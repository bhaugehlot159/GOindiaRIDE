const crypto = require('crypto');
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const principalStateMap = new Map();
const ipStateMap = new Map();

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function getTargetPath(req) {
  const base = String(req.baseUrl || '').trim();
  const path = String(req.path || '').trim();
  return `${base}${path}`;
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const trackPaths = normalizeCsv(input.trackPaths);
  const effectiveTrackPaths = trackPaths.length
    ? trackPaths
    : [
        '/api/auth/login',
        '/api/auth/admin/login',
        '/api/auth/register',
        '/api/auth/forgot-password/request',
        '/api/auth/forgot-password/confirm'
      ];

  return {
    enabled: normalizeBoolean(input.enabled, true),
    failWindowMs: normalizeNumber(input.failWindowMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    principalFailMax: normalizeNumber(input.principalFailMax, 8, 3, 1000),
    ipFailMax: normalizeNumber(input.ipFailMax, 25, 3, 3000),
    blockMs: normalizeNumber(input.blockMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    blockMaxMs: normalizeNumber(input.blockMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(input.escalationFactor, 2, 1, 5),
    resetOnSuccess: normalizeBoolean(input.resetOnSuccess, true),
    trackPaths: effectiveTrackPaths
  };
}

function pruneState(map, failWindowMs) {
  const ts = nowTs();
  for (const [key, state] of map.entries()) {
    const failures = Array.isArray(state.failures)
      ? state.failures.filter((item) => ts - item <= failWindowMs)
      : [];
    const blockedUntil = Number(state.blockedUntil || 0);
    const canDrop = failures.length === 0 && (!blockedUntil || ts > blockedUntil + failWindowMs);
    if (canDrop) {
      map.delete(key);
      continue;
    }
    map.set(key, {
      ...state,
      failures
    });
  }
}

function registerFailure(map, key, failMax, options, metadata = {}) {
  const ts = nowTs();
  const current = map.get(key) || {
    failures: [],
    blockedUntil: 0,
    escalationLevel: 0,
    lastReason: '',
    lastPath: '',
    lastUserId: '',
    lastIp: ''
  };
  const failures = Array.isArray(current.failures)
    ? current.failures.filter((item) => ts - item <= options.failWindowMs)
    : [];
  failures.push(ts);

  let blockedNow = false;
  let blockedUntil = Number(current.blockedUntil || 0);
  let escalationLevel = Number(current.escalationLevel || 0);
  if (failures.length >= failMax) {
    escalationLevel += 1;
    const durationMs = Math.min(
      options.blockMaxMs,
      Math.round(options.blockMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
    );
    blockedUntil = ts + durationMs;
    blockedNow = true;
  }

  map.set(key, {
    failures: failures.slice(-Math.max(failMax, 1)),
    blockedUntil,
    escalationLevel,
    lastReason: String(metadata.reason || ''),
    lastPath: String(metadata.path || ''),
    lastUserId: String(metadata.userId || ''),
    lastIp: String(metadata.ip || '')
  });

  return {
    count: failures.length,
    blockedNow,
    blockedUntil,
    escalationLevel
  };
}

function getBlockState(map, key) {
  const state = map.get(key);
  if (!state || !state.blockedUntil) {
    return { blocked: false, blockedUntil: 0, remainingMs: 0, escalationLevel: 0 };
  }

  const blockedUntil = Number(state.blockedUntil || 0);
  const remainingMs = blockedUntil - nowTs();
  if (remainingMs <= 0) {
    return { blocked: false, blockedUntil: 0, remainingMs: 0, escalationLevel: Number(state.escalationLevel || 0) };
  }

  return {
    blocked: true,
    blockedUntil,
    remainingMs,
    escalationLevel: Number(state.escalationLevel || 0)
  };
}

function clearPrincipalState(principalKey) {
  if (!principalKey) return;
  principalStateMap.delete(principalKey);
}

function resolvePrincipalIdentifier(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
  const username = String(req.body?.username || '').trim().toLowerCase();
  return email || phone || username || 'anonymous_principal';
}

function buildPrincipalAndIpKeys(req, targetPath) {
  const ip = getClientIp(req) || 'unknown_ip';
  const principal = resolvePrincipalIdentifier(req);
  const principalKey = hashValue(`${ip}|${principal}|${targetPath}`);
  const ipKey = hashValue(`${ip}|${targetPath}`);
  return {
    principalKey,
    ipKey,
    ip,
    principal
  };
}

async function recordAuthAbuseIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'auth_abuse_shield',
      userId: authUser.id || authUser.sub || authUser._id || null,
      email: authUser.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 70,
      severity: severityFromScore(payload.riskScore || 70),
      recommendedAction: payload.recommendedAction || 'temporary_block',
      autoResponse: {
        action: payload.action || 'temporary_block',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'auth_abuse_shield_triggered',
          note: payload.note || 'Auth abuse shield blocked request'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function listState(map, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  const includeInactive = Boolean(options.includeInactive);
  const rows = [];
  const ts = nowTs();

  for (const [key, state] of map.entries()) {
    const blockedUntil = Number(state.blockedUntil || 0);
    const remainingMs = Math.max(0, blockedUntil - ts);
    const active = remainingMs > 0;
    if (!includeInactive && !active) continue;
    rows.push({
      key,
      active,
      blockedUntil: blockedUntil ? new Date(blockedUntil).toISOString() : null,
      remainingMs,
      failureCount: Array.isArray(state.failures) ? state.failures.length : 0,
      escalationLevel: Number(state.escalationLevel || 0),
      lastReason: String(state.lastReason || ''),
      lastPath: String(state.lastPath || ''),
      lastUserId: String(state.lastUserId || ''),
      lastIp: String(state.lastIp || '')
    });
  }

  rows.sort((a, b) => b.remainingMs - a.remainingMs);
  return rows.slice(0, limit);
}

function getAuthAbuseShieldSnapshot(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  pruneState(principalStateMap, normalizeNumber(options.failWindowMs || 15 * 60 * 1000, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000));
  pruneState(ipStateMap, normalizeNumber(options.failWindowMs || 15 * 60 * 1000, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000));
  const principalLocks = listState(principalStateMap, { includeInactive, limit });
  const ipLocks = listState(ipStateMap, { includeInactive, limit });
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

function releaseAuthAbuseShieldLocks(payload = {}) {
  const principalKey = String(payload.principalKey || '').trim().toLowerCase();
  const ipKey = String(payload.ipKey || '').trim().toLowerCase();
  const clearAll = Boolean(payload.clearAll);

  let releasedPrincipal = 0;
  let releasedIp = 0;

  if (clearAll) {
    releasedPrincipal = principalStateMap.size;
    releasedIp = ipStateMap.size;
    principalStateMap.clear();
    ipStateMap.clear();
    return { releasedPrincipal, releasedIp, clearAll: true };
  }

  if (principalKey && principalStateMap.delete(principalKey)) {
    releasedPrincipal = 1;
  }
  if (ipKey && ipStateMap.delete(ipKey)) {
    releasedIp = 1;
  }

  return {
    releasedPrincipal,
    releasedIp,
    clearAll: false
  };
}

function authAbuseShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    try {
      if (!isMutatingMethod(req.method)) {
        return next();
      }

      const targetPath = getTargetPath(req);
      if (!options.trackPaths.some((path) => targetPath.startsWith(path))) {
        return next();
      }

      pruneState(principalStateMap, options.failWindowMs);
      pruneState(ipStateMap, options.failWindowMs);

      const keys = buildPrincipalAndIpKeys(req, targetPath);
      const principalBlock = getBlockState(principalStateMap, keys.principalKey);
      const ipBlock = getBlockState(ipStateMap, keys.ipKey);
      if (principalBlock.blocked || ipBlock.blocked) {
        const strongest = principalBlock.remainingMs >= ipBlock.remainingMs ? principalBlock : ipBlock;
        return res.status(429).json({
          message: 'Auth request temporarily blocked by abuse shield',
          blockedUntil: strongest.blockedUntil ? new Date(strongest.blockedUntil).toISOString() : null,
          remainingMs: strongest.remainingMs
        });
      }

      res.on('finish', async () => {
        try {
          const statusCode = Number(res.statusCode || 200);
          const isFailure = statusCode >= 400 && statusCode < 500;
          const isSuccess = statusCode >= 200 && statusCode < 300;

          if (!isFailure && !(isSuccess && options.resetOnSuccess)) {
            return;
          }

          if (isFailure) {
            const principalResult = registerFailure(
              principalStateMap,
              keys.principalKey,
              options.principalFailMax,
              options,
              {
                reason: `http_${statusCode}`,
                path: targetPath,
                userId: (req.user && req.user.id) || '',
                ip: keys.ip
              }
            );
            const ipResult = registerFailure(
              ipStateMap,
              keys.ipKey,
              options.ipFailMax,
              options,
              {
                reason: `http_${statusCode}`,
                path: targetPath,
                userId: (req.user && req.user.id) || '',
                ip: keys.ip
              }
            );

            if (principalResult.blockedNow || ipResult.blockedNow) {
              await recordAuthAbuseIncident(req, {
                eventType: 'auth_abuse_shield_blocked',
                riskScore: Math.max(72, Math.min(96, 60 + (principalResult.escalationLevel * 8) + (ipResult.escalationLevel * 4))),
                recommendedAction: 'temporary_auth_block',
                action: 'temporary_auth_block',
                note: 'Auth abuse threshold exceeded',
                signals: {
                  path: targetPath,
                  statusCode,
                  principalFailures: principalResult.count,
                  ipFailures: ipResult.count
                },
                metadata: {
                  principalKey: keys.principalKey,
                  ipKey: keys.ipKey,
                  principal: keys.principal,
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
              clearPrincipalState(keys.principalKey);
            }
          }
        } catch (_error) {
          // non-blocking
        }
      });

      return next();
    } catch (_error) {
      return next();
    }
  };
}

module.exports = {
  authAbuseShieldMiddleware,
  getAuthAbuseShieldSnapshot,
  releaseAuthAbuseShieldLocks,
  isAuthAbuseShieldSha256: isSha256
};

