const SecurityIncident = require('../models/SecurityIncident');
const {
  getGlobalLockdownStatus,
  registerGlobalLockdownBlock
} = require('../services/globalSecurityLockdownService');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const blockSignalMap = new Map();
const DEFAULT_BYPASS = ['/health', '/api/security/csrf-token', '/api/security/lockdown/global'];

function nowTs() {
  return Date.now();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const prefixes = normalizeCsv(input.bypassPrefixes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    cacheTtlMs: normalizeNumber(input.cacheTtlMs, 3000, 500, 60 * 1000),
    logThrottleMs: normalizeNumber(input.logThrottleMs, 30 * 1000, 1000, 10 * 60 * 1000),
    bypassPrefixes: prefixes.length ? prefixes : DEFAULT_BYPASS
  };
}

function resolvePath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function shouldBypass(path, options) {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return false;
  return options.bypassPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function shouldLogBlock(ip, path, options) {
  const key = `${ip || 'unknown'}::${path || 'unknown'}`;
  const ts = nowTs();
  const last = Number(blockSignalMap.get(key) || 0);
  if (ts - last < options.logThrottleMs) {
    return false;
  }
  blockSignalMap.set(key, ts);

  if (blockSignalMap.size > 10000) {
    const entries = Array.from(blockSignalMap.entries());
    entries
      .sort((a, b) => a[1] - b[1])
      .slice(0, 1000)
      .forEach((entry) => blockSignalMap.delete(entry[0]));
  }

  return true;
}

async function recordLockdownIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const user = req.user || req.auth || {};
    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'global_lockdown_block',
      userId: user.id || user.sub || user._id || null,
      email: user.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 80,
      severity: severityFromScore(payload.riskScore || 80),
      recommendedAction: payload.recommendedAction || 'block_request',
      autoResponse: {
        action: payload.action || 'global_lockdown',
        applied: true,
        note: payload.note || 'Request blocked by global lockdown shield'
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'global_lockdown_request_blocked',
          note: payload.note || 'Request blocked under global lockdown'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function globalLockdownShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);
  let statusCache = {
    expiresAt: 0,
    value: {
      active: false,
      reason: '',
      activeUntil: null,
      remainingMs: null
    }
  };

  return async (req, res, next) => {
    if (!options.enabled) return next();

    const path = resolvePath(req);
    if (shouldBypass(path, options)) {
      return next();
    }

    try {
      const ts = nowTs();
      let status;
      if (statusCache.expiresAt > ts) {
        status = statusCache.value;
      } else {
        status = await getGlobalLockdownStatus();
        statusCache = {
          expiresAt: ts + options.cacheTtlMs,
          value: status
        };
      }

      if (!status.active) {
        return next();
      }

      const ip = normalizeIp(getClientIp(req) || '');
      Promise.resolve(registerGlobalLockdownBlock({ path, ip })).catch(() => {});

      if (shouldLogBlock(ip, path, options)) {
        Promise.resolve(recordLockdownIncident(req, {
          eventType: 'global_lockdown_block',
          riskScore: 85,
          recommendedAction: 'block_request',
          action: 'global_lockdown',
          note: 'Request blocked by active global lockdown',
          signals: {
            path,
            method: req.method
          },
          metadata: {
            reason: String(status.reason || ''),
            activeUntil: status.activeUntil,
            remainingMs: status.remainingMs
          }
        })).catch(() => {});
      }

      return res.status(423).json({
        message: 'API temporarily locked down by security command',
        reason: String(status.reason || ''),
        activeUntil: status.activeUntil || null,
        remainingMs: Number(status.remainingMs || 0) || null
      });
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Global lockdown shield unavailable' });
    }
  };
}

module.exports = {
  globalLockdownShieldMiddleware
};
