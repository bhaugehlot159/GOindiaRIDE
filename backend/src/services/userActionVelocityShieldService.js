const crypto = require('crypto');

const UserActionVelocityState = require('../models/UserActionVelocityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function nowTs() {
  return Date.now();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
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

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
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
    enabled: Boolean(env.actionVelocityShieldEnabled),
    failOpen: Boolean(env.actionVelocityShieldFailOpen),
    windowMs: normalizeNumber(env.actionVelocityWindowMs, 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    maxActionCount: normalizeNumber(env.actionVelocityMaxActionCount, 40, 5, 2000),
    maxHighRiskActionCount: normalizeNumber(env.actionVelocityMaxHighRiskActionCount, 20, 3, 1000),
    maxDistinctRoutes: normalizeNumber(env.actionVelocityMaxDistinctRoutes, 12, 2, 500),
    maxDistinctIps: normalizeNumber(env.actionVelocityMaxDistinctIps, 3, 1, 50),
    enforceMutatingOnly: Boolean(env.actionVelocityEnforceMutatingOnly),
    protectedPrefixes: Array.isArray(env.actionVelocityProtectedPrefixes) ? env.actionVelocityProtectedPrefixes : [],
    highRiskPrefixes: Array.isArray(env.actionVelocityHighRiskPrefixes) ? env.actionVelocityHighRiskPrefixes : [],
    quarantineMs: normalizeNumber(env.actionVelocityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.actionVelocityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.actionVelocityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.actionVelocityAutoRevokeSessions),
    autoBanUser: Boolean(env.actionVelocityAutoBanUser),
    recordTtlMs: normalizeNumber(env.actionVelocityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  return new Date(ts + Math.max(options.recordTtlMs, options.windowMs * 2, extraMs));
}

function shouldTrackRequest({ options, method, path }) {
  const methodAllowed = !options.enforceMutatingOnly || MUTATING_METHODS.has(method);
  const protectedByPrefix = options.protectedPrefixes.length === 0
    || options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));

  return methodAllowed && protectedByPrefix;
}

function isHighRiskPath({ options, path }) {
  if (!options.highRiskPrefixes.length) return false;
  return options.highRiskPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

async function recordActionVelocityIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'user_action_velocity_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 93,
      severity: severityFromScore(payload.riskScore || 93),
      recommendedAction: payload.recommendedAction || 'quarantine_user',
      autoResponse: {
        action: payload.action || 'quarantine_user',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'user_action_velocity_shield_triggered',
          note: payload.note || 'Unusual authenticated action velocity detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function buildWindowState({
  existing = null,
  withinWindow = false,
  trackCurrent = false,
  isHighRisk = false,
  routeHash = '',
  ipHash = '',
  nowDate = null
}) {
  const existingRouteHashes = withinWindow ? (Array.isArray(existing?.windowRouteHashes) ? existing.windowRouteHashes : []) : [];
  const existingIpHashes = withinWindow ? (Array.isArray(existing?.windowIpHashes) ? existing.windowIpHashes : []) : [];
  const routeSet = new Set(existingRouteHashes);
  const ipSet = new Set(existingIpHashes);

  let actionCount = withinWindow ? Number(existing?.windowActionCount || 0) : 0;
  let highRiskActionCount = withinWindow ? Number(existing?.windowHighRiskActionCount || 0) : 0;

  if (trackCurrent) {
    actionCount += 1;
    if (isHighRisk) {
      highRiskActionCount += 1;
    }
    if (routeHash) {
      routeSet.add(routeHash);
    }
    if (ipHash) {
      ipSet.add(ipHash);
    }
  }

  return {
    windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
    windowActionCount: actionCount,
    windowHighRiskActionCount: highRiskActionCount,
    windowRouteHashes: Array.from(routeSet).slice(-500),
    windowIpHashes: Array.from(ipSet).slice(-200),
    distinctRouteCount: routeSet.size,
    distinctIpCount: ipSet.size
  };
}

