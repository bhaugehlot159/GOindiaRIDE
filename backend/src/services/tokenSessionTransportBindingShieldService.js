const crypto = require('crypto');

const UserTokenSessionTransportBindingState = require('../models/UserTokenSessionTransportBindingState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const IMMEDIATE_REASONS = new Set([
  'sid_bound_to_different_user',
  'sid_asn_binding_drift',
  'sid_host_binding_drift'
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

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
}

function getIpPrefix(ip, octets = 3) {
  const normalized = normalizeIp(ip);
  if (!normalized) return '';

  if (normalized.includes('.')) {
    const parts = normalized.split('.').filter(Boolean);
    if (!parts.length) return '';
    const count = Math.max(1, Math.min(4, Number(octets || 3)));
    return parts.slice(0, count).join('.');
  }

  if (normalized.includes(':')) {
    const groups = normalized.split(':').filter(Boolean);
    if (!groups.length) return '';
    const count = Math.max(1, Math.min(8, Number(octets || 3)));
    return groups.slice(0, count).join(':');
  }

  return normalized;
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

function normalizeProto(value) {
  const proto = normalizeLower(value, 32).replace(/[^a-z0-9.+-]/g, '');
  if (!proto) return '';
  if (proto === 'http' || proto === 'https') return proto;
  return proto.slice(0, 16);
}

function normalizeHost(value) {
  const raw = normalizeLower(value, 220);
  if (!raw) return '';

  const withoutScheme = raw.replace(/^https?:\/\//, '');
  const first = withoutScheme.split('/')[0].split(',')[0].trim();
  if (!first) return '';

  if (first.startsWith('[')) {
    const closing = first.indexOf(']');
    if (closing > 0) return first.slice(0, closing + 1);
  }

  const colonIndex = first.lastIndexOf(':');
  if (colonIndex > 0 && first.indexOf(':') === colonIndex) {
    return first.slice(0, colonIndex);
  }
  return first;
}

function normalizeAsn(value) {
  let text = normalizeLower(value, 80);
  if (!text) return '';
  text = text.replace(/^as\s*/i, '').replace(/^asn\s*/i, '');
  text = text.replace(/[^a-z0-9._-]/g, '');
  return text.slice(0, 40);
}

function normalizeNetworkOrg(value) {
  const text = normalizeLower(value, 180).replace(/\s+/g, ' ');
  return text.slice(0, 120);
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
  const methods = splitCsv(env.tokenSessionTransportBindingMethods).map((item) => item.toLowerCase());
  return {
    enabled: Boolean(env.tokenSessionTransportBindingShieldEnabled),
    failOpen: Boolean(env.tokenSessionTransportBindingShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenSessionTransportBindingProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenSessionTransportBindingEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenSessionTransportBindingRequireSidClaim),
    requireHostSignal: Boolean(env.tokenSessionTransportBindingRequireHostSignal),
    requireProtoSignal: Boolean(env.tokenSessionTransportBindingRequireProtoSignal),
    requireAsnSignal: Boolean(env.tokenSessionTransportBindingRequireAsnSignal),
    requireNetworkOrgSignal: Boolean(env.tokenSessionTransportBindingRequireNetworkOrgSignal),
    compareAsn: Boolean(env.tokenSessionTransportBindingCompareAsn),
    compareNetworkOrg: Boolean(env.tokenSessionTransportBindingCompareNetworkOrg),
    compareHost: Boolean(env.tokenSessionTransportBindingCompareHost),
    compareProto: Boolean(env.tokenSessionTransportBindingCompareProto),
    compareIpPrefix: Boolean(env.tokenSessionTransportBindingCompareIpPrefix),
    ipPrefixOctets: normalizeNumber(env.tokenSessionTransportBindingIpPrefixOctets, 3, 1, 8),
    windowMs: normalizeNumber(env.tokenSessionTransportBindingViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenSessionTransportBindingViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenSessionTransportBindingMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenSessionTransportBindingResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenSessionTransportBindingQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenSessionTransportBindingQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenSessionTransportBindingEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenSessionTransportBindingAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenSessionTransportBindingAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenSessionTransportBindingRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function parseNetworkContext({ user = null, payload = {}, req = null, options }) {
  const userId = String(user?._id || user?.id || '').trim();
  const sid = normalizeLower(payload?.sid || '', 180);
  const sidHash = sid ? hashValue(sid) : '';
  const jti = normalizeLower(payload?.jti || '', 180);
  const jtiHash = jti ? hashValue(jti) : '';

  const ip = normalizeIp(getClientIp(req || {}));
  const ipPrefix = getIpPrefix(ip, options.ipPrefixOctets);
  const ipPrefixHash = ipPrefix ? hashValue(ipPrefix) : '';

  const asn = normalizeAsn(
    firstHeaderValue(req, ['x-asn', 'x-forwarded-asn', 'cf-asn', 'x-client-asn'])
  );
  const asnHash = asn ? hashValue(asn) : '';

  const networkOrg = normalizeNetworkOrg(
    firstHeaderValue(req, ['x-asn-org', 'x-forwarded-asn-org', 'x-network-org', 'x-isp', 'x-org', 'cf-isp'])
  );
  const networkOrgHash = networkOrg ? hashValue(networkOrg) : '';

  const proto = normalizeProto(
    firstHeaderValue(req, ['x-forwarded-proto', 'x-forwarded-protocol']) || req?.protocol || ''
  );

  const host = normalizeHost(
    firstHeaderValue(req, ['x-forwarded-host', 'host', ':authority']) || req?.hostname || ''
  );
  const hostHash = host ? hashValue(host) : '';

  return {
    userId,
    sid,
    sidHash,
    jtiHash,
    asn,
    asnHash,
    networkOrg,
    networkOrgHash,
    proto,
    host,
    hostHash,
    ipPrefixHash
  };
}

function evaluateTransportBindingDrift({ existing = null, context = {}, options, method, path }) {
  const reasons = [];
  let missingClaimCount = 0;
  const metadata = {};

  if (options.requireSidClaim && !context.sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireHostSignal && !context.host) {
    reasons.push('missing_host_signal');
    missingClaimCount += 1;
  }
  if (options.requireProtoSignal && !context.proto) {
    reasons.push('missing_proto_signal');
    missingClaimCount += 1;
  }
  if (options.requireAsnSignal && !context.asn) {
    reasons.push('missing_asn_signal');
    missingClaimCount += 1;
  }
  if (options.requireNetworkOrgSignal && !context.networkOrg) {
    reasons.push('missing_network_org_signal');
    missingClaimCount += 1;
  }

  if (existing) {
    const boundUserId = String(existing.userId || '').trim();
    if (boundUserId && context.userId && boundUserId !== context.userId) {
      reasons.push('sid_bound_to_different_user');
    }

    if (
      options.compareAsn
      && context.asnHash
      && existing.boundAsnHash
      && String(existing.boundAsnHash) !== context.asnHash
    ) {
      reasons.push('sid_asn_binding_drift');
    }

    if (
      options.compareNetworkOrg
      && context.networkOrgHash
      && existing.boundNetworkOrgHash
      && String(existing.boundNetworkOrgHash) !== context.networkOrgHash
    ) {
      reasons.push('sid_network_org_binding_drift');
    }

    if (
      options.compareProto
      && context.proto
      && existing.boundProto
      && normalizeProto(existing.boundProto) !== context.proto
    ) {
      reasons.push('sid_proto_binding_drift');
    }

    if (
      options.compareHost
      && context.hostHash
      && existing.boundHostHash
      && String(existing.boundHostHash) !== context.hostHash
    ) {
      reasons.push('sid_host_binding_drift');
    }

    if (
      options.compareIpPrefix
      && context.ipPrefixHash
      && existing.boundIpPrefixHash
      && String(existing.boundIpPrefixHash) !== context.ipPrefixHash
    ) {
      reasons.push('sid_ip_prefix_binding_drift');
    }
  }

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidPresent = Boolean(context.sid);
  metadata.sidHash = context.sidHash;
  metadata.userId = context.userId;
  metadata.asnHash = context.asnHash;
  metadata.networkOrgHash = context.networkOrgHash;
  metadata.proto = context.proto;
  metadata.hostHash = context.hostHash;
  metadata.ipPrefixHash = context.ipPrefixHash;
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
  if (reasons.includes('sid_asn_binding_drift')) return 'sid_asn_binding_drift';
  if (reasons.includes('sid_host_binding_drift')) return 'sid_host_binding_drift';
  if (reasons.includes('sid_proto_binding_drift')) return 'sid_proto_binding_drift';
  if (reasons.includes('sid_network_org_binding_drift')) return 'sid_network_org_binding_drift';
  if (reasons.includes('sid_ip_prefix_binding_drift')) return 'sid_ip_prefix_binding_drift';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_host_signal')) return 'missing_host_signal';
  if (reasons.includes('missing_proto_signal')) return 'missing_proto_signal';
  if (reasons.includes('missing_asn_signal')) return 'missing_asn_signal';
  if (reasons.includes('missing_network_org_signal')) return 'missing_network_org_signal';
  if (reasons.length > 0) return reasons[0];
  return 'session_transport_binding_verified';
}

async function recordSessionTransportBindingIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_transport_binding_violation',
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
          action: 'token_session_transport_binding_shield_triggered',
          note: payload.note || 'Token session transport binding anomaly detected'
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

async function inspectUserTokenSessionTransportBinding({ user = null, payload = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const method = String(req?.method || '').trim().toUpperCase() || 'GET';
  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackRequest({ options, method, path })) {
    return { ok: true, reason: 'path_or_method_not_tracked' };
  }

  const context = parseNetworkContext({ user, payload: payload || {}, req, options });
  if (!context.userId) {
    return { ok: true, reason: 'missing_user' };
  }

  if (options.requireSidClaim && !context.sid) {
    await recordSessionTransportBindingIncident(req, {
      eventType: 'session_transport_binding_missing_sid',
      riskScore: 88,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session transport binding rejected token without sid',
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
  const existing = await UserTokenSessionTransportBindingState.findOne({ sidHash }).lean();
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

  const evaluation = evaluateTransportBindingDrift({
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
    await UserTokenSessionTransportBindingState.updateOne(
      { sidHash },
      {
        $set: {
          userId: context.userId,
          boundAsnHash: existing?.boundAsnHash || context.asnHash,
          boundNetworkOrgHash: existing?.boundNetworkOrgHash || context.networkOrgHash,
          boundProto: existing?.boundProto || context.proto,
          boundHostHash: existing?.boundHostHash || context.hostHash,
          boundIpPrefixHash: existing?.boundIpPrefixHash || context.ipPrefixHash,
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastUserId: context.userId,
          lastAsnHash: context.asnHash,
          lastNetworkOrgHash: context.networkOrgHash,
          lastProto: context.proto,
          lastHostHash: context.hostHash,
          lastIpPrefixHash: context.ipPrefixHash,
          lastJtiHash: context.jtiHash,
          lastReason: evaluation.detected ? primaryReason : 'session_transport_binding_verified',
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
      return { ok: true, reason: 'session_transport_binding_verified' };
    }

    await recordSessionTransportBindingIncident(req, {
      eventType: 'session_transport_binding_violation',
      riskScore: 90,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Session transport binding denied request',
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

  await UserTokenSessionTransportBindingState.updateOne(
    { sidHash },
    {
      $set: {
        userId: existing?.userId || context.userId,
        boundAsnHash: existing?.boundAsnHash || context.asnHash,
        boundNetworkOrgHash: existing?.boundNetworkOrgHash || context.networkOrgHash,
        boundProto: existing?.boundProto || context.proto,
        boundHostHash: existing?.boundHostHash || context.hostHash,
        boundIpPrefixHash: existing?.boundIpPrefixHash || context.ipPrefixHash,
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
        lastAsnHash: context.asnHash,
        lastNetworkOrgHash: context.networkOrgHash,
        lastProto: context.proto,
        lastHostHash: context.hostHash,
        lastIpPrefixHash: context.ipPrefixHash,
        lastJtiHash: context.jtiHash,
        lastReason: 'session_transport_binding_quarantined',
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
    reason: 'session_transport_binding_quarantined',
    req,
    metadata: {
      sidHash,
      reasons: evaluation.reasons
    }
  });

  await banUsersIfNeeded({
    options,
    currentUserId: context.userId,
    boundUserId,
    quarantineUntil
  });

  await recordSessionTransportBindingIncident(req, {
    eventType: 'session_transport_binding_quarantined',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_binding',
    note: 'Repeated session transport binding violations triggered quarantine',
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
    reason: 'session_transport_binding_quarantined',
    violationCount: nextViolationCount,
    violationThreshold: options.violationThreshold,
    missingClaimCount: nextMissingClaimCount,
    missingClaimThreshold: options.missingClaimThreshold,
    quarantineUntil: quarantineUntil.toISOString()
  };
}

function isTokenSessionTransportBindingSha256(value) {
  return /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
}

async function getTokenSessionTransportBindingShieldSnapshot({ includeReleased = false, status = '', userId = '', sidHash = '', limit = 100 } = {}) {
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

  const rows = await UserTokenSessionTransportBindingState.find(query)
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
      boundAsnHash: String(item.boundAsnHash || ''),
      boundNetworkOrgHash: String(item.boundNetworkOrgHash || ''),
      boundProto: String(item.boundProto || ''),
      boundHostHash: String(item.boundHostHash || ''),
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

async function releaseTokenSessionTransportBindingShieldStates({ id = '', sidHash = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedSidHash = String(sidHash || '').trim().toLowerCase();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenSessionTransportBindingState.updateMany(
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

  const result = await UserTokenSessionTransportBindingState.updateMany(
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

async function quarantineTokenSessionTransportBinding({
  id = '',
  sidHash = '',
  userId = '',
  reason = 'admin_manual_session_transport_binding_quarantine',
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

  const docs = await UserTokenSessionTransportBindingState.find(query).select('userId sidHash').lean();
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, 1),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const result = await UserTokenSessionTransportBindingState.updateMany(
    query,
    {
      $set: {
        status: 'quarantined',
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_session_transport_binding_quarantine',
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
        reason: 'admin_manual_session_transport_binding_quarantine',
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
  inspectUserTokenSessionTransportBinding,
  isTokenSessionTransportBindingSha256,
  getTokenSessionTransportBindingShieldSnapshot,
  releaseTokenSessionTransportBindingShieldStates,
  quarantineTokenSessionTransportBinding
};


