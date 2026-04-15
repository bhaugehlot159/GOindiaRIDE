const UserTokenTemporalIntegrityState = require('../models/UserTokenTemporalIntegrityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const IMMEDIATE_ANOMALY_REASONS = new Set([
  'invalid_temporal_order',
  'iat_in_future',
  'nbf_in_future'
]);

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

function parseEpochSec(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function epochSecToDate(value) {
  const sec = parseEpochSec(value);
  if (!sec) return null;
  return new Date(sec * 1000);
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

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
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
    enabled: Boolean(env.tokenTemporalIntegrityShieldEnabled),
    failOpen: Boolean(env.tokenTemporalIntegrityShieldFailOpen),
    protectedPrefixes: Array.isArray(env.tokenTemporalIntegrityProtectedPrefixes)
      ? env.tokenTemporalIntegrityProtectedPrefixes
      : splitCsv('/api'),
    windowMs: normalizeNumber(env.tokenTemporalIntegrityWindowMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    anomalyThreshold: normalizeNumber(env.tokenTemporalIntegrityAnomalyThreshold, 2, 1, 20),
    missingClaimThreshold: normalizeNumber(env.tokenTemporalIntegrityMissingClaimThreshold, 3, 1, 30),
    requireIatClaim: Boolean(env.tokenTemporalIntegrityRequireIatClaim),
    requireExpClaim: Boolean(env.tokenTemporalIntegrityRequireExpClaim),
    requireJtiClaim: Boolean(env.tokenTemporalIntegrityRequireJtiClaim),
    hardFailOnMissingClaims: Boolean(env.tokenTemporalIntegrityHardFailOnMissingClaims),
    maxTokenLifetimeSec: normalizeNumber(env.tokenTemporalIntegrityMaxTokenLifetimeSec, 2 * 60 * 60, 60, 30 * 24 * 60 * 60),
    maxTokenAgeSec: normalizeNumber(env.tokenTemporalIntegrityMaxTokenAgeSec, 24 * 60 * 60, 60, 365 * 24 * 60 * 60),
    maxIatFutureSkewSec: normalizeNumber(env.tokenTemporalIntegrityMaxIatFutureSkewSec, 120, 0, 24 * 60 * 60),
    maxNbfFutureSkewSec: normalizeNumber(env.tokenTemporalIntegrityMaxNbfFutureSkewSec, 120, 0, 24 * 60 * 60),
    quarantineMs: normalizeNumber(env.tokenTemporalIntegrityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenTemporalIntegrityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenTemporalIntegrityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenTemporalIntegrityAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenTemporalIntegrityAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenTemporalIntegrityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function shouldTrackPath(path, options) {
  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function analyzeTokenTemporalIntegrity({ payload = {}, options, nowSec }) {
  const iatSec = parseEpochSec(payload?.iat);
  const expSec = parseEpochSec(payload?.exp);
  const nbfSec = parseEpochSec(payload?.nbf);
  const jti = String(payload?.jti || '').trim();
  const reasons = [];
  const missingReasons = [];

  if (options.requireIatClaim && !iatSec) {
    missingReasons.push('missing_iat_claim');
  }
  if (options.requireExpClaim && !expSec) {
    missingReasons.push('missing_exp_claim');
  }
  if (options.requireJtiClaim && !jti) {
    missingReasons.push('missing_jti_claim');
  }
  missingReasons.forEach((reason) => reasons.push(reason));

  if (iatSec && expSec && expSec <= iatSec) {
    reasons.push('invalid_temporal_order');
  }
  if (iatSec && (iatSec - nowSec) > options.maxIatFutureSkewSec) {
    reasons.push('iat_in_future');
  }
  if (nbfSec && (nbfSec - nowSec) > options.maxNbfFutureSkewSec) {
    reasons.push('nbf_in_future');
  }
  if (iatSec && expSec && (expSec - iatSec) > options.maxTokenLifetimeSec) {
    reasons.push('token_lifetime_too_long');
  }
  if (iatSec && (nowSec - iatSec) > options.maxTokenAgeSec) {
    reasons.push('token_too_old');
  }

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_ANOMALY_REASONS.has(reason))
    || (options.hardFailOnMissingClaims && missingReasons.length > 0);

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    missingReasons: Array.from(new Set(missingReasons)),
    immediate,
    iatSec,
    expSec,
    nbfSec,
    jti,
    lifetimeSec: iatSec && expSec ? Math.max(0, expSec - iatSec) : null,
    ageSec: iatSec ? Math.max(0, nowSec - iatSec) : null
  };
}

function pickPrimaryReason(anomaly) {
  if (anomaly.reasons.includes('invalid_temporal_order')) return 'invalid_temporal_order';
  if (anomaly.reasons.includes('iat_in_future')) return 'iat_in_future';
  if (anomaly.reasons.includes('nbf_in_future')) return 'nbf_in_future';
  if (anomaly.reasons.includes('token_lifetime_too_long')) return 'token_lifetime_too_long';
  if (anomaly.reasons.includes('token_too_old')) return 'token_too_old';
  if (anomaly.reasons.length > 0) return anomaly.reasons[0];
  return 'token_temporal_integrity_detected';
}

async function recordTokenTemporalIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_temporal_integrity_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 96,
      severity: severityFromScore(payload.riskScore || 96),
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
          action: 'token_temporal_integrity_shield_triggered',
          note: payload.note || 'JWT temporal claim anomalies exceeded threshold'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenTemporalIntegrity({ user = null, payload = null, req = null } = {}) {
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

  const now = nowTs();
  const nowDate = new Date(now);
  const nowSec = Math.floor(now / 1000);
  const anomaly = analyzeTokenTemporalIntegrity({ payload, options, nowSec });
  const primaryReason = pickPrimaryReason(anomaly);
  const ip = normalizeIp(getClientIp(req) || '');

  const existing = await UserTokenTemporalIntegrityState.findOne({ userId }).lean();
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
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;
  const windowAnomalyCount = anomaly.detected
    ? ((withinWindow ? Number(existing?.windowAnomalyCount || 0) : 0) + 1)
    : (withinWindow ? Number(existing?.windowAnomalyCount || 0) : 0);
  const missingClaimCount = anomaly.missingReasons.length;
  const windowMissingClaimCount = (withinWindow ? Number(existing?.windowMissingClaimCount || 0) : 0) + missingClaimCount;

  const thresholdReached = anomaly.detected && (
    anomaly.immediate
    || windowAnomalyCount >= options.anomalyThreshold
    || windowMissingClaimCount >= options.missingClaimThreshold
  );

  if (!thresholdReached) {
    const update = {
      status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
      windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
      windowAnomalyCount,
      windowMissingClaimCount,
      quarantineUntil: null,
      lastSeenAt: nowDate,
      lastTokenIssuedAt: epochSecToDate(anomaly.iatSec),
      lastTokenExpiresAt: epochSecToDate(anomaly.expSec),
      lastTokenNotBeforeAt: epochSecToDate(anomaly.nbfSec),
      lastPath: path,
      lastIp: ip,
      lastReason: anomaly.detected ? primaryReason : 'token_temporal_verified',
      expiresAt: computeExpiryDate(options),
      metadata: sanitizeMetadata({
        reasons: anomaly.reasons,
        missingReasons: anomaly.missingReasons,
        lifetimeSec: anomaly.lifetimeSec,
        ageSec: anomaly.ageSec,
        windowAnomalyCount,
        windowMissingClaimCount
      })
    };

    const updateOps = {
      $set: update,
      $setOnInsert: {
        escalationLevel: 0,
      }
    };

    if (anomaly.detected) {
      updateOps.$inc = { suspiciousCount: 1 };
    }

    await UserTokenTemporalIntegrityState.updateOne(
      { userId },
      updateOps,
      { upsert: true, setDefaultsOnInsert: true }
    );

    return {
      ok: true,
      reason: anomaly.detected ? 'token_temporal_anomaly_observed' : 'token_temporal_verified',
      anomalyCount: windowAnomalyCount,
      missingClaimCount: windowMissingClaimCount
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserTokenTemporalIntegrityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowAnomalyCount,
        windowMissingClaimCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastTokenIssuedAt: epochSecToDate(anomaly.iatSec),
        lastTokenExpiresAt: epochSecToDate(anomaly.expSec),
        lastTokenNotBeforeAt: epochSecToDate(anomaly.nbfSec),
        lastPath: path,
        lastIp: ip,
        lastReason: primaryReason,
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          reasons: anomaly.reasons,
          missingReasons: anomaly.missingReasons,
          lifetimeSec: anomaly.lifetimeSec,
          ageSec: anomaly.ageSec,
          windowAnomalyCount,
          windowMissingClaimCount,
          anomalyThreshold: options.anomalyThreshold,
          missingClaimThreshold: options.missingClaimThreshold,
          immediate: anomaly.immediate
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
      reason: `token_temporal_integrity:${primaryReason}`,
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        reasons: anomaly.reasons,
        missingReasons: anomaly.missingReasons,
        lifetimeSec: anomaly.lifetimeSec,
        ageSec: anomaly.ageSec,
        path
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

  await recordTokenTemporalIncident(req, {
    eventType: 'token_temporal_integrity_detected',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'JWT temporal integrity anomaly threshold exceeded',
    userId,
    email: user.email || null,
    signals: {
      reason: primaryReason,
      reasons: anomaly.reasons,
      missingReasons: anomaly.missingReasons
    },
    metadata: {
      path,
      lifetimeSec: anomaly.lifetimeSec,
      ageSec: anomaly.ageSec,
      windowAnomalyCount,
      windowMissingClaimCount,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: `token_temporal_integrity:${primaryReason}`,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenTemporalIntegrityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenTemporalIntegrityState.find(query)
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
      windowAnomalyCount: Number(item.windowAnomalyCount || 0),
      windowMissingClaimCount: Number(item.windowMissingClaimCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastTokenIssuedAt: item.lastTokenIssuedAt ? new Date(item.lastTokenIssuedAt).toISOString() : null,
      lastTokenExpiresAt: item.lastTokenExpiresAt ? new Date(item.lastTokenExpiresAt).toISOString() : null,
      lastTokenNotBeforeAt: item.lastTokenNotBeforeAt ? new Date(item.lastTokenNotBeforeAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenTemporalIntegrityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenTemporalIntegrityState.updateMany(
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

  const result = await UserTokenTemporalIntegrityState.updateMany(
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

async function quarantineTokenTemporalIntegrityUser({
  userId = '',
  reason = 'admin_manual_token_temporal_integrity_quarantine',
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
  const existing = await UserTokenTemporalIntegrityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenTemporalIntegrityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_token_temporal_integrity_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowAnomalyCount: 0,
        windowMissingClaimCount: 0,
        lastTokenIssuedAt: null,
        lastTokenExpiresAt: null,
        lastTokenNotBeforeAt: null,
        lastPath: '',
        lastIp: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_temporal_integrity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenTemporalIntegrity,
  getTokenTemporalIntegrityShieldSnapshot,
  releaseTokenTemporalIntegrityShieldStates,
  quarantineTokenTemporalIntegrityUser
};
