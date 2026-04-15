const UserDeviceApprovalBoundaryState = require('../models/UserDeviceApprovalBoundaryState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizePath(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '/';
  const pathOnly = text.split('?')[0] || '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function matchesPrefix(pathname, prefix) {
  const normalizedPath = normalizePath(pathname);
  const normalizedPrefix = normalizePath(prefix);
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function normalizeFingerprint(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 50));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  return {
    enabled: Boolean(env.deviceApprovalBoundaryShieldEnabled),
    failOpen: Boolean(env.deviceApprovalBoundaryShieldFailOpen),
    protectedPrefixes: Array.isArray(env.deviceApprovalBoundaryProtectedPrefixes)
      ? env.deviceApprovalBoundaryProtectedPrefixes
      : [],
    requireKnownDevice: Boolean(env.deviceApprovalBoundaryRequireKnownDevice),
    allowMissingFingerprint: Boolean(env.deviceApprovalBoundaryAllowMissingFingerprint),
    treatPendingAsViolation: Boolean(env.deviceApprovalBoundaryTreatPendingAsViolation),
    blockedHardFail: Boolean(env.deviceApprovalBoundaryBlockedHardFail),
    rejectedHardFail: Boolean(env.deviceApprovalBoundaryRejectedHardFail),
    violationWindowMs: normalizeNumber(env.deviceApprovalBoundaryViolationWindowMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.deviceApprovalBoundaryViolationThreshold, 3, 1, 20),
    quarantineMs: normalizeNumber(env.deviceApprovalBoundaryQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.deviceApprovalBoundaryQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.deviceApprovalBoundaryEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.deviceApprovalBoundaryAutoRevokeSessions),
    autoBanUser: Boolean(env.deviceApprovalBoundaryAutoBanUser),
    recordTtlMs: normalizeNumber(env.deviceApprovalBoundaryRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
  };
}

