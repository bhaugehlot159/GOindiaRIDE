const UserTokenTypeSeparationState = require('../models/UserTokenTypeSeparationState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_FORBIDDEN_TYPES = ['refresh', 'refresh_token'];
const DEFAULT_ALLOWED_TYPES = ['access', 'access_token', 'bearer'];
const DEFAULT_REFRESH_SCOPE_HINTS = ['token.refresh', 'refresh.rotate', 'session.refresh'];
const DEFAULT_REFRESH_CLAIM_KEYS = ['type', 'tokenUse', 'token_use', 'kind'];
const IMMEDIATE_REASONS = new Set([
  'forbidden_refresh_token_type_on_access_path',
  'forbidden_refresh_scope_hint_on_access_path'
]);

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
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

function normalizeLowerList(value) {
  return splitCsv(value).map((item) => item.toLowerCase());
}

function normalizeClaimValue(value) {
  return String(value || '').trim().toLowerCase();
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

function resolveOptions() {
  const methods = normalizeLowerList(env.tokenTypeSeparationMethods);
  const forbiddenTokenTypes = normalizeLowerList(env.tokenTypeSeparationForbiddenTokenTypes);
  const allowedTokenTypes = normalizeLowerList(env.tokenTypeSeparationAllowedTokenTypes);
  const refreshScopeHints = normalizeLowerList(env.tokenTypeSeparationRefreshScopeHints);
  const refreshClaimKeys = splitCsv(env.tokenTypeSeparationRefreshClaimKeys).map((item) => item.trim());

  return {
    enabled: Boolean(env.tokenTypeSeparationShieldEnabled),
    failOpen: Boolean(env.tokenTypeSeparationShieldFailOpen),
    protectedPrefixes: normalizeLowerList(env.tokenTypeSeparationProtectedPrefixes),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenTypeSeparationEnforceOnAllMethods),
    requireTokenTypeClaim: Boolean(env.tokenTypeSeparationRequireTokenTypeClaim),
    requireAccessTokenType: Boolean(env.tokenTypeSeparationRequireAccessTokenType),
    forbiddenTokenTypes: forbiddenTokenTypes.length ? forbiddenTokenTypes : DEFAULT_FORBIDDEN_TYPES,
    allowedTokenTypes: allowedTokenTypes.length ? allowedTokenTypes : DEFAULT_ALLOWED_TYPES,
    refreshScopeHints: refreshScopeHints.length ? refreshScopeHints : DEFAULT_REFRESH_SCOPE_HINTS,
    refreshClaimKeys: refreshClaimKeys.length ? refreshClaimKeys : DEFAULT_REFRESH_CLAIM_KEYS,
    windowMs: normalizeNumber(env.tokenTypeSeparationViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenTypeSeparationViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenTypeSeparationMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenTypeSeparationResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenTypeSeparationQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenTypeSeparationQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenTypeSeparationEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenTypeSeparationAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenTypeSeparationAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenTypeSeparationRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  const methodTracked = options.enforceOnAllMethods || options.methods.includes(normalizedMethod);
  if (!methodTracked) return false;

  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function parseScopeValues(payload = {}) {
  const set = new Set();

  const addScope = (value) => {
    String(value || '')
      .split(/[\s,]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  };

  if (typeof payload.scope === 'string') addScope(payload.scope);
  if (Array.isArray(payload.scp)) payload.scp.forEach((entry) => addScope(entry));
  if (typeof payload.scp === 'string') addScope(payload.scp);
  if (Array.isArray(payload.permissions)) payload.permissions.forEach((entry) => addScope(entry));
  if (payload.permissions && typeof payload.permissions === 'object' && !Array.isArray(payload.permissions)) {
    Object.entries(payload.permissions).forEach(([scope, enabled]) => {
      if (enabled) addScope(scope);
    });
  }

  return Array.from(set);
}

function deriveTokenType(payload = {}, refreshClaimKeys = []) {
  for (const key of refreshClaimKeys) {
    const value = normalizeClaimValue(payload?.[key]);
    if (value) return value;
  }
  return '';
}

function evaluateTokenTypeSeparation({
  payload = {},
  options,
  method,
  path
}) {
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  const tokenType = deriveTokenType(payload, options.refreshClaimKeys);
  const scopes = parseScopeValues(payload);
  const forbiddenTypeHit = tokenType && options.forbiddenTokenTypes.includes(tokenType);
  const allowedTypeHit = tokenType && options.allowedTokenTypes.includes(tokenType);
  const refreshScopeHit = scopes.some((scope) => options.refreshScopeHints.includes(scope));

  if (options.requireTokenTypeClaim && !tokenType) {
    reasons.push('missing_token_type_claim');
    missingClaimCount += 1;
  }

  if (forbiddenTypeHit) {
    reasons.push('forbidden_refresh_token_type_on_access_path');
  }

  if (options.requireAccessTokenType && tokenType && !allowedTypeHit && !forbiddenTypeHit) {
    reasons.push('unrecognized_access_token_type');
  }

  if (refreshScopeHit) {
    reasons.push('forbidden_refresh_scope_hint_on_access_path');
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.tokenType = tokenType;
  metadata.scopeCount = scopes.length;
  metadata.refreshScopeHintsMatched = scopes.filter((scope) => options.refreshScopeHints.includes(scope)).slice(0, 20);
  metadata.tokenSub = normalizeText(payload?.sub || '', 140);
  metadata.tokenSid = normalizeText(payload?.sid || '', 140);
  metadata.tokenJti = normalizeText(payload?.jti || '', 140);

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    tokenType,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('forbidden_refresh_token_type_on_access_path')) return 'forbidden_refresh_token_type_on_access_path';
  if (reasons.includes('forbidden_refresh_scope_hint_on_access_path')) return 'forbidden_refresh_scope_hint_on_access_path';
  if (reasons.includes('missing_token_type_claim')) return 'missing_token_type_claim';
  if (reasons.includes('unrecognized_access_token_type')) return 'unrecognized_access_token_type';
  if (reasons.length > 0) return reasons[0];
  return 'token_type_valid';
}

async function recordTokenTypeIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_type_separation_violation',
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
          action: 'token_type_separation_shield_triggered',
          note: payload.note || 'Refresh/access token type boundary violated'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenTypeSeparation({ user = null, payload = null, req = null } = {}) {
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
  const existing = await UserTokenTypeSeparationState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenTypeSeparation({
    payload: payload || {},
    options,
    method,
    path
  });
  const primaryReason = pickPrimaryReason(evaluation.reasons);

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;
  const nextViolationCount = evaluation.detected
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : ((withinWindow && !options.resetWindowOnPass) ? Number(existing?.windowViolationCount || 0) : 0);
  const nextMissingClaimCount = evaluation.detected
    ? ((withinWindow ? Number(existing?.windowMissingClaimCount || 0) : 0) + Number(evaluation.missingClaimCount || 0))
    : ((withinWindow && !options.resetWindowOnPass) ? Number(existing?.windowMissingClaimCount || 0) : 0);
  const nextWindowStart = evaluation.detected
    ? (withinWindow ? new Date(existing.windowStartAt) : nowDate)
    : ((withinWindow && !options.resetWindowOnPass) ? new Date(existing.windowStartAt) : nowDate);

  const thresholdReached = evaluation.detected && (
    evaluation.immediate
    || nextViolationCount >= options.violationThreshold
    || nextMissingClaimCount >= options.missingClaimThreshold
  );

  if (!thresholdReached) {
    await UserTokenTypeSeparationState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastTokenType: String(evaluation.tokenType || ''),
          lastReason: evaluation.detected ? primaryReason : 'token_type_valid',
          metadata: sanitizeMetadata({
            ...evaluation.metadata,
            reasons: evaluation.reasons,
            violationCount: nextViolationCount,
            violationThreshold: options.violationThreshold,
            missingClaimCount: nextMissingClaimCount,
            missingClaimThreshold: options.missingClaimThreshold
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
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
      return { ok: true, reason: 'token_type_valid' };
    }

    await recordTokenTypeIncident(req, {
      eventType: 'token_type_separation_violation',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Refresh/access token type boundary violation denied request',
      userId,
      email: user.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons,
        tokenType: evaluation.tokenType
      },
      metadata: {
        violationCount: nextViolationCount,
        violationThreshold: options.violationThreshold,
        missingClaimCount: nextMissingClaimCount,
        missingClaimThreshold: options.missingClaimThreshold
      }
    });

    return {
      ok: false,
      reason: primaryReason,
      violationCount: nextViolationCount,
      violationThreshold: options.violationThreshold,
      missingClaimCount: nextMissingClaimCount,
      missingClaimThreshold: options.missingClaimThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserTokenTypeSeparationState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingClaimCount: nextMissingClaimCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastTokenType: String(evaluation.tokenType || ''),
        lastReason: 'token_type_separation_quarantined',
        metadata: sanitizeMetadata({
          ...evaluation.metadata,
          reasons: evaluation.reasons,
          violationCount: nextViolationCount,
          violationThreshold: options.violationThreshold,
          missingClaimCount: nextMissingClaimCount,
          missingClaimThreshold: options.missingClaimThreshold,
          escalationLevel
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
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
      reason: 'token_type_separation_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        tokenType: evaluation.tokenType
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 93,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordTokenTypeIncident(req, {
    eventType: 'token_type_separation_quarantined',
    riskScore: 93,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated refresh/access token type boundary violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons,
      tokenType: evaluation.tokenType
    },
    metadata: {
      violationCount: nextViolationCount,
      violationThreshold: options.violationThreshold,
      missingClaimCount: nextMissingClaimCount,
      missingClaimThreshold: options.missingClaimThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'token_type_separation_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenTypeSeparationShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenTypeSeparationState.find(query)
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
      lastTokenType: String(item.lastTokenType || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenTypeSeparationShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenTypeSeparationState.updateMany(
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

  const result = await UserTokenTypeSeparationState.updateMany(
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

async function quarantineTokenTypeSeparationUser({
  userId = '',
  reason = 'admin_manual_token_type_separation_quarantine',
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
  const existing = await UserTokenTypeSeparationState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenTypeSeparationState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_type_separation_quarantine',
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
        lastPath: '',
        lastMethod: '',
        lastTokenType: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_type_separation_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenTypeSeparation,
  getTokenTypeSeparationShieldSnapshot,
  releaseTokenTypeSeparationShieldStates,
  quarantineTokenTypeSeparationUser
};
