const crypto = require('crypto');

const UserTokenSessionRouteBindingState = require('../models/UserTokenSessionRouteBindingState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const IMMEDIATE_REASONS = new Set([
  'sid_bound_to_different_user',
  'sid_route_bucket_binding_drift'
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

function normalizeLower(value, max = 220) {
  return normalizeText(value, max).toLowerCase();
}

function normalizeMethod(value) {
  const method = String(value || '').trim().toUpperCase();
  return method || 'GET';
}

function normalizeRouteSegment(segment) {
  const raw = normalizeLower(segment, 120);
  if (!raw) return '';

  if (/^\d+$/.test(raw)) return ':id';
  if (/^[a-f0-9]{24}$/i.test(raw)) return ':objid';
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw)) {
    return ':uuid';
  }
  if (/^[a-z0-9_-]{16,}$/i.test(raw) && /\d/.test(raw) && /[a-z]/i.test(raw)) {
    return ':token';
  }

  return raw.replace(/[^a-z0-9._:-]/g, '').slice(0, 64);
}

function deriveRouteBucket(pathname, depth = 2) {
  const normalizedPath = normalizePath(pathname);
  if (!normalizedPath || normalizedPath === '/') return '/';

  const segments = normalizedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => normalizeRouteSegment(segment))
    .filter(Boolean);

  if (!segments.length) return '/';
  const maxDepth = Math.max(1, Math.min(8, Number(depth || 2)));
  return `/${segments.slice(0, maxDepth).join('/')}`;
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
  const methods = splitCsv(env.tokenSessionRouteBindingMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenSessionRouteBindingShieldEnabled),
    failOpen: Boolean(env.tokenSessionRouteBindingShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenSessionRouteBindingProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenSessionRouteBindingEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenSessionRouteBindingRequireSidClaim),
    requireRouteSignal: Boolean(env.tokenSessionRouteBindingRequireRouteSignal),
    requireMethodSignal: Boolean(env.tokenSessionRouteBindingRequireMethodSignal),
    compareRouteBucket: Boolean(env.tokenSessionRouteBindingCompareRouteBucket),
    compareMethod: Boolean(env.tokenSessionRouteBindingCompareMethod),
    allowReadMethodVariance: Boolean(env.tokenSessionRouteBindingAllowReadMethodVariance),
    routeBucketDepth: normalizeNumber(env.tokenSessionRouteBindingRouteBucketDepth, 2, 1, 8),
    windowMs: normalizeNumber(env.tokenSessionRouteBindingViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenSessionRouteBindingViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenSessionRouteBindingMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenSessionRouteBindingResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenSessionRouteBindingQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenSessionRouteBindingQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenSessionRouteBindingEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenSessionRouteBindingAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenSessionRouteBindingAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenSessionRouteBindingRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function parseRouteContext({ user = null, payload = {}, method = 'GET', path = '/', options }) {
  const userId = String(user?._id || user?.id || '').trim();
  const sid = normalizeLower(payload?.sid || '', 180);
  const sidHash = sid ? hashValue(sid) : '';
  const jti = normalizeLower(payload?.jti || '', 180);
  const jtiHash = jti ? hashValue(jti) : '';

  const normalizedMethod = normalizeMethod(method);
  const normalizedPath = normalizePath(path);
  const routeBucket = deriveRouteBucket(normalizedPath, options.routeBucketDepth);
  const routeBucketHash = routeBucket ? hashValue(routeBucket) : '';

  return {
    userId,
    sid,
    sidHash,
    jtiHash,
    method: normalizedMethod,
    path: normalizedPath,
    routeBucket,
    routeBucketHash
  };
}

function evaluateMethodDrift({ currentMethod, boundMethod, options }) {
  if (!options.compareMethod) return false;
  if (!currentMethod || !boundMethod) return false;
  if (currentMethod === boundMethod) return false;

  if (options.allowReadMethodVariance) {
    const currentRead = READ_METHODS.has(currentMethod);
    const boundRead = READ_METHODS.has(boundMethod);
    if (currentRead && boundRead) return false;
  }

  return true;
}

function evaluateRouteBindingDrift({ existing = null, context = {}, options }) {
  const reasons = [];
  let missingClaimCount = 0;
  const metadata = {};

  if (options.requireSidClaim && !context.sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireRouteSignal && !context.routeBucket) {
    reasons.push('missing_route_signal');
    missingClaimCount += 1;
  }
  if (options.requireMethodSignal && !context.method) {
    reasons.push('missing_method_signal');
    missingClaimCount += 1;
  }

  if (existing) {
    const boundUserId = String(existing.userId || '').trim();
    if (boundUserId && context.userId && boundUserId !== context.userId) {
      reasons.push('sid_bound_to_different_user');
    }

    if (
      options.compareRouteBucket
      && context.routeBucketHash
      && existing.boundRouteBucketHash
      && String(existing.boundRouteBucketHash) !== context.routeBucketHash
    ) {
      reasons.push('sid_route_bucket_binding_drift');
    }

    if (evaluateMethodDrift({
      currentMethod: context.method,
      boundMethod: normalizeMethod(existing.boundMethod),
      options
    })) {
      reasons.push('sid_method_binding_drift');
    }
  }

  metadata.path = context.path;
  metadata.method = context.method;
  metadata.routeBucket = context.routeBucket;
  metadata.routeBucketHash = context.routeBucketHash;
  metadata.sidPresent = Boolean(context.sid);
  metadata.sidHash = context.sidHash;
  metadata.userId = context.userId;
  metadata.jtiHash = context.jtiHash;

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('sid_bound_to_different_user')) return 'sid_bound_to_different_user';
  if (reasons.includes('sid_route_bucket_binding_drift')) return 'sid_route_bucket_binding_drift';
  if (reasons.includes('sid_method_binding_drift')) return 'sid_method_binding_drift';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_route_signal')) return 'missing_route_signal';
  if (reasons.includes('missing_method_signal')) return 'missing_method_signal';
  if (reasons.length > 0) return reasons[0];
  return 'session_route_binding_verified';
}

