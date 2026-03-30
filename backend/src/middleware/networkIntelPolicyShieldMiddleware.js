const SecurityIncident = require('../models/SecurityIncident');
const SecurityNetworkIntelPolicy = require('../models/SecurityNetworkIntelPolicy');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const env = require('../config/env');

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

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getTargetPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function resolveScopeFromPath(path) {
  if (path.startsWith('/api/auth')) return 'auth';
  if (path.startsWith('/api/wallet')) return 'wallet';
  if (path.startsWith('/api/wallets')) return 'wallet';
  if (path.startsWith('/api/bookings')) return 'booking';
  if (path.startsWith('/api/security')) return 'security';
  if (path.startsWith('/api/admin')) return 'admin';
  return 'all';
}

function shouldEvaluatePath(path, options) {
  return options.protectedPrefixes.some((prefix) => path.startsWith(prefix));
}

function buildOptions(input = {}) {
  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    cacheTtlMs: normalizeNumber(input.cacheTtlMs, 3000, 500, 60 * 1000),
    protectedPrefixes: normalizeCsv(input.protectedPrefixes).length
      ? normalizeCsv(input.protectedPrefixes)
      : ['/api/auth', '/api/wallet', '/api/wallets', '/api/bookings', '/api/security', '/api/admin'],
    defaultBlockedIpPrefixes: normalizeCsv(input.defaultBlockedIpPrefixes),
    defaultBlockedAsnHints: normalizeCsv(input.defaultBlockedAsnHints),
    enforceHostConsistency: normalizeBoolean(input.enforceHostConsistency, true),
    blockHeaderInjection: normalizeBoolean(input.blockHeaderInjection, true)
  };
}

