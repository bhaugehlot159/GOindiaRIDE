const UserSessionContextDriftState = require('../models/UserSessionContextDriftState');
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
    enabled: Boolean(env.sessionContextDriftShieldEnabled),
    failOpen: Boolean(env.sessionContextDriftShieldFailOpen),
    driftWindowMs: normalizeNumber(env.sessionContextDriftWindowMs, 15 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    anomalyThreshold: normalizeNumber(env.sessionContextDriftAnomalyThreshold, 2, 1, 20),
    requireCountryShift: Boolean(env.sessionContextDriftRequireCountryShift),
    quarantineMs: normalizeNumber(env.sessionContextDriftQuarantineMs, 2 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.sessionContextDriftQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.sessionContextDriftEscalationFactor, 2, 1, 5),
    autoRevokeSessions: Boolean(env.sessionContextDriftAutoRevokeSessions),
    autoBanUser: Boolean(env.sessionContextDriftAutoBanUser),
    recordTtlMs: normalizeNumber(env.sessionContextDriftRecordTtlMs, 30 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 365 * 24 * 60 * 60 * 1000)
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
  return new Date(ts + Math.max(options.recordTtlMs, options.driftWindowMs * 2, extraMs));
}

async function recordSessionContextIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'session_context_drift_detected',
      userId: payload.userId || authUser.id || authUser.sub || authUser._id || null,
      email: payload.email || authUser.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 91,
      severity: severityFromScore(payload.riskScore || 91),
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
          action: 'session_context_drift_shield_triggered',
          note: payload.note || 'Session context drift detected'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function buildPassiveUpdate({ country, ip, fingerprint, userAgent, options }) {
  return {
    status: 'active',
    lastSeenAt: new Date(),
    lastCountry: String(country || ''),
    lastIp: String(ip || ''),
    lastFingerprint: String(fingerprint || ''),
    lastUserAgent: String(userAgent || ''),
    lastReason: 'seen',
    expiresAt: computeExpiryDate(options)
  };
}

