const crypto = require('crypto');
const SecurityIncident = require('../models/SecurityIncident');
const AuthAbuseRecord = require('../models/AuthAbuseRecord');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeCsv(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function getTargetPath(req) {
  const baseUrl = String(req.baseUrl || '').trim();
  const path = String(req.path || '').trim();
  return `${baseUrl}${path}`;
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function resolvePrincipalIdentifier(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
  const username = String(req.body?.username || '').trim().toLowerCase();
  return email || phone || username || 'anonymous_principal';
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const trackPaths = normalizeCsv(input.trackPaths);
  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, true),
    failWindowMs: normalizeNumber(input.failWindowMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    principalFailMax: normalizeNumber(input.principalFailMax, 8, 3, 1000),
    ipFailMax: normalizeNumber(input.ipFailMax, 25, 3, 3000),
    blockMs: normalizeNumber(input.blockMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    blockMaxMs: normalizeNumber(input.blockMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(input.escalationFactor, 2, 1, 5),
    resetOnSuccess: normalizeBoolean(input.resetOnSuccess, true),
    retentionMs: normalizeNumber(input.retentionMs, 14 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 90 * 24 * 60 * 60 * 1000),
    trackPaths: trackPaths.length
      ? trackPaths
      : [
          '/api/auth/login',
          '/api/auth/admin/login',
          '/api/auth/register',
          '/api/auth/forgot-password/request',
          '/api/auth/forgot-password/confirm'
        ]
  };
}

function buildKeys(req, targetPath) {
  const ip = getClientIp(req) || 'unknown_ip';
  const principal = resolvePrincipalIdentifier(req);
  const principalHash = hashValue(principal);
  const ipHash = hashValue(ip);
  return {
    ip,
    principal,
    principalHash,
    ipHash,
    principalKey: hashValue(`${ip}|${principal}|${targetPath}`),
    ipKey: hashValue(`${ip}|${targetPath}`)
  };
}

function calculateDurationMs(options, escalationLevel) {
  return Math.min(
    options.blockMaxMs,
    Math.round(options.blockMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
  );
}

function computeExpiryDate(options, blockedUntilMs = 0) {
  const ts = nowTs();
  const boundedBlockedUntilMs = Number.isFinite(blockedUntilMs) ? blockedUntilMs : 0;
  const minRetentionMs = Math.max(options.retentionMs, options.failWindowMs + options.blockMaxMs);
  const extraWindowMs = boundedBlockedUntilMs > ts
    ? (boundedBlockedUntilMs - ts) + options.retentionMs
    : 0;
  return new Date(ts + Math.max(minRetentionMs, extraWindowMs));
}

async function findBlockState(keys) {
  const rows = await AuthAbuseRecord.find({
    key: { $in: [keys.principalKey, keys.ipKey] },
    keyType: { $in: ['principal', 'ip'] }
  }).lean();

  const ts = nowTs();
  const principalRow = rows.find((item) => item.key === keys.principalKey);
  const ipRow = rows.find((item) => item.key === keys.ipKey);
  const principalUntil = principalRow?.blockedUntil ? new Date(principalRow.blockedUntil).getTime() : 0;
  const ipUntil = ipRow?.blockedUntil ? new Date(ipRow.blockedUntil).getTime() : 0;
  const principalRemainingMs = Math.max(0, principalUntil - ts);
  const ipRemainingMs = Math.max(0, ipUntil - ts);
  const remainingMs = Math.max(principalRemainingMs, ipRemainingMs);
  const blocked = remainingMs > 0;
  const blockedUntilMs = Math.max(principalUntil, ipUntil);

  return {
    blocked,
    blockedUntilMs,
    remainingMs,
    principalRemainingMs,
    ipRemainingMs
  };
}

async function registerFailure(input = {}) {
  const {
    key,
    keyType,
    path,
    principalHash,
    ipHash,
    ip,
    userId,
    statusCode,
    failMax,
    options
  } = input;

  const ts = nowTs();
  const now = new Date(ts);
  const existing = await AuthAbuseRecord.findOne({ key, keyType }).lean();
  const previousLastFailureMs = existing?.lastFailureAt ? new Date(existing.lastFailureAt).getTime() : 0;
  const withinWindow = previousLastFailureMs > 0 && (ts - previousLastFailureMs) <= options.failWindowMs;

  let failureCount = withinWindow ? Number(existing?.failureCount || 0) : 0;
  let escalationLevel = Number(existing?.escalationLevel || 0);
  let blockedUntilMs = existing?.blockedUntil ? new Date(existing.blockedUntil).getTime() : 0;
  let blockedNow = false;

  failureCount += 1;

  if (failureCount >= failMax) {
    escalationLevel += 1;
    blockedUntilMs = ts + calculateDurationMs(options, escalationLevel);
    blockedNow = true;
  }

  await AuthAbuseRecord.updateOne(
    { key, keyType },
    {
      $set: {
        path,
        principalHash,
        ipHash,
        failureCount,
        escalationLevel,
        blockedUntil: blockedUntilMs ? new Date(blockedUntilMs) : null,
        lastFailureAt: now,
        lastStatusCode: Number(statusCode || 0),
        lastReason: statusCode ? `http_${statusCode}` : 'http_4xx',
        lastIp: String(ip || ''),
        lastUserId: String(userId || ''),
        expiresAt: computeExpiryDate(options, blockedUntilMs)
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return {
    count: failureCount,
    blockedNow,
    blockedUntil: blockedUntilMs,
    escalationLevel
  };
}

async function clearPrincipalLock(key, options) {
  await AuthAbuseRecord.deleteOne({ key, keyType: 'principal' });
  await AuthAbuseRecord.updateOne(
    { key, keyType: 'principal' },
    {
      $set: {
        expiresAt: computeExpiryDate(options, 0)
      }
    }
  );
}

async function recordPersistentIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const actor = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'auth_abuse_persistent_shield',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 76,
      severity: severityFromScore(payload.riskScore || 76),
      recommendedAction: payload.recommendedAction || 'temporary_auth_block',
      autoResponse: {
        action: payload.action || 'temporary_auth_block',
        applied: true,
        note: payload.note || 'Persistent auth abuse shield triggered'
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'auth_abuse_persistent_shield_triggered',
          note: payload.note || 'Persistent auth abuse shield blocked request'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function toResponseItem(item) {
  const blockedUntilMs = item?.blockedUntil ? new Date(item.blockedUntil).getTime() : 0;
  const remainingMs = Math.max(0, blockedUntilMs - nowTs());
  return {
    key: String(item?.key || ''),
    keyType: String(item?.keyType || ''),
    path: String(item?.path || ''),
    active: remainingMs > 0,
    blockedUntil: blockedUntilMs ? new Date(blockedUntilMs).toISOString() : null,
    remainingMs,
    failureCount: Number(item?.failureCount || 0),
    escalationLevel: Number(item?.escalationLevel || 0),
    lastFailureAt: item?.lastFailureAt ? new Date(item.lastFailureAt).toISOString() : null,
    lastStatusCode: Number(item?.lastStatusCode || 0) || null,
    lastReason: String(item?.lastReason || ''),
    lastIp: String(item?.lastIp || ''),
    lastUserId: String(item?.lastUserId || ''),
    principalHash: String(item?.principalHash || ''),
    ipHash: String(item?.ipHash || '')
  };
}

async function getPersistentAuthAbuseShieldSnapshot(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  const query = {
    keyType: { $in: ['principal', 'ip'] }
  };
  if (!includeInactive) {
    query.blockedUntil = { $gt: new Date() };
  }

  const rows = await AuthAbuseRecord.find(query)
    .sort({ blockedUntil: -1, lastFailureAt: -1 })
    .limit(limit * 2)
    .lean();

  const principalLocks = rows
    .filter((item) => item.keyType === 'principal')
    .map(toResponseItem)
    .slice(0, limit);
  const ipLocks = rows
    .filter((item) => item.keyType === 'ip')
    .map(toResponseItem)
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    principalLocks,
    ipLocks,
    totals: {
      principal: principalLocks.length,
      principalActive: principalLocks.filter((item) => item.active).length,
      ip: ipLocks.length,
      ipActive: ipLocks.filter((item) => item.active).length
    }
  };
}

async function releasePersistentAuthAbuseShieldLocks(payload = {}) {
  const principalKey = String(payload.principalKey || '').trim().toLowerCase();
  const ipKey = String(payload.ipKey || '').trim().toLowerCase();
  const clearAll = Boolean(payload.clearAll);

  let releasedPrincipal = 0;
  let releasedIp = 0;

  if (clearAll) {
    const result = await AuthAbuseRecord.deleteMany({ keyType: { $in: ['principal', 'ip'] } });
    const deleted = Number(result?.deletedCount || 0);
    return {
      releasedPrincipal: deleted,
      releasedIp: 0,
      clearAll: true
    };
  }

  if (principalKey) {
    const principalResult = await AuthAbuseRecord.deleteOne({ key: principalKey, keyType: 'principal' });
    releasedPrincipal = Number(principalResult?.deletedCount || 0);
  }

  if (ipKey) {
    const ipResult = await AuthAbuseRecord.deleteOne({ key: ipKey, keyType: 'ip' });
    releasedIp = Number(ipResult?.deletedCount || 0);
  }

  return {
    releasedPrincipal,
    releasedIp,
    clearAll: false
  };
}

function authPersistentAbuseShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    if (!isMutatingMethod(req.method)) {
      return next();
    }

    const targetPath = getTargetPath(req);
    if (!options.trackPaths.some((path) => targetPath.startsWith(path))) {
      return next();
    }

    const keys = buildKeys(req, targetPath);

    try {
      const blockState = await findBlockState(keys);
      if (blockState.blocked) {
        return res.status(429).json({
          message: 'Auth request temporarily blocked by persistent abuse shield',
          blockedUntil: blockState.blockedUntilMs ? new Date(blockState.blockedUntilMs).toISOString() : null,
          remainingMs: blockState.remainingMs
        });
      }
    } catch (_error) {
      if (!options.failOpen) {
        return res.status(503).json({ message: 'Auth abuse shield unavailable' });
      }
    }

    res.on('finish', () => {
      const statusCode = Number(res.statusCode || 200);
      const isFailure = statusCode >= 400 && statusCode < 500;
      const isSuccess = statusCode >= 200 && statusCode < 300;

      if (!isFailure && !(isSuccess && options.resetOnSuccess)) {
        return;
      }

      Promise.resolve().then(async () => {
        try {
          if (isFailure) {
            const user = req.user || req.auth || {};
            const userId = user.id || user.sub || user._id || '';
            const principalResult = await registerFailure({
              key: keys.principalKey,
              keyType: 'principal',
              path: targetPath,
              principalHash: keys.principalHash,
              ipHash: keys.ipHash,
              ip: keys.ip,
              userId,
              statusCode,
              failMax: options.principalFailMax,
              options
            });
            const ipResult = await registerFailure({
              key: keys.ipKey,
              keyType: 'ip',
              path: targetPath,
              principalHash: keys.principalHash,
              ipHash: keys.ipHash,
              ip: keys.ip,
              userId,
              statusCode,
              failMax: options.ipFailMax,
              options
            });

            if (principalResult.blockedNow || ipResult.blockedNow) {
              await recordPersistentIncident(req, {
                eventType: 'auth_abuse_persistent_shield_blocked',
                riskScore: Math.max(78, Math.min(97, 64 + (principalResult.escalationLevel * 8) + (ipResult.escalationLevel * 5))),
                recommendedAction: 'temporary_auth_block',
                action: 'temporary_auth_block',
                note: 'Persistent auth abuse threshold exceeded',
                signals: {
                  path: targetPath,
                  statusCode,
                  principalFailures: principalResult.count,
                  ipFailures: ipResult.count
                },
                metadata: {
                  principalKey: keys.principalKey,
                  ipKey: keys.ipKey,
                  principalHash: keys.principalHash,
                  ipHash: keys.ipHash,
                  principalBlockedUntil: principalResult.blockedUntil ? new Date(principalResult.blockedUntil).toISOString() : null,
                  ipBlockedUntil: ipResult.blockedUntil ? new Date(ipResult.blockedUntil).toISOString() : null
                }
              });
            }
            return;
          }

          if (isSuccess && options.resetOnSuccess) {
            const lowerPath = String(targetPath || '').toLowerCase();
            if (lowerPath.includes('/login') || lowerPath.includes('/register')) {
              await clearPrincipalLock(keys.principalKey, options);
            }
          }
        } catch (_error) {
          // non-blocking
        }
      });
    });

    return next();
  };
}

module.exports = {
  authPersistentAbuseShieldMiddleware,
  getPersistentAuthAbuseShieldSnapshot,
  releasePersistentAuthAbuseShieldLocks,
  isPersistentAuthAbuseShieldSha256: isSha256
};
