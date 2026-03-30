const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const IdempotencyShieldRecord = require('../models/IdempotencyShieldRecord');
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9:_-]+$/;
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().toLowerCase() === 'true';
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

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function isMutatingMethod(method) {
  return !SAFE_METHODS.has(String(method || '').toUpperCase());
}

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (!ip) return '';
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice('::ffff:'.length);
  }
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = ip.match(ipv4WithPort);
  if (match && match[1]) {
    ip = match[1];
  }
  return ip || '';
}

function getTargetPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function resolveActorKey(req) {
  const userId = String(req.user?.id || req.auth?.id || '').trim();
  if (userId) {
    return `user:${userId}`;
  }

  const bearer = String(req.headers.authorization || '');
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : '';
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      const sub = String(payload?.sub || '').trim();
      if (sub) {
        return `user:${sub}`;
      }
    } catch (_error) {
      // fallback below
    }
  }

  const ip = normalizeIp(getClientIp(req) || 'unknown');
  return `ip:${ip || 'unknown'}`;
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function buildOptions(input = {}) {
  const protectedPrefixes = normalizeCsv(input.protectedPrefixes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    enabled: normalizeBoolean(input.enabled, true),
    requireHeader: normalizeBoolean(input.requireHeader, true),
    strictPayloadMatch: normalizeBoolean(input.strictPayloadMatch, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    minKeyLength: normalizeNumber(input.minKeyLength, 16, 8, 128),
    maxKeyLength: normalizeNumber(input.maxKeyLength, 128, 16, 256),
    ttlMs: normalizeNumber(input.ttlMs, 24 * 60 * 60 * 1000, 5 * 60 * 1000, 14 * 24 * 60 * 60 * 1000),
    processingTtlMs: normalizeNumber(input.processingTtlMs, 2 * 60 * 1000, 5 * 1000, 60 * 60 * 1000),
    protectedPrefixes: protectedPrefixes.length
      ? protectedPrefixes
      : [
          '/api/wallet',
          '/api/wallets',
          '/api/bookings',
          '/api/security/shield',
          '/api/security/runtime/security',
          '/api/security/incidents',
          '/api/security/policy'
        ]
  };
}

function resolveScopeForPath(path, options) {
  const matchedPrefix = options.protectedPrefixes.find((prefix) => path.startsWith(prefix));
  if (!matchedPrefix) {
    return null;
  }
  const scope = matchedPrefix
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9/_-]+/gi, '_')
    .replace(/\//g, ':')
    .toLowerCase();
  return scope || 'global';
}

