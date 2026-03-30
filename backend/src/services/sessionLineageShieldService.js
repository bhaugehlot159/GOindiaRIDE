const crypto = require('crypto');

const UserSessionLineageState = require('../models/UserSessionLineageState');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');
const { revokeAllAccessTokensForUser } = require('./tokenRevocationService');

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
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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
    enabled: Boolean(env.sessionLineageShieldEnabled),
    failOpen: Boolean(env.sessionLineageShieldFailOpen),
    windowMs: normalizeNumber(env.sessionLineageWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    maxDistinctSids: normalizeNumber(env.sessionLineageMaxDistinctSids, 4, 1, 100),
    maxDistinctJtis: normalizeNumber(env.sessionLineageMaxDistinctJtis, 120, 5, 2000),
    maxDistinctIps: normalizeNumber(env.sessionLineageMaxDistinctIps, 4, 1, 100),
    maxDistinctCountries: normalizeNumber(env.sessionLineageMaxDistinctCountries, 3, 1, 50),
    requireSidClaim: Boolean(env.sessionLineageRequireSidClaim),
    missingSidThreshold: normalizeNumber(env.sessionLineageMissingSidThreshold, 3, 1, 50),
    protectedPrefixes: Array.isArray(env.sessionLineageProtectedPrefixes)
      ? env.sessionLineageProtectedPrefixes
      : splitCsv('/api'),
    quarantineMs: normalizeNumber(env.sessionLineageQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.sessionLineageQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.sessionLineageEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.sessionLineageAutoRevokeSessions),
    autoBanUser: Boolean(env.sessionLineageAutoBanUser),
    recordTtlMs: normalizeNumber(env.sessionLineageRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

async function recordSessionLineageIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_lineage_anomaly_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 95,
      severity: severityFromScore(payload.riskScore || 95),
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
          action: 'session_lineage_shield_triggered',
          note: payload.note || 'Session lineage anomaly threshold exceeded'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function buildWindowState({
  existing = null,
  withinWindow = false,
  sidHash = '',
  jtiHash = '',
  ipHash = '',
  countryCode = '',
  missingSid = false,
  nowDate = null
}) {
  const sidSet = new Set(withinWindow ? (Array.isArray(existing?.windowSidHashes) ? existing.windowSidHashes : []) : []);
  const jtiSet = new Set(withinWindow ? (Array.isArray(existing?.windowJtiHashes) ? existing.windowJtiHashes : []) : []);
  const ipSet = new Set(withinWindow ? (Array.isArray(existing?.windowIpHashes) ? existing.windowIpHashes : []) : []);
  const countrySet = new Set(withinWindow ? (Array.isArray(existing?.windowCountries) ? existing.windowCountries : []) : []);

  if (sidHash) sidSet.add(sidHash);
  if (jtiHash) jtiSet.add(jtiHash);
  if (ipHash) ipSet.add(ipHash);
  if (countryCode) countrySet.add(countryCode);

  const missingSidCount = (withinWindow ? Number(existing?.windowMissingSidCount || 0) : 0) + (missingSid ? 1 : 0);

  return {
    windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
    windowSidHashes: Array.from(sidSet).slice(-300),
    windowJtiHashes: Array.from(jtiSet).slice(-1500),
    windowIpHashes: Array.from(ipSet).slice(-300),
    windowCountries: Array.from(countrySet).slice(-80),
    windowMissingSidCount: missingSidCount,
    distinctSidCount: sidSet.size,
    distinctJtiCount: jtiSet.size,
    distinctIpCount: ipSet.size,
    distinctCountryCount: countrySet.size
  };
}

async function inspectUserSessionLineage({ user = null, payload = null, req = null } = {}) {
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

  const sid = String(payload?.sid || '').trim().toLowerCase();
  const jti = String(payload?.jti || '').trim().toLowerCase();
  const missingSid = options.requireSidClaim && !sid;
  const sidHash = sid ? hashValue(sid) : '';
  const jtiHash = jti ? hashValue(jti) : '';
  const ip = normalizeIp(getClientIp(req) || '');
  const ipHash = hashValue(ip || 'unknown_ip');
  const countryCode = String(getCountry(req) || '').trim().toLowerCase() || 'unknown';
  const now = nowTs();
  const nowDate = new Date(now);

  const existing = await UserSessionLineageState.findOne({ userId }).lean();
  if (!existing) {
    const nextWindow = buildWindowState({
      existing: null,
      withinWindow: false,
      sidHash,
      jtiHash,
      ipHash,
      countryCode,
      missingSid,
      nowDate
    });

    await UserSessionLineageState.create({
      userId,
      status: 'active',
      escalationLevel: 0,
      suspiciousCount: 0,
      windowStartAt: nextWindow.windowStartAt,
      windowSidHashes: nextWindow.windowSidHashes,
      windowJtiHashes: nextWindow.windowJtiHashes,
      windowIpHashes: nextWindow.windowIpHashes,
      windowCountries: nextWindow.windowCountries,
      windowMissingSidCount: nextWindow.windowMissingSidCount,
      quarantineUntil: null,
      lastSeenAt: nowDate,
      lastSidHash: sidHash,
      lastJtiHash: jtiHash,
      lastPath: path,
      lastCountry: countryCode,
      lastIp: ip,
      lastReason: missingSid ? 'missing_sid_observed' : 'first_seen',
      metadata: sanitizeMetadata({
        distinctSidCount: nextWindow.distinctSidCount,
        distinctJtiCount: nextWindow.distinctJtiCount,
        distinctIpCount: nextWindow.distinctIpCount,
        distinctCountryCount: nextWindow.distinctCountryCount
      }),
      expiresAt: computeExpiryDate(options)
    });

    return { ok: true, reason: missingSid ? 'missing_sid_observed' : 'first_seen' };
  }

  const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
  if (existing.status === 'quarantined' && quarantineUntilMs > now) {
    return {
      ok: false,
      reason: 'user_quarantined',
      quarantineUntil: new Date(quarantineUntilMs).toISOString()
    };
  }

  const windowStartMs = existing.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = windowStartMs > 0 && (now - windowStartMs) <= options.windowMs;

  const nextWindow = buildWindowState({
    existing,
    withinWindow,
    sidHash,
    jtiHash,
    ipHash,
    countryCode,
    missingSid,
    nowDate
  });

  const thresholdExceeded = (
    nextWindow.distinctSidCount > options.maxDistinctSids
    || nextWindow.distinctJtiCount > options.maxDistinctJtis
    || nextWindow.distinctIpCount > options.maxDistinctIps
    || nextWindow.distinctCountryCount > options.maxDistinctCountries
    || nextWindow.windowMissingSidCount >= options.missingSidThreshold
  );

  if (!thresholdExceeded) {
    await UserSessionLineageState.updateOne(
      { userId },
      {
        $set: {
          status: existing.status === 'released' ? 'active' : existing.status,
          windowStartAt: nextWindow.windowStartAt,
          windowSidHashes: nextWindow.windowSidHashes,
          windowJtiHashes: nextWindow.windowJtiHashes,
          windowIpHashes: nextWindow.windowIpHashes,
          windowCountries: nextWindow.windowCountries,
          windowMissingSidCount: nextWindow.windowMissingSidCount,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastSidHash: sidHash,
          lastJtiHash: jtiHash,
          lastPath: path,
          lastCountry: countryCode,
          lastIp: ip,
          lastReason: missingSid ? 'missing_sid_observed' : 'seen',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            distinctSidCount: nextWindow.distinctSidCount,
            distinctJtiCount: nextWindow.distinctJtiCount,
            distinctIpCount: nextWindow.distinctIpCount,
            distinctCountryCount: nextWindow.distinctCountryCount,
            windowMissingSidCount: nextWindow.windowMissingSidCount
          })
        }
      }
    );

    return { ok: true, reason: missingSid ? 'missing_sid_observed' : 'seen' };
  }

  const escalationLevel = Number(existing.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserSessionLineageState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindow.windowStartAt,
        windowSidHashes: nextWindow.windowSidHashes,
        windowJtiHashes: nextWindow.windowJtiHashes,
        windowIpHashes: nextWindow.windowIpHashes,
        windowCountries: nextWindow.windowCountries,
        windowMissingSidCount: nextWindow.windowMissingSidCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastSidHash: sidHash,
        lastJtiHash: jtiHash,
        lastPath: path,
        lastCountry: countryCode,
        lastIp: ip,
        lastReason: nextWindow.windowMissingSidCount >= options.missingSidThreshold
          ? 'session_sid_claim_missing_repeated'
          : 'session_lineage_anomaly_detected',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          distinctSidCount: nextWindow.distinctSidCount,
          distinctJtiCount: nextWindow.distinctJtiCount,
          distinctIpCount: nextWindow.distinctIpCount,
          distinctCountryCount: nextWindow.distinctCountryCount,
          windowMissingSidCount: nextWindow.windowMissingSidCount,
          maxDistinctSids: options.maxDistinctSids,
          maxDistinctJtis: options.maxDistinctJtis,
          maxDistinctIps: options.maxDistinctIps,
          maxDistinctCountries: options.maxDistinctCountries,
          missingSidThreshold: options.missingSidThreshold
        })
      },
      $inc: {
        suspiciousCount: 1
      }
    }
  );

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId,
      reason: 'session_lineage_anomaly_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        path,
        distinctSidCount: nextWindow.distinctSidCount,
        distinctJtiCount: nextWindow.distinctJtiCount,
        distinctIpCount: nextWindow.distinctIpCount,
        distinctCountryCount: nextWindow.distinctCountryCount,
        windowMissingSidCount: nextWindow.windowMissingSidCount
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

  const missingSidEscalation = nextWindow.windowMissingSidCount >= options.missingSidThreshold;
  await recordSessionLineageIncident(req, {
    eventType: missingSidEscalation ? 'session_sid_claim_missing_repeated' : 'session_lineage_anomaly_detected',
    riskScore: missingSidEscalation ? 93 : 95,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: missingSidEscalation
      ? 'Repeated missing SID claim detected in authenticated traffic'
      : 'Session lineage anomaly detected from SID/JTI/IP fanout',
    userId,
    email: user.email || null,
    signals: {
      distinctSidCount: nextWindow.distinctSidCount,
      distinctJtiCount: nextWindow.distinctJtiCount,
      distinctIpCount: nextWindow.distinctIpCount,
      distinctCountryCount: nextWindow.distinctCountryCount,
      windowMissingSidCount: nextWindow.windowMissingSidCount
    },
    metadata: {
      path,
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: missingSidEscalation ? 'session_sid_claim_missing_repeated' : 'session_lineage_anomaly_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getSessionLineageShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserSessionLineageState.find(query)
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
      distinctSidCount: Array.isArray(item.windowSidHashes) ? item.windowSidHashes.length : 0,
      distinctJtiCount: Array.isArray(item.windowJtiHashes) ? item.windowJtiHashes.length : 0,
      distinctIpCount: Array.isArray(item.windowIpHashes) ? item.windowIpHashes.length : 0,
      distinctCountryCount: Array.isArray(item.windowCountries) ? item.windowCountries.length : 0,
      windowMissingSidCount: Number(item.windowMissingSidCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastPath: String(item.lastPath || ''),
      lastCountry: String(item.lastCountry || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseSessionLineageShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserSessionLineageState.updateMany(
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

  const result = await UserSessionLineageState.updateMany(
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

async function quarantineSessionLineageUser({
  userId = '',
  reason = 'admin_manual_session_lineage_quarantine',
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
  const existing = await UserSessionLineageState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserSessionLineageState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_session_lineage_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowSidHashes: [],
        windowJtiHashes: [],
        windowIpHashes: [],
        windowCountries: [],
        windowMissingSidCount: 0,
        suspiciousCount: 0,
        lastSidHash: '',
        lastJtiHash: '',
        lastPath: '',
        lastCountry: '',
        lastIp: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_session_lineage_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserSessionLineage,
  getSessionLineageShieldSnapshot,
  releaseSessionLineageShieldStates,
  quarantineSessionLineageUser
};
