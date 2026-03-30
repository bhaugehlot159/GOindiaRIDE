const crypto = require('crypto');

const UserTokenPayloadHygieneState = require('../models/UserTokenPayloadHygieneState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_ALLOWED_CLAIMS = [
  'sub',
  'role',
  'accountType',
  'sid',
  'jti',
  'iat',
  'exp',
  'nbf',
  'iss',
  'aud',
  'scope',
  'scp',
  'permissions',
  'type'
];
const PRIVILEGE_CLAIM_PATTERN = /(admin|root|superuser|sudo|impersonat|god|elevat|bypass|staff)/i;
const IMMEDIATE_REASONS = new Set([
  'invalid_token_structure',
  'malformed_token_payload_base64',
  'malformed_token_payload_json',
  'token_payload_too_large',
  'forbidden_privilege_claim_detected'
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

function decodeBase64UrlToText(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function parseTokenPayloadSegment(token) {
  const raw = String(token || '').trim();
  const segments = raw.split('.');
  if (segments.length !== 3) {
    return {
      ok: false,
      reason: 'invalid_token_structure',
      payload: null,
      payloadBytes: 0
    };
  }

  const payloadSegment = segments[1];
  let decoded = '';
  try {
    decoded = decodeBase64UrlToText(payloadSegment);
  } catch (_error) {
    return {
      ok: false,
      reason: 'malformed_token_payload_base64',
      payload: null,
      payloadBytes: 0
    };
  }

  let parsedPayload = null;
  try {
    parsedPayload = JSON.parse(decoded);
  } catch (_error) {
    return {
      ok: false,
      reason: 'malformed_token_payload_json',
      payload: null,
      payloadBytes: Buffer.byteLength(decoded, 'utf8')
    };
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    return {
      ok: false,
      reason: 'malformed_token_payload_json',
      payload: null,
      payloadBytes: Buffer.byteLength(decoded, 'utf8')
    };
  }

  return {
    ok: true,
    reason: 'parsed',
    payload: parsedPayload,
    payloadBytes: Buffer.byteLength(decoded, 'utf8'),
    claimCount: Object.keys(parsedPayload).length
  };
}

function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'user') return 'customer';
  return normalized;
}

function parseScopes(payload = {}) {
  const set = new Set();

  const addScope = (value) => {
    String(value || '')
      .split(/[\s,]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach((item) => set.add(item));
  };

  if (typeof payload.scope === 'string') {
    addScope(payload.scope);
  }
  if (Array.isArray(payload.scp)) {
    payload.scp.forEach((entry) => addScope(entry));
  } else if (typeof payload.scp === 'string') {
    addScope(payload.scp);
  }
  if (Array.isArray(payload.permissions)) {
    payload.permissions.forEach((entry) => addScope(entry));
  } else if (payload.permissions && typeof payload.permissions === 'object') {
    Object.entries(payload.permissions).forEach(([key, allowed]) => {
      if (allowed) addScope(key);
    });
  }

  return Array.from(set);
}

function resolveOptions() {
  const methods = splitCsv(env.tokenPayloadHygieneMethods).map((item) => item.toLowerCase());
  const allowedClaims = splitCsv(env.tokenPayloadHygieneAllowedClaims);
  return {
    enabled: Boolean(env.tokenPayloadHygieneShieldEnabled),
    failOpen: Boolean(env.tokenPayloadHygieneShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenPayloadHygieneProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    maxPayloadBytes: normalizeNumber(env.tokenPayloadHygieneMaxPayloadBytes, 4096, 128, 65536),
    maxClaimCount: normalizeNumber(env.tokenPayloadHygieneMaxClaimCount, 30, 5, 200),
    maxClaimStringLength: normalizeNumber(env.tokenPayloadHygieneMaxClaimStringLength, 512, 20, 20000),
    maxScopeCount: normalizeNumber(env.tokenPayloadHygieneMaxScopeCount, 25, 1, 500),
    maxScopeValueLength: normalizeNumber(env.tokenPayloadHygieneMaxScopeValueLength, 120, 5, 2000),
    requireSidClaim: Boolean(env.tokenPayloadHygieneRequireSidClaim),
    requireJtiClaim: Boolean(env.tokenPayloadHygieneRequireJtiClaim),
    requireRoleClaim: Boolean(env.tokenPayloadHygieneRequireRoleClaim),
    requireAccountTypeClaim: Boolean(env.tokenPayloadHygieneRequireAccountTypeClaim),
    allowUnknownClaims: Boolean(env.tokenPayloadHygieneAllowUnknownClaims),
    allowedClaims: allowedClaims.length ? allowedClaims : DEFAULT_ALLOWED_CLAIMS,
    denyPrivilegeLikeCustomClaims: Boolean(env.tokenPayloadHygieneDenyPrivilegeLikeCustomClaims),
    windowMs: normalizeNumber(env.tokenPayloadHygieneViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenPayloadHygieneViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenPayloadHygieneMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenPayloadHygieneResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenPayloadHygieneQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenPayloadHygieneQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenPayloadHygieneEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenPayloadHygieneAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenPayloadHygieneAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenPayloadHygieneRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function detectPrivilegeLikeUnknownClaims(unknownClaims = []) {
  return unknownClaims.filter((claim) => PRIVILEGE_CLAIM_PATTERN.test(String(claim || '')));
}

function checkClaimStringLength(value, maxLength) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  return value.length > maxLength;
}

function evaluatePayloadHygiene({
  token = '',
  payload = {},
  options,
  method,
  path
}) {
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  const parsed = parseTokenPayloadSegment(token);
  if (!parsed.ok) {
    reasons.push(parsed.reason);
  }

  const targetPayload = parsed.payload && typeof parsed.payload === 'object'
    ? parsed.payload
    : (payload && typeof payload === 'object' ? payload : {});

  const claimKeys = Object.keys(targetPayload);
  const allowedClaimSet = new Set((options.allowedClaims || []).map((item) => String(item).trim()).filter(Boolean));
  const unknownClaims = claimKeys.filter((claim) => !allowedClaimSet.has(claim));
  const privilegeLikeUnknownClaims = detectPrivilegeLikeUnknownClaims(unknownClaims);
  const scopes = parseScopes(targetPayload);

  if (parsed.payloadBytes > options.maxPayloadBytes) {
    reasons.push('token_payload_too_large');
  }

  if (claimKeys.length > options.maxClaimCount) {
    reasons.push('excessive_claim_count');
  }

  if (options.requireSidClaim && !normalizeText(targetPayload.sid, 220)) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireJtiClaim && !normalizeText(targetPayload.jti, 220)) {
    reasons.push('missing_jti_claim');
    missingClaimCount += 1;
  }
  if (options.requireRoleClaim && !normalizeRole(targetPayload.role)) {
    reasons.push('missing_role_claim');
    missingClaimCount += 1;
  }
  if (options.requireAccountTypeClaim && !normalizeRole(targetPayload.accountType)) {
    reasons.push('missing_account_type_claim');
    missingClaimCount += 1;
  }

  if (!options.allowUnknownClaims && unknownClaims.length) {
    reasons.push('unknown_claims_detected');
  }

  if (options.denyPrivilegeLikeCustomClaims && privilegeLikeUnknownClaims.length) {
    reasons.push('forbidden_privilege_claim_detected');
  }

  if (checkClaimStringLength(targetPayload.sub, options.maxClaimStringLength)) {
    reasons.push('sub_claim_too_long');
  }
  if (checkClaimStringLength(targetPayload.sid, options.maxClaimStringLength)) {
    reasons.push('sid_claim_too_long');
  }
  if (checkClaimStringLength(targetPayload.jti, options.maxClaimStringLength)) {
    reasons.push('jti_claim_too_long');
  }
  if (checkClaimStringLength(targetPayload.scope, options.maxClaimStringLength)) {
    reasons.push('scope_claim_too_long');
  }
  if (checkClaimStringLength(targetPayload.iss, options.maxClaimStringLength)) {
    reasons.push('issuer_claim_too_long');
  }
  if (checkClaimStringLength(targetPayload.aud, options.maxClaimStringLength)) {
    reasons.push('audience_claim_too_long');
  }

  if (scopes.length > options.maxScopeCount) {
    reasons.push('excessive_scope_count');
  }

  const oversizedScopes = scopes.filter((scope) => String(scope || '').length > options.maxScopeValueLength);
  if (oversizedScopes.length) {
    reasons.push('oversized_scope_value');
  }

  metadata.payloadBytes = Number(parsed.payloadBytes || 0);
  metadata.claimCount = Number(parsed.claimCount || claimKeys.length || 0);
  metadata.unknownClaims = unknownClaims.slice(0, 50);
  metadata.privilegeLikeUnknownClaims = privilegeLikeUnknownClaims.slice(0, 30);
  metadata.scopes = scopes.slice(0, 120);
  metadata.oversizedScopes = oversizedScopes.slice(0, 20);
  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sid = normalizeText(targetPayload.sid, 220);
  metadata.jti = normalizeText(targetPayload.jti, 220);
  metadata.sub = normalizeText(targetPayload.sub, 220);

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    payloadHash: hashValue(JSON.stringify(targetPayload)),
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('invalid_token_structure')) return 'invalid_token_structure';
  if (reasons.includes('malformed_token_payload_base64')) return 'malformed_token_payload_base64';
  if (reasons.includes('malformed_token_payload_json')) return 'malformed_token_payload_json';
  if (reasons.includes('token_payload_too_large')) return 'token_payload_too_large';
  if (reasons.includes('forbidden_privilege_claim_detected')) return 'forbidden_privilege_claim_detected';
  if (reasons.includes('unknown_claims_detected')) return 'unknown_claims_detected';
  if (reasons.length > 0) return reasons[0];
  return 'payload_hygiene_verified';
}

async function recordTokenPayloadIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_payload_hygiene_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 90,
      severity: severityFromScore(payload.riskScore || 90),
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
          action: 'token_payload_hygiene_shield_triggered',
          note: payload.note || 'JWT payload hygiene validation failed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenPayloadHygiene({ user = null, payload = null, token = '', req = null } = {}) {
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
  const existing = await UserTokenPayloadHygieneState.findOne({ userId }).lean();
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

  const evaluation = evaluatePayloadHygiene({
    token,
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
    await UserTokenPayloadHygieneState.updateOne(
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
          lastReason: evaluation.detected ? primaryReason : 'payload_hygiene_verified',
          lastPayloadHash: String(evaluation.payloadHash || ''),
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
      return { ok: true, reason: 'payload_hygiene_verified' };
    }

    await recordTokenPayloadIncident(req, {
      eventType: 'token_payload_hygiene_violation',
      riskScore: 90,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'JWT payload hygiene violation denied request',
      userId,
      email: user.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons
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

  await UserTokenPayloadHygieneState.updateOne(
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
        lastReason: 'token_payload_hygiene_quarantined',
        lastPayloadHash: String(evaluation.payloadHash || ''),
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
      reason: 'token_payload_hygiene_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        violationCount: nextViolationCount,
        missingClaimCount: nextMissingClaimCount
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 94,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordTokenPayloadIncident(req, {
    eventType: 'token_payload_hygiene_quarantined',
    riskScore: 94,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated JWT payload hygiene violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons
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
    reason: 'token_payload_hygiene_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenPayloadHygieneShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenPayloadHygieneState.find(query)
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
      lastReason: String(item.lastReason || ''),
      lastPayloadHash: String(item.lastPayloadHash || '')
    }))
  };
}

async function releaseTokenPayloadHygieneShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenPayloadHygieneState.updateMany(
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

  const result = await UserTokenPayloadHygieneState.updateMany(
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

async function quarantineTokenPayloadHygieneUser({
  userId = '',
  reason = 'admin_manual_token_payload_hygiene_quarantine',
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
  const existing = await UserTokenPayloadHygieneState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenPayloadHygieneState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_payload_hygiene_quarantine',
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
        lastPayloadHash: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_payload_hygiene_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenPayloadHygiene,
  getTokenPayloadHygieneShieldSnapshot,
  releaseTokenPayloadHygieneShieldStates,
  quarantineTokenPayloadHygieneUser
};
