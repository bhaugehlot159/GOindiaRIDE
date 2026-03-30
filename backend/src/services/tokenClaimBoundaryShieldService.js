const crypto = require('crypto');

const UserTokenClaimBoundaryState = require('../models/UserTokenClaimBoundaryState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_SCOPE_RULES = [
  '/api/admin:post|put|patch|delete:admin.full|admin.write|role:admin',
  '/api/security:post|put|patch|delete:admin.full|security.write|role:admin',
  '/api/wallet:post|put|patch|delete:wallet.write|admin.full|role:customer|role:driver|role:admin',
  '/api/wallets:post|put|patch|delete:wallet.write|admin.full|role:customer|role:driver|role:admin',
  '/api/bookings:post|put|patch|delete:booking.write|admin.full|role:customer|role:driver|role:admin'
].join(';');
const IMMEDIATE_REASONS = new Set([
  'issuer_mismatch',
  'audience_mismatch',
  'scope_rule_mismatch'
]);

function nowTs() {
  return Date.now();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function splitRules(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
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

function normalizeText(value, max = 220) {
  return String(value || '').trim().slice(0, max);
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'user') return 'customer';
  if (normalized === 'customer' || normalized === 'driver' || normalized === 'admin') return normalized;
  return normalized;
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 60));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function parseScopeRules(value) {
  const rules = [];
  const entries = splitRules(value);

  entries.forEach((entry) => {
    const [prefixRaw = '', methodsRaw = '*', ...scopeParts] = String(entry || '').split(':');
    const prefix = normalizePath(prefixRaw);
    const methods = String(methodsRaw || '*')
      .split('|')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const scopes = String(scopeParts.join(':') || '')
      .split('|')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (!prefix || !scopes.length) {
      return;
    }

    rules.push({
      prefix,
      methods: methods.length ? methods : ['*'],
      scopes
    });
  });

  return rules;
}

function resolveOptions() {
  const methods = splitCsv(env.tokenClaimBoundaryMethods);
  const scopeClaimKeys = splitCsv(env.tokenClaimBoundaryScopeClaimKeys);
  return {
    enabled: Boolean(env.tokenClaimBoundaryShieldEnabled),
    failOpen: Boolean(env.tokenClaimBoundaryShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenClaimBoundaryProtectedPrefixes),
    methods: methods.length ? methods : DEFAULT_METHODS,
    requireIssuer: Boolean(env.tokenClaimBoundaryRequireIssuer),
    requiredIssuer: normalizeText(env.tokenClaimBoundaryRequiredIssuer || env.jwtIssuer || '', 220),
    requireAudience: Boolean(env.tokenClaimBoundaryRequireAudience),
    requiredAudience: normalizeText(env.tokenClaimBoundaryRequiredAudience || env.jwtAudience || '', 220),
    requireScopeRules: Boolean(env.tokenClaimBoundaryRequireScopeRules),
    scopeRules: parseScopeRules(env.tokenClaimBoundaryScopeRules || DEFAULT_SCOPE_RULES),
    scopeClaimKeys: scopeClaimKeys.length ? scopeClaimKeys : ['scope', 'scp', 'permissions'],
    allowRoleScopeFallback: Boolean(env.tokenClaimBoundaryAllowRoleScopeFallback),
    windowMs: normalizeNumber(env.tokenClaimBoundaryViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenClaimBoundaryViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenClaimBoundaryMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenClaimBoundaryResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenClaimBoundaryQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenClaimBoundaryQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenClaimBoundaryEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenClaimBoundaryAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenClaimBoundaryAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenClaimBoundaryRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  return new Date(ts + Math.max(options.recordTtlMs, options.windowMs * 2, extraMs));
}

function shouldTrackRequest({ options, method, path }) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const methodTracked = options.methods.includes(normalizedMethod);
  if (!methodTracked) return false;

  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function parseAudience(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item, 220))
      .filter(Boolean);
  }

  const text = normalizeText(value, 220);
  if (!text) return [];

  if (text.includes(',')) {
    return text
      .split(',')
      .map((item) => normalizeText(item, 220))
      .filter(Boolean);
  }

  return [text];
}

function addScopeToken(targetSet, value) {
  const parts = String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  parts.forEach((scope) => targetSet.add(scope));
}

function parseTokenScopes(payload = {}, scopeClaimKeys = []) {
  const set = new Set();
  const keys = Array.isArray(scopeClaimKeys) && scopeClaimKeys.length
    ? scopeClaimKeys
    : ['scope', 'scp', 'permissions'];

  keys.forEach((key) => {
    const raw = payload ? payload[key] : null;
    if (!raw) return;

    if (Array.isArray(raw)) {
      raw.forEach((entry) => addScopeToken(set, entry));
      return;
    }

    if (typeof raw === 'object') {
      Object.entries(raw).forEach(([scopeKey, allowed]) => {
        if (allowed) addScopeToken(set, scopeKey);
      });
      return;
    }

    addScopeToken(set, raw);
  });

  if (Array.isArray(payload?.scopes)) {
    payload.scopes.forEach((entry) => addScopeToken(set, entry));
  }

  return Array.from(set);
}

