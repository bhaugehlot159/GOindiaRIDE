const UserGeoVelocityState = require('../models/UserGeoVelocityState');
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
    enabled: Boolean(env.geoVelocityShieldEnabled),
    failOpen: Boolean(env.geoVelocityShieldFailOpen),
    countryJumpWindowMs: normalizeNumber(env.geoVelocityCountryJumpWindowMs, 20 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    requireFingerprintChange: Boolean(env.geoVelocityRequireFingerprintChange),
    ignoreUnknownCountry: Boolean(env.geoVelocityIgnoreUnknownCountry),
    quarantineMs: normalizeNumber(env.geoVelocityQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.geoVelocityQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.geoVelocityEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.geoVelocityAutoRevokeSessions),
    autoBanUser: Boolean(env.geoVelocityAutoBanUser)
  };
}

function computeQuarantineMs(options, escalationLevel) {
  return Math.min(
    options.quarantineMaxMs,
    Math.round(options.quarantineMs * Math.pow(options.escalationFactor, Math.max(0, escalationLevel - 1)))
  );
}

async function recordGeoVelocityIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const user = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'geo_velocity_impossible_travel',
      userId: payload.userId || user.id || user.sub || user._id || null,
      email: payload.email || user.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 94,
      severity: severityFromScore(payload.riskScore || 94),
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
          action: 'geo_velocity_shield_triggered',
          note: payload.note || 'Geo-velocity shield detected impossible travel'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function upsertPassiveState({ userId, country, ip, fingerprint, userAgent }) {
  await UserGeoVelocityState.updateOne(
    { userId },
    {
      $set: {
        lastSeenAt: new Date(),
        lastCountry: String(country || ''),
        lastIp: String(ip || ''),
        lastFingerprint: String(fingerprint || ''),
        lastUserAgent: String(userAgent || ''),
        lastReason: 'seen',
        status: 'active'
      },
      $setOnInsert: {
        escalationLevel: 0,
        suspiciousCount: 0,
        metadata: {}
      }
    },
    { upsert: true }
  );
}

async function inspectUserGeoVelocity({ user = null, req = null } = {}) {
  const options = resolveOptions();
  if (!options.enabled) {
    return { ok: true, reason: 'disabled' };
  }

  const userId = String(user?._id || user?.id || '').trim();
  if (!userId) {
    return { ok: true, reason: 'missing_user' };
  }

  const countryRaw = String(getCountry(req) || '').trim().toLowerCase();
  const country = countryRaw || 'unknown';
  if (options.ignoreUnknownCountry && country === 'unknown') {
    return { ok: true, reason: 'unknown_country_ignored' };
  }

  const ip = normalizeIp(getClientIp(req) || '');
  const fingerprintHeader = String(req.headers['x-device-fingerprint'] || '').trim().toLowerCase();
  const fingerprint = fingerprintHeader || String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const now = nowTs();
  const nowDate = new Date(now);

  const existing = await UserGeoVelocityState.findOne({ userId }).lean();
  if (!existing) {
    await upsertPassiveState({ userId, country, ip, fingerprint, userAgent });
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

  const lastSeenMs = existing.lastSeenAt ? new Date(existing.lastSeenAt).getTime() : 0;
  const withinJumpWindow = lastSeenMs > 0 && (now - lastSeenMs) <= options.countryJumpWindowMs;
  const countryChanged = Boolean(existing.lastCountry && country && existing.lastCountry !== country);
  const ipChanged = Boolean(existing.lastIp && ip && existing.lastIp !== ip);
  const fingerprintChanged = Boolean(existing.lastFingerprint && fingerprint && existing.lastFingerprint !== fingerprint);
  const fingerprintCondition = options.requireFingerprintChange ? fingerprintChanged : true;
  const impossibleTravel = countryChanged && withinJumpWindow && ipChanged && fingerprintCondition;

  if (!impossibleTravel) {
    await upsertPassiveState({ userId, country, ip, fingerprint, userAgent });
    return { ok: true, reason: 'seen' };
  }

  const escalationLevel = Number(existing.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserGeoVelocityState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastCountry: country,
        lastIp: ip,
        lastFingerprint: fingerprint,
        lastUserAgent: userAgent,
        lastReason: 'impossible_travel',
        metadata: sanitizeMetadata({
          previousCountry: existing.lastCountry || '',
          previousIp: existing.lastIp || '',
          previousFingerprint: existing.lastFingerprint || ''
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
      reason: 'geo_velocity_impossible_travel_detected',
      source: 'security_event',
      actorUserId: null,
      actorIp: ip,
      metadata: {
        country,
        previousCountry: existing.lastCountry || ''
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

  await recordGeoVelocityIncident(req, {
    eventType: 'geo_velocity_impossible_travel',
    riskScore: 95,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Impossible travel pattern detected for authenticated user',
    userId,
    email: user.email || null,
    signals: {
      countryChanged,
      ipChanged,
      fingerprintChanged,
      withinJumpWindow
    },
    metadata: {
      previousCountry: existing.lastCountry || '',
      currentCountry: country,
      previousIp: existing.lastIp || '',
      currentIp: ip,
      quarantineUntil: quarantineUntil.toISOString()
    }
  });

  return {
    ok: false,
    reason: 'geo_velocity_impossible_travel',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getGeoVelocityShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserGeoVelocityState.find(query)
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
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastCountry: String(item.lastCountry || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseGeoVelocityShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserGeoVelocityState.updateMany(
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

  const result = await UserGeoVelocityState.updateMany(
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

module.exports = {
  inspectUserGeoVelocity,
  getGeoVelocityShieldSnapshot,
  releaseGeoVelocityShieldStates
};
