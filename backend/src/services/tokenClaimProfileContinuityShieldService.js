const crypto = require('crypto');

const UserTokenClaimProfileContinuityState = require('../models/UserTokenClaimProfileContinuityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

const DEFAULT_METHODS = ['post', 'put', 'patch', 'delete'];
const DEFAULT_SCOPE_CLAIM_KEYS = ['scope', 'scp', 'permissions'];
const DEFAULT_TOKEN_TYPE_CLAIM_KEYS = ['type', 'tokenUse', 'token_use', 'kind'];

const IMMEDIATE_REASONS = new Set([
  'sid_issuer_drift_detected',
  'sid_audience_drift_detected',
  'sid_role_drift_detected',
  'sid_account_type_drift_detected'
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

function normalizeSessionId(value) {
  return normalizeLower(value, 180);
}

function normalizeJti(value) {
  return normalizeLower(value, 180);
}

function toEpochSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
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

function normalizeAudienceClaim(aud) {
  if (Array.isArray(aud)) {
    return aud
      .map((item) => normalizeLower(item, 160))
      .filter(Boolean)
      .sort()
      .join('|');
  }
  return normalizeLower(aud, 160);
}

function parseScopeValues(payload = {}, scopeClaimKeys = DEFAULT_SCOPE_CLAIM_KEYS, maxScopeValues = 50) {
  const set = new Set();

  const addScopeValue = (value) => {
    String(value || '')
      .split(/[\s,]+/)
      .map((item) => normalizeLower(item, 120))
      .filter(Boolean)
      .forEach((item) => {
        if (set.size < maxScopeValues) {
          set.add(item);
        }
      });
  };

  const maybeAddFromObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.entries(obj).forEach(([key, enabled]) => {
      if (!enabled) return;
      addScopeValue(key);
    });
  };

  scopeClaimKeys.forEach((claimKey) => {
    const value = payload?.[claimKey];
    if (typeof value === 'string') {
      addScopeValue(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => addScopeValue(entry));
      return;
    }
    if (value && typeof value === 'object') {
      maybeAddFromObject(value);
    }
  });

  return Array.from(set).sort();
}

function deriveTokenType(payload = {}, tokenTypeClaimKeys = DEFAULT_TOKEN_TYPE_CLAIM_KEYS) {
  for (const key of tokenTypeClaimKeys) {
    const value = normalizeLower(payload?.[key], 120);
    if (value) return value;
  }
  return '';
}

function fingerprintScopes(scopes = []) {
  if (!Array.isArray(scopes) || !scopes.length) return '';
  return hashValue(scopes.join('|'));
}

function areScopesSuperset(candidate = [], baseline = []) {
  if (!baseline.length) return true;
  if (!candidate.length) return false;
  const set = new Set(candidate);
  return baseline.every((item) => set.has(item));
}

function buildClaimProfileHash({
  issuer = '',
  audience = '',
  role = '',
  accountType = '',
  tokenType = '',
  scopeFingerprint = ''
}) {
  return hashValue([
    normalizeLower(issuer, 180),
    normalizeLower(audience, 180),
    normalizeLower(role, 120),
    normalizeLower(accountType, 120),
    normalizeLower(tokenType, 120),
    normalizeLower(scopeFingerprint, 200)
  ].join('|'));
}

function resolveOptions() {
  const methods = splitCsv(env.tokenClaimProfileContinuityMethods).map((item) => item.toLowerCase());
  const scopeClaimKeys = splitCsv(env.tokenClaimProfileContinuityScopeClaimKeys);
  const tokenTypeClaimKeys = splitCsv(env.tokenClaimProfileContinuityTokenTypeClaimKeys);

  return {
    enabled: Boolean(env.tokenClaimProfileContinuityShieldEnabled),
    failOpen: Boolean(env.tokenClaimProfileContinuityShieldFailOpen),
    protectedPrefixes: splitCsv(env.tokenClaimProfileContinuityProtectedPrefixes).map((item) => item.toLowerCase()),
    methods: methods.length ? methods : DEFAULT_METHODS,
    enforceOnAllMethods: Boolean(env.tokenClaimProfileContinuityEnforceOnAllMethods),
    requireSidClaim: Boolean(env.tokenClaimProfileContinuityRequireSidClaim),
    requireIssuerClaim: Boolean(env.tokenClaimProfileContinuityRequireIssuerClaim),
    requireAudienceClaim: Boolean(env.tokenClaimProfileContinuityRequireAudienceClaim),
    requireRoleClaim: Boolean(env.tokenClaimProfileContinuityRequireRoleClaim),
    requireAccountTypeClaim: Boolean(env.tokenClaimProfileContinuityRequireAccountTypeClaim),
    compareTokenType: Boolean(env.tokenClaimProfileContinuityCompareTokenType),
    compareScopeFingerprint: Boolean(env.tokenClaimProfileContinuityCompareScopeFingerprint),
    allowScopeSuperset: Boolean(env.tokenClaimProfileContinuityAllowScopeSuperset),
    requireSidProfilePresence: Boolean(env.tokenClaimProfileContinuityRequireSidProfilePresence),
    scopeClaimKeys: scopeClaimKeys.length ? scopeClaimKeys : DEFAULT_SCOPE_CLAIM_KEYS,
    tokenTypeClaimKeys: tokenTypeClaimKeys.length ? tokenTypeClaimKeys : DEFAULT_TOKEN_TYPE_CLAIM_KEYS,
    maxScopeValues: normalizeNumber(env.tokenClaimProfileContinuityMaxScopeValues, 50, 5, 300),
    maxSidProfiles: normalizeNumber(env.tokenClaimProfileContinuityMaxSidProfiles, 80, 10, 1000),
    windowMs: normalizeNumber(env.tokenClaimProfileContinuityViolationWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    violationThreshold: normalizeNumber(env.tokenClaimProfileContinuityViolationThreshold, 3, 1, 50),
    missingClaimThreshold: normalizeNumber(env.tokenClaimProfileContinuityMissingClaimThreshold, 4, 1, 80),
    resetWindowOnPass: Boolean(env.tokenClaimProfileContinuityResetWindowOnPass),
    quarantineMs: normalizeNumber(env.tokenClaimProfileContinuityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.tokenClaimProfileContinuityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.tokenClaimProfileContinuityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.tokenClaimProfileContinuityAutoRevokeSessions),
    autoBanUser: Boolean(env.tokenClaimProfileContinuityAutoBanUser),
    recordTtlMs: normalizeNumber(env.tokenClaimProfileContinuityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
function normalizeSidProfileEntry(entry = {}) {
  return {
    sidHash: normalizeText(entry.sidHash || '', 160),
    issuer: normalizeLower(entry.issuer || '', 180),
    audience: normalizeLower(entry.audience || '', 180),
    role: normalizeLower(entry.role || '', 120),
    accountType: normalizeLower(entry.accountType || '', 120),
    tokenType: normalizeLower(entry.tokenType || '', 120),
    scopeFingerprint: normalizeLower(entry.scopeFingerprint || '', 200),
    scopeValueCount: Math.max(0, Number(entry.scopeValueCount || 0)),
    lastIatSec: Math.max(0, toEpochSeconds(entry.lastIatSec)),
    lastJtiHash: normalizeText(entry.lastJtiHash || '', 180),
    lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt) : null,
    seenCount: Math.max(0, Number(entry.seenCount || 0)),
    scopeValues: Array.isArray(entry.scopeValues)
      ? entry.scopeValues.map((item) => normalizeLower(item, 120)).filter(Boolean)
      : []
  };
}

function buildSidProfiles({
  existingProfiles = [],
  sidHash = '',
  issuer = '',
  audience = '',
  role = '',
  accountType = '',
  tokenType = '',
  scopeFingerprint = '',
  scopeValues = [],
  iatSec = 0,
  jtiHash = '',
  nowDate = new Date(),
  maxSidProfiles = 80
}) {
  const normalized = Array.isArray(existingProfiles)
    ? existingProfiles
      .map((entry) => normalizeSidProfileEntry(entry))
      .filter((entry) => entry.sidHash)
    : [];

  if (sidHash) {
    const index = normalized.findIndex((entry) => entry.sidHash === sidHash);
    if (index === -1) {
      normalized.push({
        sidHash,
        issuer,
        audience,
        role,
        accountType,
        tokenType,
        scopeFingerprint,
        scopeValueCount: scopeValues.length,
        lastIatSec: iatSec > 0 ? iatSec : 0,
        lastJtiHash: jtiHash || '',
        lastSeenAt: nowDate,
        seenCount: 1,
        scopeValues: scopeValues.slice(0, 300)
      });
    } else {
      const current = normalized[index];
      normalized[index] = {
        sidHash: current.sidHash,
        issuer: issuer || current.issuer || '',
        audience: audience || current.audience || '',
        role: role || current.role || '',
        accountType: accountType || current.accountType || '',
        tokenType: tokenType || current.tokenType || '',
        scopeFingerprint: scopeFingerprint || current.scopeFingerprint || '',
        scopeValueCount: scopeValues.length || Number(current.scopeValueCount || 0),
        lastIatSec: Math.max(current.lastIatSec, iatSec > 0 ? iatSec : 0),
        lastJtiHash: jtiHash || current.lastJtiHash || '',
        lastSeenAt: nowDate,
        seenCount: Math.max(0, Number(current.seenCount || 0)) + 1,
        scopeValues: (scopeValues.length ? scopeValues : current.scopeValues).slice(0, 300)
      };
    }
  }

  normalized.sort((a, b) => {
    const aTs = a.lastSeenAt ? a.lastSeenAt.getTime() : 0;
    const bTs = b.lastSeenAt ? b.lastSeenAt.getTime() : 0;
    if (aTs !== bTs) return bTs - aTs;
    return Number(b.seenCount || 0) - Number(a.seenCount || 0);
  });

  return normalized.slice(0, maxSidProfiles).map((entry) => ({
    sidHash: entry.sidHash,
    issuer: entry.issuer,
    audience: entry.audience,
    role: entry.role,
    accountType: entry.accountType,
    tokenType: entry.tokenType,
    scopeFingerprint: entry.scopeFingerprint,
    scopeValueCount: Number(entry.scopeValueCount || 0),
    lastIatSec: Number(entry.lastIatSec || 0),
    lastJtiHash: String(entry.lastJtiHash || ''),
    lastSeenAt: entry.lastSeenAt || nowDate,
    seenCount: Number(entry.seenCount || 0),
    scopeValues: Array.isArray(entry.scopeValues) ? entry.scopeValues.slice(0, 300) : []
  }));
}

function pickSidProfile(profiles = [], sidHash = '') {
  if (!sidHash) return null;
  return profiles.find((entry) => entry.sidHash === sidHash) || null;
}

function evaluateClaimProfileContinuity({
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
  const sidHash = sid ? hashValue(sid) : '';
  const issuer = normalizeLower(payload?.iss || '', 180);
  const audience = normalizeAudienceClaim(payload?.aud);
  const role = normalizeLower(payload?.role || '', 120);
  const accountType = normalizeLower(payload?.accountType || '', 120);
  const tokenType = deriveTokenType(payload, options.tokenTypeClaimKeys);
  const jti = normalizeJti(payload?.jti);
  const jtiHash = jti ? hashValue(jti) : '';
  const iatSec = toEpochSeconds(payload?.iat);
  const scopeValues = parseScopeValues(payload, options.scopeClaimKeys, options.maxScopeValues);
  const scopeFingerprint = fingerprintScopes(scopeValues);

  const existingProfiles = Array.isArray(existing?.sidProfiles) ? existing.sidProfiles : [];
  const normalizedProfiles = existingProfiles.map((entry) => normalizeSidProfileEntry(entry)).filter((entry) => entry.sidHash);
  const sidProfile = pickSidProfile(normalizedProfiles, sidHash);

  if (options.requireSidClaim && !sid) {
    reasons.push('missing_sid_claim');
    missingClaimCount += 1;
  }
  if (options.requireIssuerClaim && !issuer) {
    reasons.push('missing_issuer_claim');
    missingClaimCount += 1;
  }
  if (options.requireAudienceClaim && !audience) {
    reasons.push('missing_audience_claim');
    missingClaimCount += 1;
  }
  if (options.requireRoleClaim && !role) {
    reasons.push('missing_role_claim');
    missingClaimCount += 1;
  }
  if (options.requireAccountTypeClaim && !accountType) {
    reasons.push('missing_account_type_claim');
    missingClaimCount += 1;
  }

  if (sid && options.requireSidProfilePresence && !sidProfile) {
    reasons.push('sid_not_seen_in_claim_profile_ledger');
  }

  if (sidProfile) {
    if (issuer && sidProfile.issuer && sidProfile.issuer !== issuer) {
      reasons.push('sid_issuer_drift_detected');
    }
    if (audience && sidProfile.audience && sidProfile.audience !== audience) {
      reasons.push('sid_audience_drift_detected');
    }
    if (role && sidProfile.role && sidProfile.role !== role) {
      reasons.push('sid_role_drift_detected');
    }
    if (accountType && sidProfile.accountType && sidProfile.accountType !== accountType) {
      reasons.push('sid_account_type_drift_detected');
    }

    if (options.compareTokenType && tokenType && sidProfile.tokenType && sidProfile.tokenType !== tokenType) {
      reasons.push('sid_token_type_drift_detected');
    }

    if (options.compareScopeFingerprint && scopeFingerprint && sidProfile.scopeFingerprint && sidProfile.scopeFingerprint !== scopeFingerprint) {
      if (options.allowScopeSuperset) {
        const baselineScopes = Array.isArray(sidProfile.scopeValues) ? sidProfile.scopeValues : [];
        const isSuperset = areScopesSuperset(scopeValues, baselineScopes);
        if (!isSuperset) {
          reasons.push('sid_scope_profile_drift_detected');
        }
      } else {
        reasons.push('sid_scope_profile_drift_detected');
      }
    }
  }

  const claimProfileHash = buildClaimProfileHash({
    issuer,
    audience,
    role,
    accountType,
    tokenType,
    scopeFingerprint
  });

  metadata.method = String(method || '').toUpperCase();
  metadata.path = normalizePath(path);
  metadata.sidPresent = Boolean(sid);
  metadata.sidHash = sidHash;
  metadata.claimProfileHash = claimProfileHash;
  metadata.issuer = issuer;
  metadata.audience = audience;
  metadata.role = role;
  metadata.accountType = accountType;
  metadata.tokenType = tokenType;
  metadata.scopeFingerprint = scopeFingerprint;
  metadata.scopeValueCount = scopeValues.length;
  metadata.scopeValuesSample = scopeValues.slice(0, 20);
  metadata.sidProfilesSize = normalizedProfiles.length;
  metadata.sidProfileSeenCount = Number(sidProfile?.seenCount || 0);
  metadata.sidProfileLastIatSec = Number(sidProfile?.lastIatSec || 0);
  metadata.tokenIatSec = Number(iatSec || 0);
  metadata.tokenSub = normalizeText(payload?.sub || '', 140);
  metadata.tokenJti = normalizeText(payload?.jti || '', 140);

  const dedupedReasons = Array.from(new Set(reasons));
  const immediate = dedupedReasons.some((reason) => IMMEDIATE_REASONS.has(reason));
  const nextSidProfiles = buildSidProfiles({
    existingProfiles: normalizedProfiles,
    sidHash,
    issuer,
    audience,
    role,
    accountType,
    tokenType,
    scopeFingerprint,
    scopeValues,
    iatSec,
    jtiHash,
    nowDate,
    maxSidProfiles: options.maxSidProfiles
  });

  return {
    detected: dedupedReasons.length > 0,
    reasons: dedupedReasons,
    immediate,
    missingClaimCount,
    sidHash,
    claimProfileHash,
    nextSidProfiles,
    metadata
  };
}

function pickPrimaryReason(reasons = []) {
  if (reasons.includes('sid_issuer_drift_detected')) return 'sid_issuer_drift_detected';
  if (reasons.includes('sid_audience_drift_detected')) return 'sid_audience_drift_detected';
  if (reasons.includes('sid_role_drift_detected')) return 'sid_role_drift_detected';
  if (reasons.includes('sid_account_type_drift_detected')) return 'sid_account_type_drift_detected';
  if (reasons.includes('sid_token_type_drift_detected')) return 'sid_token_type_drift_detected';
  if (reasons.includes('sid_scope_profile_drift_detected')) return 'sid_scope_profile_drift_detected';
  if (reasons.includes('sid_not_seen_in_claim_profile_ledger')) return 'sid_not_seen_in_claim_profile_ledger';
  if (reasons.includes('missing_sid_claim')) return 'missing_sid_claim';
  if (reasons.includes('missing_issuer_claim')) return 'missing_issuer_claim';
  if (reasons.includes('missing_audience_claim')) return 'missing_audience_claim';
  if (reasons.includes('missing_role_claim')) return 'missing_role_claim';
  if (reasons.includes('missing_account_type_claim')) return 'missing_account_type_claim';
  if (reasons.length > 0) return reasons[0];
  return 'token_claim_profile_continuity_verified';
}
async function recordTokenClaimProfileIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'token_claim_profile_continuity_violation',
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
          action: 'token_claim_profile_continuity_shield_triggered',
          note: payload.note || 'Token claim profile continuity anomaly detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserTokenClaimProfileContinuity({ user = null, payload = null, req = null } = {}) {
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
  const existing = await UserTokenClaimProfileContinuityState.findOne({ userId }).lean();
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

  const evaluation = evaluateClaimProfileContinuity({
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
    await UserTokenClaimProfileContinuityState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: nextWindowStart,
          windowViolationCount: nextViolationCount,
          windowMissingClaimCount: nextMissingClaimCount,
          quarantineUntil: null,
          sidProfiles: evaluation.nextSidProfiles,
          lastSeenAt: nowDate,
          lastPath: path,
          lastMethod: method,
          lastSidHash: String(evaluation.sidHash || ''),
          lastClaimProfileHash: String(evaluation.claimProfileHash || ''),
          lastReason: evaluation.detected ? primaryReason : 'token_claim_profile_continuity_verified',
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
      return { ok: true, reason: 'token_claim_profile_continuity_verified' };
    }

    await recordTokenClaimProfileIncident(req, {
      eventType: 'token_claim_profile_continuity_violation',
      riskScore: 90,
      recommendedAction: 'deny_request',
      action: 'deny_request',
      note: 'Token claim profile continuity denied request',
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

  await UserTokenClaimProfileContinuityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowStart,
        windowViolationCount: nextViolationCount,
        windowMissingClaimCount: nextMissingClaimCount,
        quarantineUntil,
        sidProfiles: evaluation.nextSidProfiles,
        lastSeenAt: nowDate,
        lastPath: path,
        lastMethod: method,
        lastSidHash: String(evaluation.sidHash || ''),
        lastClaimProfileHash: String(evaluation.claimProfileHash || ''),
        lastReason: 'token_claim_profile_continuity_quarantined',
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
      reason: 'token_claim_profile_continuity_quarantined',
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
          riskScore: 96,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordTokenClaimProfileIncident(req, {
    eventType: 'token_claim_profile_continuity_quarantined',
    riskScore: 96,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated token claim profile continuity violations triggered quarantine',
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
    reason: 'token_claim_profile_continuity_quarantined',
    violationCount: nextViolationCount,
    violationThreshold: options.violationThreshold,
    missingClaimCount: nextMissingClaimCount,
    missingClaimThreshold: options.missingClaimThreshold,
    quarantineUntil: quarantineUntil.toISOString()
  };
}
async function getTokenClaimProfileContinuityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserTokenClaimProfileContinuityState.find(query)
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
      sidProfilesSize: Array.isArray(item.sidProfiles) ? item.sidProfiles.length : 0,
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastMethod: String(item.lastMethod || ''),
      lastSidHash: String(item.lastSidHash || ''),
      lastClaimProfileHash: String(item.lastClaimProfileHash || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseTokenClaimProfileContinuityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserTokenClaimProfileContinuityState.updateMany(
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

  const result = await UserTokenClaimProfileContinuityState.updateMany(
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

async function quarantineTokenClaimProfileContinuityUser({
  userId = '',
  reason = 'admin_manual_token_claim_profile_continuity_quarantine',
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
  const existing = await UserTokenClaimProfileContinuityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserTokenClaimProfileContinuityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: normalizeText(reason, 220) || 'admin_manual_token_claim_profile_continuity_quarantine',
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
        sidProfiles: [],
        lastPath: '',
        lastMethod: '',
        lastSidHash: '',
        lastClaimProfileHash: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_token_claim_profile_continuity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserTokenClaimProfileContinuity,
  getTokenClaimProfileContinuityShieldSnapshot,
  releaseTokenClaimProfileContinuityShieldStates,
  quarantineTokenClaimProfileContinuityUser
};
