const SecurityIncident = require('../models/SecurityIncident');
const AccessTokenReplayRecord = require('../models/AccessTokenReplayRecord');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const {
  hashJti,
  isTokenRevocationSha256,
  revokeAccessTokenByJti,
  revokeAllAccessTokensForUser
} = require('./tokenRevocationService');

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
}

function normalizeDate(value, fallbackMs) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return new Date(fallbackMs);
  }
  return date;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).slice(0, 50));
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveReplayOptions() {
  return {
    enabled: Boolean(env.accessTokenReplayShieldEnabled),
    failOpen: Boolean(env.accessTokenReplayShieldFailOpen),
    maxDeltaMs: normalizeNumber(env.accessTokenReplayMaxDeltaMs, 10 * 60 * 1000, 30 * 1000, 24 * 60 * 60 * 1000),
    requireFingerprintChange: Boolean(env.accessTokenReplayRequireFingerprintChange),
    userCutoffOnDetect: Boolean(env.accessTokenReplayUserCutoffOnDetect),
    recordTtlMs: normalizeNumber(env.accessTokenReplayRecordTtlMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000)
  };
}

async function recordReplayIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};
    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'access_token_replay_detected',
      userId: authUser.id || authUser.sub || authUser._id || payload.userId || null,
      email: authUser.email || payload.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 92,
      severity: severityFromScore(payload.riskScore || 92),
      recommendedAction: payload.recommendedAction || 'revoke_token',
      autoResponse: {
        action: payload.action || 'revoke_token',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'access_token_replay_detected',
          note: payload.note || 'Access token replay pattern detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function getFingerprint(req) {
  const provided = String(req.headers['x-device-fingerprint'] || '').trim().toLowerCase();
  if (provided) return provided;
  return String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
}

function computeExpiryFromPayload(payload, recordTtlMs) {
  const now = Date.now();
  const expSec = Number(payload?.exp || 0);
  if (Number.isFinite(expSec) && expSec > 0) {
    const expMs = expSec * 1000;
    if (expMs > now) {
      return new Date(Math.max(expMs, now + 60 * 1000));
    }
  }
  return new Date(now + recordTtlMs);
}

