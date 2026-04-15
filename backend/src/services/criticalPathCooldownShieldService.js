const crypto = require('crypto');

const UserCriticalPathCooldownState = require('../models/UserCriticalPathCooldownState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];

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
  return Object.fromEntries(Object.entries(input).slice(0, 60));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  const methods = splitCsv(env.criticalPathCooldownMethods);
  return {
    enabled: Boolean(env.criticalPathCooldownShieldEnabled),
    failOpen: Boolean(env.criticalPathCooldownShieldFailOpen),
    protectedPrefixes: splitCsv(env.criticalPathCooldownProtectedPrefixes),
    methods: methods.length ? methods : DEFAULT_METHODS,
    cooldownMs: normalizeNumber(env.criticalPathCooldownMs, 2000, 200, 60 * 1000),
    violationWindowMs: normalizeNumber(env.criticalPathCooldownViolationWindowMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.criticalPathCooldownViolationThreshold, 4, 1, 50),
    resetWindowOnSafeRequest: Boolean(env.criticalPathCooldownResetWindowOnSafeRequest),
    maxRouteStateEntries: normalizeNumber(env.criticalPathCooldownMaxRouteStateEntries, 200, 20, 2000),
    quarantineMs: normalizeNumber(env.criticalPathCooldownQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.criticalPathCooldownQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.criticalPathCooldownEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.criticalPathCooldownAutoRevokeSessions),
    autoBanUser: Boolean(env.criticalPathCooldownAutoBanUser),
    recordTtlMs: normalizeNumber(env.criticalPathCooldownRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function buildRouteKey(method, path) {
  return hashValue(`${String(method || '').toUpperCase()}:${normalizePath(path)}`);
}

function pruneRouteState(routeState, maxEntries) {
  const entries = Object.entries(routeState || {});
  if (entries.length <= maxEntries) {
    return routeState;
  }
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  const sliced = entries.slice(0, maxEntries);
  return Object.fromEntries(sliced);
}

function shouldTrackRequest({ options, method, path }) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const methodAllowed = options.methods.includes(normalizedMethod);
  if (!methodAllowed) return false;

  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

async function recordCooldownIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'critical_path_cooldown_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 80,
      severity: severityFromScore(payload.riskScore || 80),
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
          action: 'critical_path_cooldown_shield_triggered',
          note: payload.note || 'Rapid repeat request detected on critical route'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserCriticalPathCooldown({ user = null, req = null } = {}) {
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
  if (!shouldTrackRequest({ options, method, path })) {
    return { ok: true, reason: 'path_or_method_not_tracked' };
  }

  const now = nowTs();
  const nowDate = new Date(now);
  const routeKey = buildRouteKey(method, path);

  const existing = await UserCriticalPathCooldownState.findOne({ userId }).lean();
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
  const previousRouteState = withinWindow && existing?.metadata?.routeLastHitAtMs && typeof existing.metadata.routeLastHitAtMs === 'object'
    ? existing.metadata.routeLastHitAtMs
    : {};
  const lastHitMs = Number(previousRouteState[routeKey] || 0);
  const elapsedMs = lastHitMs > 0 ? Math.max(0, now - lastHitMs) : Number.MAX_SAFE_INTEGER;
  const cooldownViolated = elapsedMs < options.cooldownMs;
  const retryAfterMs = cooldownViolated ? Math.max(1, options.cooldownMs - elapsedMs) : 0;

  const nextRouteState = {
    ...previousRouteState,
    [routeKey]: now
  };
  const prunedRouteState = pruneRouteState(nextRouteState, options.maxRouteStateEntries);

  const violationCount = cooldownViolated
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : (withinWindow && !options.resetWindowOnSafeRequest ? Number(existing?.windowViolationCount || 0) : 0);
  const thresholdReached = cooldownViolated && violationCount >= options.violationThreshold;

  if (!thresholdReached) {
    await UserCriticalPathCooldownState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: withinWindow && !options.resetWindowOnSafeRequest ? new Date(existing.windowStartAt) : nowDate,
          windowViolationCount: violationCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastReason: cooldownViolated ? 'critical_path_cooldown_violation' : 'cooldown_ok',
          metadata: sanitizeMetadata({
            routeLastHitAtMs: prunedRouteState,
            cooldownMs: options.cooldownMs,
            retryAfterMs,
            violationCount,
            violationThreshold: options.violationThreshold
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
        },
        ...(cooldownViolated ? { $inc: { suspiciousCount: 1 } } : {})
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (cooldownViolated) {
      await recordCooldownIncident(req, {
        eventType: 'critical_path_cooldown_violation',
        riskScore: 80,
        recommendedAction: 'deny_request',
        action: 'deny_request',
        note: 'Critical path request cooldown violated',
        userId,
        email: user.email || null,
        signals: {
          path,
          method,
          cooldownMs: options.cooldownMs,
          retryAfterMs
        },
        metadata: {
          violationCount,
          violationThreshold: options.violationThreshold
        }
      });
    }

    if (!cooldownViolated) {
      return { ok: true, reason: 'cooldown_ok' };
    }

    return {
      ok: false,
      reason: 'critical_path_cooldown_violation',
      retryAfterMs,
      violationCount,
      violationThreshold: options.violationThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserCriticalPathCooldownState.updateOne(
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
        lastReason: 'critical_path_cooldown_quarantined',
        metadata: sanitizeMetadata({
          routeLastHitAtMs: prunedRouteState,
          cooldownMs: options.cooldownMs,
          retryAfterMs,
          violationCount,
          violationThreshold: options.violationThreshold
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
      reason: 'critical_path_cooldown_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        path,
        method,
        retryAfterMs,
        violationCount,
        violationThreshold: options.violationThreshold
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 91,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordCooldownIncident(req, {
    eventType: 'critical_path_cooldown_quarantined',
    riskScore: 91,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated critical route cooldown violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      retryAfterMs,
      cooldownMs: options.cooldownMs
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
    reason: 'critical_path_cooldown_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getCriticalPathCooldownShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserCriticalPathCooldownState.find(query)
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
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseCriticalPathCooldownShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserCriticalPathCooldownState.updateMany(
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

  const result = await UserCriticalPathCooldownState.updateMany(
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

async function quarantineCriticalPathCooldownUser({
  userId = '',
  reason = 'admin_manual_critical_path_cooldown_quarantine',
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
  const existing = await UserCriticalPathCooldownState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserCriticalPathCooldownState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_critical_path_cooldown_quarantine',
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
        lastMethod: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_critical_path_cooldown_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserCriticalPathCooldown,
  getCriticalPathCooldownShieldSnapshot,
  releaseCriticalPathCooldownShieldStates,
  quarantineCriticalPathCooldownUser
};
