const UserRoleBoundaryState = require('../models/UserRoleBoundaryState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_BOUNDARY_RULES = [
  { prefix: '/api/admin', requiredRole: 'admin' },
  { prefix: '/api/security/shield', requiredRole: 'admin' },
  { prefix: '/api/security/lockdown', requiredRole: 'admin' },
  { prefix: '/api/security/incidents', requiredRole: 'admin' },
  { prefix: '/api/security/policy', requiredRole: 'admin' }
];

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizePath(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '/';
  const pathOnly = text.split('?')[0] || '/';
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function matchesPrefix(pathname, prefix) {
  const normalizedPath = normalizePath(pathname);
  const normalizedPrefix = normalizePath(prefix);
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'customer';
  if (normalized === 'user') return 'customer';
  return normalized;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 50));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function parseRoleList(rawValue) {
  return String(rawValue || '')
    .split('|')
    .map((entry) => normalizeRole(entry))
    .filter(Boolean);
}

function parseBoundaryRules(value) {
  const entries = splitCsv(value);
  if (!entries.length) {
    return DEFAULT_BOUNDARY_RULES.map((item) => ({
      prefix: normalizePath(item.prefix),
      requiredRoles: [normalizeRole(item.requiredRole)]
    }));
  }

  const parsed = [];
  for (const entry of entries) {
    const [rawPrefix, rawRoles] = String(entry).split(':');
    const prefix = normalizePath(rawPrefix);
    const roles = parseRoleList(rawRoles || 'admin');
    if (!prefix || !roles.length) continue;
    parsed.push({ prefix, requiredRoles: roles });
  }

  if (!parsed.length) {
    return DEFAULT_BOUNDARY_RULES.map((item) => ({
      prefix: normalizePath(item.prefix),
      requiredRoles: [normalizeRole(item.requiredRole)]
    }));
  }

  parsed.sort((a, b) => b.prefix.length - a.prefix.length);
  return parsed;
}

