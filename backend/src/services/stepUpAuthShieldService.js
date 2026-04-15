const UserStepUpAuthState = require('../models/UserStepUpAuthState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_ENFORCED_METHODS = ['post', 'put', 'patch', 'delete'];
const ACCEPTED_TRUE_VALUES = new Set(['true', '1', 'yes', 'verified', 'otp_verified']);

function nowTs() {
  return Date.now();
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'customer';
  if (normalized === 'user') return 'customer';
  return normalized;
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
    enabled: Boolean(env.stepUpAuthShieldEnabled),
    failOpen: Boolean(env.stepUpAuthShieldFailOpen),
    protectedPrefixes: Array.isArray(env.stepUpAuthProtectedPrefixes) ? env.stepUpAuthProtectedPrefixes : [],
    enforcedMethods: Array.isArray(env.stepUpAuthEnforcedMethods) && env.stepUpAuthEnforcedMethods.length
      ? env.stepUpAuthEnforcedMethods
      : DEFAULT_ENFORCED_METHODS,
    maxTokenAgeMs: normalizeNumber(env.stepUpAuthMaxTokenAgeMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    requireIatClaim: Boolean(env.stepUpAuthRequireIatClaim),
    allowAdminBypass: Boolean(env.stepUpAuthAllowAdminBypass),
    verificationHeaders: Array.isArray(env.stepUpAuthVerificationHeaders) && env.stepUpAuthVerificationHeaders.length
      ? env.stepUpAuthVerificationHeaders
      : ['x-otp-verified', 'x-step-up-auth'],
    bypassWindowMs: normalizeNumber(env.stepUpAuthBypassWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    bypassThreshold: normalizeNumber(env.stepUpAuthBypassThreshold, 3, 1, 20),
    quarantineMs: normalizeNumber(env.stepUpAuthQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.stepUpAuthQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.stepUpAuthEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.stepUpAuthAutoRevokeSessions),
    autoBanUser: Boolean(env.stepUpAuthAutoBanUser),
    recordTtlMs: normalizeNumber(env.stepUpAuthRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  return new Date(ts + Math.max(options.recordTtlMs, options.bypassWindowMs * 2, extraMs));
}

function shouldEnforceStepUp({ options, user = null, method = '', path = '' }) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const methodEnforced = options.enforcedMethods.includes(normalizedMethod);
  if (!methodEnforced) return false;

  const userRole = normalizeRole(user?.role || user?.accountType || '');
  if (options.allowAdminBypass && userRole === 'admin') {
    return false;
  }

  if (!options.protectedPrefixes.length) {
    return true;
  }

  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function getTokenAgeMs(payload = null) {
  const iat = Number(payload?.iat);
  if (!Number.isFinite(iat) || iat <= 0) return null;
  return nowTs() - (iat * 1000);
}

function hasStepUpVerification(req, headerNames = []) {
  for (const headerName of headerNames) {
    const raw = req?.headers?.[headerName];
    const value = String(Array.isArray(raw) ? raw[0] : raw || '').trim().toLowerCase();
    if (value && ACCEPTED_TRUE_VALUES.has(value)) {
      return true;
    }
  }
  return false;
}

async function recordStepUpIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'step_up_auth_required',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 76,
      severity: severityFromScore(payload.riskScore || 76),
      recommendedAction: payload.recommendedAction || 'require_step_up_auth',
      autoResponse: {
        action: payload.action || 'require_step_up_auth',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: payload.timelineAction || 'step_up_auth_required',
          note: payload.note || 'Step-up verification required for sensitive action'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserStepUpAuth({ user = null, payload = null, req = null } = {}) {
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
  const tokenAgeMs = getTokenAgeMs(payload);

  const existing = await UserStepUpAuthState.findOne({ userId }).lean();
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

  const enforce = shouldEnforceStepUp({
    options,
    user,
    method,
    path
  });

  if (!enforce) {
    return { ok: true, reason: 'route_not_enforced' };
  }

  const tokenTooOld = tokenAgeMs === null
    ? options.requireIatClaim
    : tokenAgeMs > options.maxTokenAgeMs;

  if (!tokenTooOld) {
    await UserStepUpAuthState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nowDate,
          windowBypassCount: 0,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastReason: 'token_fresh',
          metadata: sanitizeMetadata({
            tokenAgeMs: Number(tokenAgeMs || 0),
            maxTokenAgeMs: options.maxTokenAgeMs
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return { ok: true, reason: 'token_fresh' };
  }

  const verified = hasStepUpVerification(req, options.verificationHeaders);
  if (verified) {
    await UserStepUpAuthState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nowDate,
          windowBypassCount: 0,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastReason: 'step_up_verified',
          metadata: sanitizeMetadata({
            tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
            maxTokenAgeMs: options.maxTokenAgeMs,
            verificationHeaders: options.verificationHeaders
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return { ok: true, reason: 'step_up_verified' };
  }

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.bypassWindowMs;
  const bypassCount = (withinWindow ? Number(existing?.windowBypassCount || 0) : 0) + 1;
  const thresholdReached = bypassCount >= options.bypassThreshold;

  if (!thresholdReached) {
    await UserStepUpAuthState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
          windowBypassCount: bypassCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastReason: 'step_up_required',
          metadata: sanitizeMetadata({
            tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
            maxTokenAgeMs: options.maxTokenAgeMs,
            bypassCount,
            bypassThreshold: options.bypassThreshold,
            verificationHeaders: options.verificationHeaders
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
        },
        $inc: {
          suspiciousCount: 1
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await recordStepUpIncident(req, {
      eventType: 'step_up_auth_required',
      riskScore: 76,
      recommendedAction: 'require_step_up_auth',
      action: 'require_step_up_auth',
      note: 'Sensitive action attempted with stale token without OTP step-up',
      timelineAction: 'step_up_auth_required',
      userId,
      email: user.email || null,
      signals: {
        method,
        path,
        tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
        bypassCount
      },
      metadata: {
        bypassThreshold: options.bypassThreshold,
        verificationHeaders: options.verificationHeaders
      }
    });

    return {
      ok: false,
      reason: 'step_up_required',
      stepUpRequired: true,
      requiredHeaders: options.verificationHeaders,
      bypassCount,
      bypassThreshold: options.bypassThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserStepUpAuthState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowBypassCount: bypassCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastReason: 'step_up_bypass_detected',
        metadata: sanitizeMetadata({
          tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
          maxTokenAgeMs: options.maxTokenAgeMs,
          bypassCount,
          bypassThreshold: options.bypassThreshold,
          verificationHeaders: options.verificationHeaders
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
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
      reason: 'step_up_bypass_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        method,
        path,
        tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
        bypassCount,
        bypassThreshold: options.bypassThreshold
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 96,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordStepUpIncident(req, {
    eventType: 'step_up_bypass_detected',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated bypass attempts against step-up auth enforcement detected',
    timelineAction: 'step_up_bypass_detected',
    userId,
    email: user.email || null,
    signals: {
      method,
      path,
      tokenAgeMs: tokenAgeMs === null ? null : Number(tokenAgeMs),
      bypassCount
    },
    metadata: {
      bypassThreshold: options.bypassThreshold,
      quarantineUntil: quarantineUntil.toISOString()
    }
  });

  return {
    ok: false,
    reason: 'step_up_bypass_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getStepUpAuthShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserStepUpAuthState.find(query)
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
      windowBypassCount: Number(item.windowBypassCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseStepUpAuthShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserStepUpAuthState.updateMany(
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

  const result = await UserStepUpAuthState.updateMany(
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

async function quarantineStepUpAuthUser({
  userId = '',
  reason = 'admin_manual_step_up_auth_quarantine',
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
  const existing = await UserStepUpAuthState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserStepUpAuthState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_step_up_auth_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowBypassCount: 0,
        lastPath: '',
        lastMethod: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_step_up_auth_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserStepUpAuth,
  getStepUpAuthShieldSnapshot,
  releaseStepUpAuthShieldStates,
  quarantineStepUpAuthUser,
  splitCsv
};