async function recordIdempotencyIncident(req, payload = {}) {
  try {
    const actor = req.user || req.auth || {};
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'idempotency_shield_blocked',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 74,
      severity: severityFromScore(payload.riskScore || 74),
      recommendedAction: payload.recommendedAction || 'deny_duplicate',
      autoResponse: {
        action: payload.action || 'deny_duplicate',
        applied: true,
        note: payload.note || ''
      },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'idempotency_shield_triggered',
          note: payload.note || 'Idempotency shield blocked duplicate/replay request'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

function buildRequestHashes(req) {
  const method = String(req.method || '').toUpperCase();
  const path = getTargetPath(req);
  const bodyJson = JSON.stringify(req.body || {});
  const bodyHash = hashValue(bodyJson);
  return { method, path, bodyHash };
}

async function claimRecord(payload = {}) {
  const {
    scope,
    actorKey,
    keyHash,
    keyPrefix,
    method,
    path,
    bodyHash,
    requestHash,
    options
  } = payload;

  const ts = nowTs();
  const now = new Date(ts);
  const lockUntil = new Date(ts + options.processingTtlMs);
  const expiresAt = new Date(ts + options.ttlMs);

  async function createNewRecord() {
    await IdempotencyShieldRecord.create({
      scope,
      actorKey,
      keyHash,
      keyPrefix,
      method,
      path,
      requestHash,
      bodyHash,
      status: 'processing',
      lockUntil,
      firstSeenAt: now,
      lastSeenAt: now,
      hitCount: 1,
      expiresAt
    });

    const created = await IdempotencyShieldRecord.findOne({ scope, actorKey, keyHash }).lean();
    return {
      action: 'claimed_new',
      record: created
    };
  }

  let existing = await IdempotencyShieldRecord.findOne({ scope, actorKey, keyHash }).lean();
  if (!existing) {
    try {
      return await createNewRecord();
    } catch (error) {
      if (!(error && error.code === 11000)) {
        throw error;
      }
      existing = await IdempotencyShieldRecord.findOne({ scope, actorKey, keyHash }).lean();
    }
  }

  if (!existing) {
    throw new Error('Unable to claim idempotency key');
  }

  const existingLockUntilMs = existing.lockUntil ? new Date(existing.lockUntil).getTime() : 0;
  const hasPayloadMismatch = Boolean(options.strictPayloadMatch && existing.requestHash !== requestHash);
  if (hasPayloadMismatch) {
    await IdempotencyShieldRecord.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastSeenAt: now,
          lastReason: 'payload_mismatch',
          expiresAt
        },
        $inc: { hitCount: 1 }
      }
    );
    return {
      action: 'blocked_payload_mismatch',
      record: existing
    };
  }

  if (existing.status === 'processing' && existingLockUntilMs > ts) {
    await IdempotencyShieldRecord.updateOne(
      { _id: existing._id },
      {
        $set: {
          lastSeenAt: now,
          lastReason: 'duplicate_in_progress',
          expiresAt
        },
        $inc: { hitCount: 1 }
      }
    );
    return {
      action: 'blocked_in_progress',
      record: existing
    };
  }

  const staleOrCompleted = existingLockUntilMs <= ts || existing.status === 'completed' || existing.status === 'failed';
  if (staleOrCompleted) {
    const reclaimed = await IdempotencyShieldRecord.findOneAndUpdate(
      {
        _id: existing._id,
        scope,
        actorKey,
        keyHash
      },
      {
        $set: {
          method,
          path,
          requestHash,
          bodyHash,
          status: 'processing',
          lockUntil,
          lastSeenAt: now,
          lastReason: existing.status === 'completed' ? 'replay_reclaimed' : 'stale_reclaimed',
          expiresAt
        },
        $inc: { hitCount: 1 }
      },
      { new: true }
    ).lean();

    if (reclaimed) {
      if (existing.status === 'completed') {
        return {
          action: 'blocked_replay',
          record: reclaimed
        };
      }
      return {
        action: 'claimed_reused',
        record: reclaimed
      };
    }
  }

  return {
    action: 'blocked_in_progress',
    record: existing
  };
}

async function finalizeRecord(recordId, statusCode, options) {
  if (!recordId) return;
  const ts = nowTs();
  const now = new Date(ts);
  const expiresAt = new Date(ts + options.ttlMs);
  const isSuccess = Number(statusCode) >= 200 && Number(statusCode) < 400;

  await IdempotencyShieldRecord.updateOne(
    { _id: recordId },
    {
      $set: {
        status: isSuccess ? 'completed' : 'failed',
        lastStatusCode: Number(statusCode || 0),
        lockUntil: null,
        lastSeenAt: now,
        expiresAt,
        lastReason: isSuccess ? 'completed' : 'failed'
      }
    }
  );
}

function idempotencyEnforcementMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled || !isMutatingMethod(req.method)) {
      return next();
    }

    const { method, path, bodyHash } = buildRequestHashes(req);
    const scope = resolveScopeForPath(path, options);
    if (!scope) {
      return next();
    }

    const key = String(req.headers['x-idempotency-key'] || '').trim();
    if (options.requireHeader && !key) {
      return res.status(400).json({ message: 'X-Idempotency-Key is required for this operation' });
    }

    if (!key) {
      return next();
    }

    if (key.length < options.minKeyLength || key.length > options.maxKeyLength || !IDEMPOTENCY_KEY_REGEX.test(key)) {
      return res.status(400).json({ message: 'Invalid X-Idempotency-Key format' });
    }

    const actorKey = resolveActorKey(req);
    const keyHash = hashValue(key);
    const keyPrefix = key.slice(0, 8);
    const requestHash = hashValue(`${method}:${path}:${bodyHash}:${actorKey}`);

    try {
      const claim = await claimRecord({
        scope,
        actorKey,
        keyHash,
        keyPrefix,
        method,
        path,
        bodyHash,
        requestHash,
        options
      });

      if (claim.action === 'blocked_payload_mismatch') {
        await recordIdempotencyIncident(req, {
          eventType: 'idempotency_payload_mismatch_blocked',
          riskScore: 84,
          recommendedAction: 'deny_duplicate',
          action: 'deny_duplicate',
          note: 'Idempotency key reused with different payload',
          signals: {
            scope,
            path,
            method
          },
          metadata: {
            actorKey,
            keyHash
          }
        });
        return res.status(409).json({ message: 'Idempotency key already used with different payload' });
      }

      if (claim.action === 'blocked_in_progress') {
        return res.status(409).json({ message: 'Request with same idempotency key is already in progress' });
      }

      if (claim.action === 'blocked_replay') {
        await recordIdempotencyIncident(req, {
          eventType: 'idempotency_replay_blocked',
          riskScore: 76,
          recommendedAction: 'deny_duplicate',
          action: 'deny_duplicate',
          note: 'Duplicate idempotent replay blocked',
          signals: {
            scope,
            path,
            method
          },
          metadata: {
            actorKey,
            keyHash
          }
        });
        return res.status(409).json({ message: 'Duplicate idempotency request blocked' });
      }

      const recordId = claim.record && claim.record._id ? String(claim.record._id) : '';
      if (recordId) {
        res.on('finish', () => {
          Promise.resolve(finalizeRecord(recordId, res.statusCode, options)).catch(() => {});
        });
      }

      return next();
    } catch (error) {
      if (options.failOpen) {
        await recordIdempotencyIncident(req, {
          eventType: 'idempotency_shield_degraded',
          riskScore: 50,
          recommendedAction: 'monitor',
          action: 'allow_with_warning',
          note: 'Idempotency shield degraded; request allowed due to fail-open',
          signals: {
            scope,
            path,
            method
          },
          metadata: {
            message: String(error && error.message ? error.message : error)
          }
        });
        return next();
      }
      return res.status(503).json({ message: 'Idempotency shield unavailable' });
    }
  };
}

