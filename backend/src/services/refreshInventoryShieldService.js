const UserRefreshInventoryState = require('../models/UserRefreshInventoryState');
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

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSessionId(value) {
  return String(value || '').trim().toLowerCase();
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
    enabled: Boolean(env.refreshInventoryShieldEnabled),
    failOpen: Boolean(env.refreshInventoryShieldFailOpen),
    protectedPrefixes: splitCsv(env.refreshInventoryProtectedPrefixes),
    windowMs: normalizeNumber(env.refreshInventoryWindowMs, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    maxActiveTokens: normalizeNumber(env.refreshInventoryMaxActiveTokens, 8, 1, 500),
    maxMissingSessionTokens: normalizeNumber(env.refreshInventoryMaxMissingSessionTokens, 2, 0, 200),
    maxDuplicateSessionTokens: normalizeNumber(env.refreshInventoryMaxDuplicateSessionTokens, 3, 0, 200),
    requireSessionId: Boolean(env.refreshInventoryRequireSessionId),
    violationThreshold: normalizeNumber(env.refreshInventoryViolationThreshold, 2, 1, 20),
    quarantineMs: normalizeNumber(env.refreshInventoryQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.refreshInventoryQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.refreshInventoryEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.refreshInventoryAutoRevokeSessions),
    autoBanUser: Boolean(env.refreshInventoryAutoBanUser),
    recordTtlMs: normalizeNumber(env.refreshInventoryRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

function shouldTrackPath(path, options) {
  if (!options.protectedPrefixes.length) return true;
  return options.protectedPrefixes.some((prefix) => matchesPrefix(path, prefix));
}

function getRefreshInventoryStats(user = {}) {
  const now = nowTs();
  const refreshTokens = Array.isArray(user.refreshTokens) ? user.refreshTokens : [];
  const active = refreshTokens.filter((token) => {
    if (!token) return false;
    if (!token.expiresAt) return true;
    const expMs = new Date(token.expiresAt).getTime();
    return Number.isFinite(expMs) && expMs > now;
  });

  const sessionIds = active.map((token) => normalizeSessionId(token.sessionId)).filter(Boolean);
  const activeCount = active.length;
  const missingSessionCount = Math.max(0, activeCount - sessionIds.length);
  const freq = {};
  sessionIds.forEach((sid) => {
    freq[sid] = Number(freq[sid] || 0) + 1;
  });
  const duplicateSessionCount = Object.values(freq).reduce((sum, count) => {
    if (count > 1) return sum + (count - 1);
    return sum;
  }, 0);
  const uniqueSessionCount = Object.keys(freq).length;

  return {
    activeCount,
    missingSessionCount,
    duplicateSessionCount,
    uniqueSessionCount
  };
}

function detectInventoryViolations(stats, options) {
  const reasons = [];
  if (stats.activeCount > options.maxActiveTokens) {
    reasons.push('too_many_active_refresh_tokens');
  }
  if (stats.missingSessionCount > options.maxMissingSessionTokens) {
    reasons.push('too_many_missing_session_ids');
  }
  if (stats.duplicateSessionCount > options.maxDuplicateSessionTokens) {
    reasons.push('too_many_duplicate_session_tokens');
  }
  if (options.requireSessionId && stats.missingSessionCount > 0) {
    reasons.push('session_id_required_for_refresh_tokens');
  }

  return {
    detected: reasons.length > 0,
    reasons
  };
}

async function recordRefreshInventoryIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'refresh_inventory_violation_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 84,
      severity: severityFromScore(payload.riskScore || 84),
      recommendedAction: payload.recommendedAction || 'monitor',
      autoResponse: {
        action: payload.action || 'monitor',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'refresh_inventory_shield_triggered',
          note: payload.note || 'Refresh token inventory anomaly observed'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function inspectUserRefreshInventory({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const path = normalizePath(req?.originalUrl || req?.path || '/');
  if (!shouldTrackPath(path, options)) {
    return { ok: true, reason: 'path_not_tracked' };
  }

  const now = nowTs();
  const nowDate = new Date(now);
  const stats = getRefreshInventoryStats(user);
  const violation = detectInventoryViolations(stats, options);

  const existing = await UserRefreshInventoryState.findOne({ userId }).lean();
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
  const violationCount = violation.detected
    ? ((withinWindow ? Number(existing?.windowViolationCount || 0) : 0) + 1)
    : 0;
  const thresholdReached = violation.detected && violationCount >= options.violationThreshold;

  if (!thresholdReached) {
    await UserRefreshInventoryState.updateOne(
      { userId },
      {
        $set: {
          status: existing?.status === 'released' ? 'active' : (existing?.status || 'active'),
          windowStartAt: violation.detected ? (withinWindow ? new Date(existing.windowStartAt) : nowDate) : nowDate,
          windowViolationCount: violationCount,
          lastActiveRefreshCount: stats.activeCount,
          lastUniqueSessionCount: stats.uniqueSessionCount,
          lastMissingSessionCount: stats.missingSessionCount,
          lastDuplicateSessionCount: stats.duplicateSessionCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastReason: violation.detected ? 'refresh_inventory_violation_observed' : 'refresh_inventory_ok',
          metadata: sanitizeMetadata({
            reasons: violation.reasons,
            maxActiveTokens: options.maxActiveTokens,
            maxMissingSessionTokens: options.maxMissingSessionTokens,
            maxDuplicateSessionTokens: options.maxDuplicateSessionTokens,
            violationThreshold: options.violationThreshold,
            violationCount
          }),
          expiresAt: computeExpiryDate(options)
        },
        $setOnInsert: {
          escalationLevel: 0,
          suspiciousCount: 0
        },
        ...(violation.detected ? { $inc: { suspiciousCount: 1 } } : {})
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    if (violation.detected) {
      await recordRefreshInventoryIncident(req, {
        eventType: 'refresh_inventory_violation_observed',
        riskScore: 84,
        recommendedAction: 'monitor',
        action: 'monitor',
        note: 'Refresh inventory violation observed below quarantine threshold',
        userId,
        email: user.email || null,
        signals: {
          reasons: violation.reasons,
          activeCount: stats.activeCount,
          missingSessionCount: stats.missingSessionCount,
          duplicateSessionCount: stats.duplicateSessionCount
        },
        metadata: {
          violationCount,
          violationThreshold: options.violationThreshold
        }
      });
    }

    return { ok: true, reason: violation.detected ? 'refresh_inventory_violation_observed' : 'refresh_inventory_ok' };
  }

  const escalationLevel = Number(existing?.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserRefreshInventoryState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
        windowViolationCount: violationCount,
        lastActiveRefreshCount: stats.activeCount,
        lastUniqueSessionCount: stats.uniqueSessionCount,
        lastMissingSessionCount: stats.missingSessionCount,
        lastDuplicateSessionCount: stats.duplicateSessionCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: 'refresh_inventory_quarantined',
        metadata: sanitizeMetadata({
          reasons: violation.reasons,
          maxActiveTokens: options.maxActiveTokens,
          maxMissingSessionTokens: options.maxMissingSessionTokens,
          maxDuplicateSessionTokens: options.maxDuplicateSessionTokens,
          violationCount,
          violationThreshold: options.violationThreshold
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
      reason: 'refresh_inventory_quarantined',
      source: 'security_event',
      actorUserId: null,
      actorIp: getClientIp(req),
      metadata: {
        reasons: violation.reasons,
        activeCount: stats.activeCount,
        missingSessionCount: stats.missingSessionCount,
        duplicateSessionCount: stats.duplicateSessionCount,
        violationCount,
        violationThreshold: options.violationThreshold
      }
    });
  }

  if (options.autoBanUser) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          isTemporarilyBannedUntil: quarantineUntil,
          riskScore: 89,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordRefreshInventoryIncident(req, {
    eventType: 'refresh_inventory_quarantined',
    riskScore: 89,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Repeated refresh inventory violations triggered quarantine',
    userId,
    email: user.email || null,
    signals: {
      reasons: violation.reasons,
      activeCount: stats.activeCount,
      missingSessionCount: stats.missingSessionCount,
      duplicateSessionCount: stats.duplicateSessionCount
    },
    metadata: {
      violationCount,
      violationThreshold: options.violationThreshold,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'refresh_inventory_quarantined',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getRefreshInventoryShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserRefreshInventoryState.find(query)
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
      lastActiveRefreshCount: Number(item.lastActiveRefreshCount || 0),
      lastUniqueSessionCount: Number(item.lastUniqueSessionCount || 0),
      lastMissingSessionCount: Number(item.lastMissingSessionCount || 0),
      lastDuplicateSessionCount: Number(item.lastDuplicateSessionCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseRefreshInventoryShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserRefreshInventoryState.updateMany(
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

  const result = await UserRefreshInventoryState.updateMany(
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

async function quarantineRefreshInventoryUser({
  userId = '',
  reason = 'admin_manual_refresh_inventory_quarantine',
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
  const existing = await UserRefreshInventoryState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserRefreshInventoryState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_refresh_inventory_quarantine',
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
        suspiciousCount: 0,
        lastActiveRefreshCount: 0,
        lastUniqueSessionCount: 0,
        lastMissingSessionCount: 0,
        lastDuplicateSessionCount: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_refresh_inventory_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserRefreshInventory,
  getRefreshInventoryShieldSnapshot,
  releaseRefreshInventoryShieldStates,
  quarantineRefreshInventoryUser
};
