const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { getClientIp } = require('../utils/device');
const { appendAdminAuditChainEntry, computeAuditPayloadHash } = require('../services/adminAuditChainService');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice('::ffff:'.length);
  }
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) {
    ip = match[1];
  }
  return ip;
}

function resolvePath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function parseActorFromBearer(req) {
  const bearer = String(req.headers.authorization || '');
  if (!bearer.startsWith('Bearer ')) {
    return {
      actorUserId: '',
      actorRole: '',
      actorEmail: ''
    };
  }

  const token = bearer.slice(7).trim();
  if (!token || token.length > 5000) {
    return {
      actorUserId: '',
      actorRole: '',
      actorEmail: ''
    };
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    return {
      actorUserId: String(payload?.sub || '').trim(),
      actorRole: String(payload?.role || '').trim().toLowerCase(),
      actorEmail: String(payload?.email || '').trim().toLowerCase()
    };
  } catch (_error) {
    return {
      actorUserId: '',
      actorRole: '',
      actorEmail: ''
    };
  }
}

function buildOptions(input = {}) {
  const prefixes = normalizeCsv(input.prefixes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  return {
    enabled: normalizeBoolean(input.enabled, true),
    trackReadOps: normalizeBoolean(input.trackReadOps, false),
    prefixes: prefixes.length ? prefixes : ['/api/security', '/api/admin']
  };
}

function shouldTrackRequest(req, options) {
  const path = resolvePath(req);
  if (!path) return false;
  const prefixMatched = options.prefixes.some((prefix) => path.startsWith(prefix));
  if (!prefixMatched) return false;

  const method = String(req.method || '').toUpperCase();
  if (MUTATING_METHODS.has(method)) return true;
  if (options.trackReadOps) return true;
  return false;
}

function adminAuditChainMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return (req, res, next) => {
    if (!options.enabled || !shouldTrackRequest(req, options)) {
      return next();
    }

    const path = resolvePath(req);
    const method = String(req.method || '').toUpperCase();
    const requestId = String(req.headers['x-request-id'] || '').trim();
    const actorFromBearer = parseActorFromBearer(req);
    const payloadHash = computeAuditPayloadHash({
      body: req.body || {},
      query: req.query || {},
      params: req.params || {}
    });
    const actorIp = normalizeIp(getClientIp(req) || '');

    res.on('finish', () => {
      const actorUserId = String(req.user?.id || req.auth?.id || actorFromBearer.actorUserId || '').trim();
      const actorRole = String(req.user?.role || req.auth?.role || actorFromBearer.actorRole || '').trim().toLowerCase();
      const actorEmail = String(req.user?.email || req.auth?.email || actorFromBearer.actorEmail || '').trim().toLowerCase();
      const action = `http_${method.toLowerCase()}_${path.replace(/^\/+/, '').replace(/[^a-z0-9/_-]+/gi, '_').replace(/\//g, ':')}`;

      Promise.resolve(appendAdminAuditChainEntry({
        action,
        routePath: path,
        method,
        actorUserId,
        actorRole,
        actorEmail,
        actorIp,
        requestId,
        payloadHash,
        statusCode: res.statusCode,
        outcome: '',
        metadata: {
          source: 'middleware',
          routeBaseUrl: String(req.baseUrl || ''),
          routePath: String(req.path || '')
        }
      })).catch(() => {});
    });

    return next();
  };
}

module.exports = {
  adminAuditChainMiddleware
};