async function recordSessionRouteBindingIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_route_binding_violation',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || req.headers['cf-ipcity'] || 'unknown',
      deviceFingerprint: req.headers['x-device-fingerprint'] || null,
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
          action: 'token_session_route_binding_shield_triggered',
          note: payload.note || 'Token session route binding anomaly detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function revokeUsersIfNeeded({ options, currentUserId, boundUserId, reason, req, metadata }) {
  if (!options.autoRevokeSessions) return;

  const userIds = new Set();
  if (currentUserId) userIds.add(String(currentUserId));
  if (boundUserId) userIds.add(String(boundUserId));

  for (const userId of userIds) {
    await revokeAllAccessTokensForUser({
      userId,
      reason,
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: sanitizeMetadata(metadata)
    });
  }
}

async function banUsersIfNeeded({ options, currentUserId, boundUserId, quarantineUntil }) {
  if (!options.autoBanUser) return;

  const userIds = new Set();
  if (currentUserId) userIds.add(String(currentUserId));
  if (boundUserId) userIds.add(String(boundUserId));
  if (!userIds.size) return;

  await User.updateMany(
    { _id: { $in: Array.from(userIds) } },
    {
      $set: {
        isTemporarilyBannedUntil: quarantineUntil,
        riskScore: 95,
        lastRiskUpdate: new Date()
      }
    }
  );
}