async function inspectUserActionVelocity({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const path = normalizePath(req?.originalUrl || req?.path || '/');
  const now = nowTs();
  const nowDate = new Date(now);

  const ip = normalizeIp(getClientIp(req) || '');
  const country = String(getCountry(req) || '').trim().toLowerCase() || 'unknown';
  const fingerprintHeader = String(req?.headers?.['x-device-fingerprint'] || '').trim().toLowerCase();
  const fingerprint = fingerprintHeader || String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
  const isHighRiskAction = isHighRiskPath({ options, path });
  const trackCurrent = shouldTrackRequest({ options, method, path });
  const routeHash = hashValue(`${method}:${path}`);
  const ipHash = hashValue(ip || 'unknown_ip');

  const existing = await UserActionVelocityState.findOne({ userId }).lean();
  if (!existing) {
    const initialWindow = buildWindowState({
      existing: null,
      withinWindow: false,
      trackCurrent,
      isHighRisk: isHighRiskAction,
      routeHash,
      ipHash,
      nowDate
    });

    await UserActionVelocityState.create({
      userId,
      status: 'active',
      escalationLevel: 0,
      windowStartAt: initialWindow.windowStartAt,
      windowActionCount: initialWindow.windowActionCount,
      windowHighRiskActionCount: initialWindow.windowHighRiskActionCount,
      windowRouteHashes: initialWindow.windowRouteHashes,
      windowIpHashes: initialWindow.windowIpHashes,
      quarantineUntil: null,
      lastSeenAt: nowDate,
      lastMethod: method,
      lastPath: path,
      lastCountry: country,
      lastIp: ip,
      lastFingerprint: fingerprint,
      lastReason: trackCurrent ? 'first_seen_tracked' : 'first_seen_untracked',
      metadata: sanitizeMetadata({
        trackCurrent,
        isHighRiskAction,
        windowActionCount: initialWindow.windowActionCount,
        windowHighRiskActionCount: initialWindow.windowHighRiskActionCount
      }),
      expiresAt: computeExpiryDate(options)
    });
    return { ok: true, reason: trackCurrent ? 'first_seen_tracked' : 'first_seen_untracked' };
  }

  const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
  if (existing.status === 'quarantined' && quarantineUntilMs > now) {
    return {
      ok: false,
      reason: 'user_quarantined',
      quarantineUntil: new Date(quarantineUntilMs).toISOString()
    };
  }

  const windowStartMs = existing.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;

  const nextWindow = buildWindowState({
    existing,
    withinWindow,
    trackCurrent,
    isHighRisk: isHighRiskAction,
    routeHash,
    ipHash,
    nowDate
  });

  if (!trackCurrent) {
    await UserActionVelocityState.updateOne(
      { userId },
      {
        $set: {
          status: existing.status === 'released' ? 'active' : existing.status,
          windowStartAt: nextWindow.windowStartAt,
          windowActionCount: nextWindow.windowActionCount,
          windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
          windowRouteHashes: nextWindow.windowRouteHashes,
          windowIpHashes: nextWindow.windowIpHashes,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastMethod: method,
          lastPath: path,
          lastCountry: country,
          lastIp: ip,
          lastFingerprint: fingerprint,
          lastReason: 'untracked_path_or_method',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            trackCurrent: false,
            isHighRiskAction,
            windowActionCount: nextWindow.windowActionCount,
            windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
            distinctRouteCount: nextWindow.distinctRouteCount,
            distinctIpCount: nextWindow.distinctIpCount
          })
        }
      }
    );
    return { ok: true, reason: 'untracked_path_or_method' };
  }

  const thresholdExceeded = (
    nextWindow.windowActionCount > options.maxActionCount
    || nextWindow.windowHighRiskActionCount > options.maxHighRiskActionCount
    || nextWindow.distinctRouteCount > options.maxDistinctRoutes
    || nextWindow.distinctIpCount > options.maxDistinctIps
  );

  if (!thresholdExceeded) {
    await UserActionVelocityState.updateOne(
      { userId },
      {
        $set: {
          status: existing.status === 'released' ? 'active' : existing.status,
          windowStartAt: nextWindow.windowStartAt,
          windowActionCount: nextWindow.windowActionCount,
          windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
          windowRouteHashes: nextWindow.windowRouteHashes,
          windowIpHashes: nextWindow.windowIpHashes,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastMethod: method,
          lastPath: path,
          lastCountry: country,
          lastIp: ip,
          lastFingerprint: fingerprint,
          lastReason: 'tracked_action_seen',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            trackCurrent: true,
            isHighRiskAction,
            windowActionCount: nextWindow.windowActionCount,
            windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
            distinctRouteCount: nextWindow.distinctRouteCount,
            distinctIpCount: nextWindow.distinctIpCount
          })
        }
      }
    );
    return { ok: true, reason: 'tracked_action_seen' };
  }

  const escalationLevel = Number(existing.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserActionVelocityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindow.windowStartAt,
        windowActionCount: nextWindow.windowActionCount,
        windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
        windowRouteHashes: nextWindow.windowRouteHashes,
        windowIpHashes: nextWindow.windowIpHashes,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastMethod: method,
        lastPath: path,
        lastCountry: country,
        lastIp: ip,
        lastFingerprint: fingerprint,
        lastReason: 'user_action_velocity_detected',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          isHighRiskAction,
          windowActionCount: nextWindow.windowActionCount,
          windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
          distinctRouteCount: nextWindow.distinctRouteCount,
          distinctIpCount: nextWindow.distinctIpCount,
          maxActionCount: options.maxActionCount,
          maxHighRiskActionCount: options.maxHighRiskActionCount,
          maxDistinctRoutes: options.maxDistinctRoutes,
          maxDistinctIps: options.maxDistinctIps
        })
      },
      $inc: {
        suspiciousCount: 1
      }
    }
  );

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId,
      reason: 'user_action_velocity_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        method,
        path,
        windowActionCount: nextWindow.windowActionCount,
        windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
        distinctRouteCount: nextWindow.distinctRouteCount,
        distinctIpCount: nextWindow.distinctIpCount
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 95,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordActionVelocityIncident(req, {
    eventType: 'user_action_velocity_detected',
    riskScore: 95,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Unusual authenticated action velocity detected on sensitive routes',
    userId,
    email: user.email || null,
    signals: {
      method,
      path,
      isHighRiskAction,
      windowActionCount: nextWindow.windowActionCount,
      windowHighRiskActionCount: nextWindow.windowHighRiskActionCount,
      distinctRouteCount: nextWindow.distinctRouteCount,
      distinctIpCount: nextWindow.distinctIpCount
    },
    metadata: {
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'user_action_velocity_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getActionVelocityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserActionVelocityState.find(query)
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
      windowActionCount: Number(item.windowActionCount || 0),
      windowHighRiskActionCount: Number(item.windowHighRiskActionCount || 0),
      distinctRouteCount: Array.isArray(item.windowRouteHashes) ? item.windowRouteHashes.length : 0,
      distinctIpCount: Array.isArray(item.windowIpHashes) ? item.windowIpHashes.length : 0,
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastMethod: String(item.lastMethod || ''),
      lastPath: String(item.lastPath || ''),
      lastCountry: String(item.lastCountry || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseActionVelocityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserActionVelocityState.updateMany(
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

  const result = await UserActionVelocityState.updateMany(
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

async function quarantineActionVelocityUser({
  userId = '',
  reason = 'admin_manual_action_velocity_quarantine',
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
  const existing = await UserActionVelocityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserActionVelocityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_action_velocity_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowActionCount: 0,
        windowHighRiskActionCount: 0,
        windowRouteHashes: [],
        windowIpHashes: [],
        lastMethod: '',
        lastPath: '',
        lastCountry: '',
        lastIp: '',
        lastFingerprint: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_action_velocity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserActionVelocity,
  getActionVelocityShieldSnapshot,
  releaseActionVelocityShieldStates,
  quarantineActionVelocityUser,
  splitCsv
};
