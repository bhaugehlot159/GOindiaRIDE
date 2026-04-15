const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const RefreshTokenReplayState = require('../models/RefreshTokenReplayState');
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

function normalizeObjectId(value) {
  const normalized = String(value || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(normalized)) {
    return '';
  }
  return normalized;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  return {
    enabled: Boolean(env.refreshTokenReplayShieldEnabled),
    failOpen: Boolean(env.refreshTokenReplayShieldFailOpen),
    maxDeltaMs: normalizeNumber(env.refreshTokenReplayMaxDeltaMs, 10 * 60 * 1000, 30 * 1000, 24 * 60 * 60 * 1000),
    requireFingerprintChange: Boolean(env.refreshTokenReplayRequireFingerprintChange),
    ignoreUnknownCountry: Boolean(env.refreshTokenReplayIgnoreUnknownCountry),
    recordTtlMs: normalizeNumber(env.refreshTokenReplayRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 10 * 60 * 1000, 120 * 24 * 60 * 60 * 1000),
    autoCutoffEnabled: Boolean(env.refreshTokenReplayAutoCutoffEnabled),
    autoClearStoredTokens: Boolean(env.refreshTokenReplayAutoClearStoredTokens),
    autoBanUser: Boolean(env.refreshTokenReplayAutoBanUser),
    autoBanMs: normalizeNumber(env.refreshTokenReplayAutoBanMs, 2 * 60 * 60 * 1000, 60 * 1000, 30 * 24 * 60 * 60 * 1000)
  };
}

function extractRefreshSubject(token) {
  const output = {
    userId: '',
    sessionId: '',
    iat: 0,
    exp: 0,
    verified: false
  };

  if (!token) return output;
  const secret = String(env.jwtRefreshSecret || env.jwtSecret || '');

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    output.userId = normalizeObjectId(payload?.sub || payload?.id || payload?._id || '');
    output.sessionId = String(payload?.sid || '').trim().slice(0, 128);
    output.iat = Number(payload?.iat || 0);
    output.exp = Number(payload?.exp || 0);
    output.verified = true;
    return output;
  } catch (_error) {
    // continue with decode fallback to identify replay context even for expired tokens
  }

  try {
    const payload = jwt.decode(token);
    output.userId = normalizeObjectId(payload?.sub || payload?.id || payload?._id || '');
    output.sessionId = String(payload?.sid || '').trim().slice(0, 128);
    output.iat = Number(payload?.iat || 0);
    output.exp = Number(payload?.exp || 0);
  } catch (_error) {
    // keep defaults
  }

  return output;
}

function computeExpiryDate(decoded, recordTtlMs) {
  const now = nowTs();
  const expSec = Number(decoded?.exp || 0);
  if (Number.isFinite(expSec) && expSec > 0) {
    const expMs = Math.floor(expSec * 1000);
    if (expMs > now) {
      return new Date(Math.max(expMs, now + 60 * 1000));
    }
  }
  return new Date(now + recordTtlMs);
}

