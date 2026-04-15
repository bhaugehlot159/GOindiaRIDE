const crypto = require('crypto');

const UserTokenHeaderIntegrityState = require('../models/UserTokenHeaderIntegrityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_ALLOWED_ALGORITHMS = ['HS256'];
const DEFAULT_ALLOWED_TYP_VALUES = ['jwt'];
const EXTERNAL_KEY_HEADER_FIELDS = ['jku', 'jwk', 'x5u', 'x5c', 'x5t', 'x5t#s256'];
const IMMEDIATE_REASONS = new Set([
  'invalid_token_structure',
  'malformed_token_header_base64',
  'malformed_token_header_json',
  'token_header_too_large',
  'disallowed_algorithm_none',
  'disallowed_algorithm',
  'forbidden_external_key_reference',
  'forbidden_critical_header',
  'kid_not_allowed',
  'nested_jwt_header_not_allowed'
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

function normalizeAlgorithms(value) {
  const items = splitCsv(value);
  if (!items.length) return DEFAULT_ALLOWED_ALGORITHMS;
  return Array.from(new Set(items.map((item) => item.toUpperCase())));
}

function normalizeTypValues(value) {
  const items = splitCsv(value);
  if (!items.length) return DEFAULT_ALLOWED_TYP_VALUES;
  return Array.from(new Set(items.map((item) => item.toLowerCase())));
}

function resolveOptions() {
  const methods = splitCsv(env.tokenHeaderIntegrityMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenHeaderIntegrityShieldEnabled),
    failOpen: Boolean(env.tokenHeaderIntegrityShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenHeaderIntegrityProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    maxHeaderBytes: normalizeNumber(env.tokenHeaderIntegrityMaxHeaderBytes, 2048, 64, 16384),
    allowedAlgorithms: normalizeAlgorithms(env.tokenHeaderIntegrityAllowedAlgorithms),
    rejectNoneAlgorithm: Boolean(env.tokenHeaderIntegrityRejectNoneAlgorithm),
    requireTyp: Boolean(env.tokenHeaderIntegrityRequireTyp),
    allowedTypValues: normalizeTypValues(env.tokenHeaderIntegrityAllowedTypValues),
    requireKid: Boolean(env.tokenHeaderIntegrityRequireKid),
    allowedKids: splitCsv(env.tokenHeaderIntegrityAllowedKids),
    disallowExternalKeyRefs: Boolean(env.tokenHeaderIntegrityDisallowExternalKeyRefs),
    disallowCriticalHeader: Boolean(env.tokenHeaderIntegrityDisallowCriticalHeader),
    disallowNestedJwtHeader: Boolean(env.tokenHeaderIntegrityDisallowNestedJwtHeader),
    windowMs: normalizeNumber(env.tokenHeaderIntegrityViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenHeaderIntegrityViolationThreshold, 3, 1, 50),
    missingFieldThreshold: normalizeNumber(env.tokenHeaderIntegrityMissingFieldThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenHeaderIntegrityResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenHeaderIntegrityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenHeaderIntegrityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenHeaderIntegrityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenHeaderIntegrityAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenHeaderIntegrityAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenHeaderIntegrityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function parseTokenHeader(token) {
  const raw = String(token || '').trim();
  const segments = raw.split('.');

  if (segments.length !== 3) {
    return {
      ok: false,
      reason: 'invalid_token_structure',
      header: null,
      headerBytes: 0
    };
  }

  const headerSegment = segments[0];
  let decoded = '';
  try {
    decoded = decodeBase64UrlToText(headerSegment);
  } catch (_error) {
    return {
      ok: false,
      reason: 'malformed_token_header_base64',
      header: null,
      headerBytes: 0
    };
  }

  let parsedHeader = null;
  try {
    parsedHeader = JSON.parse(decoded);
  } catch (_error) {
    return {
      ok: false,
      reason: 'malformed_token_header_json',
      header: null,
      headerBytes: Buffer.byteLength(decoded, 'utf8')
    };
  }

  if (!parsedHeader || typeof parsedHeader !== 'object' || Array.isArray(parsedHeader)) {
    return {
      ok: false,
      reason: 'malformed_token_header_json',
      header: null,
      headerBytes: Buffer.byteLength(decoded, 'utf8')
    };
  }

  return {
    ok: true,
    reason: 'parsed',
    header: parsedHeader,
    headerBytes: Buffer.byteLength(decoded, 'utf8'),
    headerFieldCount: Object.keys(parsedHeader).length
  };
}

function evaluateTokenHeaderIntegrity({
  token = '',
  payload = {},
  options,
  method,
  path
}) {
  const reasons = [];
  const metadata = {};
  let missingFieldCount = 0;

  const parsed = parseTokenHeader(token);
  if (!parsed.ok) {
    reasons.push(parsed.reason);
  }

  const header = parsed.header || {};
  const algorithm = normalizeText(header.alg || '', 60).toUpperCase();
  const typ = normalizeText(header.typ || '', 80).toLowerCase();
  const kid = normalizeText(header.kid || '', 140);
  const cty = normalizeText(header.cty || '', 80).toLowerCase();
  const crit = Array.isArray(header.crit)
    ? header.crit.map((item) => normalizeText(item, 80)).filter(Boolean)
    : [];

  const externalKeyFields = EXTERNAL_KEY_HEADER_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(header, field));

  if (parsed.headerBytes > options.maxHeaderBytes) {
    reasons.push('token_header_too_large');
  }

  if (!algorithm) {
    reasons.push('missing_alg_header');
    missingFieldCount += 1;
  } else {
    if (options.rejectNoneAlgorithm && algorithm === 'NONE') {
      reasons.push('disallowed_algorithm_none');
    }
    if (Array.isArray(options.allowedAlgorithms) && options.allowedAlgorithms.length) {
      if (!options.allowedAlgorithms.includes(algorithm)) {
        reasons.push('disallowed_algorithm');
      }
    }
  }

  if (options.requireTyp) {
    if (!typ) {
      reasons.push('missing_typ_header');
      missingFieldCount += 1;
    } else if (!options.allowedTypValues.includes(typ)) {
      reasons.push('typ_mismatch');
    }
  }

  if (options.disallowNestedJwtHeader && cty === 'jwt') {
    reasons.push('nested_jwt_header_not_allowed');
  }

  if (options.requireKid && !kid) {
    reasons.push('missing_kid_header');
    missingFieldCount += 1;
  }

  if (Array.isArray(options.allowedKids) && options.allowedKids.length && kid) {
    if (!options.allowedKids.includes(kid)) {
      reasons.push('kid_not_allowed');
    }
  }

  if (options.disallowExternalKeyRefs && externalKeyFields.length) {
    reasons.push('forbidden_external_key_reference');
  }

  if (options.disallowCriticalHeader && crit.length) {
    reasons.push('forbidden_critical_header');
  }

  metadata.headerBytes = Number(parsed.headerBytes || 0);
  metadata.headerFieldCount = Number(parsed.headerFieldCount || 0);
  metadata.algorithm = algorithm;
  metadata.typ = typ;
  metadata.kid = kid;
  metadata.cty = cty;
  metadata.crit = crit.slice(0, 20);
  metadata.externalKeyFields = externalKeyFields;
  metadata.sub = normalizeText(payload?.sub || '', 140);
  metadata.sid = normalizeText(payload?.sid || '', 140);
  metadata.jti = normalizeText(payload?.jti || '', 140);
  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingFieldCount,
    algorithm,
    typ,
    kid,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('invalid_token_structure')) return 'invalid_token_structure';
  if (reasons.includes('malformed_token_header_base64')) return 'malformed_token_header_base64';
  if (reasons.includes('malformed_token_header_json')) return 'malformed_token_header_json';
  if (reasons.includes('disallowed_algorithm_none')) return 'disallowed_algorithm_none';
  if (reasons.includes('disallowed_algorithm')) return 'disallowed_algorithm';
  if (reasons.includes('kid_not_allowed')) return 'kid_not_allowed';
  if (reasons.includes('forbidden_external_key_reference')) return 'forbidden_external_key_reference';
  if (reasons.includes('forbidden_critical_header')) return 'forbidden_critical_header';
  if (reasons.includes('nested_jwt_header_not_allowed')) return 'nested_jwt_header_not_allowed';
  if (reasons.length > 0) return reasons[0];
  return 'header_integrity_verified';
}

async function recordTokenHeaderIntegrityIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_header_integrity_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 89,
      severity: severityFromScore(payload.riskScore || 89),
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
          action: 'token_header_integrity_shield_triggered',
          note: payload.note || 'JWT header integrity validation failed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenHeaderIntegrity({ user = null, payload = null, token = '', req = null } = {}) {
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
  const existing = await UserTokenHeaderIntegrityState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenHeaderIntegrity({
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
  const nextMissingFieldCount = evaluation.detected
    ? ((withinWindow ? Number(existing?.windowMissingFieldCount || 0) : 0) + Number(evaluation.missingFieldCount || 0))
    : ((withinWindow && !options.resetWindowOnPass) ? Number(existing?.windowMissingFieldCount || 0) : 0);
  const nextWindowStart = evaluation.detected
    ? (withinWindow ? new Date(existing.windowStartAt) : nowDate)
    : ((withinWindow && !options.resetWindowOnPass) ? new Date(existing.windowStartAt) : nowDate);

  const thresholdReached = evaluation.detected && (
    evaluation.immediate
    || nextViolationCount >= options.violationThreshold
    || nextMissingFieldCount >= options.missingFieldThreshold
  );

  if (!thresholdReached) {
    await UserTokenHeaderIntegrityState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingFieldCount: nextMissingFieldCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastAlg: String(evaluation.algorithm || ''),
          lastTyp: String(evaluation.typ || ''),
          lastKid: String(evaluation.kid || ''),
          lastReason: evaluation.detected ? primaryReason : 'header_integrity_verified',
          metadata: sanitizeMetadata({
            ...evaluation.metadata,
            reasonList: evaluation.reasons,
            scopeHash: hashValue(`${method}:${path}`),
            violationCount: nextViolationCount,
            violationThreshold: options.violationThreshold,
            missingFieldCount: nextMissingFieldCount,
            missingFieldThreshold: options.missingFieldThreshold
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
      return { ok: true, reason: 'header_integrity_verified' };
    }

    await recordTokenHeaderIntegrityIncident(req, {
      eventType: 'token_header_integrity_violation',
      riskScore: 89,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'JWT header integrity violation denied request',
      userId,
      email: user.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons,
        algorithm: evaluation.algorithm,
        typ: evaluation.typ,
        kid: evaluation.kid
      },
      metadata: {
        violationCount: nextViolationCount,
        violationThreshold: options.violationThreshold,
        missingFieldCount: nextMissingFieldCount,
        missingFieldThreshold: options.missingFieldThreshold,
        headerBytes: evaluation.metadata.headerBytes
      }
    });

    return {
      ok: false,
      reason: primaryReason,
      violationCount: nextViolationCount,
      violationThreshold: options.violationThreshold,
      missingFieldCount: nextMissingFieldCount,
      missingFieldThreshold: options.missingFieldThreshold
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserTokenHeaderIntegrityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingFieldCount: nextMissingFieldCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastAlg: String(evaluation.algorithm || ''),
        lastTyp: String(evaluation.typ || ''),
        lastKid: String(evaluation.kid || ''),
        lastReason: 'token_header_integrity_quarantined',
        metadata: sanitizeMetadata({
          ...evaluation.metadata,
          reasonList: evaluation.reasons,
          scopeHash: hashValue(`${method}:${path}`),
          violationCount: nextViolationCount,
          violationThreshold: options.violationThreshold,
          missingFieldCount: nextMissingFieldCount,
          missingFieldThreshold: options.missingFieldThreshold,
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
      reason: 'token_header_integrity_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        algorithm: evaluation.algorithm,
        typ: evaluation.typ,
        kid: evaluation.kid
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

  await recordTokenHeaderIntegrityIncident(req, {
    eventType: 'token_header_integrity_quarantined',
    riskScore: 93,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated JWT header integrity violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons,
      algorithm: evaluation.algorithm,
      typ: evaluation.typ,
      kid: evaluation.kid
    },
    metadata: {
      violationCount: nextViolationCount,
      violationThreshold: options.violationThreshold,
      missingFieldCount: nextMissingFieldCount,
      missingFieldThreshold: options.missingFieldThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'token_header_integrity_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenHeaderIntegrityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenHeaderIntegrityState.find(query)
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
      windowMissingFieldCount: Number(item.windowMissingFieldCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastAlg: String(item.lastAlg || ''),
      lastTyp: String(item.lastTyp || ''),
      lastKid: String(item.lastKid || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenHeaderIntegrityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenHeaderIntegrityState.updateMany(
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

  const result = await UserTokenHeaderIntegrityState.updateMany(
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

async function quarantineTokenHeaderIntegrityUser({
  userId = '',
  reason = 'admin_manual_token_header_integrity_quarantine',
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
  const existing = await UserTokenHeaderIntegrityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenHeaderIntegrityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_header_integrity_quarantine',
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
        windowMissingFieldCount: 0,
        lastPath: '',
        lastMethod: '',
        lastAlg: '',
        lastTyp: '',
        lastKid: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_header_integrity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenHeaderIntegrity,
  getTokenHeaderIntegrityShieldSnapshot,
  releaseTokenHeaderIntegrityShieldStates,
  quarantineTokenHeaderIntegrityUser
};
