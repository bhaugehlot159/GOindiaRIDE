const crypto = require('crypto');

const UserTokenSessionAnchorState = require('../models/UserTokenSessionAnchorState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const IMMEDIATE_REASONS = new Set([
  'sid_not_found_in_refresh_inventory',
  'sid_anchor_duplicate_exceeded',
  'sid_fingerprint_mismatch',
  'sid_user_agent_mismatch'
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

function normalizeFingerprint(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUserAgent(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 70));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  const methods = splitCsv(env.tokenSessionAnchorMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenSessionAnchorShieldEnabled),
    failOpen: Boolean(env.tokenSessionAnchorShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenSessionAnchorProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenSessionAnchorEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenSessionAnchorRequireSidClaim),
    requireAnchorMatch: Boolean(env.tokenSessionAnchorRequireAnchorMatch),
    minRefreshTokenRemainingMs: normalizeNumber(env.tokenSessionAnchorMinRefreshTokenRemainingMs, 60 * 1000, 0, 24 * 60 * 60 * 1000),
    maxAnchorAgeMs: normalizeNumber(env.tokenSessionAnchorMaxAgeMs, 0, 0, 365 * 24 * 60 * 60 * 1000),
    maxSessionSidDuplicates: normalizeNumber(env.tokenSessionAnchorMaxSessionSidDuplicates, 4, 1, 50),
    requireFingerprintMatch: Boolean(env.tokenSessionAnchorRequireFingerprintMatch),
    allowMissingFingerprint: Boolean(env.tokenSessionAnchorAllowMissingFingerprint),
    requireUserAgentMatch: Boolean(env.tokenSessionAnchorRequireUserAgentMatch),
    allowMissingUserAgent: Boolean(env.tokenSessionAnchorAllowMissingUserAgent),
    windowMs: normalizeNumber(env.tokenSessionAnchorViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenSessionAnchorViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenSessionAnchorMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenSessionAnchorResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenSessionAnchorQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenSessionAnchorQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenSessionAnchorEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenSessionAnchorAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenSessionAnchorAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenSessionAnchorRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function collectActiveRefreshAnchors(user = {}, options) {
  const rows = Array.isArray(user?.refreshTokens) ? user.refreshTokens : [];
  const now = nowTs();

  const anchors = [];
  let missingSessionIdCount = 0;

  rows.forEach((token) => {
    if (!token || typeof token !== 'object') return;

    const expiresAtMs = token.expiresAt ? new Date(token.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    const active = Number.isFinite(expiresAtMs)
      ? expiresAtMs > (now + options.minRefreshTokenRemainingMs)
      : true;
    if (!active) return;

    const sid = normalizeSessionId(token.sessionId);
    if (!sid) {
      missingSessionIdCount += 1;
      return;
    }

    const createdAtMs = token.createdAt ? new Date(token.createdAt).getTime() : 0;
    const sessionStartedAtMs = token.sessionStartedAt ? new Date(token.sessionStartedAt).getTime() : 0;
    const anchorStartedAtMs = sessionStartedAtMs > 0 ? sessionStartedAtMs : createdAtMs;

    if (options.maxAnchorAgeMs > 0 && anchorStartedAtMs > 0) {
      const anchorAgeMs = Math.max(0, now - anchorStartedAtMs);
      if (anchorAgeMs > options.maxAnchorAgeMs) {
        return;
      }
    }

    anchors.push({
      sid,
      sidHash: hashValue(sid),
      deviceFingerprint: normalizeFingerprint(token.deviceFingerprint),
      userAgent: normalizeUserAgent(token.userAgent),
      ip: normalizeText(token.ip || '', 120),
      expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs : null,
      anchorStartedAtMs: anchorStartedAtMs > 0 ? anchorStartedAtMs : null
    });
  });

  const bySid = new Map();
  anchors.forEach((item) => {
    const list = bySid.get(item.sid) || [];
    list.push(item);
    bySid.set(item.sid, list);
  });

  return {
    anchors,
    bySid,
    missingSessionIdCount
  };
}

function evaluateTokenSessionAnchor({
  user = null,
  payload = {},
  req = null,
  options,
  method,
  path
}) {
  const reasons = [];
  const metadata = {};
  let missingClaimCount = 0;

  const sid = normalizeSessionId(payload?.sid);
  if (options.requireSidClaim && !sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }

  const anchors = collectActiveRefreshAnchors(user, options);
  const matches = sid ? (anchors.bySid.get(sid) || []) : [];
  const matchCount = matches.length;

  if (sid && options.requireAnchorMatch && matchCount === 0) {
    reasons.push('sid_not_found_in_refresh_inventory');
  }
  if (sid && matchCount > options.maxSessionSidDuplicates) {
    reasons.push('sid_anchor_duplicate_exceeded');
  }

  const reqFingerprint = normalizeFingerprint(
    req?.headers?.['x-device-fingerprint'] || getDeviceMeta(req).fingerprint
  );
  const reqUserAgent = normalizeUserAgent(req?.headers?.['user-agent'] || '');

  if (sid && matchCount > 0 && options.requireFingerprintMatch) {
    if (!reqFingerprint) {
      if (!options.allowMissingFingerprint) {
        reasons.push('sid_fingerprint_missing');
      }
    } else {
      const fingerprintMatched = matches.some((item) => item.deviceFingerprint && item.deviceFingerprint === reqFingerprint);
      if (!fingerprintMatched) {
        reasons.push('sid_fingerprint_mismatch');
      }
    }
  }

  if (sid && matchCount > 0 && options.requireUserAgentMatch) {
    if (!reqUserAgent) {
      if (!options.allowMissingUserAgent) {
        reasons.push('sid_user_agent_missing');
      }
    } else {
      const userAgentMatched = matches.some((item) => item.userAgent && item.userAgent === reqUserAgent);
      if (!userAgentMatched) {
        reasons.push('sid_user_agent_mismatch');
      }
    }
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidHash = sid ? hashValue(sid) : '';
  metadata.sidPresent = Boolean(sid);
  metadata.refreshAnchorCount = anchors.anchors.length;
  metadata.missingRefreshSessionIdCount = Number(anchors.missingSessionIdCount || 0);
  metadata.matchCount = matchCount;
  metadata.reqFingerprint = reqFingerprint ? hashValue(reqFingerprint) : '';
  metadata.reqUserAgent = reqUserAgent ? hashValue(reqUserAgent) : '';
  metadata.tokenSub = normalizeText(payload?.sub || '', 140);
  metadata.tokenJti = normalizeText(payload?.jti || '', 140);

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    sid,
    sidHash: sid ? hashValue(sid) : '',
    anchorMatchState: !sid ? 'missing_sid' : (matchCount > 0 ? 'matched' : 'unmatched'),
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('sid_not_found_in_refresh_inventory')) return 'sid_not_found_in_refresh_inventory';
  if (reasons.includes('sid_anchor_duplicate_exceeded')) return 'sid_anchor_duplicate_exceeded';
  if (reasons.includes('sid_fingerprint_mismatch')) return 'sid_fingerprint_mismatch';
  if (reasons.includes('sid_user_agent_mismatch')) return 'sid_user_agent_mismatch';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.length > 0) return reasons[0];
  return 'session_anchor_verified';
}

async function recordTokenSessionAnchorIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_session_anchor_violation',
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
          action: 'token_session_anchor_shield_triggered',
          note: payload.note || 'Token sid is not anchored to active refresh inventory'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenSessionAnchor({ user = null, payload = null, req = null } = {}) {
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
  const existing = await UserTokenSessionAnchorState.findOne({ userId }).lean();
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

  const evaluation = evaluateTokenSessionAnchor({
    user,
    payload: payload || {},
    req,
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
    await UserTokenSessionAnchorState.updateOne(
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
          lastAnchorMatchState: String(evaluation.anchorMatchState || ''),
          lastReason: evaluation.detected ? primaryReason : 'session_anchor_verified',
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
      return { ok: true, reason: 'session_anchor_verified' };
    }

    await recordTokenSessionAnchorIncident(req, {
      eventType: 'token_session_anchor_violation',
      riskScore: 89,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Token sid anchor validation denied request',
      userId,
      email: user.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons,
        anchorMatchState: evaluation.anchorMatchState
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

  await UserTokenSessionAnchorState.updateOne(
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
        lastAnchorMatchState: String(evaluation.anchorMatchState || ''),
        lastReason: 'token_session_anchor_quarantined',
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
      reason: 'token_session_anchor_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: evaluation.reasons,
        anchorMatchState: evaluation.anchorMatchState
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

  await recordTokenSessionAnchorIncident(req, {
    eventType: 'token_session_anchor_quarantined',
    riskScore: 94,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated token sid anchor violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons,
      anchorMatchState: evaluation.anchorMatchState
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
    reason: 'token_session_anchor_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getTokenSessionAnchorShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenSessionAnchorState.find(query)
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
      lastAnchorMatchState: String(item.lastAnchorMatchState || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenSessionAnchorShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenSessionAnchorState.updateMany(
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

  const result = await UserTokenSessionAnchorState.updateMany(
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

async function quarantineTokenSessionAnchorUser({
  userId = '',
  reason = 'admin_manual_token_session_anchor_quarantine',
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
  const existing = await UserTokenSessionAnchorState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenSessionAnchorState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_session_anchor_quarantine',
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
        lastSidHash: '',
        lastAnchorMatchState: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_session_anchor_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenSessionAnchor,
  getTokenSessionAnchorShieldSnapshot,
  releaseTokenSessionAnchorShieldStates,
  quarantineTokenSessionAnchorUser
};
