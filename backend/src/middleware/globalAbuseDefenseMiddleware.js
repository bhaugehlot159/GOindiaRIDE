const crypto = require('crypto');
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_CONTENT_TYPES = [
  'application/json',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain'
];
const SUSPICIOUS_PATH_PATTERNS = [
  /\.\./i,
  /%2e%2e/i,
  /\/\.env/i,
  /\/wp-admin/i,
  /\/phpmyadmin/i,
  /\/etc\/passwd/i,
  /\/proc\/self/i,
  /\/server-status/i,
  /\/actuator/i,
  /\/cgi-bin/i
];

const principalStateMap = new Map();
const routeVelocityMap = new Map();

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

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function pruneState(options) {
  const ts = nowTs();
  const maxWindow = Math.max(options.principalFailWindowMs, 60 * 1000);

  for (const [key, state] of principalStateMap.entries()) {
    const failures = Array.isArray(state.failures)
      ? state.failures.filter((item) => ts - item <= maxWindow)
      : [];
    const cooldownUntil = Number(state.cooldownUntil || 0);
    const canDrop = failures.length === 0 && (!cooldownUntil || ts > cooldownUntil + maxWindow);
    if (canDrop) {
      principalStateMap.delete(key);
      continue;
    }
    state.failures = failures;
    principalStateMap.set(key, state);
  }

  for (const [key, value] of routeVelocityMap.entries()) {
    const hits = Array.isArray(value.hits)
      ? value.hits.filter((item) => ts - item <= 60 * 1000)
      : [];
    if (!hits.length && ts - Number(value.updatedAt || 0) > 5 * 60 * 1000) {
      routeVelocityMap.delete(key);
      continue;
    }
    routeVelocityMap.set(key, {
      hits,
      updatedAt: hits.length ? ts : value.updatedAt
    });
  }
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function hasKnownContentType(req) {
  const raw = String(req.headers['content-type'] || '').toLowerCase();
  if (!raw) return false;
  return SAFE_CONTENT_TYPES.some((item) => raw.includes(item));
}

function getRequestBodyDepth(input, currentDepth = 0) {
  if (!input || typeof input !== 'object') return currentDepth;
  if (Array.isArray(input)) {
    let maxDepth = currentDepth;
    for (let i = 0; i < input.length; i += 1) {
      maxDepth = Math.max(maxDepth, getRequestBodyDepth(input[i], currentDepth + 1));
    }
    return maxDepth;
  }

  let maxDepth = currentDepth;
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i += 1) {
    maxDepth = Math.max(maxDepth, getRequestBodyDepth(input[keys[i]], currentDepth + 1));
  }
  return maxDepth;
}

function countRequestBodyKeys(input) {
  if (!input || typeof input !== 'object') return 0;
  if (Array.isArray(input)) {
    let count = 0;
    for (let i = 0; i < input.length; i += 1) {
      count += countRequestBodyKeys(input[i]);
    }
    return count;
  }

  const keys = Object.keys(input);
  let count = keys.length;
  for (let i = 0; i < keys.length; i += 1) {
    count += countRequestBodyKeys(input[keys[i]]);
  }
  return count;
}

function findLongestStringLength(input) {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'string') return input.length;
  if (typeof input !== 'object') return 0;
  if (Array.isArray(input)) {
    let longest = 0;
    for (let i = 0; i < input.length; i += 1) {
      longest = Math.max(longest, findLongestStringLength(input[i]));
    }
    return longest;
  }

  const keys = Object.keys(input);
  let longest = 0;
  for (let i = 0; i < keys.length; i += 1) {
    longest = Math.max(longest, findLongestStringLength(input[keys[i]]));
  }
  return longest;
}

function findLargestArrayLength(input) {
  if (!input || typeof input !== 'object') return 0;
  if (Array.isArray(input)) {
    let maxLen = input.length;
    for (let i = 0; i < input.length; i += 1) {
      maxLen = Math.max(maxLen, findLargestArrayLength(input[i]));
    }
    return maxLen;
  }

  const keys = Object.keys(input);
  let maxLen = 0;
  for (let i = 0; i < keys.length; i += 1) {
    maxLen = Math.max(maxLen, findLargestArrayLength(input[keys[i]]));
  }
  return maxLen;
}

function buildPrincipalKey(req) {
  const ip = getClientIp(req) || 'unknown_ip';
  const authUser = req.user || req.auth || {};
  const actorUserId = authUser.id || authUser.sub || authUser._id || 'anonymous';
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 220);
  return hashValue(`${ip}|${actorUserId}|${userAgent}`);
}

function addRouteVelocity(req) {
  const ip = getClientIp(req) || 'unknown_ip';
  const routeKey = `${ip}::${String(req.originalUrl || req.url || '').slice(0, 180)}::${String(req.method || 'GET')}`;
  const ts = nowTs();
  const bucket = routeVelocityMap.get(routeKey) || { hits: [], updatedAt: ts };
  bucket.hits.push(ts);
  bucket.hits = bucket.hits.filter((item) => ts - item <= 60 * 1000);
  bucket.updatedAt = ts;
  routeVelocityMap.set(routeKey, bucket);
  return bucket.hits.length;
}

