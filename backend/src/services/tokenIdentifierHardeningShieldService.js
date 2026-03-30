const crypto = require('crypto');

const UserTokenIdentifierHardeningState = require('../models/UserTokenIdentifierHardeningState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_ALLOWED_PATTERN = '^[A-Za-z0-9._:-]+$';
const DEFAULT_WEAK_IDS = [
  '12345',
  '123456',
  '123456789',
  'abcdef',
  'qwerty',
  'password',
  'token',
  'session',
  'test',
  'admin',
  'root'
].join(',');
const IMMEDIATE_REASONS = new Set([
  'sid_equals_jti',
  'sid_identifier_sequential_pattern',
  'jti_identifier_sequential_pattern',
  'sid_identifier_repeated_pattern',
  'jti_identifier_repeated_pattern',
  'sid_identifier_weak_denylisted',
  'jti_identifier_weak_denylisted'
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

function normalizeText(value, max = 300) {
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

function compilePattern(pattern, fallback) {
  const candidate = String(pattern || '').trim();
  if (!candidate) return new RegExp(fallback);
  try {
    return new RegExp(candidate);
  } catch (_error) {
    return new RegExp(fallback);
  }
}

function uniqueCharRatio(value) {
  const text = String(value || '');
  if (!text.length) return 0;
  return new Set(text.split('')).size / text.length;
}

function isLikelySequential(value, minRunLength) {
  const text = String(value || '');
  if (!text) return false;
  if (text.length < minRunLength) return false;

  let asc = 1;
  let desc = 1;

  for (let i = 1; i < text.length; i += 1) {
    const prev = text.charCodeAt(i - 1);
    const current = text.charCodeAt(i);

    if (current === prev + 1) {
      asc += 1;
    } else {
      asc = 1;
    }

    if (current === prev - 1) {
      desc += 1;
    } else {
      desc = 1;
    }

    if (asc >= minRunLength || desc >= minRunLength) {
      return true;
    }
  }

  return false;
}

function hasRepeatedPattern(value) {
  const text = String(value || '');
  if (!text) return false;
  if (/^(.)\1{5,}$/i.test(text)) return true;
  if (/(.{1,4})\1{3,}/i.test(text)) return true;
  return false;
}

function resolveOptions() {
  const methods = splitCsv(env.tokenIdentifierHardeningMethods).map((item) => item.toLowerCase());
  const weakSet = new Set(splitCsv(env.tokenIdentifierHardeningWeakIdentifierDenylist || DEFAULT_WEAK_IDS)
    .map((item) => item.toLowerCase()));

  return {
    enabled: Boolean(env.tokenIdentifierHardeningShieldEnabled),
    failOpen: Boolean(env.tokenIdentifierHardeningShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenIdentifierHardeningProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    requireSidClaim: Boolean(env.tokenIdentifierHardeningRequireSidClaim),
    requireJtiClaim: Boolean(env.tokenIdentifierHardeningRequireJtiClaim),
    sidMinLength: normalizeNumber(env.tokenIdentifierHardeningSidMinLength, 20, 4, 500),
    sidMaxLength: normalizeNumber(env.tokenIdentifierHardeningSidMaxLength, 120, 8, 2000),
    jtiMinLength: normalizeNumber(env.tokenIdentifierHardeningJtiMinLength, 20, 4, 500),
    jtiMaxLength: normalizeNumber(env.tokenIdentifierHardeningJtiMaxLength, 120, 8, 2000),
    allowedPattern: compilePattern(env.tokenIdentifierHardeningAllowedPattern, DEFAULT_ALLOWED_PATTERN),
    minUniqueCharRatio: normalizeNumber(env.tokenIdentifierHardeningMinUniqueCharRatio, 0.35, 0.05, 1),
    disallowSidEqualsJti: Boolean(env.tokenIdentifierHardeningDisallowSidEqualsJti),
    disallowSequentialPattern: Boolean(env.tokenIdentifierHardeningDisallowSequentialPattern),
    sequentialRunMinLength: normalizeNumber(env.tokenIdentifierHardeningSequentialRunMinLength, 5, 3, 20),
    disallowRepeatedPattern: Boolean(env.tokenIdentifierHardeningDisallowRepeatedPattern),
    disallowWeakDenylist: Boolean(env.tokenIdentifierHardeningDisallowWeakDenylist),
    weakIdentifierSet: weakSet,
    windowMs: normalizeNumber(env.tokenIdentifierHardeningViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenIdentifierHardeningViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenIdentifierHardeningMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenIdentifierHardeningResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenIdentifierHardeningQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenIdentifierHardeningQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenIdentifierHardeningEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenIdentifierHardeningAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenIdentifierHardeningAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenIdentifierHardeningRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function evaluateSingleIdentifier({
  idValue = '',
  label = '',
  minLength = 0,
  maxLength = 0,
  options
}) {
  const reasons = [];
  const normalized = normalizeText(idValue, maxLength + 20);
  const lower = normalized.toLowerCase();

  if (!normalized) {
    reasons.push(`${label}_claim_missing_or_empty`);
    return {
      reasons,
      metadata: {
        length: 0,
        uniqueRatio: 0
      }
    };
  }

  const len = normalized.length;
  if (len < minLength) reasons.push(`${label}_identifier_too_short`);
  if (len > maxLength) reasons.push(`${label}_identifier_too_long`);

  if (!options.allowedPattern.test(normalized)) {
    reasons.push(`${label}_identifier_invalid_charset`);
  }

  const uniqueRatio = uniqueCharRatio(normalized);
  if (uniqueRatio < options.minUniqueCharRatio) {
    reasons.push(`${label}_identifier_low_entropy`);
  }

  if (options.disallowSequentialPattern && isLikelySequential(normalized, options.sequentialRunMinLength)) {
    reasons.push(`${label}_identifier_sequential_pattern`);
  }

  if (options.disallowRepeatedPattern && hasRepeatedPattern(normalized)) {
    reasons.push(`${label}_identifier_repeated_pattern`);
  }

  if (options.disallowWeakDenylist && options.weakIdentifierSet.has(lower)) {
    reasons.push(`${label}_identifier_weak_denylisted`);
  }

  return {
    reasons,
    metadata: {
      length: len,
      uniqueRatio: Number(uniqueRatio.toFixed(4)),
      hash: hashValue(normalized)
    }
  };
}

function evaluateTokenIdentifierHardening({
  payload = {},
  options,
  method,
  path
}) {
  const sid = normalizeText(payload?.sid || '', 220);
  const jti = normalizeText(payload?.jti || '', 220);
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  if (options.requireSidClaim && !sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireJtiClaim && !jti) {
    reasons.push('missing_jti_claim');
    missingClaimCount += 1;
  }

  const sidResult = sid
    ? evaluateSingleIdentifier({
      idValue: sid,
      label: 'sid',
      minLength: options.sidMinLength,
      maxLength: options.sidMaxLength,
      options
    })
    : { reasons: [], metadata: { length: 0, uniqueRatio: 0, hash: '' } };
  const jtiResult = jti
    ? evaluateSingleIdentifier({
      idValue: jti,
      label: 'jti',
      minLength: options.jtiMinLength,
      maxLength: options.jtiMaxLength,
      options
    })
    : { reasons: [], metadata: { length: 0, uniqueRatio: 0, hash: '' } };

  reasons.push(...sidResult.reasons);
  reasons.push(...jtiResult.reasons);

  if (options.disallowSidEqualsJti && sid && jti && sid === jti) {
    reasons.push('sid_equals_jti');
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidLength = Number(sidResult.metadata.length || 0);
  metadata.jtiLength = Number(jtiResult.metadata.length || 0);
  metadata.sidUniqueRatio = Number(sidResult.metadata.uniqueRatio || 0);
  metadata.jtiUniqueRatio = Number(jtiResult.metadata.uniqueRatio || 0);
  metadata.sidHash = String(sidResult.metadata.hash || '');
  metadata.jtiHash = String(jtiResult.metadata.hash || '');

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    sid,
    jti,
    sidHash: sidResult.metadata.hash || '',
    jtiHash: jtiResult.metadata.hash || '',
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('sid_equals_jti')) return 'sid_equals_jti';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_jti_claim')) return 'missing_jti_claim';
  if (reasons.includes('sid_identifier_low_entropy')) return 'sid_identifier_low_entropy';
  if (reasons.includes('jti_identifier_low_entropy')) return 'jti_identifier_low_entropy';
  if (reasons.includes('sid_identifier_sequential_pattern')) return 'sid_identifier_sequential_pattern';
  if (reasons.includes('jti_identifier_sequential_pattern')) return 'jti_identifier_sequential_pattern';
  if (reasons.length > 0) return reasons[0];
  return 'token_identifier_integrity_verified';
}

async function recordTokenIdentifierIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_identifier_hardening_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 87,
      severity: severityFromScore(payload.riskScore || 87),
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
          action: 'token_identifier_hardening_shield_triggered',
          note: payload.note || 'JWT sid/jti identifier hardening validation failed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenIdentifierHardening({ user = null, payload = null, req = null } = {}) {
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
  const existing = await UserTokenIdentifierHardeningState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenIdentifierHardening({
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
    await UserTokenIdentifierHardeningState.updateOne(
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
          lastSidHash: String(evaluation.sidHash || ''),
          lastJtiHash: String(evaluation.jtiHash || ''),
          lastReason: evaluation.detected ? primaryReason : 'token_identifier_integrity_verified',
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
      return { ok: true, reason: 'token_identifier_integrity_verified' };
    }

    await recordTokenIdentifierIncident(req, {
      eventType: 'token_identifier_hardening_violation',
      riskScore: 87,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'JWT identifier hardening violation denied request',
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

  await UserTokenIdentifierHardeningState.updateOne(
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
        lastSidHash: String(evaluation.sidHash || ''),
        lastJtiHash: String(evaluation.jtiHash || ''),
        lastReason: 'token_identifier_hardening_quarantined',
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
      reason: 'token_identifier_hardening_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        sidHash: evaluation.sidHash,
        jtiHash: evaluation.jtiHash
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

  await recordTokenIdentifierIncident(req, {
    eventType: 'token_identifier_hardening_quarantined',
    riskScore: 92,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated JWT identifier hardening violations triggered quarantine',
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
    reason: 'token_identifier_hardening_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenIdentifierHardeningShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenIdentifierHardeningState.find(query)
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
      lastSidHash: String(item.lastSidHash || ''),
      lastJtiHash: String(item.lastJtiHash || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenIdentifierHardeningShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenIdentifierHardeningState.updateMany(
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

  const result = await UserTokenIdentifierHardeningState.updateMany(
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

async function quarantineTokenIdentifierHardeningUser({
  userId = '',
  reason = 'admin_manual_token_identifier_hardening_quarantine',
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
  const existing = await UserTokenIdentifierHardeningState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenIdentifierHardeningState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_identifier_hardening_quarantine',
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
        lastSidHash: '',
        lastJtiHash: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_identifier_hardening_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenIdentifierHardening,
  getTokenIdentifierHardeningShieldSnapshot,
  releaseTokenIdentifierHardeningShieldStates,
  quarantineTokenIdentifierHardeningUser
};
