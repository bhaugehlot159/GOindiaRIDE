const crypto = require('crypto');

const UserTokenRotationContinuityState = require('../models/UserTokenRotationContinuityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const IMMEDIATE_REASONS = new Set([
  'sid_iat_rollback_detected',
  'sid_jti_reuse_with_new_iat',
  'invalid_exp_before_iat'
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

function normalizeSessionId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeJti(value) {
  return String(value || '').trim().toLowerCase();
}

function toEpochSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 0) return 0;
  return Math.floor(parsed);
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 80));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  const methods = splitCsv(env.tokenRotationContinuityMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenRotationContinuityShieldEnabled),
    failOpen: Boolean(env.tokenRotationContinuityShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenRotationContinuityProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenRotationContinuityEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenRotationContinuityRequireSidClaim),
    requireIatClaim: Boolean(env.tokenRotationContinuityRequireIatClaim),
    requireJtiClaim: Boolean(env.tokenRotationContinuityRequireJtiClaim),
    requireSidLedgerPresence: Boolean(env.tokenRotationContinuityRequireSidLedgerPresence),
    iatRollbackLeewaySec: normalizeNumber(env.tokenRotationContinuityIatRollbackLeewaySec, 30, 0, 3600),
    allowSameIatWithNewJti: Boolean(env.tokenRotationContinuityAllowSameIatWithNewJti),
    jtiReuseIatJumpSec: normalizeNumber(env.tokenRotationContinuityJtiReuseIatJumpSec, 120, 1, 3600),
    maxSidLedgerEntries: normalizeNumber(env.tokenRotationContinuityMaxSidLedgerEntries, 60, 10, 1000),
    windowMs: normalizeNumber(env.tokenRotationContinuityViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenRotationContinuityViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenRotationContinuityMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenRotationContinuityResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenRotationContinuityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenRotationContinuityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenRotationContinuityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenRotationContinuityAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenRotationContinuityAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenRotationContinuityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function normalizeLedgerEntry(entry = {}) {
  return {
    sidHash: normalizeText(entry.sidHash || '', 140),
    lastIatSec: Math.max(0, toEpochSeconds(entry.lastIatSec)),
    lastExpSec: Math.max(0, toEpochSeconds(entry.lastExpSec)),
    lastJtiHash: normalizeText(entry.lastJtiHash || '', 140),
    lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt) : null,
    seenCount: Math.max(0, Number(entry.seenCount || 0))
  };
}

function buildSidLedger({
  existingLedger = [],
  sidHash = '',
  iatSec = 0,
  expSec = 0,
  jtiHash = '',
  nowDate = new Date(),
  maxEntries = 60
}) {
  const normalized = Array.isArray(existingLedger)
    ? existingLedger
      .map((entry) => normalizeLedgerEntry(entry))
      .filter((entry) => entry.sidHash)
    : [];

  if (sidHash) {
    const index = normalized.findIndex((entry) => entry.sidHash === sidHash);
    if (index === -1) {
      normalized.push({
        sidHash,
        lastIatSec: iatSec > 0 ? iatSec : 0,
        lastExpSec: expSec > 0 ? expSec : 0,
        lastJtiHash: jtiHash || '',
        lastSeenAt: nowDate,
        seenCount: 1
      });
    } else {
      const current = normalized[index];
      normalized[index] = {
        sidHash: current.sidHash,
        lastIatSec: Math.max(current.lastIatSec, iatSec > 0 ? iatSec : 0),
        lastExpSec: Math.max(current.lastExpSec, expSec > 0 ? expSec : 0),
        lastJtiHash: jtiHash || current.lastJtiHash || '',
        lastSeenAt: nowDate,
        seenCount: Math.max(0, Number(current.seenCount || 0)) + 1
      };
    }
  }

  normalized.sort((a, b) => {
    const aTs = a.lastSeenAt ? a.lastSeenAt.getTime() : 0;
    const bTs = b.lastSeenAt ? b.lastSeenAt.getTime() : 0;
    if (aTs !== bTs) return bTs - aTs;
    return Number(b.seenCount || 0) - Number(a.seenCount || 0);
  });

  return normalized.slice(0, maxEntries).map((entry) => ({
    sidHash: entry.sidHash,
    lastIatSec: Number(entry.lastIatSec || 0),
    lastExpSec: Number(entry.lastExpSec || 0),
    lastJtiHash: String(entry.lastJtiHash || ''),
    lastSeenAt: entry.lastSeenAt || nowDate,
    seenCount: Number(entry.seenCount || 0)
  }));
}

