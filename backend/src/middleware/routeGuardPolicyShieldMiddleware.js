const SecurityIncident = require('../models/SecurityIncident');
const SecurityRouteGuardPolicy = require('../models/SecurityRouteGuardPolicy');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

let policyCache = {
  expiresAt: 0,
  policies: []
};

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
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
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

function getTargetPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    cacheTtlMs: normalizeNumber(input.cacheTtlMs, 2000, 500, 60 * 1000),
    bypassPrefixes: normalizeCsv(input.bypassPrefixes).length
      ? normalizeCsv(input.bypassPrefixes)
      : ['/health', '/api/security/csrf-token', '/api/security/shield/route-guard']
  };
}

function shouldBypass(path, options) {
  return options.bypassPrefixes.some((prefix) => path.startsWith(prefix));
}

async function loadPolicies(options) {
  const ts = nowTs();
  if (policyCache.expiresAt > ts && Array.isArray(policyCache.policies)) {
    return policyCache.policies;
  }

  const now = new Date(ts);
  const rows = await SecurityRouteGuardPolicy.find({
    status: 'active',
    activeFrom: { $lte: now },
    $or: [
      { activeUntil: null },
      { activeUntil: { $gt: now } }
    ]
  })
    .sort({ priority: -1, updatedAt: -1, createdAt: -1 })
    .limit(2000)
    .lean();

  policyCache = {
    expiresAt: ts + options.cacheTtlMs,
    policies: rows
  };

  return rows;
}

function matchPolicy({ path, method, policies }) {
  for (let i = 0; i < policies.length; i += 1) {
    const policy = policies[i];
    const policyPrefix = String(policy.routePrefix || '').trim().toLowerCase();
    if (!policyPrefix || !path.startsWith(policyPrefix)) {
      continue;
    }
    const methods = Array.isArray(policy.methods) ? policy.methods : [];
    if (!methods.length) {
      continue;
    }
    const methodAllowed = methods.includes('*') || methods.includes(method);
    if (!methodAllowed) {
      continue;
    }
    return policy;
  }
  return null;
}

async function registerPolicyHit(policy, req, path, method) {
  if (!policy?._id) return;
  const user = req.user || req.auth || {};
  await SecurityRouteGuardPolicy.updateOne(
    { _id: policy._id },
    {
      $set: {
        lastHitAt: new Date(),
        lastHitPath: String(path || ''),
        lastHitMethod: String(method || ''),
        lastHitIp: normalizeIp(getClientIp(req)),
        lastHitUserId: String(user.id || user.sub || user._id || '')
      },
      $inc: { hitCount: 1 }
    }
  );
}

async function recordRouteGuardIncident(policy, req, path, method) {
  try {
    const actor = req.user || req.auth || {};
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);

    await SecurityIncident.create({
      source: 'gateway',
      eventType: 'route_guard_policy_blocked',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: 89,
      severity: severityFromScore(89),
      recommendedAction: 'deny_request',
      autoResponse: {
        action: 'deny_request',
        applied: true,
        note: 'Request blocked by route guard policy'
      },
      signals: {
        path,
        method,
        routePrefix: String(policy.routePrefix || ''),
        policyMethods: Array.isArray(policy.methods) ? policy.methods : []
      },
      metadata: {
        routeGuardPolicyId: String(policy._id || ''),
        reason: String(policy.reason || ''),
        priority: Number(policy.priority || 0),
        source: String(policy.source || '')
      },
      timeline: [
        {
          action: 'route_guard_policy_blocked',
          note: `Blocked by policy ${String(policy._id || '')}`
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function routeGuardPolicyShieldMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    try {
      const path = getTargetPath(req);
      if (!path) {
        return next();
      }

      if (shouldBypass(path, options)) {
        return next();
      }

      const method = String(req.method || '').trim().toUpperCase();
      const policies = await loadPolicies(options);
      const matchedPolicy = matchPolicy({ path, method, policies });

      if (!matchedPolicy) {
        return next();
      }

      Promise.resolve(registerPolicyHit(matchedPolicy, req, path, method)).catch(() => {});
      Promise.resolve(recordRouteGuardIncident(matchedPolicy, req, path, method)).catch(() => {});

      return res.status(403).json({
        message: 'Request blocked by route guard security policy',
        policyId: String(matchedPolicy._id || ''),
        routePrefix: String(matchedPolicy.routePrefix || ''),
        methods: Array.isArray(matchedPolicy.methods) ? matchedPolicy.methods : []
      });
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Route guard policy shield unavailable' });
    }
  };
}

module.exports = {
  routeGuardPolicyShieldMiddleware
};
