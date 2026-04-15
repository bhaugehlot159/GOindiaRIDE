const crypto = require('crypto');

const UserTokenSessionDeviceClassBindingState = require('../models/UserTokenSessionDeviceClassBindingState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const IMMEDIATE_REASONS = new Set([
  'sid_bound_to_different_user',
  'sid_device_class_binding_drift'
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

function firstHeaderValue(req, keys = []) {
  if (!req || typeof req !== 'object') return '';

  for (const key of keys) {
    if (!key) continue;
    const raw = req.headers?.[key];
    if (Array.isArray(raw) && raw.length > 0) {
      const first = String(raw[0] || '').trim();
      if (first) return first.split(',')[0].trim();
      continue;
    }

    const text = String(raw || '').trim();
    if (text) return text.split(',')[0].trim();
  }

  return '';
}

function normalizeDeviceClassTag(value) {
  const raw = normalizeLower(value, 180)
    .replace(/_/g, '-')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9-]/g, '');
  if (!raw) return '';

  if (/(bot|spider|crawler|crawl|headless|monitor)/.test(raw)) return 'bot';
  if (/(tablet|ipad)/.test(raw)) return 'tablet';
  if (/(mobile|iphone|android|phone)/.test(raw)) return 'mobile';
  if (/(tv|smarttv|hbbtv)/.test(raw)) return 'tv';
  if (/(desktop|windows|macos|linux|x11|chromeos)/.test(raw)) return 'desktop';
  if (/(web|browser)/.test(raw)) return 'web';

  return raw.slice(0, 40);
}

function normalizeMobileStateTag(value) {
  const raw = normalizeLower(value, 80);
  if (!raw) return '';
  if (raw === '?1' || raw === '1' || raw === 'true') return 'mobile';
  if (raw === '?0' || raw === '0' || raw === 'false') return 'non_mobile';
  if (/(mobile|phone|android|iphone|tablet)/.test(raw)) return 'mobile';
  if (/(desktop|web|browser|laptop|tv|console|nonmobile|non-mobile)/.test(raw)) return 'non_mobile';
  if (/(unknown|n[\\/]a|na|null|undefined)/.test(raw)) return 'unknown';
  return '';
}

function parseAcceptMobileState(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const first = text.split(',')[0] || '';
  const noQuality = first.split(';')[0] || '';
  return normalizeMobileStateTag(noQuality);
}

function inferDeviceClassFromUserAgent(value) {
  const ua = normalizeLower(value, 500);
  if (!ua) return '';
  if (/(bot|spider|crawler|crawl|headless|monitor)/.test(ua)) return 'bot';
  if (/(ipad|tablet)/.test(ua)) return 'tablet';
  if (/(android|iphone|mobile|phone)/.test(ua)) return 'mobile';
  if (/(smart-tv|smarttv|hbbtv|appletv|googletv)/.test(ua)) return 'tv';
  if (/(windows|macintosh|linux|x11|chromeos)/.test(ua)) return 'desktop';
  return 'web';
}

