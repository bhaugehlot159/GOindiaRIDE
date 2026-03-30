const crypto = require('crypto');

const CredentialStuffingShieldRecord = require('../models/CredentialStuffingShieldRecord');
const SecurityIncident = require('../models/SecurityIncident');
const env = require('../config/env');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function nowTs() {
  return Date.now();
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeCsv(input) {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
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

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).slice(0, 50));
}

function resolveOptions() {
  const trackPaths = normalizeCsv(env.credentialStuffingTrackPaths);
  return {
    enabled: normalizeBoolean(env.credentialStuffingShieldEnabled, true),
    failOpen: normalizeBoolean(env.credentialStuffingShieldFailOpen, false),
    failWindowMs: normalizeNumber(env.credentialStuffingFailWindowMs, 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    failureMax: normalizeNumber(env.credentialStuffingFailureMax, 20, 3, 5000),
    uniquePrincipalMax: normalizeNumber(env.credentialStuffingUniquePrincipalMax, 8, 2, 2000),
    quarantineMs: normalizeNumber(env.credentialStuffingQuarantineMs, 30 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    quarantineMaxMs: normalizeNumber(env.credentialStuffingQuarantineMaxMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    escalationFactor: normalizeNumber(env.credentialStuffingEscalationFactor, 2, 1, 5),
    recordTtlMs: normalizeNumber(env.credentialStuffingRecordTtlMs, 14 * 24 * 60 * 60 * 1000, 60 * 60 * 1000, 180 * 24 * 60 * 60 * 1000),
    trackPaths: trackPaths.length
      ? trackPaths
      : [
          '/api/auth/login',
          '/api/auth/admin/login',
          '/api/auth/register',
          '/api/auth/forgot-password/request',
          '/api/auth/forgot-password/confirm'
        ]
  };
}

function resolvePrincipalIdentifier(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
  const username = String(req.body?.username || '').trim().toLowerCase();
  const identifier = String(req.body?.identifier || '').trim().toLowerCase();
  return email || phone || username || identifier || 'anonymous_principal';
}

function resolvePathGroup(path) {
  const normalized = String(path || '').trim().toLowerCase();
  if (normalized.includes('/admin/login')) return 'admin_auth';
  if (normalized.includes('/forgot-password')) return 'password_reset';
  if (normalized.includes('/register')) return 'register';
  if (normalized.includes('/login')) return 'login';
  return 'auth';
}

function shouldTrackPath(path, options) {
  const normalized = String(path || '').trim().toLowerCase();
  return options.trackPaths.some((prefix) => normalized.startsWith(String(prefix || '').trim().toLowerCase()));
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
  return new Date(ts + Math.max(options.recordTtlMs, options.failWindowMs * 2, extraMs));
}

async function recordCredentialStuffingIncident(req, payload = {}) {
  try {
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);
    const authUser = req.user || req.auth || {};

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'credential_stuffing_detected',
      userId: authUser.id || authUser.sub || authUser._id || null,
      email: authUser.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 93,
      severity: severityFromScore(payload.riskScore || 93),
      recommendedAction: payload.recommendedAction || 'quarantine_ip',
      autoResponse: {
        action: payload.action || 'quarantine_ip',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'credential_stuffing_shield_triggered',
          note: payload.note || 'Credential stuffing shield detected suspicious auth spray'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function getCredentialStuffingBlockState({ ipHash = '', pathGroup = '' } = {}) {
  const normalizedIpHash = String(ipHash || '').trim().toLowerCase();
  const normalizedPathGroup = String(pathGroup || '').trim().toLowerCase() || 'auth';
  if (!normalizedIpHash || !isSha256(normalizedIpHash)) {
    return { blocked: false, remainingMs: 0, quarantineUntil: null };
  }

  const existing = await CredentialStuffingShieldRecord.findOne({
    ipHash: normalizedIpHash,
    pathGroup: normalizedPathGroup
  }).lean();

  if (!existing) {
    return { blocked: false, remainingMs: 0, quarantineUntil: null };
  }

  const quarantineUntilMs = existing.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;
  const remainingMs = Math.max(0, quarantineUntilMs - nowTs());
  if (existing.status === 'quarantined' && remainingMs > 0) {
    return {
      blocked: true,
      remainingMs,
      quarantineUntil: new Date(quarantineUntilMs).toISOString(),
      escalationLevel: Number(existing.escalationLevel || 0)
    };
  }

  return { blocked: false, remainingMs: 0, quarantineUntil: null };
}

async function registerCredentialStuffingFailure({
  req = null,
  path = '',
  statusCode = 0,
  reason = 'http_4xx'
} = {}) {
  const options = resolveOptions();
  const normalizedPath = String(path || '').trim().toLowerCase();
  if (!shouldTrackPath(normalizedPath, options)) {
    return { tracked: false, suspicious: false };
  }

  const ip = normalizeIp(getClientIp(req) || '');
  const ipHash = hashValue(ip || 'unknown_ip');
  const pathGroup = resolvePathGroup(normalizedPath);
  const principalHash = hashValue(resolvePrincipalIdentifier(req));
  const now = nowTs();
  const nowDate = new Date(now);

  const existing = await CredentialStuffingShieldRecord.findOne({ ipHash, pathGroup }).lean();
  const existingWindowStartMs = existing?.windowStartAt ? new Date(existing.windowStartAt).getTime() : 0;
  const withinWindow = existingWindowStartMs > 0 && (now - existingWindowStartMs) <= options.failWindowMs;

  let windowStartAt = withinWindow ? new Date(existingWindowStartMs) : nowDate;
  let windowFailureCount = withinWindow ? Number(existing?.windowFailureCount || 0) : 0;
  const principalSet = new Set(withinWindow ? (Array.isArray(existing?.windowPrincipalHashes) ? existing.windowPrincipalHashes : []) : []);
  principalSet.add(principalHash);
  windowFailureCount += 1;

  const uniquePrincipalCount = principalSet.size;
  const suspicious = windowFailureCount >= options.failureMax || uniquePrincipalCount >= options.uniquePrincipalMax;
  let escalationLevel = Number(existing?.escalationLevel || 0);
  let quarantineUntilMs = existing?.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0;

  if (suspicious) {
    escalationLevel += 1;
    quarantineUntilMs = now + computeQuarantineMs(options, escalationLevel);
  }

  const nextStatus = suspicious
    ? 'quarantined'
    : (existing?.status === 'released' ? 'active' : (existing?.status || 'active'));

  await CredentialStuffingShieldRecord.updateOne(
    { ipHash, pathGroup },
    {
      $set: {
        status: nextStatus,
        escalationLevel,
        windowStartAt,
        windowFailureCount,
        windowPrincipalHashes: Array.from(principalSet).slice(-500),
        quarantineUntil: suspicious ? new Date(quarantineUntilMs) : (existing?.quarantineUntil || null),
        lastFailureAt: nowDate,
        lastIp: ip,
        lastReason: String(reason || '').trim() || `http_${statusCode || 0}`,
        metadata: sanitizeMetadata({
          path: normalizedPath,
          statusCode: Number(statusCode || 0),
          uniquePrincipalCount
        }),
        expiresAt: computeExpiryDate(options, suspicious ? quarantineUntilMs : (existing?.quarantineUntil ? new Date(existing.quarantineUntil).getTime() : 0))
      },
      $inc: {
        totalFailureCount: 1,
        suspiciousCount: suspicious ? 1 : 0
      }
    },
    { upsert: true }
  );

  if (suspicious) {
    await recordCredentialStuffingIncident(req, {
      eventType: 'credential_stuffing_detected',
      riskScore: Math.max(86, Math.min(99, 70 + (escalationLevel * 6) + Math.round(uniquePrincipalCount / 2))),
      recommendedAction: 'quarantine_ip',
      action: 'quarantine_ip',
      note: 'Cross-account auth spray threshold exceeded',
      signals: {
        path: normalizedPath,
        pathGroup,
        statusCode: Number(statusCode || 0),
        windowFailureCount,
        uniquePrincipalCount
      },
      metadata: {
        ipHash,
        quarantineUntil: new Date(quarantineUntilMs).toISOString(),
        escalationLevel
      }
    });
  }

  return {
    tracked: true,
    suspicious,
    ipHash,
    pathGroup,
    windowFailureCount,
    uniquePrincipalCount,
    quarantineUntil: suspicious ? new Date(quarantineUntilMs).toISOString() : null,
    escalationLevel
  };
}

async function quarantineCredentialStuffingKey({
  ipHash = '',
  pathGroup = 'auth',
  reason = 'admin_manual_credential_stuffing_quarantine',
  durationMs = null,
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const options = resolveOptions();
  const normalizedIpHash = String(ipHash || '').trim().toLowerCase();
  if (!isSha256(normalizedIpHash)) {
    const error = new Error('ipHash must be a SHA-256 hash');
    error.statusCode = 400;
    throw error;
  }

  const normalizedPathGroup = String(pathGroup || '').trim().toLowerCase() || 'auth';
  const now = nowTs();
  const nowDate = new Date(now);
  const existing = await CredentialStuffingShieldRecord.findOne({
    ipHash: normalizedIpHash,
    pathGroup: normalizedPathGroup
  }).lean();

  const nextEscalationLevel = Math.max(1, Number(existing?.escalationLevel || 0) + 1);
  const boundedDurationMs = normalizeNumber(
    durationMs,
    computeQuarantineMs(options, nextEscalationLevel),
    60 * 1000,
    options.quarantineMaxMs
  );
  const quarantineUntil = new Date(now + boundedDurationMs);

  const doc = await CredentialStuffingShieldRecord.findOneAndUpdate(
    { ipHash: normalizedIpHash, pathGroup: normalizedPathGroup },
    {
      $set: {
        status: 'quarantined',
        escalationLevel: nextEscalationLevel,
        quarantineUntil,
        lastFailureAt: nowDate,
        lastReason: String(reason || '').trim().slice(0, 220) || 'admin_manual_credential_stuffing_quarantine',
        metadata: sanitizeMetadata({
          ...(metadata || {}),
          actorUserId: String(actorUserId || ''),
          actorIp: String(actorIp || '')
        }),
        expiresAt: computeExpiryDate(options, quarantineUntil.getTime())
      },
      $setOnInsert: {
        windowStartAt: nowDate,
        windowFailureCount: 0,
        windowPrincipalHashes: [],
        totalFailureCount: 0,
        suspiciousCount: 0,
        lastIp: ''
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

async function getCredentialStuffingShieldSnapshot({ includeReleased = false, status = '', pathGroup = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedPathGroup = String(pathGroup || '').trim().toLowerCase();

  const query = {};
  if (!includeReleased) {
    query.status = { $ne: 'released' };
  }
  if (normalizedStatus) {
    query.status = normalizedStatus;
  }
  if (normalizedPathGroup) {
    query.pathGroup = normalizedPathGroup;
  }

  const rows = await CredentialStuffingShieldRecord.find(query)
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
      ipHash: String(item.ipHash || ''),
      pathGroup: String(item.pathGroup || ''),
      status: String(item.status || ''),
      escalationLevel: Number(item.escalationLevel || 0),
      windowFailureCount: Number(item.windowFailureCount || 0),
      uniquePrincipalCount: Array.isArray(item.windowPrincipalHashes) ? item.windowPrincipalHashes.length : 0,
      totalFailureCount: Number(item.totalFailureCount || 0),
      suspiciousCount: Number(item.suspiciousCount || 0),
      windowStartAt: item.windowStartAt ? new Date(item.windowStartAt).toISOString() : null,
      quarantineUntil: item.quarantineUntil ? new Date(item.quarantineUntil).toISOString() : null,
      lastFailureAt: item.lastFailureAt ? new Date(item.lastFailureAt).toISOString() : null,
      lastIp: String(item.lastIp || ''),
      lastReason: String(item.lastReason || '')
    }))
  };
}

async function releaseCredentialStuffingShieldRecords({ id = '', ipHash = '', pathGroup = '', clearAll = false } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedIpHash = String(ipHash || '').trim().toLowerCase();
  const normalizedPathGroup = String(pathGroup || '').trim().toLowerCase();

  if (clearAll) {
    const result = await CredentialStuffingShieldRecord.updateMany(
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
  if (normalizedIpHash) query.ipHash = normalizedIpHash;
  if (normalizedPathGroup) query.pathGroup = normalizedPathGroup;

  const result = await CredentialStuffingShieldRecord.updateMany(
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
  isCredentialStuffingSha256: isSha256,
  resolveCredentialStuffingOptions: resolveOptions,
  shouldTrackCredentialStuffingPath: shouldTrackPath,
  resolveCredentialStuffingPathGroup: resolvePathGroup,
  getCredentialStuffingBlockState,
  registerCredentialStuffingFailure,
  quarantineCredentialStuffingKey,
  getCredentialStuffingShieldSnapshot,
  releaseCredentialStuffingShieldRecords
};