function resolveOptions() {
  return {
    enabled: Boolean(env.roleBoundaryShieldEnabled),
    failOpen: Boolean(env.roleBoundaryShieldFailOpen),
    boundaryRules: parseBoundaryRules(env.roleBoundaryProtectedRules),
    exemptPrefixes: splitCsv(env.roleBoundaryExemptPrefixes),
    violationWindowMs: normalizeNumber(env.roleBoundaryViolationWindowMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.roleBoundaryViolationThreshold, 3, 1, 20),
    resetOnPass: Boolean(env.roleBoundaryResetOnPass),
    allowAdminOverride: Boolean(env.roleBoundaryAllowAdminOverride),
    quarantineMs: normalizeNumber(env.roleBoundaryQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.roleBoundaryQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.roleBoundaryEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.roleBoundaryAutoRevokeSessions),
    autoBanUser: Boolean(env.roleBoundaryAutoBanUser),
    recordTtlMs: normalizeNumber(env.roleBoundaryRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
  };
}

function computeQuarantineMs(options, escalationLevel) {
  return Math.min(
    options.quarantineMaxMs,
    Math.round(options.quarantineMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
  );
}

function computeExpiryDate(options, quarantineUntilMs = 0) {
  const ts = nowTs();
  const extraMs = quarantineUntilMs > ts
    ? (quarantineUntilMs - ts) + options.recordTtlMs
    : 0;
  return new Date(ts + Math.max(options.recordTtlMs, options.violationWindowMs * 2, extraMs));
}

function resolveActorRole(user = {}) {
  return normalizeRole(user.role || user.accountType || 'customer');
}

function isRoleAllowed({ actorRole, requiredRoles, allowAdminOverride }) {
  if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
    return true;
  }

  if (allowAdminOverride && actorRole === 'admin') {
    return true;
  }

  return requiredRoles.includes(actorRole);
}

function resolveRuleForPath(pathname, options) {
  const path = normalizePath(pathname);
  if (options.exemptPrefixes.some((prefix) => matchesPrefix(path, prefix))) {
    return null;
  }
  for (const rule of options.boundaryRules) {
    if (matchesPrefix(path, rule.prefix)) {
      return rule;
    }
  }
  return null;
}

async function recordRoleBoundaryIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'role_boundary_violation_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 88,
      severity: severityFromScore(payload.riskScore || 88),
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
          action: 'role_boundary_shield_triggered',
          note: payload.note || 'Role boundary violation detected on protected route'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserRoleBoundary({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const path = normalizePath(req?.originalUrl || req?.path || '/');
  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const actorRole = resolveActorRole(user);
  const matchedRule = resolveRuleForPath(path, options);

  if (!matchedRule) {
    return { ok: true, reason: 'path_not_protected' };
  }

  const now = nowTs();
  const nowDate = new Date(now);
  const requiredRoles = Array.isArray(matchedRule.requiredRoles) ? matchedRule.requiredRoles : ['admin'];
  const requiredRole = requiredRoles.join('|');
  const allowed = isRoleAllowed({
    actorRole,
    requiredRoles,
    allowAdminOverride: options.allowAdminOverride
  });

  const existing = await UserRoleBoundaryState.findOne({ userId }).lean();
  if (existing) {
    const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
    if (existing.status === 'quarantined' && quarantineUntilMs > now) {
      return {
        ok: false,
        reason: 'user_quarantined',
        quarantineUntil: new Date(quarantineUntilMs).toISOString()
      };
    }
  }

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.violationWindowMs;

  if (allowed) {
    if (existing) {
      await UserRoleBoundaryState.updateOne(
        { userId },
        {
          $set: {
            status: existing.status === 'released' ? 'active' : existing.status,
            windowStartAt: options.resetOnPass ? nowDate : (withinWindow ? new Date(existing.windowStartAt) : nowDate),
            windowViolationCount: options.resetOnPass ? 0 : (withinWindow ? Number(existing.windowViolationCount || 0) : 0),
            quarantineUntil: null,
            lastSeenAt: nowDate,
            lastPath: path,
            lastMethod: method,
            lastActorRole: actorRole,
            lastRequiredRole: requiredRole,
            lastReason: 'role_boundary_verified',
            expiresAt: computeExpiryDate(options),
            metadata: sanitizeMetadata({
              requiredRoles,
              matchedPrefix: matchedRule.prefix,
              resetOnPass: options.resetOnPass
            })
          }
        }
      );
    }
    return { ok: true, reason: 'role_boundary_verified' };
  }

  const violationCount = (withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1;
  const thresholdReached = violationCount >= options.violationThreshold;

  if (!thresholdReached) {
    await UserRoleBoundaryState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
          windowViolationCount: violationCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastActorRole: actorRole,
          lastRequiredRole: requiredRole,
          lastReason: 'role_boundary_violation_observed',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            requiredRoles,
            matchedPrefix: matchedRule.prefix,
            violationCount,
            violationThreshold: options.violationThreshold
          })
        },
        $setOnInsert: {
          escalationLevel: 0,
          suspiciousCount: 0
        },
        $inc: {
          suspiciousCount: 1
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await recordRoleBoundaryIncident(req, {
      eventType: 'role_boundary_violation_observed',
      riskScore: 82,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Authenticated user attempted protected route without required role',
      userId,
      email: user.email || null,
      signals: {
        actorRole,
        requiredRoles,
        path,
        method
      },
      metadata: {
        violationCount,
        violationThreshold: options.violationThreshold,
        matchedPrefix: matchedRule.prefix
      }
    });

    return {
      ok: false,
      reason: 'role_boundary_forbidden',
      requiredRole,
      violationCount,
      violationThreshold: options.violationThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);
  const ip = normalizeIp(getClientIp(req) || '');

  await UserRoleBoundaryState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowViolationCount: violationCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastActorRole: actorRole,
        lastRequiredRole: requiredRole,
        lastReason: 'role_boundary_quarantined',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          requiredRoles,
          matchedPrefix: matchedRule.prefix,
          violationCount,
          violationThreshold: options.violationThreshold
        })
      },
      $setOnInsert: {
        suspiciousCount: 0
      },
      $inc: {
        suspiciousCount: 1
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId,
      reason: 'role_boundary_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        actorRole,
        requiredRole,
        path,
        method,
        violationCount,
        violationThreshold: options.violationThreshold
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 92,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordRoleBoundaryIncident(req, {
    eventType: 'role_boundary_quarantined',
    riskScore: 92,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated protected-route role boundary violations detected',
    userId,
    email: user.email || null,
    signals: {
      actorRole,
      requiredRoles,
      path,
      method
    },
    metadata: {
      violationCount,
      violationThreshold: options.violationThreshold,
      matchedPrefix: matchedRule.prefix,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'role_boundary_quarantined',
    requiredRole,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getRoleBoundaryShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

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

  const rows = await UserRoleBoundaryState.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    quarantinedCount: rows.filter((item) => {
      const qMs = item.quarantineUntil ? new Date(item.quarantineUntil).getTime() : 0;
      return item.status === 'quarantined' && qMs > nowTs();
    }).length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      userId: item.userId ? String(item.userId) : null,
      status: String(item.status || ''),
      escalationLevel: Number(item.escalationLevel || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      windowViolationCount: Number(item.windowViolationCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastActorRole: String(item.lastActorRole || ''),
      lastRequiredRole: String(item.lastRequiredRole || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseRoleBoundaryShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserRoleBoundaryState.updateMany(
      {},
      {
        $set: {
          status: 'released',
          quarantineUntil: null,
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
  if (normalizedId) query._id = normalizedId;
  if (normalizedUserId) query.userId = normalizedUserId;

  const result = await UserRoleBoundaryState.updateMany(
    query,
    {
      $set: {
        status: 'released',
        quarantineUntil: null,
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

async function quarantineRoleBoundaryUser({
  userId = '',
  reason = 'admin_manual_role_boundary_quarantine',
  durationMs = null,
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    const error = new Error('userId is required');
    error.statusCode = 400;
    throw error;
  }

  const options = resolveOptions();
  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await UserRoleBoundaryState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserRoleBoundaryState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_role_boundary_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowViolationCount: 0,
        suspiciousCount: 0,
        lastPath: '',
        lastMethod: '',
        lastActorRole: '',
        lastRequiredRole: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_role_boundary_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserRoleBoundary,
  getRoleBoundaryShieldSnapshot,
  releaseRoleBoundaryShieldStates,
  quarantineRoleBoundaryUser
};
