const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { walletCriticalLimiter } = require('./rateLimiters');
const { verifyApiSignature } = require('./requestSignatureMiddleware');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEX_SHA256_REGEX = /^[a-f0-9]{64}$/i;
const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;

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

function buildAllowedIpSet(list = []) {
  const set = new Set();
  list.forEach((item) => {
    const normalized = normalizeIp(item);
    if (!normalized) return;
    set.add(normalized);
    if (normalized === '127.0.0.1') {
      set.add('::1');
      set.add('::ffff:127.0.0.1');
    }
    if (normalized === '::1') {
      set.add('127.0.0.1');
      set.add('::ffff:127.0.0.1');
    }
  });
  return set;
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function getTargetPath(req) {
  return `${String(req.baseUrl || '').trim()}${String(req.path || '').trim()}`.toLowerCase();
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const protectedPrefixes = normalizeCsv(input.protectedPrefixes);
  const normalizedPrefixes = (protectedPrefixes.length
    ? protectedPrefixes
    : [
        '/api/security/incidents',
        '/api/security/shield',
        '/api/security/runtime/security',
        '/api/security/policy'
      ]
  ).map((item) => String(item || '').trim().toLowerCase());

  return {
    enabled: normalizeBoolean(input.enabled, true),
    strictSignature: normalizeBoolean(input.strictSignature, true),
    enforceAdminIp: normalizeBoolean(input.enforceAdminIp, true),
    criticalRateLimitEnabled: normalizeBoolean(input.criticalRateLimitEnabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    protectedPrefixes: normalizedPrefixes,
    adminAllowedIpSet: buildAllowedIpSet(normalizeCsv(input.adminAllowedIps))
  };
}

function isProtectedControlPlaneMutation(req, options) {
  if (!isMutatingMethod(req.method)) {
    return false;
  }

  const targetPath = getTargetPath(req);
  return options.protectedPrefixes.some((prefix) => targetPath.startsWith(prefix));
}

async function recordControlPlaneIncident(req, payload = {}) {
  try {
    const actor = req.user || req.auth || {};
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'security_control_plane_shield_blocked',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 82,
      severity: severityFromScore(payload.riskScore || 82),
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
          action: 'security_control_plane_shield_blocked',
          note: payload.note || 'Control plane request blocked'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function securityControlPlaneShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return (req, res, next) => {
    if (!options.enabled || !isProtectedControlPlaneMutation(req, options)) {
      return next();
    }

    const targetPath = getTargetPath(req);
    const clientIp = normalizeIp(getClientIp(req));
    let blockedLogged = false;
    const logBlocked = (reason, riskScore = 82, metadata = {}) => {
      if (blockedLogged) return;
      blockedLogged = true;
      Promise.resolve(recordControlPlaneIncident(req, {
        eventType: 'security_control_plane_shield_blocked',
        riskScore,
        recommendedAction: 'deny_request',
        action: 'deny_request',
        note: reason,
        signals: {
          path: targetPath,
          method: req.method
        },
        metadata
      })).catch(() => {});
    };

    if (options.enforceAdminIp && options.adminAllowedIpSet.size > 0) {
      const allowed = options.adminAllowedIpSet.has(clientIp) || options.adminAllowedIpSet.has(`::ffff:${clientIp}`);
      if (!allowed) {
        logBlocked('Control-plane mutation blocked by admin IP policy', 90, {
          path: targetPath,
          method: req.method,
          ip: clientIp
        });
        return res.status(403).json({ message: 'Security control-plane mutation not allowed from this IP' });
      }
    }

    const runSignatureCheck = () => {
      if (!options.strictSignature) {
        return next();
      }

      const timestamp = Number(req.headers['x-timestamp']);
      const signature = String(req.headers['x-signature'] || '').trim();

      if (!Number.isFinite(timestamp) || !signature) {
        logBlocked('Missing API signature headers on control-plane mutation', 88, {
          path: targetPath,
          method: req.method
        });
        return res.status(401).json({ message: 'Missing API signature headers' });
      }

      if (!HEX_SHA256_REGEX.test(signature)) {
        logBlocked('Invalid API signature format on control-plane mutation', 86, {
          path: targetPath,
          method: req.method
        });
        return res.status(401).json({ message: 'Invalid API signature format' });
      }

      if (Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_SKEW_MS) {
        logBlocked('Expired API signature timestamp on control-plane mutation', 84, {
          path: targetPath,
          method: req.method
        });
        return res.status(401).json({ message: 'Expired request timestamp' });
      }

      let signaturePassed = false;
      res.on('finish', () => {
        if (!signaturePassed && (res.statusCode === 401 || res.statusCode === 409)) {
          logBlocked('Control-plane signature verification failed', 89, {
            path: targetPath,
            method: req.method,
            statusCode: res.statusCode
          });
        }
      });

      return Promise.resolve(verifyApiSignature(req, res, (error) => {
        if (error) {
          return next(error);
        }
        signaturePassed = true;
        return next();
      })).catch((error) => {
        if (options.failOpen) {
          Promise.resolve(recordControlPlaneIncident(req, {
            eventType: 'security_control_plane_shield_degraded',
            riskScore: 52,
            recommendedAction: 'monitor',
            action: 'allow_with_warning',
            note: 'Signature verification degraded; request allowed due to fail-open',
            signals: {
              path: targetPath,
              method: req.method
            },
            metadata: {
              error: String(error && error.message ? error.message : error)
            }
          })).catch(() => {});
          return next();
        }

        logBlocked('Control-plane signature verification unavailable', 91, {
          path: targetPath,
          method: req.method,
          error: String(error && error.message ? error.message : error)
        });
        return res.status(503).json({ message: 'Security control-plane signature service unavailable' });
      });
    };

    if (!options.criticalRateLimitEnabled) {
      return runSignatureCheck();
    }

    let rateLimitPassed = false;
    res.on('finish', () => {
      if (!rateLimitPassed && res.statusCode === 429) {
        logBlocked('Control-plane mutation throttled by critical rate limiter', 80, {
          path: targetPath,
          method: req.method,
          ip: clientIp
        });
      }
    });

    return walletCriticalLimiter(req, res, (error) => {
      if (error) {
        return next(error);
      }
      rateLimitPassed = true;
      return runSignatureCheck();
    });
  };
}

module.exports = {
  securityControlPlaneShieldMiddleware
};