function toResponseRow(item) {
  const lockUntilMs = item?.lockUntil ? new Date(item.lockUntil).getTime() : 0;
  const expiresAtMs = item?.expiresAt ? new Date(item.expiresAt).getTime() : 0;
  const now = nowTs();
  return {
    id: String(item?._id || ''),
    scope: String(item?.scope || ''),
    actorKey: String(item?.actorKey || ''),
    keyHash: String(item?.keyHash || ''),
    keyPrefix: String(item?.keyPrefix || ''),
    path: String(item?.path || ''),
    method: String(item?.method || ''),
    status: String(item?.status || ''),
    hitCount: Number(item?.hitCount || 0),
    lastStatusCode: Number(item?.lastStatusCode || 0) || null,
    active: expiresAtMs > now,
    processingActive: lockUntilMs > now,
    lockUntil: lockUntilMs ? new Date(lockUntilMs).toISOString() : null,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    firstSeenAt: item?.firstSeenAt ? new Date(item.firstSeenAt).toISOString() : null,
    lastSeenAt: item?.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
    lastReason: String(item?.lastReason || '')
  };
}

async function getIdempotencyShieldSnapshot(options = {}) {
  const includeExpired = Boolean(options.includeExpired);
  const scope = String(options.scope || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));

  const query = {};
  if (!includeExpired) {
    query.expiresAt = { $gt: new Date() };
  }
  if (scope) {
    query.scope = scope;
  }

  const rows = await IdempotencyShieldRecord.find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const items = rows.map(toResponseRow);
  return {
    generatedAt: new Date().toISOString(),
    scope: scope || null,
    count: items.length,
    processingActive: items.filter((item) => item.processingActive).length,
    items
  };
}

async function releaseIdempotencyShieldRecords(payload = {}) {
  const id = String(payload.id || '').trim();
  const keyHash = String(payload.keyHash || '').trim().toLowerCase();
  const actorKey = String(payload.actorKey || '').trim().toLowerCase();
  const scope = String(payload.scope || '').trim().toLowerCase();
  const clearAll = Boolean(payload.clearAll);

  if (clearAll) {
    const query = {};
    if (scope) {
      query.scope = scope;
    }
    const result = await IdempotencyShieldRecord.deleteMany(query);
    return {
      clearAll: true,
      releasedCount: Number(result?.deletedCount || 0)
    };
  }

  if (id) {
    const result = await IdempotencyShieldRecord.deleteOne({ _id: id });
    return {
      clearAll: false,
      releasedCount: Number(result?.deletedCount || 0)
    };
  }

  const query = {};
  if (scope) query.scope = scope;
  if (keyHash) query.keyHash = keyHash;
  if (actorKey) query.actorKey = actorKey;

  const result = await IdempotencyShieldRecord.deleteMany(query);
  return {
    clearAll: false,
    releasedCount: Number(result?.deletedCount || 0)
  };
}

module.exports = {
  idempotencyEnforcementMiddleware,
  getIdempotencyShieldSnapshot,
  releaseIdempotencyShieldRecords,
  isIdempotencyShieldSha256: isSha256
};