function pickSidEntry(ledger = [], sidHash = '') {
  if (!sidHash) return null;
  return ledger.find((entry) => entry.sidHash === sidHash) || null;
}

function evaluateTokenRotationContinuity({
  payload = {},
  existing = null,
  options,
  method,
  path,
  nowDate = new Date()
}) {
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  const sid = normalizeSessionId(payload?.sid);
  const jti = normalizeJti(payload?.jti);
  const iatSec = toEpochSeconds(payload?.iat);
  const expSec = toEpochSeconds(payload?.exp);
  const sidHash = sid ? hashValue(sid) : '';
  const jtiHash = jti ? hashValue(jti) : '';

  const existingLedger = Array.isArray(existing?.sidLedger) ? existing.sidLedger : [];
  const normalizedLedger = existingLedger.map((entry) => normalizeLedgerEntry(entry)).filter((entry) => entry.sidHash);
  const sidEntry = pickSidEntry(normalizedLedger, sidHash);

  if (options.requireSidClaim && !sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireIatClaim && iatSec <= 0) {
    reasons.push('missing_iat_claim');
    missingClaimCount += 1;
  }
  if (options.requireJtiClaim && !jti) {
    reasons.push('missing_jti_claim');
    missingClaimCount += 1;
  }

  if (iatSec > 0 && expSec > 0 && expSec <= iatSec) {
    reasons.push('invalid_exp_before_iat');
  }

  if (sid && options.requireSidLedgerPresence && !sidEntry) {
    reasons.push('sid_not_seen_in_rotation_ledger');
  }

  if (sidEntry && iatSec > 0) {
    const lastIatSec = Number(sidEntry.lastIatSec || 0);
    if (lastIatSec > 0 && (iatSec + options.iatRollbackLeewaySec) < lastIatSec) {
      reasons.push('sid_iat_rollback_detected');
    }

    if (
      !options.allowSameIatWithNewJti
      && lastIatSec > 0
      && iatSec === lastIatSec
      && jtiHash
      && sidEntry.lastJtiHash
      && sidEntry.lastJtiHash !== jtiHash
    ) {
      reasons.push('sid_same_iat_new_jti_detected');
    }

    if (
      jtiHash
      && sidEntry.lastJtiHash
      && sidEntry.lastJtiHash === jtiHash
      && lastIatSec > 0
      && iatSec >= (lastIatSec + options.jtiReuseIatJumpSec)
    ) {
      reasons.push('sid_jti_reuse_with_new_iat');
    }
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidPresent = Boolean(sid);
  metadata.sidHash = sidHash;
  metadata.jtiPresent = Boolean(jti);
  metadata.jtiHash = jtiHash;
  metadata.iatSec = Number(iatSec || 0);
  metadata.expSec = Number(expSec || 0);
  metadata.sidLedgerSize = normalizedLedger.length;
  metadata.sidEntryLastIatSec = Number(sidEntry?.lastIatSec || 0);
  metadata.sidEntryLastExpSec = Number(sidEntry?.lastExpSec || 0);
  metadata.sidEntryLastJtiHash = String(sidEntry?.lastJtiHash || '');
  metadata.tokenSub = normalizeText(payload?.sub || '', 140);
  metadata.tokenType = normalizeText(payload?.type || payload?.tokenUse || '', 80).toLowerCase();

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));
  const nextSidLedger = buildSidLedger({
    existingLedger: normalizedLedger,
    sidHash,
    iatSec,
    expSec,
    jtiHash,
    nowDate,
    maxEntries: options.maxSidLedgerEntries
  });

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    sidHash,
    jtiHash,
    iatSec,
    expSec,
    nextSidLedger,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('sid_iat_rollback_detected')) return 'sid_iat_rollback_detected';
  if (reasons.includes('sid_jti_reuse_with_new_iat')) return 'sid_jti_reuse_with_new_iat';
  if (reasons.includes('invalid_exp_before_iat')) return 'invalid_exp_before_iat';
  if (reasons.includes('sid_same_iat_new_jti_detected')) return 'sid_same_iat_new_jti_detected';
  if (reasons.includes('sid_not_seen_in_rotation_ledger')) return 'sid_not_seen_in_rotation_ledger';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_iat_claim')) return 'missing_iat_claim';
  if (reasons.includes('missing_jti_claim')) return 'missing_jti_claim';
  if (reasons.length > 0) return reasons[0];
  return 'token_rotation_continuity_verified';
}