function computeQuarantineMs(options, escalationLevel) {
  return Math.min(
    options.quarantineMaxMs,
    Math.round(options.quarantineMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
  );
}

function computeExpiryDate(options, quarantineUntilMs = 0) {
  const ts = nowTs();
  const extraMs = quarantineUntilMs > ts
    ? (quarantineUntilMs - ts) + options.recordTtlMs
    : 0;
  return new Date(ts + Math.max(options.recordTtlMs, options.violationWindowMs * 2, extraMs));
}

function shouldTrackPath(path, options) {
  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function resolveDeviceStatus(device = null) {
  if (!device) return 'unknown';
  if (device.isBlocked === true) return 'blocked';
  if (String(device.approvalStatus || '').trim().toLowerCase() === 'rejected') return 'rejected';
  if (
    String(device.approvalStatus || '').trim().toLowerCase() === 'pending'
    || device.approvalRequired === true
  ) {
    return 'pending';
  }
  return 'approved';
}

function isViolation({ status, options, hasFingerprint }) {
  if (!hasFingerprint && !options.allowMissingFingerprint) {
    return { violation: true, reason: 'missing_device_fingerprint', hardFail: false };
  }

  if (status === 'blocked') {
    return { violation: true, reason: 'device_blocked', hardFail: options.blockedHardFail };
  }

  if (status === 'rejected') {
    return { violation: true, reason: 'device_rejected', hardFail: options.rejectedHardFail };
  }

  if (status === 'pending' && options.treatPendingAsViolation) {
    return { violation: true, reason: 'device_pending_approval', hardFail: false };
  }

  if (status === 'unknown' && options.requireKnownDevice) {
    return { violation: true, reason: 'device_not_registered', hardFail: false };
  }

  return { violation: false, reason: 'device_verified', hardFail: false };
}

async function recordDeviceBoundaryIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'device_approval_boundary_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 85,
      severity: severityFromScore(payload.riskScore || 85),
      recommendedAction: payload.recommendedAction || 'deny_request',
      autoResponse: {
        action: payload.action || 'deny_request',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'device_approval_boundary_shield_triggered',
          note: payload.note || 'Request denied by device approval boundary shield'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserDeviceApprovalBoundary({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackPath(path, options)) {
    return { ok: true, reason: 'path_not_tracked' };
  }

  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const fingerprintHeader = normalizeFingerprint(req?.headers?.['x-device-fingerprint']);
  const metaFingerprint = normalizeFingerprint(getDeviceMeta(req).fingerprint);
  const fingerprint = fingerprintHeader || metaFingerprint;
  const hasFingerprint = Boolean(fingerprint);
  const trustedDevices = Array.isArray(user?.trustedDevices) ? user.trustedDevices : [];
  const matchedDevice = trustedDevices.find((item) => normalizeFingerprint(item?.fingerprint) === fingerprint) || null;
  const deviceStatus = resolveDeviceStatus(matchedDevice);
  const violationInfo = isViolation({
    status: deviceStatus,
    options,
    hasFingerprint
  });

  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await UserDeviceApprovalBoundaryState.findOne({ userId }).lean();

  if (existing) {
    const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
    if (existing.status === 'quarantined' && quarantineUntilMs > now) {
      return {
        ok: false,
        reason: 'user_quarantined',
        quarantineUntil: new Date(quarantineUntilMs).toISOString()
      };
    }
  }

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.violationWindowMs;
  const violationCount = violationInfo.violation
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : 0;
  const thresholdReached = violationInfo.violation
    && (violationInfo.hardFail || violationCount >= options.violationThreshold);

  if (!thresholdReached) {
    await UserDeviceApprovalBoundaryState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: violationInfo.violation
            ? (withinWindow ? new Date(existing.windowStartAt) : nowDate)
            : nowDate,
          windowViolationCount: violationInfo.violation ? violationCount : 0,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastDeviceFingerprint: fingerprint,
          lastDeviceStatus: deviceStatus,
          lastReason: violationInfo.reason,
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            violation: violationInfo.violation,
            hardFail: violationInfo.hardFail,
            matchedDevice: Boolean(matchedDevice),
            violationCount,
            violationThreshold: options.violationThreshold
          })
        },
        $setOnInsert: {
          escalationLevel: 0,
        },
        ...(violationInfo.violation ? { $inc: { suspiciousCount: 1 } } : {})
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (violationInfo.violation) {
      await recordDeviceBoundaryIncident(req, {
        eventType: 'device_approval_boundary_violation',
        riskScore: 85,
        recommendedAction: 'deny_request',
        action: 'deny_request',
        note: 'Authenticated request from unapproved device boundary',
        userId,
        email: user.email || null,
        signals: {
          path,
          method,
          deviceStatus,
          violationReason: violationInfo.reason
        },
        metadata: {
          violationCount,
          violationThreshold: options.violationThreshold
        }
      });
    }

    if (!violationInfo.violation) {
      return { ok: true, reason: 'device_verified' };
    }

    return {
      ok: false,
      reason: violationInfo.reason,
      deviceStatus,
      violationCount,
      violationThreshold: options.violationThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserDeviceApprovalBoundaryState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowViolationCount: violationCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastDeviceFingerprint: fingerprint,
        lastDeviceStatus: deviceStatus,
        lastReason: violationInfo.reason,
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          violationReason: violationInfo.reason,
          deviceStatus,
          hardFail: violationInfo.hardFail,
          violationCount,
          violationThreshold: options.violationThreshold
        })
      },
      $setOnInsert: {
      },
      $inc: {
        suspiciousCount: 1
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId,
      reason: `device_approval_boundary:${violationInfo.reason}`,
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        path,
        method,
        deviceStatus,
        violationReason: violationInfo.reason,
        violationCount
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 90,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordDeviceBoundaryIncident(req, {
    eventType: 'device_approval_boundary_quarantined',
    riskScore: 90,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated unapproved device attempts triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      deviceStatus,
      violationReason: violationInfo.reason
    },
    metadata: {
      violationCount,
      violationThreshold: options.violationThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'device_approval_boundary_quarantined',
    deviceStatus,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getDeviceApprovalBoundaryShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

  const query = {};
  if (!includeReleased) {
    query.status = { $ne: 'released' };
  }
  if (normalizedStatus) {
    query.status = normalizedStatus;
  }
  if (normalizedUserId) {
    query.userId = normalizedUserId;
  }

  const rows = await UserDeviceApprovalBoundaryState.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    quarantinedCount: rows.filter((item) => {
      const qMs = item.quarantineUntil ? new Date(item.quarantineUntil).getTime() : 0;
      return item.status === 'quarantined' && qMs > nowTs();
    }).length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      userId: item.userId ? String(item.userId) : null,
      status: String(item.status || ''),
      escalationLevel: Number(item.escalationLevel || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      windowViolationCount: Number(item.windowViolationCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastDeviceFingerprint: String(item.lastDeviceFingerprint || ''),
      lastDeviceStatus: String(item.lastDeviceStatus || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseDeviceApprovalBoundaryShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserDeviceApprovalBoundaryState.updateMany(
      {},
      {
        $set: {
          status: 'released',
          quarantineUntil: null,
          lastReason: 'manual_release_all'
        }
      }
    );
    return {
      clearAll: true,
      matchedCount: Number(result?.matchedCount || 0),
      updatedCount: Number(result?.modifiedCount || 0)
    };
  }

  const query = {};
  if (normalizedId) query._id = normalizedId;
  if (normalizedUserId) query.userId = normalizedUserId;

  const result = await UserDeviceApprovalBoundaryState.updateMany(
    query,
    {
      $set: {
        status: 'released',
        quarantineUntil: null,
        lastReason: 'manual_release'
      }
    }
  );

  return {
    clearAll: false,
    matchedCount: Number(result?.matchedCount || 0),
    updatedCount: Number(result?.modifiedCount || 0)
  };
}

async function quarantineDeviceApprovalBoundaryUser({
  userId = '',
  reason = 'admin_manual_device_approval_boundary_quarantine',
  durationMs = null,
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    const error = new Error('userId is required');
    error.statusCode = 400;
    throw error;
  }

  const options = resolveOptions();
  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await UserDeviceApprovalBoundaryState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserDeviceApprovalBoundaryState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_device_approval_boundary_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowViolationCount: 0,
        lastPath: '',
        lastMethod: '',
        lastDeviceFingerprint: '',
        lastDeviceStatus: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_device_approval_boundary_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserDeviceApprovalBoundary,
  getDeviceApprovalBoundaryShieldSnapshot,
  releaseDeviceApprovalBoundaryShieldStates,
  quarantineDeviceApprovalBoundaryUser
};