async function inspectUserSessionContextDrift({ user = null, req = null } = {}) {
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

  const existing = await UserSessionContextDriftState.findOne({ userId }).lean();
  if (!existing) {
    await UserSessionContextDriftState.create({
      userId,
      status: 'active',
      escalationLevel: 0,
      windowStartAt: nowDate,
      windowAnomalyCount: 0,
      quarantineUntil: null,
      ...buildPassiveUpdate({ country, ip, fingerprint, userAgent, options }),
      metadata: {}
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

  const lastSeenMs = existing.lastSeenAt ? new Date(existing.lastSeenAt).getTime() : 0;
  const withinDriftWindow = lastSeenMs > 0 && (now - lastSeenMs) <= options.driftWindowMs;
  const ipChanged = Boolean(existing.lastIp && ip && existing.lastIp !== ip);
  const fingerprintChanged = Boolean(existing.lastFingerprint && fingerprint && existing.lastFingerprint !== fingerprint);
  const countryChanged = Boolean(existing.lastCountry && country && existing.lastCountry !== country);
  const userAgentChanged = Boolean(existing.lastUserAgent && userAgent && existing.lastUserAgent !== userAgent);

  let anomalyDetected = withinDriftWindow && ipChanged && fingerprintChanged;
  if (options.requireCountryShift) {
    anomalyDetected = anomalyDetected && countryChanged;
  }

  if (!anomalyDetected) {
    const resetWindow = !withinDriftWindow;
    await UserSessionContextDriftState.updateOne(
      { userId },
      {
        $set: {
          ...buildPassiveUpdate({ country, ip, fingerprint, userAgent, options }),
          windowStartAt: resetWindow ? nowDate : (existing.windowStartAt || nowDate),
          windowAnomalyCount: resetWindow ? 0 : Number(existing.windowAnomalyCount || 0),
          quarantineUntil: null
        }
      }
    );
    return { ok: true, reason: 'seen' };
  }

  const windowStartMs = existing.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const windowActive = windowStartMs > 0 && (now - windowStartMs) <= options.driftWindowMs;
  const anomalyCount = (windowActive ? Number(existing.windowAnomalyCount || 0) : 0) + 1;
  const thresholdReached = anomalyCount >= options.anomalyThreshold;

  if (!thresholdReached) {
    await UserSessionContextDriftState.updateOne(
      { userId },
      {
        $set: {
          status: 'active',
          windowStartAt: windowActive ? new Date(windowStartMs) : nowDate,
          windowAnomalyCount: anomalyCount,
          lastSeenAt: nowDate,
          lastCountry: country,
          lastIp: ip,
          lastFingerprint: fingerprint,
          lastUserAgent: userAgent,
          lastReason: 'anomaly_observed',
          expiresAt: computeExpiryDate(options),
          metadata: sanitizeMetadata({
            previousIp: existing.lastIp || '',
            previousCountry: existing.lastCountry || '',
            previousFingerprint: existing.lastFingerprint || ''
          })
        },
        $inc: {
          suspiciousCount: 1
        }
      }
    );

    return {
      ok: true,
      reason: 'anomaly_observed',
      anomalyCount
    };
  }

  const escalationLevel = Number(existing.escalationLevel || 0) + 1;
  const quarantineMs = computeQuarantineMs(options, escalationLevel);
  const quarantineUntil = new Date(now + quarantineMs);

  await UserSessionContextDriftState.updateOne(
    { userId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel,
        windowStartAt: windowActive ? new Date(windowStartMs) : nowDate,
        windowAnomalyCount: anomalyCount,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastCountry: country,
        lastIp: ip,
        lastFingerprint: fingerprint,
        lastUserAgent: userAgent,
        lastReason: 'session_context_drift_detected',
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime()),
        metadata: sanitizeMetadata({
          previousIp: existing.lastIp || '',
          previousCountry: existing.lastCountry || '',
          previousFingerprint: existing.lastFingerprint || '',
          previousUserAgent: existing.lastUserAgent || ''
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
      reason: 'session_context_drift_detected',
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
          riskScore: 94,
          lastRiskUpdate: nowDate
        }
      }
    );
  }

  await recordSessionContextIncident(req, {
    eventType: 'session_context_drift_detected',
    riskScore: 94,
    recommendedAction: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    action: options.autoRevokeSessions ? 'revoke_sessions_and_quarantine' : 'quarantine_user',
    note: 'Rapid session context drift detected for authenticated user',
    userId,
    email: user.email || null,
    signals: {
      withinDriftWindow,
      ipChanged,
      fingerprintChanged,
      countryChanged,
      userAgentChanged,
      anomalyCount
    },
    metadata: {
      previousIp: existing.lastIp || '',
      currentIp: ip,
      previousCountry: existing.lastCountry || '',
      currentCountry: country,
      quarantineUntil: quarantineUntil.toISOString()
    }
  });

  return {
    ok: false,
    reason: 'session_context_drift_detected',
    quarantineUntil: quarantineUntil.toISOString()
  };
}

async function getSessionContextDriftShieldSnapshot({ includeReleased = false, status = '', userId = '', limit = 100 } = {}) {
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

  const rows = await UserSessionContextDriftState.find(query)
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
      windowAnomalyCount: Number(item.windowAnomalyCount || 0),
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
      lastCountry: String(item.lastCountry || ''),
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseSessionContextDriftShieldStates({ id = '', userId = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedUserId = String(userId || '').trim();

  if (clearAll) {
    const result = await UserSessionContextDriftState.updateMany(
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

  const result = await UserSessionContextDriftState.updateMany(
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

async function quarantineSessionContextUser({
  userId = '',
  reason = 'admin_manual_session_context_quarantine',
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
  const existing = await UserSessionContextDriftState.findOne({ userId: normalizedUserId }).lean();
  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await UserSessionContextDriftState.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastSeenAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_session_context_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowAnomalyCount: 0,
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
      reason: 'admin_manual_session_context_quarantine',
      source: 'admin',
      actorUserId: actorUserId || null,
      actorIp: String(actorIp || ''),
      metadata: sanitizeMetadata(metadata)
    });
  }

  return doc;
}

module.exports = {
  inspectUserSessionContextDrift,
  getSessionContextDriftShieldSnapshot,
  releaseSessionContextDriftShieldStates,
  quarantineSessionContextUser
};
