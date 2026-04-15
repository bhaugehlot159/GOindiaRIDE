const crypto = require('crypto');

const UserSessionFanoutState = require('../models/UserSessionFanoutState');
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

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) ip = match[1];
  return ip;
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
    enabled: Boolean(env.sessionFanoutShieldEnabled),
    failOpen: Boolean(env.sessionFanoutShieldFailOpen),
    windowMs: normalizeNumber(env.sessionFanoutWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    maxDistinctContexts: normalizeNumber(env.sessionFanoutMaxDistinctContexts, 4, 2, 50),
    maxDistinctIps: normalizeNumber(env.sessionFanoutMaxDistinctIps, 3, 1, 30),
    maxDistinctCountries: normalizeNumber(env.sessionFanoutMaxDistinctCountries, 2, 1, 20),
    requireFingerprint: Boolean(env.sessionFanoutRequireFingerprint),
    quarantineMs: normalizeNumber(env.sessionFanoutQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.sessionFanoutQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.sessionFanoutEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.sessionFanoutAutoRevokeSessions),
    autoBanUser: Boolean(env.sessionFanoutAutoBanUser),
    recordTtlMs: normalizeNumber(env.sessionFanoutRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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

async function recordSessionFanoutIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_fanout_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 92,
      severity: severityFromScore(payload.riskScore || 92),
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
          action: 'session_fanout_shield_triggered',
          note: payload.note || 'Session fanout threshold exceeded'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function getContextHashes({ ip, country, fingerprint, userAgent, requireFingerprint }) {
  const ipHash = hashValue(ip || 'unknown_ip');
  const countryCode = String(country || 'unknown').trim().toLowerCase();
  const countryHash = hashValue(countryCode || 'unknown');
  const fpValue = String(fingerprint || '').trim().toLowerCase();
  const userAgentValue = String(userAgent || '').trim().toLowerCase();
  const contextBase = requireFingerprint
    ? `${ip}|${countryCode}|${fpValue || 'missing_fp'}`
    : `${ip}|${countryCode}|${fpValue || userAgentValue || 'unknown_ua'}`;
  const contextHash = hashValue(contextBase);

  return {
    ipHash,
    countryHash,
    countryCode,
    contextHash
  };
}

function buildPassiveSetUpdate({
  existing = null,
  withinWindow = false,
  contextHash = '',
  ipHash = '',
  countryCode = '',
  nowDate = null
}) {
  const contextSet = new Set(withinWindow ? (Array.isArray(existing?.windowContextHashes) ? existing.windowContextHashes : []) : []);
  const ipSet = new Set(withinWindow ? (Array.isArray(existing?.windowIpHashes) ? existing.windowIpHashes : []) : []);
  const countrySet = new Set(withinWindow ? (Array.isArray(existing?.windowCountries) ? existing.windowCountries : []) : []);

  if (contextHash) contextSet.add(contextHash);
  if (ipHash) ipSet.add(ipHash);
  if (countryCode) countrySet.add(countryCode);

  return {
    windowStartAt: withinWindow ? new Date(existing.windowStartAt) : nowDate,
    windowContextHashes: Array.from(contextSet).slice(-300),
    windowIpHashes: Array.from(ipSet).slice(-300),
    windowCountries: Array.from(countrySet).slice(-60),
    distinctContextCount: contextSet.size,
    distinctIpCount: ipSet.size,
    distinctCountryCount: countrySet.size
  };
}

async function inspectUserSessionFanout({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const ip = normalizeIp(getClientIp(req) || '');
  const country = String(getCountry(req) || '').trim().toLowerCase() || 'unknown';
  const fingerprintHeader = String(req?.headers?.['x-device-fingerprint'] || '').trim().toLowerCase();
  const fingerprint = fingerprintHeader || String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
  const userAgent = String(req?.headers?.['user-agent'] || '').trim().toLowerCase();
  const now = nowTs();
  const nowDate = new Date(now);

  const { ipHash, countryCode, contextHash } = getContextHashes({
    ip,
    country,
    fingerprint,
    userAgent,
    requireFingerprint: options.requireFingerprint
  });

  const existing = await UserSessionFanoutState.findOne({ userId }).lean();
  if (!existing) {
    await UserSessionFanoutState.create({
      userId,
      status: 'active',
      escalationLevel: 0,
      windowStartAt: nowDate,
      windowContextHashes: [contextHash],
      windowIpHashes: [ipHash],
      windowCountries: [countryCode],
      quarantineUntil: null,
      lastSeenAt: nowDate,
      lastCountry: countryCode,
      lastIp: ip,
      lastFingerprint: fingerprint,
      lastUserAgent: userAgent,
      lastReason: 'first_seen',
      metadata: {},
      expiresAt: computeExpiryDate(options)
    });
    return { ok: true, reason: 'first_seen' };
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

  const nextWindowState = buildPassiveSetUpdate({
    existing,
    withinWindow,
    contextHash,
    ipHash,
    countryCode,
    nowDate
  });

  const thresholdExceeded = (
    nextWindowState.distinctContextCount > options.maxDistinctContexts
    || nextWindowState.distinctIpCount > options.maxDistinctIps
    || nextWindowState.distinctCountryCount > options.maxDistinctCountries
  );

  if (!thresholdExceeded) {
    await UserSessionFanoutState.updateOne(
      { userId },
      {
        $set: {
          status: existing.status === 'released' ? 'active' : existing.status,
          windowStartAt: nextWindowState.windowStartAt,
          windowContextHashes: nextWindowState.windowContextHashes,
          windowIpHashes: nextWindowState.windowIpHashes,
          windowCountries: nextWindowState.windowCountries,
          quarantineUntil: null,
          lastSeenAt: nowDate,
          lastCountry: countryCode,
          lastIp: ip,
          lastFingerprint: fingerprint,
          lastUserAgent: userAgent,
          lastReason: 'seen',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            distinctContextCount: nextWindowState.distinctContextCount,
            distinctIpCount: nextWindowState.distinctIpCount,
            distinctCountryCount: nextWindowState.distinctCountryCount
          })
        }
      }
    );
    return { ok: true, reason: 'seen' };
  }

  const escalationLevel = Number(existing.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserSessionFanoutState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: nextWindowState.windowStartAt,
        windowContextHashes: nextWindowState.windowContextHashes,
        windowIpHashes: nextWindowState.windowIpHashes,
        windowCountries: nextWindowState.windowCountries,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastCountry: countryCode,
        lastIp: ip,
        lastFingerprint: fingerprint,
        lastUserAgent: userAgent,
        lastReason: 'session_fanout_detected',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          distinctContextCount: nextWindowState.distinctContextCount,
          distinctIpCount: nextWindowState.distinctIpCount,
          distinctCountryCount: nextWindowState.distinctCountryCount,
          previousIp: existing.lastIp || '',
          previousCountry: existing.lastCountry || ''
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
      reason: 'session_fanout_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        distinctContextCount: nextWindowState.distinctContextCount,
        distinctIpCount: nextWindowState.distinctIpCount,
        distinctCountryCount: nextWindowState.distinctCountryCount
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

  await recordSessionFanoutIncident(req, {
    eventType: 'session_fanout_detected',
    riskScore: 95,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Unusual rapid multi-context session fanout detected',
    userId,
    email: user.email || null,
    signals: {
      distinctContextCount: nextWindowState.distinctContextCount,
      distinctIpCount: nextWindowState.distinctIpCount,
      distinctCountryCount: nextWindowState.distinctCountryCount
    },
    metadata: {
      quarantineUntil: quarantineUntil.toISOString(),
      escalationLevel
    }
  });

  return {
    ok: false,
    reason: 'session_fanout_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getSessionFanoutShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserSessionFanoutState.find(query)
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
      distinctContextCount: Array.isArray(item.windowContextHashes) ? item.windowContextHashes.length : 0,
      distinctIpCount: Array.isArray(item.windowIpHashes) ? item.windowIpHashes.length : 0,
      distinctCountryCount: Array.isArray(item.windowCountries) ? item.windowCountries.length : 0,
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastCountry: String(item.lastCountry || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseSessionFanoutShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserSessionFanoutState.updateMany(
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

  const result = await UserSessionFanoutState.updateMany(
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

async function quarantineSessionFanoutUser({
  userId = '',
  reason = 'admin_manual_session_fanout_quarantine',
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
  const existing = await UserSessionFanoutState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserSessionFanoutState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_session_fanout_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowContextHashes: [],
        windowIpHashes: [],
        windowCountries: [],
        lastCountry: '',
        lastIp: '',
        lastFingerprint: '',
        lastUserAgent: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  if (options.autoRevokeSessions) {
    await revokeAllAccessTokensForUser({
      userId: normalizedUserId,
      reason: 'admin_manual_session_fanout_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserSessionFanout,
  getSessionFanoutShieldSnapshot,
  releaseSessionFanoutShieldStates,
  quarantineSessionFanoutUser
};
