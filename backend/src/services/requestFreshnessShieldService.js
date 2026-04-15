const crypto = require('crypto');

const UserRequestFreshnessState = require('../models/UserRequestFreshnessState');
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
  const methods = splitCsv(env.requestFreshnessMethods);
  return {
    enabled: Boolean(env.requestFreshnessShieldEnabled),
    failOpen: Boolean(env.requestFreshnessShieldFailOpen),
    protectedPrefixes: splitCsv(env.requestFreshnessProtectedPrefixes),
    methods: methods.length ? methods : DEFAULT_METHODS,
    requireRequestId: Boolean(env.requestFreshnessRequireRequestId),
    requestIdMinLength: normalizeNumber(env.requestFreshnessRequestIdMinLength, 12, 4, 128),
    requestIdMaxLength: normalizeNumber(env.requestFreshnessRequestIdMaxLength, 160, 16, 500),
    requireTimestamp: Boolean(env.requestFreshnessRequireTimestamp),
    maxSkewMs: normalizeNumber(env.requestFreshnessMaxSkewMs, 5 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    replayWindowMs: normalizeNumber(env.requestFreshnessReplayWindowMs, 10 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    windowMs: normalizeNumber(env.requestFreshnessWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.requestFreshnessViolationThreshold, 3, 1, 50),
    maxRememberedRequestIds: normalizeNumber(env.requestFreshnessMaxRememberedRequestIds, 300, 20, 5000),
    quarantineMs: normalizeNumber(env.requestFreshnessQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.requestFreshnessQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.requestFreshnessEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.requestFreshnessAutoRevokeSessions),
    autoBanUser: Boolean(env.requestFreshnessAutoBanUser),
    recordTtlMs: normalizeNumber(env.requestFreshnessRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const methodTracked = options.methods.includes(normalizedMethod);
  if (!methodTracked) return false;

  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function parseFreshnessHeaders(req) {
  const requestIdRaw = String(req?.headers?.['x-request-id'] || '').trim();
  const timestampRaw = String(req?.headers?.['x-timestamp'] || '').trim();
  const timestampValue = Number(timestampRaw);

  return {
    requestId: requestIdRaw,
    requestIdHash: requestIdRaw ? hashValue(requestIdRaw) : '',
    timestampMs: Number.isFinite(timestampValue) ? Math.round(timestampValue) : null
  };
}

function pruneRememberedRequestIds(seenMap, options, now) {
  const entries = Object.entries(seenMap || {});
  const freshEntries = entries.filter((item) => {
    const ts = Number(item[1] || 0);
    return ts > 0 && (now - ts) <= options.replayWindowMs;
  });
  freshEntries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return Object.fromEntries(freshEntries.slice(0, options.maxRememberedRequestIds));
}

function evaluateRequestFreshness({
  headers,
  options,
  rememberedRequestIds,
  now
}) {
  const reasons = [];
  const metadata = {};

  if (options.requireRequestId && !headers.requestId) {
    reasons.push('missing_request_id');
  }

  if (headers.requestId) {
    const length = String(headers.requestId).length;
    if (length < options.requestIdMinLength || length > options.requestIdMaxLength) {
      reasons.push('invalid_request_id_length');
      metadata.requestIdLength = length;
    }
  }

  if (options.requireTimestamp && headers.timestampMs === null) {
    reasons.push('missing_request_timestamp');
  }

  if (headers.timestampMs !== null) {
    const skewMs = Math.abs(now - headers.timestampMs);
    metadata.skewMs = skewMs;
    if (skewMs > options.maxSkewMs) {
      reasons.push('request_timestamp_skew_exceeded');
    }
  }

  const nextRemembered = pruneRememberedRequestIds(rememberedRequestIds, options, now);

  if (headers.requestIdHash) {
    const prior = Number(nextRemembered[headers.requestIdHash] || 0);
    if (prior > 0 && (now - prior) <= options.replayWindowMs) {
      reasons.push('request_id_replay_detected');
      metadata.replayWithinMs = now - prior;
    }
    nextRemembered[headers.requestIdHash] = now;
  }

  const prunedFinal = pruneRememberedRequestIds(nextRemembered, options, now);

  return {
    detected: reasons.length > 0,
    reasons,
    metadata,
    nextRememberedRequestIds: prunedFinal
  };
}

async function recordFreshnessIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'request_freshness_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 86,
      severity: severityFromScore(payload.riskScore || 86),
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
          action: 'request_freshness_shield_triggered',
          note: payload.note || 'Request freshness validation failed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserRequestFreshness({ user = null, req = null } = {}) {
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
  const headers = parseFreshnessHeaders(req);

  const existing = await UserRequestFreshnessState.findOne({ userId }).lean();
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

  const remembered = existing?.metadata?.rememberedRequestIds && typeof existing.metadata.rememberedRequestIds === 'object'
    ? existing.metadata.rememberedRequestIds
    : {};
  const freshness = evaluateRequestFreshness({
    headers,
    options,
    rememberedRequestIds: remembered,
    now
  });

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;
  const violationCount = freshness.detected
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : 0;
  const thresholdReached = freshness.detected && violationCount >= options.violationThreshold;

  if (!thresholdReached) {
    await UserRequestFreshnessState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: freshness.detected ? (withinWindow ? new Date(existing.windowStartAt) : nowDate) : nowDate,
          windowViolationCount: violationCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastRequestIdHash: headers.requestIdHash,
          lastTimestampMs: Number(headers.timestampMs || 0),
          lastReason: freshness.detected ? 'request_freshness_violation' : 'request_freshness_ok',
          metadata: sanitizeMetadata({
            reasons: freshness.reasons,
            reasonMeta: freshness.metadata,
            rememberedRequestIds: freshness.nextRememberedRequestIds,
            violationCount,
            violationThreshold: options.violationThreshold
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
        },
        ...(freshness.detected ? { $inc: { suspiciousCount: 1 } } : {})
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (freshness.detected) {
      await recordFreshnessIncident(req, {
        eventType: 'request_freshness_violation',
        riskScore: 86,
        recommendedAction: 'deny_request',
        action: 'deny_request',
        note: 'Freshness headers failed validation',
        userId,
        email: user.email || null,
        signals: {
          reasons: freshness.reasons,
          path,
          method
        },
        metadata: {
          reasonMeta: freshness.metadata,
          violationCount,
          violationThreshold: options.violationThreshold
        }
      });

      return {
        ok: false,
        reason: 'request_freshness_violation',
        retryAfterMs: freshness.reasons.includes('request_id_replay_detected')
          ? Math.max(1, options.replayWindowMs)
          : 0,
        violationCount,
        violationThreshold: options.violationThreshold
      };
    }

    return { ok: true, reason: 'request_freshness_ok' };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserRequestFreshnessState.updateOne(
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
        lastRequestIdHash: headers.requestIdHash,
        lastTimestampMs: Number(headers.timestampMs || 0),
        lastReason: 'request_freshness_quarantined',
        metadata: sanitizeMetadata({
          reasons: freshness.reasons,
          reasonMeta: freshness.metadata,
          rememberedRequestIds: freshness.nextRememberedRequestIds,
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
      reason: 'request_freshness_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: freshness.reasons,
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
          riskScore: 90,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordFreshnessIncident(req, {
    eventType: 'request_freshness_quarantined',
    riskScore: 90,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated freshness violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      reasons: freshness.reasons,
      path,
      method
    },
    metadata: {
      reasonMeta: freshness.metadata,
      violationCount,
      violationThreshold: options.violationThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'request_freshness_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getRequestFreshnessShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserRequestFreshnessState.find(query)
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
      lastRequestIdHash: String(item.lastRequestIdHash || ''),
      lastTimestampMs: Number(item.lastTimestampMs || 0),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseRequestFreshnessShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserRequestFreshnessState.updateMany(
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

  const result = await UserRequestFreshnessState.updateMany(
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

async function quarantineRequestFreshnessUser({
  userId = '',
  reason = 'admin_manual_request_freshness_quarantine',
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
  const existing = await UserRequestFreshnessState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserRequestFreshnessState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_request_freshness_quarantine',
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
        lastRequestIdHash: '',
        lastTimestampMs: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_request_freshness_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserRequestFreshness,
  getRequestFreshnessShieldSnapshot,
  releaseRequestFreshnessShieldStates,
  quarantineRequestFreshnessUser
};