function getApplicableScopeRules({ path, method, scopeRules }) {
  const normalizedMethod = String(method || '').trim().toLowerCase();
  const matched = (scopeRules || []).filter((rule) => {
    const methodMatched = Array.isArray(rule.methods)
      && (rule.methods.includes('*') || rule.methods.includes(normalizedMethod));
    return methodMatched && matchesPrefix(path, rule.prefix);
  });

  if (!matched.length) return [];

  const maxPrefixLength = Math.max(...matched.map((rule) => String(rule.prefix || '').length));
  return matched.filter((rule) => String(rule.prefix || '').length === maxPrefixLength);
}

function evaluateTokenClaimBoundary({
  payload = {},
  options,
  method,
  path
}) {
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  const issuer = normalizeText(payload?.iss, 220);
  const audienceList = parseAudience(payload?.aud);
  const tokenScopes = parseTokenScopes(payload, options.scopeClaimKeys);
  const matchedScopeRules = getApplicableScopeRules({
    path,
    method,
    scopeRules: options.scopeRules
  });

  if (options.requireIssuer) {
    if (!issuer) {
      reasons.push('missing_issuer_claim');
      missingClaimCount += 1;
    } else if (options.requiredIssuer && issuer !== options.requiredIssuer) {
      reasons.push('issuer_mismatch');
      metadata.requiredIssuer = options.requiredIssuer;
    }
  }

  if (options.requireAudience) {
    if (!audienceList.length) {
      reasons.push('missing_audience_claim');
      missingClaimCount += 1;
    } else if (options.requiredAudience && !audienceList.includes(options.requiredAudience)) {
      reasons.push('audience_mismatch');
      metadata.requiredAudience = options.requiredAudience;
    }
  }

  let requiredScopes = [];
  if (options.requireScopeRules && matchedScopeRules.length) {
    requiredScopes = Array.from(new Set(matchedScopeRules.flatMap((rule) => rule.scopes)));

    if (!tokenScopes.length) {
      reasons.push('missing_scope_claim');
      missingClaimCount += 1;
    } else {
      const actorRole = normalizeRole(payload?.role || payload?.accountType || '');
      const scopeRuleViolated = matchedScopeRules.some((rule) => !rule.scopes.some((requiredScope) => {
        if (tokenScopes.includes(requiredScope)) return true;
        if (!options.allowRoleScopeFallback) return false;
        if (!requiredScope.startsWith('role:')) return false;
        const requiredRole = normalizeRole(requiredScope.slice('role:'.length));
        return Boolean(requiredRole && actorRole === requiredRole);
      }));

      if (scopeRuleViolated) {
        reasons.push('scope_rule_mismatch');
      }
    }
  }

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  metadata.issuer = issuer;
  metadata.audience = audienceList;
  metadata.tokenScopes = tokenScopes.slice(0, 100);
  metadata.scopeClaimKeys = options.scopeClaimKeys;
  metadata.matchedScopeRules = matchedScopeRules.map((rule) => ({
    prefix: rule.prefix,
    methods: Array.isArray(rule.methods) ? rule.methods.slice(0, 10) : [],
    scopes: Array.isArray(rule.scopes) ? rule.scopes.slice(0, 30) : []
  }));
  metadata.requiredScopes = requiredScopes.slice(0, 60);

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    issuer,
    audienceList,
    tokenScopes,
    requiredScopes,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('issuer_mismatch')) return 'issuer_mismatch';
  if (reasons.includes('audience_mismatch')) return 'audience_mismatch';
  if (reasons.includes('scope_rule_mismatch')) return 'scope_rule_mismatch';
  if (reasons.includes('missing_issuer_claim')) return 'missing_issuer_claim';
  if (reasons.includes('missing_audience_claim')) return 'missing_audience_claim';
  if (reasons.includes('missing_scope_claim')) return 'missing_scope_claim';
  if (reasons.length > 0) return reasons[0];
  return 'claims_verified';
}

async function recordTokenClaimBoundaryIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_claim_boundary_violation',
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
          action: 'token_claim_boundary_shield_triggered',
          note: payload.note || 'JWT token claim boundary validation failed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenClaimBoundary({ user = null, payload = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackRequest({ options, method, path })) {
    return { ok: true, reason: 'path_or_method_not_tracked' };
  }

  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await UserTokenClaimBoundaryState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenClaimBoundary({
    payload: payload || {},
    options,
    method,
    path
  });
  const primaryReason = pickPrimaryReason(evaluation.reasons);

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;

  const violationCount = evaluation.detected
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : ((withinWindow && !options.resetWindowOnPass) ? Number(existing?.windowViolationCount || 0) : 0);
  const windowMissingClaimCount = evaluation.detected
    ? ((withinWindow ? Number(existing?.windowMissingClaimCount || 0) : 0) + Number(evaluation.missingClaimCount || 0))
    : ((withinWindow && !options.resetWindowOnPass) ? Number(existing?.windowMissingClaimCount || 0) : 0);

  const thresholdReached = evaluation.detected && (
    evaluation.immediate
    || violationCount >= options.violationThreshold
    || windowMissingClaimCount >= options.missingClaimThreshold
  );

  const nextWindowStart = evaluation.detected
    ? (withinWindow ? new Date(existing.windowStartAt) : nowDate)
    : ((withinWindow && !options.resetWindowOnPass) ? new Date(existing.windowStartAt) : nowDate);

  if (!thresholdReached) {
    await UserTokenClaimBoundaryState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: violationCount,
          windowMissingClaimCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastIssuer: String(evaluation.issuer || ''),
          lastAudience: evaluation.audienceList.join(','),
          lastScopeHash: hashValue((evaluation.tokenScopes || []).join('|')),
          lastReason: evaluation.detected ? primaryReason : 'claims_verified',
          metadata: sanitizeMetadata({
            ...evaluation.metadata,
            reasons: evaluation.reasons,
            violationCount,
            violationThreshold: options.violationThreshold,
            windowMissingClaimCount,
            missingClaimThreshold: options.missingClaimThreshold
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
          suspiciousCount: 0
        },
        ...(evaluation.detected ? {
          $inc: {
            suspiciousCount: 1
          }
        } : {})
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (!evaluation.detected) {
      return { ok: true, reason: 'claims_verified' };
    }

    await recordTokenClaimBoundaryIncident(req, {
      eventType: 'token_claim_boundary_violation',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'JWT claim boundary validation denied request',
      userId,
      email: user.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons,
        issuer: evaluation.issuer,
        audience: evaluation.audienceList
      },
      metadata: {
        requiredScopes: evaluation.requiredScopes,
        violationCount,
        violationThreshold: options.violationThreshold,
        windowMissingClaimCount,
        missingClaimThreshold: options.missingClaimThreshold
      }
    });

    return {
      ok: false,
      reason: primaryReason,
      violationCount,
      violationThreshold: options.violationThreshold,
      missingClaimCount: windowMissingClaimCount,
      missingClaimThreshold: options.missingClaimThreshold,
      requiredScopes: evaluation.requiredScopes
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserTokenClaimBoundaryState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: violationCount,
        windowMissingClaimCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastIssuer: String(evaluation.issuer || ''),
        lastAudience: evaluation.audienceList.join(','),
        lastScopeHash: hashValue((evaluation.tokenScopes || []).join('|')),
        lastReason: 'token_claim_boundary_quarantined',
        metadata: sanitizeMetadata({
          ...evaluation.metadata,
          reasons: evaluation.reasons,
          violationCount,
          violationThreshold: options.violationThreshold,
          windowMissingClaimCount,
          missingClaimThreshold: options.missingClaimThreshold,
          escalationLevel
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
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
      reason: 'token_claim_boundary_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        violationCount,
        windowMissingClaimCount,
        issuer: evaluation.issuer,
        audience: evaluation.audienceList
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

  await recordTokenClaimBoundaryIncident(req, {
    eventType: 'token_claim_boundary_quarantined',
    riskScore: 92,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated JWT claim boundary violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons,
      issuer: evaluation.issuer,
      audience: evaluation.audienceList
    },
    metadata: {
      requiredScopes: evaluation.requiredScopes,
      violationCount,
      violationThreshold: options.violationThreshold,
      windowMissingClaimCount,
      missingClaimThreshold: options.missingClaimThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'token_claim_boundary_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenClaimBoundaryShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenClaimBoundaryState.find(query)
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
      windowMissingClaimCount: Number(item.windowMissingClaimCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastIssuer: String(item.lastIssuer || ''),
      lastAudience: String(item.lastAudience || ''),
      lastScopeHash: String(item.lastScopeHash || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenClaimBoundaryShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenClaimBoundaryState.updateMany(
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

  const result = await UserTokenClaimBoundaryState.updateMany(
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

async function quarantineTokenClaimBoundaryUser({
  userId = '',
  reason = 'admin_manual_token_claim_boundary_quarantine',
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
  const existing = await UserTokenClaimBoundaryState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenClaimBoundaryState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_claim_boundary_quarantine',
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
        windowMissingClaimCount: 0,
        suspiciousCount: 0,
        lastPath: '',
        lastMethod: '',
        lastIssuer: '',
        lastAudience: '',
        lastScopeHash: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_claim_boundary_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenClaimBoundary,
  getTokenClaimBoundaryShieldSnapshot,
  releaseTokenClaimBoundaryShieldStates,
  quarantineTokenClaimBoundaryUser
};