function resolveOptions() {
  const methods = splitCsv(env.tokenSessionDeviceClassBindingMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenSessionDeviceClassBindingShieldEnabled),
    failOpen: Boolean(env.tokenSessionDeviceClassBindingShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenSessionDeviceClassBindingProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenSessionDeviceClassBindingEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenSessionDeviceClassBindingRequireSidClaim),
    requireDeviceClassSignal: Boolean(env.tokenSessionDeviceClassBindingRequireDeviceClassSignal),
    requireMobileStateSignal: Boolean(env.tokenSessionDeviceClassBindingRequireMobileStateSignal),
    compareDeviceClass: Boolean(env.tokenSessionDeviceClassBindingCompareDeviceClass),
    compareMobileState: Boolean(env.tokenSessionDeviceClassBindingCompareMobileState),
    allowMobileStateRegionFallback: Boolean(env.tokenSessionDeviceClassBindingAllowMobileStateRegionFallback),
    windowMs: normalizeNumber(env.tokenSessionDeviceClassBindingViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenSessionDeviceClassBindingViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenSessionDeviceClassBindingMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenSessionDeviceClassBindingResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenSessionDeviceClassBindingQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenSessionDeviceClassBindingQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenSessionDeviceClassBindingEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenSessionDeviceClassBindingAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenSessionDeviceClassBindingAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenSessionDeviceClassBindingRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function parseDeviceClassContext({ user = null, payload = {}, req = null }) {
  const userId = String(user?._id || user?.id || '').trim();
  const sid = normalizeLower(payload?.sid || '', 180);
  const sidHash = sid ? hashValue(sid) : '';
  const jti = normalizeLower(payload?.jti || '', 180);
  const jtiHash = jti ? hashValue(jti) : '';

  const headerDeviceClass = normalizeDeviceClassTag(
    firstHeaderValue(req, ['x-client-device-class', 'x-device-class', 'x-device-type'])
  );
  const userAgentDeviceClass = inferDeviceClassFromUserAgent(firstHeaderValue(req, ['user-agent']));
  const payloadDeviceClass = normalizeDeviceClassTag(
    payload?.deviceClass || payload?.deviceType || payload?.platform || payload?.clientDeviceClass || ''
  );

  const deviceClassTag = headerDeviceClass || payloadDeviceClass || userAgentDeviceClass;
  const deviceClassHash = deviceClassTag ? hashValue(deviceClassTag) : '';
  const headerMobileState = parseAcceptMobileState(
    firstHeaderValue(req, ['sec-ch-ua-mobile', 'x-device-mobile', 'x-mobile'])
  );
  const payloadMobileState = normalizeMobileStateTag(
    payload?.mobileState ?? payload?.isMobile ?? payload?.mobile ?? ''
  );
  const uaMobileState = normalizeMobileStateTag(userAgentDeviceClass);
  const mobileStateTag = headerMobileState || payloadMobileState || uaMobileState;

  return {
    userId,
    sid,
    sidHash,
    jtiHash,
    deviceClassTag,
    deviceClassHash,
    mobileStateTag
  };
}

function evaluateMobileStateMatch({ existingMobileState = '', currentMobileState = '', options }) {
  if (!options.compareMobileState) return true;
  if (!existingMobileState || !currentMobileState) return true;
  if (existingMobileState === currentMobileState) return true;

  if (options.allowMobileStateRegionFallback) {
    const a = normalizeMobileStateTag(existingMobileState);
    const b = normalizeMobileStateTag(currentMobileState);
    if (a && b && a === b) return true;
    if ((a === 'mobile' && b === 'unknown') || (a === 'unknown' && b === 'mobile')) return true;
  }

  return false;
}

function evaluateDeviceClassBindingDrift({ existing = null, context = {}, options, method, path }) {
  const reasons = [];
  let missingClaimCount = 0;
  const metadata = {};

  if (options.requireSidClaim && !context.sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireDeviceClassSignal && !context.deviceClassTag) {
    reasons.push('missing_device_class_signal');
    missingClaimCount += 1;
  }
  if (options.requireMobileStateSignal && !context.mobileStateTag) {
    reasons.push('missing_mobile_state_signal');
    missingClaimCount += 1;
  }

  if (existing) {
    const boundUserId = String(existing.userId || '').trim();
    if (boundUserId && context.userId && boundUserId !== context.userId) {
      reasons.push('sid_bound_to_different_user');
    }

    if (
      options.compareDeviceClass
      && context.deviceClassHash
      && existing.boundDeviceClassHash
      && String(existing.boundDeviceClassHash) !== context.deviceClassHash
    ) {
      reasons.push('sid_device_class_binding_drift');
    }

    const mobileStateMatch = evaluateMobileStateMatch({
      existingMobileState: normalizeLower(existing.boundMobileStateTag || '', 40),
      currentMobileState: normalizeLower(context.mobileStateTag || '', 40),
      options
    });
    if (!mobileStateMatch) {
      reasons.push('sid_mobile_state_binding_drift');
    }
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidPresent = Boolean(context.sid);
  metadata.sidHash = context.sidHash;
  metadata.userId = context.userId;
  metadata.deviceClassHash = context.deviceClassHash;
  metadata.mobileStateTag = context.mobileStateTag;
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
  if (reasons.includes('sid_device_class_binding_drift')) return 'sid_device_class_binding_drift';
  if (reasons.includes('sid_mobile_state_binding_drift')) return 'sid_mobile_state_binding_drift';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_device_class_signal')) return 'missing_device_class_signal';
  if (reasons.includes('missing_mobile_state_signal')) return 'missing_mobile_state_signal';
  if (reasons.length > 0) return reasons[0];
  return 'session_device_class_binding_verified';
}

async function recordSessionDeviceClassBindingIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_device_class_binding_violation',
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
          action: 'token_session_device_class_binding_shield_triggered',
          note: payload.note || 'Token Session device class binding anomaly detected'
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

async function inspectUserTokenSessionDeviceClassBinding({ user = null, payload = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackRequest({ options, method, path })) {
    return { ok: true, reason: 'path_or_method_not_tracked' };
  }

  const context = parseDeviceClassContext({ user, payload: payload || {}, req });
  if (!context.userId) {
    return { ok: true, reason: 'missing_user' };
  }

  if (options.requireSidClaim && !context.sid) {
    await recordSessionDeviceClassBindingIncident(req, {
      eventType: 'session_device_class_binding_missing_sid',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session device class binding rejected token without sid',
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
  const existing = await UserTokenSessionDeviceClassBindingState.findOne({ sidHash }).lean();
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

  const evaluation = evaluateDeviceClassBindingDrift({
    existing,
    context,
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
    await UserTokenSessionDeviceClassBindingState.updateOne(
      { sidHash },
      {
        $set: {
          userId: context.userId,
          boundDeviceClassHash: existing?.boundDeviceClassHash || context.deviceClassHash,
          boundMobileStateTag: existing?.boundMobileStateTag || context.mobileStateTag,
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastUserId: context.userId,
          lastDeviceClassHash: context.deviceClassHash,
          lastMobileStateTag: context.mobileStateTag,
          lastJtiHash: context.jtiHash,
          lastReason: evaluation.detected ? primaryReason : 'session_device_class_binding_verified',
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
      return { ok: true, reason: 'session_device_class_binding_verified' };
    }

    await recordSessionDeviceClassBindingIncident(req, {
      eventType: 'session_device_class_binding_violation',
      riskScore: 90,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session device class binding denied request',
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

  await UserTokenSessionDeviceClassBindingState.updateOne(
    { sidHash },
    {
      $set: {
        userId: existing?.userId || context.userId,
        boundDeviceClassHash: existing?.boundDeviceClassHash || context.deviceClassHash,
        boundMobileStateTag: existing?.boundMobileStateTag || context.mobileStateTag,
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingClaimCount: nextMissingClaimCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastUserId: context.userId,
        lastDeviceClassHash: context.deviceClassHash,
        lastMobileStateTag: context.mobileStateTag,
        lastJtiHash: context.jtiHash,
        lastReason: 'session_device_class_binding_quarantined',
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

  await revokeUsersIfNeeded({
    options,
    currentUserId: context.userId,
    boundUserId,
    reason: 'session_device_class_binding_quarantined',
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

  await recordSessionDeviceClassBindingIncident(req, {
    eventType: 'session_device_class_binding_quarantined',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    note: 'Repeated Session device class binding violations triggered quarantine',
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
    reason: 'session_device_class_binding_quarantined',
    violationCount: nextViolationCount,
    violationThreshold: options.violationThreshold,
    missingClaimCount: nextMissingClaimCount,
    missingClaimThreshold: options.missingClaimThreshold,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

function isTokenSessionDeviceClassBindingSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

async function getTokenSessionDeviceClassBindingShieldSnapshot({ includeReleased = false, status = '', userId = '', sidHash = '', limit = 100 } = {}) {
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

  const rows = await UserTokenSessionDeviceClassBindingState.find(query)
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
      boundDeviceClassHash: String(item.boundDeviceClassHash || ''),
      boundMobileStateTag: String(item.boundMobileStateTag || ''),
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

async function releaseTokenSessionDeviceClassBindingShieldStates({ id = '', sidHash = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedSidHash = String(sidHash || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenSessionDeviceClassBindingState.updateMany(
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

  const result = await UserTokenSessionDeviceClassBindingState.updateMany(
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

async function quarantineTokenSessionDeviceClassBinding({
  id = '',
  sidHash = '',
  userId = '',
  reason = 'admin_manual_session_device_class_binding_quarantine',
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

  const docs = await UserTokenSessionDeviceClassBindingState.find(query).select('userId sidHash').lean();
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, 1),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const result = await UserTokenSessionDeviceClassBindingState.updateMany(
    query,
    {
      $set: {
        status: 'quarantined',
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_session_device_class_binding_quarantine',
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
        reason: 'admin_manual_session_device_class_binding_quarantine',
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
  inspectUserTokenSessionDeviceClassBinding,
  isTokenSessionDeviceClassBindingSha256,
  getTokenSessionDeviceClassBindingShieldSnapshot,
  releaseTokenSessionDeviceClassBindingShieldStates,
  quarantineTokenSessionDeviceClassBinding
};