async function recordTokenRotationIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_rotation_continuity_violation',
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
          action: 'token_rotation_continuity_shield_triggered',
          note: payload.note || 'Access token rotation continuity anomaly detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenRotationContinuity({ user = null, payload = null, req = null } = {}) {
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
  const existing = await UserTokenRotationContinuityState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenRotationContinuity({
    payload: payload || {},
    existing,
    options,
    method,
    path,
    nowDate
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
    await UserTokenRotationContinuityState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          sidLedger: evaluation.nextSidLedger,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastSidHash: String(evaluation.sidHash || ''),
          lastJtiHash: String(evaluation.jtiHash || ''),
          lastIatSec: Number(evaluation.iatSec || 0),
          lastExpSec: Number(evaluation.expSec || 0),
          lastReason: evaluation.detected ? primaryReason : 'token_rotation_continuity_verified',
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
      return { ok: true, reason: 'token_rotation_continuity_verified' };
    }

    await recordTokenRotationIncident(req, {
      eventType: 'token_rotation_continuity_violation',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Token rotation continuity denied request',
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

  await UserTokenRotationContinuityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingClaimCount: nextMissingClaimCount,
        quarantineUntil,
        sidLedger: evaluation.nextSidLedger,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastSidHash: String(evaluation.sidHash || ''),
        lastJtiHash: String(evaluation.jtiHash || ''),
        lastIatSec: Number(evaluation.iatSec || 0),
        lastExpSec: Number(evaluation.expSec || 0),
        lastReason: 'token_rotation_continuity_quarantined',
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
      reason: 'token_rotation_continuity_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 95,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordTokenRotationIncident(req, {
    eventType: 'token_rotation_continuity_quarantined',
    riskScore: 95,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated token rotation continuity violations triggered quarantine',
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
    reason: 'token_rotation_continuity_quarantined',
    violationCount: nextViolationCount,
    violationThreshold: options.violationThreshold,
    missingClaimCount: nextMissingClaimCount,
    missingClaimThreshold: options.missingClaimThreshold,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenRotationContinuityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenRotationContinuityState.find(query)
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
      sidLedgerSize: Array.isArray(item.sidLedger) ? item.sidLedger.length : 0,
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastSidHash: String(item.lastSidHash || ''),
      lastJtiHash: String(item.lastJtiHash || ''),
      lastIatSec: Number(item.lastIatSec || 0),
      lastExpSec: Number(item.lastExpSec || 0),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenRotationContinuityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenRotationContinuityState.updateMany(
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

  const result = await UserTokenRotationContinuityState.updateMany(
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

async function quarantineTokenRotationContinuityUser({
  userId = '',
  reason = 'admin_manual_token_rotation_continuity_quarantine',
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
  const existing = await UserTokenRotationContinuityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenRotationContinuityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_rotation_continuity_quarantine',
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
        sidLedger: [],
        lastPath: '',
        lastMethod: '',
        lastSidHash: '',
        lastJtiHash: '',
        lastIatSec: 0,
        lastExpSec: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_rotation_continuity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenRotationContinuity,
  getTokenRotationContinuityShieldSnapshot,
  releaseTokenRotationContinuityShieldStates,
  quarantineTokenRotationContinuityUser
};