function registerPrincipalStrike(principalKey, options, metadata = {}) {
  const ts = nowTs();
  const state = principalStateMap.get(principalKey) || {
    failures: [],
    cooldownUntil: 0,
    escalationLevel: 0,
    lastReason: '',
    lastIp: '',
    lastUserId: ''
  };

  state.failures = Array.isArray(state.failures)
    ? state.failures.filter((item) => ts - item <= options.principalFailWindowMs)
    : [];
  state.failures.push(ts);

  let cooldownApplied = false;
  if (state.failures.length >= options.principalFailMax) {
    state.escalationLevel = Math.max(0, Number(state.escalationLevel || 0)) + 1;
    const durationMs = Math.min(
      options.principalBlockMaxMs,
      Math.round(options.principalBlockMs * Math.pow(options.principalEscalationFactor, Math.max(0, state.escalationLevel - 1)))
    );
    state.cooldownUntil = ts + durationMs;
    state.failures = state.failures.slice(-options.principalFailMax);
    cooldownApplied = true;
  }

  state.lastReason = String(metadata.reason || '');
  state.lastIp = String(metadata.ip || '');
  state.lastUserId = String(metadata.userId || '');
  principalStateMap.set(principalKey, state);

  return {
    failureCount: state.failures.length,
    cooldownApplied,
    cooldownUntil: state.cooldownUntil || 0,
    escalationLevel: state.escalationLevel || 0
  };
}

function getPrincipalCooldown(principalKey) {
  const state = principalStateMap.get(principalKey);
  if (!state || !state.cooldownUntil) {
    return { blocked: false, cooldownUntil: 0, remainingMs: 0, escalationLevel: 0 };
  }

  const remainingMs = Number(state.cooldownUntil) - nowTs();
  if (remainingMs <= 0) {
    return { blocked: false, cooldownUntil: 0, remainingMs: 0, escalationLevel: Number(state.escalationLevel || 0) };
  }

  return {
    blocked: true,
    cooldownUntil: Number(state.cooldownUntil),
    remainingMs,
    escalationLevel: Number(state.escalationLevel || 0)
  };
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

async function recordGatewayIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'global_abuse_defense',
      userId: authUser.id || authUser.sub || authUser._id || null,
      email: authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 70,
      severity: severityFromScore(payload.riskScore || 70),
      recommendedAction: payload.recommendedAction || 'block',
      autoResponse: {
        action: payload.autoAction || 'temporary_block',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'global_abuse_defense_triggered',
          note: payload.note || 'Global abuse defense blocked request'
        }
      ]
    });
  } catch (_error) {
    // best-effort audit logging
  }
}