async function inspectUserTokenSessionRouteBinding({ user = null, payload = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const method = normalizeMethod(req?.method || 'GET');
  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackRequest({ options, method, path })) {
    return { ok: true, reason: 'path_or_method_not_tracked' };
  }

  const context = parseRouteContext({
    user,
    payload: payload || {},
    method,
    path,
    options
  });

  if (!context.userId) {
    return { ok: true, reason: 'missing_user' };
  }

  if (options.requireSidClaim && !context.sid) {
    await recordSessionRouteBindingIncident(req, {
      eventType: 'session_route_binding_missing_sid',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session route binding rejected token without sid',
      userId: context.userId,
      email: user?.email || null,
      signals: {
        path,
        method,
        reasons: ['missing_sid_claim']
      },
      metadata: {
        missingClaimCount: 1
      }
    });
    return {
      ok: false,
      reason: 'missing_sid_claim',
      missingClaimCount: 1,
      missingClaimThreshold: options.missingClaimThreshold
    };
  }

  const sidHash = context.sidHash;
  if (!sidHash) {
    return { ok: true, reason: 'sid_not_available' };
  }

  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await UserTokenSessionRouteBindingState.findOne({ sidHash }).lean();
  if (existing) {
    const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
    if (existing.status === 'quarantined' && quarantineUntilMs > now) {
      return {
        ok: false,
        reason: 'sid_binding_quarantined',
        quarantineUntil: new Date(quarantineUntilMs).toISOString()
      };
    }
  }

  const evaluation = evaluateRouteBindingDrift({
    existing,
    context,
    options
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
    await UserTokenSessionRouteBindingState.updateOne(
      { sidHash },
      {
        $set: {
          userId: context.userId,
          boundRouteBucketHash: existing?.boundRouteBucketHash || context.routeBucketHash,
          boundMethod: existing?.boundMethod || context.method,
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: context.path,
          lastMethod: context.method,
          lastUserId: context.userId,
          lastRouteBucketHash: context.routeBucketHash,
          lastJtiHash: context.jtiHash,
          lastReason: evaluation.detected ? primaryReason : 'session_route_binding_verified',
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
      return { ok: true, reason: 'session_route_binding_verified' };
    }

    await recordSessionRouteBindingIncident(req, {
      eventType: 'session_route_binding_violation',
      riskScore: 90,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session route binding denied request',
      userId: context.userId,
      email: user?.email || null,
      signals: {
        path,
        method,
        reasons: evaluation.reasons
      },
      metadata: {
        sidHash,
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
  const boundUserId = existing?.userId ? String(existing.userId) : '';

  await UserTokenSessionRouteBindingState.updateOne(
    { sidHash },
    {
      $set: {
        userId: existing?.userId || context.userId,
        boundRouteBucketHash: existing?.boundRouteBucketHash || context.routeBucketHash,
        boundMethod: existing?.boundMethod || context.method,
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingClaimCount: nextMissingClaimCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: context.path,
        lastMethod: context.method,
        lastUserId: context.userId,
        lastRouteBucketHash: context.routeBucketHash,
        lastJtiHash: context.jtiHash,
        lastReason: 'session_route_binding_quarantined',
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

  await revokeUsersIfNeeded({
    options,
    currentUserId: context.userId,
    boundUserId,
    reason: 'session_route_binding_quarantined',
    req,
    metadata: {
      sidHash,
      path,
      method,
      reasons: evaluation.reasons
    }
  });

  await banUsersIfNeeded({
    options,
    currentUserId: context.userId,
    boundUserId,
    quarantineUntil
  });

  await recordSessionRouteBindingIncident(req, {
    eventType: 'session_route_binding_quarantined',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    note: 'Repeated session route binding violations triggered quarantine',
    userId: context.userId,
    email: user?.email || null,
    signals: {
      path,
      method,
      reasons: evaluation.reasons
    },
    metadata: {
      sidHash,
      boundUserId,
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
    reason: 'session_route_binding_quarantined',
    violationCount: nextViolationCount,
    violationThreshold: options.violationThreshold,
    missingClaimCount: nextMissingClaimCount,
    missingClaimThreshold: options.missingClaimThreshold,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

function isTokenSessionRouteBindingSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

async function getTokenSessionRouteBindingShieldSnapshot({ includeReleased = false, status = '', userId = '', sidHash = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();
  const normalizedSidHash = String(sidHash || '').trim().toLowerCase();

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
  if (normalizedSidHash) {
    query.sidHash = normalizedSidHash;
  }

  const rows = await UserTokenSessionRouteBindingState.find(query)
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
      sidHash: String(item.sidHash || ''),
      userId: item.userId ? String(item.userId) : null,
      boundRouteBucketHash: String(item.boundRouteBucketHash || ''),
      boundMethod: String(item.boundMethod || ''),
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
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenSessionRouteBindingShieldStates({ id = '', sidHash = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedSidHash = String(sidHash || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenSessionRouteBindingState.updateMany(
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
  if (normalizedSidHash) query.sidHash = normalizedSidHash;
  if (normalizedUserId) query.userId = normalizedUserId;

  const result = await UserTokenSessionRouteBindingState.updateMany(
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

async function quarantineTokenSessionRouteBinding({
  id = '',
  sidHash = '',
  userId = '',
  reason = 'admin_manual_session_route_binding_quarantine',
  durationMs = null,
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedSidHash = String(sidHash || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedId && !normalizedSidHash && !normalizedUserId) {
    const error = new Error('At least one selector is required');
    error.statusCode = 400;
    throw error;
  }

  const options = resolveOptions();
  const now = nowTs();
  const nowDate = new Date(now);
  const query = {};
  if (normalizedId) query._id = normalizedId;
  if (normalizedSidHash) query.sidHash = normalizedSidHash;
  if (normalizedUserId) query.userId = normalizedUserId;

  const docs = await UserTokenSessionRouteBindingState.find(query).select('userId sidHash').lean();
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, 1),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const result = await UserTokenSessionRouteBindingState.updateMany(
    query,
    {
      $set: {
        status: 'quarantined',
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_session_route_binding_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $inc: {
        escalationLevel: 1
      }
    }
  );

  const uniqueUserIds = Array.from(
    new Set(
      docs
        .map((item) => String(item.userId || '').trim())
        .filter(Boolean)
    )
  );

  if (options.autoRevokeSessions) {
    for (const principalUserId of uniqueUserIds) {
      await revokeAllAccessTokensForUser({
        userId: principalUserId,
        reason: 'admin_manual_session_route_binding_quarantine',
        source: 'admin',
        actorUserId: actorUserId || null,
        actorIp: String(actorIp || ''),
        metadata: sanitizeMetadata(metadata)
      });
    }
  }

  if (options.autoBanUser && uniqueUserIds.length > 0) {
    await User.updateMany(
      { _id: { $in: uniqueUserIds } },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 95,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  return {
    matchedCount: Number(result?.matchedCount || 0),
    updatedCount: Number(result?.modifiedCount || 0),
    quarantineUntil: quarantineUntil.toISOString()
  };
}

module.exports = {
  inspectUserTokenSessionRouteBinding,
  isTokenSessionRouteBindingSha256,
  getTokenSessionRouteBindingShieldSnapshot,
  releaseTokenSessionRouteBindingShieldStates,
  quarantineTokenSessionRouteBinding
};