async function loadPolicies(options) {
  const ts = nowTs();
  if (policyCache.expiresAt > ts && Array.isArray(policyCache.policies)) {
    return policyCache.policies;
  }

  const now = new Date(ts);
  const rows = await SecurityNetworkIntelPolicy.find({
    status: 'active',
    activeFrom: { $lte: now },
    $or: [{ activeUntil: null }, { activeUntil: { $gt: now } }]
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

function matchPolicy({ policies, scope, ip, asn, country }) {
  for (let i = 0; i < policies.length; i += 1) {
    const policy = policies[i];
    if (!policy || policy.status !== 'active') continue;
    const policyScope = String(policy.scope || 'all').trim().toLowerCase();
    if (policyScope !== 'all' && policyScope !== scope && policyScope !== 'sensitive') {
      continue;
    }

    const targetType = String(policy.targetType || '').trim().toLowerCase();
    const matchValue = String(policy.matchValue || '').trim().toLowerCase();
    if (!targetType || !matchValue) continue;

    if (targetType === 'ip_prefix' && ip && ip.startsWith(matchValue)) {
      return policy;
    }
    if (targetType === 'asn_hint' && asn && asn.includes(matchValue)) {
      return policy;
    }
    if (targetType === 'country_code' && country && country === matchValue) {
      return policy;
    }
  }

  return null;
}

async function registerPolicyHit(policy, req, path, method, ip) {
  if (!policy?._id) return;
  const user = req.user || req.auth || {};
  await SecurityNetworkIntelPolicy.updateOne(
    { _id: policy._id },
    {
      $set: {
        lastHitAt: new Date(),
        lastHitPath: String(path || ''),
        lastHitMethod: String(method || ''),
        lastHitIp: String(ip || ''),
        lastHitUserId: String(user.id || user.sub || user._id || '')
      },
      $inc: { hitCount: 1 }
    }
  );
}

async function recordNetworkIntelIncident(req, payload = {}) {
  try {
    const actor = req.user || req.auth || {};
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'network_intel_policy_blocked',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 85,
      severity: severityFromScore(payload.riskScore || 85),
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
          action: 'network_intel_policy_blocked',
          note: payload.note || 'Request blocked by network intelligence policy shield'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function networkIntelPolicyShieldMiddleware(userOptions = {}) {
  const options = buildOptions({
    ...userOptions,
    defaultBlockedIpPrefixes: userOptions.defaultBlockedIpPrefixes || env.networkIntelDefaultBlockedIpPrefixes,
    defaultBlockedAsnHints: userOptions.defaultBlockedAsnHints || env.networkIntelDefaultBlockedAsnHints
  });

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    try {
      const path = getTargetPath(req);
      if (!path || !shouldEvaluatePath(path, options)) {
        return next();
      }

      const method = String(req.method || '').trim().toUpperCase();
      const ip = normalizeIp(getClientIp(req) || '');
      const asn = String(req.headers['x-asn-name'] || '').trim().toLowerCase();
      const country = String(getCountry(req) || '').trim().toLowerCase();
      const scope = resolveScopeFromPath(path);

      const host = String(req.headers.host || '').trim().toLowerCase();
      const forwardedHost = String(req.headers['x-forwarded-host'] || '').trim().toLowerCase();
      const hasHostMismatch = Boolean(forwardedHost && host && forwardedHost !== host);
      const hasHeaderInjectionProbe = /[\r\n]/.test(forwardedHost) || /[\r\n]/.test(host);

      if (options.blockHeaderInjection && hasHeaderInjectionProbe) {
        Promise.resolve(recordNetworkIntelIncident(req, {
          eventType: 'network_intel_header_injection_probe_blocked',
          riskScore: 94,
          recommendedAction: 'deny_request',
          action: 'deny_request',
          note: 'Header injection probe blocked by network intel shield',
          signals: { path, method, host, forwardedHost },
          metadata: { reason: 'header_injection_probe' }
        })).catch(() => {});
        return res.status(403).json({ message: 'Request blocked by network intelligence policy' });
      }

      if (options.enforceHostConsistency && hasHostMismatch) {
        Promise.resolve(recordNetworkIntelIncident(req, {
          eventType: 'network_intel_host_mismatch_blocked',
          riskScore: 90,
          recommendedAction: 'deny_request',
          action: 'deny_request',
          note: 'Forwarded host mismatch blocked by network intel shield',
          signals: { path, method, host, forwardedHost },
          metadata: { reason: 'host_mismatch' }
        })).catch(() => {});
        return res.status(403).json({ message: 'Request blocked by network intelligence policy' });
      }

      if (ip && options.defaultBlockedIpPrefixes.some((prefix) => ip.startsWith(prefix))) {
        Promise.resolve(recordNetworkIntelIncident(req, {
          eventType: 'network_intel_default_ip_prefix_blocked',
          riskScore: 88,
          recommendedAction: 'deny_request',
          action: 'deny_request',
          note: 'Default blocked IP prefix matched',
          signals: { path, method, ip },
          metadata: { reason: 'default_ip_prefix' }
        })).catch(() => {});
        return res.status(403).json({ message: 'Request blocked by network intelligence policy' });
      }

      if (asn && options.defaultBlockedAsnHints.some((hint) => asn.includes(hint))) {
        Promise.resolve(recordNetworkIntelIncident(req, {
          eventType: 'network_intel_default_asn_blocked',
          riskScore: 87,
          recommendedAction: 'deny_request',
          action: 'deny_request',
          note: 'Default blocked ASN hint matched',
          signals: { path, method, asn },
          metadata: { reason: 'default_asn_hint' }
        })).catch(() => {});
        return res.status(403).json({ message: 'Request blocked by network intelligence policy' });
      }

      const policies = await loadPolicies(options);
      const matchedPolicy = matchPolicy({ policies, scope, ip, asn, country });

      if (!matchedPolicy) {
        return next();
      }

      Promise.resolve(registerPolicyHit(matchedPolicy, req, path, method, ip)).catch(() => {});
      Promise.resolve(recordNetworkIntelIncident(req, {
        eventType: 'network_intel_policy_blocked',
        riskScore: 89,
        recommendedAction: 'deny_request',
        action: 'deny_request',
        note: 'Request blocked by network intel dynamic policy',
        signals: {
          path,
          method,
          targetType: String(matchedPolicy.targetType || ''),
          matchValue: String(matchedPolicy.matchValue || '')
        },
        metadata: {
          policyId: String(matchedPolicy._id || ''),
          scope: String(matchedPolicy.scope || ''),
          reason: String(matchedPolicy.reason || '')
        }
      })).catch(() => {});

      return res.status(403).json({
        message: 'Request blocked by network intelligence policy',
        policyId: String(matchedPolicy._id || ''),
        targetType: String(matchedPolicy.targetType || '')
      });
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Network intelligence policy shield unavailable' });
    }
  };
}

module.exports = {
  networkIntelPolicyShieldMiddleware
};