function buildOptions(input = {}) {
  return {
    enabled: normalizeBoolean(input.enabled, true),
    maxUrlLength: normalizeNumber(input.maxUrlLength, 2048, 512, 12000),
    maxHeaderCount: normalizeNumber(input.maxHeaderCount, 120, 20, 500),
    maxBodyDepth: normalizeNumber(input.maxBodyDepth, 10, 2, 30),
    maxBodyKeys: normalizeNumber(input.maxBodyKeys, 800, 50, 20000),
    maxArrayLength: normalizeNumber(input.maxArrayLength, 5000, 50, 100000),
    maxStringLength: normalizeNumber(input.maxStringLength, 10000, 100, 200000),
    requireKnownContentType: normalizeBoolean(input.requireKnownContentType, true),
    principalFailWindowMs: normalizeNumber(input.principalFailWindowMs, 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    principalFailMax: normalizeNumber(input.principalFailMax, 15, 3, 1000),
    principalBlockMs: normalizeNumber(input.principalBlockMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    principalBlockMaxMs: normalizeNumber(input.principalBlockMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    principalEscalationFactor: normalizeNumber(input.principalEscalationFactor, 2, 1, 5)
  };
}

function globalAbuseDefenseMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    try {
      pruneState(options);
      const principalKey = buildPrincipalKey(req);
      const principalCooldown = getPrincipalCooldown(principalKey);
      if (principalCooldown.blocked) {
        return res.status(429).json({
          message: 'Request temporarily blocked by global abuse defense',
          blockedUntil: new Date(principalCooldown.cooldownUntil).toISOString(),
          remainingMs: principalCooldown.remainingMs
        });
      }

      const method = String(req.method || 'GET').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) {
        const strike = registerPrincipalStrike(principalKey, options, {
          reason: 'method_not_allowed',
          ip: getClientIp(req),
          userId: (req.user && req.user.id) || ''
        });
        await recordGatewayIncident(req, {
          eventType: 'method_not_allowed_probe',
          riskScore: 68,
          note: 'Method not allowed blocked',
          signals: { method, strike },
          metadata: { originalUrl: req.originalUrl }
        });
        return res.status(405).json({ message: 'Method not allowed' });
      }

      const urlLength = String(req.originalUrl || req.url || '').length;
      if (urlLength > options.maxUrlLength) {
        const strike = registerPrincipalStrike(principalKey, options, {
          reason: 'url_too_long',
          ip: getClientIp(req),
          userId: (req.user && req.user.id) || ''
        });
        await recordGatewayIncident(req, {
          eventType: 'oversized_url_probe',
          riskScore: 74,
          note: 'Oversized URL blocked',
          signals: { urlLength, maxUrlLength: options.maxUrlLength, strike },
          metadata: { originalUrl: String(req.originalUrl || '').slice(0, 300) }
        });
        return res.status(414).json({ message: 'Request URL too long' });
      }

      const headerCount = Object.keys(req.headers || {}).length;
      if (headerCount > options.maxHeaderCount) {
        const strike = registerPrincipalStrike(principalKey, options, {
          reason: 'header_count_exceeded',
          ip: getClientIp(req),
          userId: (req.user && req.user.id) || ''
        });
        await recordGatewayIncident(req, {
          eventType: 'header_flood_probe',
          riskScore: 75,
          note: 'Header flood blocked',
          signals: { headerCount, maxHeaderCount: options.maxHeaderCount, strike },
          metadata: { originalUrl: req.originalUrl }
        });
        return res.status(400).json({ message: 'Malformed request headers' });
      }

      const fullPath = String(req.originalUrl || req.url || '');
      const suspiciousPath = SUSPICIOUS_PATH_PATTERNS.some((pattern) => pattern.test(fullPath));
      if (suspiciousPath) {
        const strike = registerPrincipalStrike(principalKey, options, {
          reason: 'suspicious_path_probe',
          ip: getClientIp(req),
          userId: (req.user && req.user.id) || ''
        });
        await recordGatewayIncident(req, {
          eventType: 'suspicious_path_probe',
          riskScore: 86,
          note: 'Suspicious path blocked',
          signals: { strike },
          metadata: { originalUrl: fullPath.slice(0, 300) }
        });
        return res.status(403).json({ message: 'Request blocked by global abuse defense' });
      }

      const pathVelocity = addRouteVelocity(req);
      if (pathVelocity >= 180) {
        const strike = registerPrincipalStrike(principalKey, options, {
          reason: 'route_velocity_spike',
          ip: getClientIp(req),
          userId: (req.user && req.user.id) || ''
        });
        await recordGatewayIncident(req, {
          eventType: 'route_velocity_spike',
          riskScore: 81,
          note: 'Route velocity spike blocked',
          signals: { pathVelocity, strike, method },
          metadata: { originalUrl: fullPath.slice(0, 300) }
        });
        return res.status(429).json({ message: 'Too many requests on this route' });
      }

      if (isMutatingMethod(method) && options.requireKnownContentType) {
        const transferEncoding = String(req.headers['transfer-encoding'] || '');
        const contentLength = Number(req.headers['content-length'] || 0);
        const hasPayload = transferEncoding || Number.isFinite(contentLength) && contentLength > 0;
        if (hasPayload && !hasKnownContentType(req)) {
          const strike = registerPrincipalStrike(principalKey, options, {
            reason: 'unknown_content_type',
            ip: getClientIp(req),
            userId: (req.user && req.user.id) || ''
          });
          await recordGatewayIncident(req, {
            eventType: 'unknown_content_type_probe',
            riskScore: 66,
            note: 'Unknown content-type blocked',
            signals: {
              contentType: req.headers['content-type'] || null,
              strike
            },
            metadata: { originalUrl: fullPath.slice(0, 300) }
          });
          return res.status(415).json({ message: 'Unsupported content-type' });
        }
      }

      if (req.body && typeof req.body === 'object') {
        const bodyDepth = getRequestBodyDepth(req.body, 0);
        const bodyKeys = countRequestBodyKeys(req.body);
        const longestString = findLongestStringLength(req.body);
        const longestArray = findLargestArrayLength(req.body);

        if (
          bodyDepth > options.maxBodyDepth
          || bodyKeys > options.maxBodyKeys
          || longestString > options.maxStringLength
          || longestArray > options.maxArrayLength
        ) {
          const strike = registerPrincipalStrike(principalKey, options, {
            reason: 'body_shape_violation',
            ip: getClientIp(req),
            userId: (req.user && req.user.id) || ''
          });
          await recordGatewayIncident(req, {
            eventType: 'body_shape_violation',
            riskScore: 78,
            note: 'Suspicious request body blocked',
            signals: {
              bodyDepth,
              bodyKeys,
              longestString,
              longestArray,
              strike
            },
            metadata: { originalUrl: fullPath.slice(0, 300) }
          });
          return res.status(413).json({ message: 'Request payload rejected by security policy' });
        }
      }

      req.securityContext = {
        ...(req.securityContext || {}),
        globalAbuseDefense: {
          principalKey,
          pathVelocity
        }
      };
      return next();
    } catch (_error) {
      return next();
    }
  };
}

module.exports = {
  globalAbuseDefenseMiddleware
};