async function inspectAccessTokenReplay({ payload = {}, user = null, req = null } = {}) {
  const options = resolveReplayOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const jti = String(payload?.jti || '').trim();
  if (!jti) {
    return { ok: true, reason: 'missing_jti' };
  }

  const jtiHash = hashJti(jti);
  if (!isTokenRevocationSha256(jtiHash)) {
    return { ok: true, reason: 'invalid_jti_hash' };
  }

  const userId = String(user?._id || user?.id || payload?.sub || '').trim();
  const sessionId = String(payload?.sid || '').trim();
  const ip = normalizeIp(getClientIp(req) || '');
  const fingerprint = getFingerprint(req);
  const country = String(getCountry(req) || '').trim().toLowerCase();
  const userAgent = String(req?.headers?.['user-agent'] || '').trim();
  const now = Date.now();
  const nowDate = new Date(now);
  const expiresAt = computeExpiryFromPayload(payload, options.recordTtlMs);

  const existing = await AccessTokenReplayRecord.findOne({ jtiHash }).lean();
  if (!existing) {
    await AccessTokenReplayRecord.create({
      jtiHash,
      userId: userId || null,
      sessionId,
      firstSeenAt: nowDate,
      lastSeenAt: nowDate,
      firstIp: ip,
      lastIp: ip,
      firstFingerprint: fingerprint,
      lastFingerprint: fingerprint,
      firstUserAgent: userAgent,
      lastUserAgent: userAgent,
      firstCountry: country,
      lastCountry: country,
      seenCount: 1,
      status: 'active',
      lastReason: 'first_seen',
      metadata: {},
      expiresAt
    });
    return {
      ok: true,
      reason: 'first_seen',
      jtiHash
    };
  }

  const firstSeenMs = existing.firstSeenAt ? new Date(existing.firstSeenAt).getTime() : now;
  const withinTightWindow = (now - firstSeenMs) <= options.maxDeltaMs;
  const userMismatch = userId && existing.userId && String(existing.userId) !== userId;
  const ipChanged = Boolean(existing.lastIp && ip && existing.lastIp !== ip);
  const fingerprintChanged = Boolean(existing.lastFingerprint && fingerprint && existing.lastFingerprint !== fingerprint);
  const fingerprintCondition = options.requireFingerprintChange ? fingerprintChanged : true;
  const replayByNetworkShift = withinTightWindow && ipChanged && fingerprintCondition;

  const suspicious = userMismatch || replayByNetworkShift || existing.status === 'compromised';
  if (suspicious) {
    const reasons = [];
    if (userMismatch) reasons.push('user_mismatch');
    if (replayByNetworkShift) reasons.push('ip_fingerprint_drift');
    if (existing.status === 'compromised') reasons.push('previously_compromised');
    const reason = reasons.join(',');

    await AccessTokenReplayRecord.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastSeenAt: nowDate,
          lastIp: ip,
          lastFingerprint: fingerprint,
          lastUserAgent: userAgent,
          lastCountry: country,
          status: 'compromised',
          lastReason: reason,
          expiresAt
        },
        $inc: {
          seenCount: 1,
          suspiciousCount: 1
        }
      }
    );

    await revokeAccessTokenByJti({
      jtiHash,
      userId: userId || existing.userId || null,
      reason: 'auto_access_token_replay_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        reasons,
        sessionId
      }
    });

    if (options.userCutoffOnDetect) {
      const effectiveUserId = String(userId || existing.userId || '').trim();
      if (effectiveUserId) {
        await revokeAllAccessTokensForUser({
          userId: effectiveUserId,
          reason: 'auto_access_token_replay_detected_cutoff',
          source: 'security_event',
          actorUserId: null,
          actorIp: ip,
          metadata: {
            jtiHash
          }
        });
      }
    }

    await recordReplayIncident(req, {
      eventType: 'access_token_replay_detected',
      riskScore: 95,
      recommendedAction: 'revoke_token',
      action: options.userCutoffOnDetect ? 'revoke_user_sessions' : 'revoke_token',
      note: 'Access token replay pattern detected',
      signals: {
        userMismatch,
        ipChanged,
        fingerprintChanged,
        withinTightWindow
      },
      metadata: {
        jtiHash,
        reasons,
        sessionId,
        userId: userId || String(existing.userId || '')
      }
    });

    return {
      ok: false,
      reason: 'access_token_replay_detected',
      jtiHash,
      evidence: {
        userMismatch,
        ipChanged,
        fingerprintChanged,
        withinTightWindow
      }
    };
  }

  await AccessTokenReplayRecord.updateOne(
    { _id: existing._id },
    {
      $set: {
        lastSeenAt: nowDate,
        lastIp: ip,
        lastFingerprint: fingerprint,
        lastUserAgent: userAgent,
        lastCountry: country,
        status: existing.status === 'released' ? 'active' : existing.status,
        lastReason: ipChanged || fingerprintChanged ? 'context_shift_allowed' : 'seen',
        expiresAt
      },
      $inc: {
        seenCount: 1
      }
    }
  );

  return {
    ok: true,
    reason: 'seen',
    jtiHash
  };
}

async function getAccessTokenReplaySnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
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

  const rows = await AccessTokenReplayRecord.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    compromisedCount: rows.filter((item) => item.status === 'compromised').length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      jtiHash: String(item.jtiHash || ''),
      userId: item.userId ? String(item.userId) : null,
      sessionId: String(item.sessionId || ''),
      status: String(item.status || ''),
      seenCount: Number(item.seenCount || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      firstSeenAt: item.firstSeenAt ? new Date(item.firstSeenAt).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      firstIp: String(item.firstIp || ''),
      lastIp: String(item.lastIp || ''),
      firstFingerprint: String(item.firstFingerprint || ''),
      lastFingerprint: String(item.lastFingerprint || ''),
      lastReason: String(item.lastReason || ''),
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : null
    }))
  };
}

async function releaseAccessTokenReplayRecords({ id = '', jtiHash = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedJtiHash = String(jtiHash || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await AccessTokenReplayRecord.updateMany(
      {},
      {
        $set: {
          status: 'released',
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
  if (normalizedId) {
    query._id = normalizedId;
  }
  if (normalizedJtiHash) {
    query.jtiHash = normalizedJtiHash;
  }
  if (normalizedUserId) {
    query.userId = normalizedUserId;
  }

  const result = await AccessTokenReplayRecord.updateMany(
    query,
    {
      $set: {
        status: 'released',
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

module.exports = {
  inspectAccessTokenReplay,
  getAccessTokenReplaySnapshot,
  releaseAccessTokenReplayRecords
};
