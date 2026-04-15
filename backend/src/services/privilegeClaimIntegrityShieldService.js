const UserPrivilegeIntegrityState = require('../models/UserPrivilegeIntegrityState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeText(value, max = 120) {
  return String(value || '').trim().toLowerCase().slice(0, max);
}

function normalizeRole(value) {
  const normalized = normalizeText(value, 40);
  if (!normalized) return '';
  if (normalized === 'admin' || normalized === 'driver' || normalized === 'customer' || normalized === 'user') {
    return normalized === 'user' ? 'customer' : normalized;
  }
  return normalized;
}

function normalizeAccountType(value) {
  const normalized = normalizeText(value, 60);
  if (!normalized) return '';
  if (normalized === 'admin' || normalized === 'driver' || normalized === 'customer' || normalized === 'user') {
    return normalized === 'user' ? 'customer' : normalized;
  }
  return normalized;
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 50));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function resolveOptions() {
  return {
    enabled: Boolean(env.privilegeIntegrityShieldEnabled),
    failOpen: Boolean(env.privilegeIntegrityShieldFailOpen),
    windowMs: normalizeNumber(env.privilegeIntegrityWindowMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    anomalyThreshold: normalizeNumber(env.privilegeIntegrityAnomalyThreshold, 2, 1, 20),
    strictRoleMatch: Boolean(env.privilegeIntegrityStrictRoleMatch),
    strictAccountTypeMatch: Boolean(env.privilegeIntegrityStrictAccountTypeMatch),
    allowMissingClaims: Boolean(env.privilegeIntegrityAllowMissingClaims),
    adminClaimHardFail: Boolean(env.privilegeIntegrityAdminClaimHardFail),
    quarantineMs: normalizeNumber(env.privilegeIntegrityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.privilegeIntegrityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.privilegeIntegrityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.privilegeIntegrityAutoRevokeSessions),
    autoBanUser: Boolean(env.privilegeIntegrityAutoBanUser),
    recordTtlMs: normalizeNumber(env.privilegeIntegrityRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

async function recordPrivilegeIntegrityIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'privilege_claim_integrity_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 97,
      severity: severityFromScore(payload.riskScore || 97),
      recommendedAction: payload.recommendedAction || 'quarantine_user',
      autoResponse: {
        action: payload.action || 'quarantine_user',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'privilege_claim_integrity_shield_triggered',
          note: payload.note || 'JWT claim mismatch against DB privilege profile detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function deriveDbAccountType(user = {}) {
  const raw = normalizeAccountType(user.accountType);
  if (raw) return raw;
  const role = normalizeRole(user.role);
  if (role === 'admin') return 'admin';
  if (role === 'driver') return 'driver';
  return 'customer';
}

function determineMismatchState({
  options,
  tokenRole,
  tokenAccountType,
  dbRole,
  dbAccountType
}) {
  const missingRoleClaim = !tokenRole;
  const missingAccountTypeClaim = !tokenAccountType;
  const roleMismatch = options.strictRoleMatch && tokenRole && dbRole && tokenRole !== dbRole;
  const accountTypeMismatch = options.strictAccountTypeMatch && tokenAccountType && dbAccountType && tokenAccountType !== dbAccountType;
  const missingClaimViolation = !options.allowMissingClaims
    && ((options.strictRoleMatch && missingRoleClaim) || (options.strictAccountTypeMatch && missingAccountTypeClaim));
  const adminClaimElevation = options.adminClaimHardFail && tokenRole === 'admin' && dbRole !== 'admin';

  return {
    missingRoleClaim,
    missingAccountTypeClaim,
    roleMismatch,
    accountTypeMismatch,
    missingClaimViolation,
    adminClaimElevation,
    mismatchDetected: roleMismatch || accountTypeMismatch || missingClaimViolation || adminClaimElevation
  };
}

async function inspectUserPrivilegeClaimIntegrity({ user = null, payload = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const tokenRole = normalizeRole(payload?.role);
  const tokenAccountType = normalizeAccountType(payload?.accountType);
  const dbRole = normalizeRole(user?.role);
  const dbAccountType = deriveDbAccountType(user || {});

  const mismatchState = determineMismatchState({
    options,
    tokenRole,
    tokenAccountType,
    dbRole,
    dbAccountType
  });

  const existing = await UserPrivilegeIntegrityState.findOne({ userId }).lean();
  const now = nowTs();
  const nowDate = new Date(now);

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

  const windowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;

  const nextWindowMismatchCount = mismatchState.mismatchDetected
    ? ((withinWindow ? Number(existing?.windowMismatchCount || 0) : 0) + 1)
    : (withinWindow ? Number(existing?.windowMismatchCount || 0) : 0);

  const threshold = mismatchState.adminClaimElevation ? 1 : options.anomalyThreshold;
  const thresholdReached = mismatchState.mismatchDetected && nextWindowMismatchCount >= threshold;

  if (!thresholdReached) {
    const update = {
      status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
      windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
      windowMismatchCount: nextWindowMismatchCount,
      quarantineUntil: null,
      lastSeenAt: nowDate,
      lastTokenRole: tokenRole,
      lastDbRole: dbRole,
      lastTokenAccountType: tokenAccountType,
      lastDbAccountType: dbAccountType,
      lastReason: mismatchState.mismatchDetected ? 'privilege_claim_mismatch_observed' : 'claims_verified',
      expiresAt: computeExpiryDate(options),
      metadata: sanitizeMetadata({
        sid: normalizeText(payload?.sid || '', 120),
        jti: normalizeText(payload?.jti || '', 120),
        mismatchState
      })
    };

    const updateOps = {
      $set: update,
      $setOnInsert: {
        escalationLevel: 0,
      }
    };

    if (mismatchState.mismatchDetected) {
      updateOps.$inc = { suspiciousCount: 1 };
    }

    await UserPrivilegeIntegrityState.updateOne({ userId }, updateOps, { upsert: true, setDefaultsOnInsert: true });

    return {
      ok: true,
      reason: mismatchState.mismatchDetected ? 'privilege_claim_mismatch_observed' : 'claims_verified',
      mismatchObserved: mismatchState.mismatchDetected,
      mismatchCount: nextWindowMismatchCount
    };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserPrivilegeIntegrityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowMismatchCount: nextWindowMismatchCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastTokenRole: tokenRole,
        lastDbRole: dbRole,
        lastTokenAccountType: tokenAccountType,
        lastDbAccountType: dbAccountType,
        lastReason: 'privilege_claim_integrity_detected',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          sid: normalizeText(payload?.sid || '', 120),
          jti: normalizeText(payload?.jti || '', 120),
          mismatchState,
          mismatchCount: nextWindowMismatchCount,
          threshold
        })
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
      reason: 'privilege_claim_integrity_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        sid: normalizeText(payload?.sid || '', 120),
        jti: normalizeText(payload?.jti || '', 120),
        tokenRole,
        dbRole,
        tokenAccountType,
        dbAccountType
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 97,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordPrivilegeIntegrityIncident(req, {
    eventType: 'privilege_claim_integrity_detected',
    riskScore: 97,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'JWT privilege claims mismatched DB privilege profile',
    userId,
    email: user.email || null,
    signals: {
      tokenRole,
      dbRole,
      tokenAccountType,
      dbAccountType,
      mismatchState
    },
    metadata: {
      sid: normalizeText(payload?.sid || '', 120),
      jti: normalizeText(payload?.jti || '', 120),
      mismatchCount: nextWindowMismatchCount,
      threshold,
      quarantineUntil: quarantineUntil.toISOString()
    }
  });

  return {
    ok: false,
    reason: 'privilege_claim_integrity_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getPrivilegeIntegrityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = normalizeText(status, 40);
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

  const rows = await UserPrivilegeIntegrityState.find(query)
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
      status: normalizeText(item.status, 30),
      escalationLevel: Number(item.escalationLevel || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      windowMismatchCount: Number(item.windowMismatchCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastTokenRole: normalizeText(item.lastTokenRole, 40),
      lastDbRole: normalizeText(item.lastDbRole, 40),
      lastTokenAccountType: normalizeText(item.lastTokenAccountType, 60),
      lastDbAccountType: normalizeText(item.lastDbAccountType, 60),
      lastReason: normalizeText(item.lastReason, 120)
    }))
  };
}

async function releasePrivilegeIntegrityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserPrivilegeIntegrityState.updateMany(
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

  const result = await UserPrivilegeIntegrityState.updateMany(
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

async function quarantinePrivilegeIntegrityUser({
  userId = '',
  reason = 'admin_manual_privilege_integrity_quarantine',
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
  const existing = await UserPrivilegeIntegrityState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserPrivilegeIntegrityState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_privilege_integrity_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowMismatchCount: 0,
        lastTokenRole: '',
        lastDbRole: '',
        lastTokenAccountType: '',
        lastDbAccountType: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_privilege_integrity_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserPrivilegeClaimIntegrity,
  getPrivilegeIntegrityShieldSnapshot,
  releasePrivilegeIntegrityShieldStates,
  quarantinePrivilegeIntegrityUser
};