async function recordReplayIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'refresh_token_replay_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 96,
      severity: severityFromScore(payload.riskScore || 96),
      recommendedAction: payload.recommendedAction || 'revoke_sessions',
      autoResponse: {
        action: payload.action || 'revoke_sessions',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'refresh_token_replay_detected',
          note: payload.note || 'Refresh token replay pattern detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectRefreshTokenReplay({ token = '', req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }
  req = req && typeof req === 'object' ? req : { headers: {}, socket: { remoteAddress: '' } };

  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return { ok: true, reason: 'missing_refresh_token' };
  }
  if (normalizedToken.length > 12000) {
    return { ok: false, reason: 'invalid_refresh_token_format' };
  }

  const tokenHash = hashToken(normalizedToken);
  const decoded = extractRefreshSubject(normalizedToken);
  const userId = decoded.userId;
  const ip = normalizeIp(getClientIp(req) || '');
  const countryRaw = String(getCountry(req) || '').trim().toLowerCase();
  const country = countryRaw || 'unknown';
  if (options.ignoreUnknownCountry && country === 'unknown') {
    return { ok: true, reason: 'unknown_country_ignored' };
  }

  const fingerprintHeader = String(req?.headers?.['x-device-fingerprint'] || '').trim().toLowerCase();
  const fingerprint = fingerprintHeader || String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
  const userAgent = String(req?.headers?.['user-agent'] || '').trim();
  const now = nowTs();
  const nowDate = new Date(now);
  const expiresAt = computeExpiryDate(decoded, options.recordTtlMs);

  const existing = await RefreshTokenReplayState.findOne({ tokenHash }).lean();
  if (!existing) {
    await RefreshTokenReplayState.create({
      tokenHash,
      userId: userId || null,
      status: 'active',
      seenCount: 1,
      firstSeenAt: nowDate,
      lastSeenAt: nowDate,
      firstIp: ip,
      lastIp: ip,
      firstCountry: country,
      lastCountry: country,
      firstFingerprint: fingerprint,
      lastFingerprint: fingerprint,
      firstUserAgent: userAgent,
      lastUserAgent: userAgent,
      lastReason: decoded.verified ? 'first_seen_verified' : 'first_seen_unverified',
      metadata: sanitizeMetadata({
        sessionId: decoded.sessionId || ''
      }),
      expiresAt
    });

    return {
      ok: true,
      reason: 'first_seen',
      tokenHash
    };
  }

  const firstSeenMs = existing.firstSeenAt ? new Date(existing.firstSeenAt).getTime() : now;
  const withinReplayWindow = (now - firstSeenMs) <= options.maxDeltaMs;
  const userMismatch = Boolean(userId && existing.userId && String(existing.userId) !== userId);
  const ipChanged = Boolean(existing.lastIp && ip && existing.lastIp !== ip);
  const fingerprintChanged = Boolean(existing.lastFingerprint && fingerprint && existing.lastFingerprint !== fingerprint);
  const fingerprintCondition = options.requireFingerprintChange ? fingerprintChanged : true;
  const replayByContextDrift = withinReplayWindow && ipChanged && fingerprintCondition;

  const suspicious = userMismatch || replayByContextDrift || existing.status === 'compromised';
  if (suspicious) {
    const reasons = [];
    if (userMismatch) reasons.push('user_mismatch');
    if (replayByContextDrift) reasons.push('context_drift_replay');
    if (existing.status === 'compromised') reasons.push('already_compromised');
    const reason = reasons.join(',');

    await RefreshTokenReplayState.updateOne(
      { _id: existing._id },
      {
        $set: {
          status: 'compromised',
          lastSeenAt: nowDate,
          lastIp: ip,
          lastCountry: country,
          lastFingerprint: fingerprint,
          lastUserAgent: userAgent,
          lastReason: reason,
          metadata: sanitizeMetadata({
            sessionId: decoded.sessionId || '',
            previousIp: existing.lastIp || '',
            previousCountry: existing.lastCountry || '',
            previousFingerprint: existing.lastFingerprint || ''
          }),
          expiresAt
        },
        $inc: {
          seenCount: 1,
          suspiciousCount: 1
        }
      }
    );

    const effectiveUserId = normalizeObjectId(userId || existing.userId || '');
    if (options.autoCutoffEnabled && effectiveUserId) {
      await revokeAllAccessTokensForUser({
        userId: effectiveUserId,
        reason: 'refresh_token_replay_detected_cutoff',
        source: 'security_event',
        actorUserId: null,
        actorIp: ip,
        metadata: {
          tokenHash,
          reasons
        }
      });
    }

    if (options.autoClearStoredTokens && effectiveUserId) {
      await User.updateOne(
        { _id: effectiveUserId },
        {
          $set: {
            refreshToken: null,
            refreshTokens: []
          }
        }
      );
    }

    if (options.autoBanUser && effectiveUserId) {
      await User.updateOne(
        { _id: effectiveUserId },
        {
          $set: {
            isTemporarilyBannedUntil: new Date(now + options.autoBanMs),
            riskScore: 97,
            lastRiskUpdate: nowDate
          }
        }
      );
    }

    await recordReplayIncident(req, {
      eventType: 'refresh_token_replay_detected',
      riskScore: 97,
      recommendedAction: options.autoCutoffEnabled ? 'revoke_sessions_and_deny' : 'deny_refresh',
      action: options.autoCutoffEnabled ? 'revoke_sessions_and_deny' : 'deny_refresh',
      note: 'Refresh token replay/context drift detected',
      userId: effectiveUserId || null,
      signals: {
        userMismatch,
        ipChanged,
        fingerprintChanged,
        withinReplayWindow
      },
      metadata: {
        tokenHash,
        reasons,
        sessionId: decoded.sessionId || ''
      }
    });

    return {
      ok: false,
      reason: 'refresh_token_replay_detected',
      tokenHash,
      evidence: {
        userMismatch,
        ipChanged,
        fingerprintChanged,
        withinReplayWindow
      }
    };
  }

  await RefreshTokenReplayState.updateOne(
    { _id: existing._id },
    {
      $set: {
        status: existing.status === 'released' ? 'active' : existing.status,
        lastSeenAt: nowDate,
        lastIp: ip,
        lastCountry: country,
        lastFingerprint: fingerprint,
        lastUserAgent: userAgent,
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
    tokenHash
  };
}

async function getRefreshTokenReplaySnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedUserId = normalizeObjectId(userId);
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

  const rows = await RefreshTokenReplayState.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    compromisedCount: rows.filter((item) => item.status === 'compromised').length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      tokenHash: String(item.tokenHash || ''),
      userId: item.userId ? String(item.userId) : null,
      status: String(item.status || ''),
      seenCount: Number(item.seenCount || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      firstSeenAt: item.firstSeenAt ? new Date(item.firstSeenAt).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      firstIp: String(item.firstIp || ''),
      lastIp: String(item.lastIp || ''),
      firstCountry: String(item.firstCountry || ''),
      lastCountry: String(item.lastCountry || ''),
      lastReason: String(item.lastReason || ''),
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : null
    }))
  };
}

async function releaseRefreshTokenReplayStates({ id = '', tokenHash = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedTokenHash = String(tokenHash || '').trim().toLowerCase();
  const normalizedUserId = normalizeObjectId(userId);

  if (clearAll) {
    const result = await RefreshTokenReplayState.updateMany(
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
  if (normalizedTokenHash) {
    query.tokenHash = normalizedTokenHash;
  }
  if (normalizedUserId) {
    query.userId = normalizedUserId;
  }

  const result = await RefreshTokenReplayState.updateMany(
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
  inspectRefreshTokenReplay,
  getRefreshTokenReplaySnapshot,
  releaseRefreshTokenReplayStates
};
