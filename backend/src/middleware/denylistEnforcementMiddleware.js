const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const SecurityIncident = require('../models/SecurityIncident');
const SecurityDenylistEntry = require('../models/SecurityDenylistEntry');
const { getClientIp, getCountry, getDeviceMeta } = require('../utils/device');

const SCOPE_SET = new Set(['all', 'auth', 'wallet', 'booking', 'security', 'admin', 'sensitive']);
const TARGET_TYPE_SET = new Set(['ip', 'user', 'device', 'email']);
const SHA256_REGEX = /^[a-f0-9]{64}$/i;
const MAX_CACHE_ROWS = 5000;
const evaluationCache = new Map();

function nowTs() {
  return Date.now();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
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

function normalizeScope(value, fallback = 'all') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return SCOPE_SET.has(normalized) ? normalized : fallback;
}

function normalizeTargetType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!TARGET_TYPE_SET.has(normalized)) {
    const error = new Error('targetType must be one of ip, user, device, email');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
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
  return ip;
}

function normalizeTargetValue(type, value) {
  const raw = String(value || '').trim();
  if (!raw) {
    const error = new Error('targetValue is required');
    error.statusCode = 400;
    throw error;
  }

  if (type === 'ip') {
    const normalizedIp = normalizeIp(raw);
    if (!normalizedIp) {
      const error = new Error('Invalid IP value');
      error.statusCode = 400;
      throw error;
    }
    return normalizedIp.toLowerCase();
  }

  if (type === 'email') {
    return raw.toLowerCase();
  }

  if (type === 'device') {
    return raw.toLowerCase();
  }

  return raw.toLowerCase();
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return Object.fromEntries(Object.entries(metadata).slice(0, 40));
}

function getTargetPreview(type, normalizedValue) {
  if (type === 'email') {
    const [local, domain] = String(normalizedValue || '').split('@');
    const left = String(local || '');
    if (!domain) return `${left.slice(0, 2)}***`;
    return `${left.slice(0, 2)}***@${domain}`;
  }
  if (type === 'device') {
    return `${String(normalizedValue || '').slice(0, 10)}...`;
  }
  if (type === 'user') {
    return `${String(normalizedValue || '').slice(0, 16)}`;
  }
  return String(normalizedValue || '');
}

function buildOptions(input = {}) {
  const prefixes = normalizeCsv(input.protectedPrefixes)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    enabled: normalizeBoolean(input.enabled, true),
    failOpen: normalizeBoolean(input.failOpen, false),
    cacheTtlMs: normalizeNumber(input.cacheTtlMs, 5000, 500, 60 * 1000),
    protectedPrefixes: prefixes.length
      ? prefixes
      : ['/api/auth', '/api/wallet', '/api/wallets', '/api/bookings', '/api/security', '/api/admin']
  };
}

function pruneCache() {
  const ts = nowTs();
  for (const [key, value] of evaluationCache.entries()) {
    if (!value || Number(value.expiresAt || 0) <= ts) {
      evaluationCache.delete(key);
    }
  }
  if (evaluationCache.size > MAX_CACHE_ROWS) {
    const keys = Array.from(evaluationCache.keys());
    const removeCount = evaluationCache.size - MAX_CACHE_ROWS;
    for (let i = 0; i < removeCount; i += 1) {
      evaluationCache.delete(keys[i]);
    }
  }
}

function clearDenylistEvaluationCache() {
  evaluationCache.clear();
}

function shouldEvaluatePath(path, options) {
  const normalizedPath = String(path || '').trim().toLowerCase();
  if (!normalizedPath) return false;
  return options.protectedPrefixes.some((prefix) => normalizedPath.startsWith(prefix));
}

function resolveRequestScopes(path) {
  const normalizedPath = String(path || '').trim().toLowerCase();
  const scopes = new Set(['all']);

  if (normalizedPath.startsWith('/api/auth')) {
    scopes.add('auth');
    scopes.add('sensitive');
  }
  if (normalizedPath.startsWith('/api/wallet')) {
    scopes.add('wallet');
    scopes.add('sensitive');
  }
  if (normalizedPath.startsWith('/api/wallets')) {
    scopes.add('wallet');
    scopes.add('sensitive');
  }
  if (normalizedPath.startsWith('/api/bookings')) {
    scopes.add('booking');
    scopes.add('sensitive');
  }
  if (normalizedPath.startsWith('/api/security')) {
    scopes.add('security');
    scopes.add('sensitive');
  }
  if (normalizedPath.startsWith('/api/admin')) {
    scopes.add('admin');
    scopes.add('sensitive');
  }

  return Array.from(scopes);
}

function getTargetPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
}

function resolveBearerUserId(req) {
  const bearer = String(req.headers.authorization || '').trim();
  if (!bearer.startsWith('Bearer ')) return '';
  const token = bearer.slice(7).trim();
  if (!token || token.length > 5000) return '';

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    return String(payload?.sub || '').trim();
  } catch (_error) {
    return '';
  }
}

function buildCandidatePairs(req) {
  const pairs = [];
  const path = getTargetPath(req);
  const ip = normalizeIp(getClientIp(req) || '');
  if (ip) {
    pairs.push({ targetType: 'ip', targetHash: hashValue(ip), rawValue: ip });
  }

  const userIdFromReq = String(req.user?.id || req.auth?.id || '').trim();
  const userIdFromBearer = userIdFromReq || resolveBearerUserId(req);
  if (userIdFromBearer) {
    pairs.push({ targetType: 'user', targetHash: hashValue(userIdFromBearer.toLowerCase()), rawValue: userIdFromBearer.toLowerCase() });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email) {
    pairs.push({ targetType: 'email', targetHash: hashValue(email), rawValue: email });
  }

  const providedFingerprint = String(req.headers['x-device-fingerprint'] || '').trim().toLowerCase();
  const deviceFingerprint = providedFingerprint || String(getDeviceMeta(req).fingerprint || '').trim().toLowerCase();
  if (deviceFingerprint) {
    pairs.push({ targetType: 'device', targetHash: hashValue(deviceFingerprint), rawValue: deviceFingerprint });
  }

  return {
    path,
    pairs
  };
}

function buildCacheKey(path, scopes, pairs) {
  const scopePart = scopes.slice().sort().join(',');
  const pairPart = pairs
    .map((item) => `${item.targetType}:${item.targetHash}`)
    .sort()
    .join('|');
  return `${path}#${scopePart}#${pairPart}`;
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

async function recordDenylistIncident(req, payload = {}) {
  try {
    const actor = req.user || req.auth || {};
    const ip = getClientIp(req);
    const country = getCountry(req);
    const device = getDeviceMeta(req);

    await SecurityIncident.create({
      source: 'gateway',
      eventType: payload.eventType || 'denylist_shield_blocked',
      userId: actor.id || actor.sub || actor._id || null,
      email: actor.email || req.body?.email || null,
      ip,
      city: req.headers['x-city'] || country || 'unknown',
      deviceFingerprint: device.fingerprint,
      riskScore: payload.riskScore || 82,
      severity: severityFromScore(payload.riskScore || 82),
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
          action: 'denylist_shield_blocked',
          note: payload.note || 'Request blocked by denylist shield'
        }
      ]
    });
  } catch (_error) {
    // best effort
  }
}

async function findMatchedEntry(path, scopes, pairs) {
  if (!pairs.length) {
    return null;
  }

  const now = new Date();
  const pairScopes = [];
  for (let i = 0; i < pairs.length; i += 1) {
    for (let j = 0; j < scopes.length; j += 1) {
      pairScopes.push({
        targetType: pairs[i].targetType,
        targetHash: pairs[i].targetHash,
        scope: scopes[j]
      });
    }
  }

  const query = {
    status: 'active',
    activeFrom: { $lte: now },
    $or: [
      { activeUntil: null },
      { activeUntil: { $gt: now } }
    ],
    $and: [
      { $or: pairScopes }
    ]
  };

  const entry = await SecurityDenylistEntry.findOne(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  return entry || null;
}

async function registerEntryHit(entryId, req, path) {
  if (!entryId) return;
  const user = req.user || req.auth || {};
  await SecurityDenylistEntry.updateOne(
    { _id: entryId },
    {
      $set: {
        lastHitAt: new Date(),
        lastHitPath: String(path || ''),
        lastHitIp: normalizeIp(getClientIp(req) || ''),
        lastHitUserId: String(user.id || user.sub || user._id || '')
      },
      $inc: { hitCount: 1 }
    }
  );
}

function denylistEnforcementMiddleware(userOptions = {}) {
  const options = buildOptions(userOptions);

  return async (req, res, next) => {
    if (!options.enabled) {
      return next();
    }

    try {
      const { path, pairs } = buildCandidatePairs(req);
      if (!shouldEvaluatePath(path, options)) {
        return next();
      }

      const scopes = resolveRequestScopes(path);
      const cacheKey = buildCacheKey(path, scopes, pairs);
      const cached = evaluationCache.get(cacheKey);
      const ts = nowTs();
      if (cached && Number(cached.expiresAt || 0) > ts) {
        if (cached.blocked && cached.entry) {
          Promise.resolve(registerEntryHit(cached.entry._id, req, path)).catch(() => {});
          Promise.resolve(recordDenylistIncident(req, {
            eventType: 'denylist_shield_blocked_cached',
            riskScore: 85,
            recommendedAction: 'deny_request',
            action: 'deny_request',
            note: 'Request blocked by denylist shield cache',
            signals: {
              path,
              method: req.method,
              scope: cached.entry.scope,
              targetType: cached.entry.targetType
            },
            metadata: {
              denylistEntryId: String(cached.entry._id || '')
            }
          })).catch(() => {});
          return res.status(403).json({ message: 'Request blocked by security denylist policy' });
        }
        return next();
      }

      const matched = await findMatchedEntry(path, scopes, pairs);
      pruneCache();
      evaluationCache.set(cacheKey, {
        blocked: Boolean(matched),
        entry: matched || null,
        expiresAt: ts + options.cacheTtlMs
      });

      if (matched) {
        Promise.resolve(registerEntryHit(matched._id, req, path)).catch(() => {});
        Promise.resolve(recordDenylistIncident(req, {
          eventType: 'denylist_shield_blocked',
          riskScore: 88,
          recommendedAction: 'deny_request',
          action: 'deny_request',
          note: 'Request blocked by denylist shield',
          signals: {
            path,
            method: req.method,
            scope: matched.scope,
            targetType: matched.targetType
          },
          metadata: {
            denylistEntryId: String(matched._id || ''),
            targetPreview: String(matched.targetPreview || '')
          }
        })).catch(() => {});
        return res.status(403).json({ message: 'Request blocked by security denylist policy' });
      }

      return next();
    } catch (_error) {
      if (options.failOpen) {
        return next();
      }
      return res.status(503).json({ message: 'Denylist shield unavailable' });
    }
  };
}

async function addOrUpdateDenylistEntry(payload = {}) {
  const targetType = normalizeTargetType(payload.targetType);
  const targetValue = normalizeTargetValue(targetType, payload.targetValue);
  const targetHash = hashValue(targetValue);
  const scope = normalizeScope(payload.scope, 'all');
  const status = String(payload.status || 'active').trim().toLowerCase() === 'disabled' ? 'disabled' : 'active';

  const now = new Date();
  const activeFrom = payload.activeFrom ? new Date(payload.activeFrom) : now;
  const fallbackDurationMs = normalizeNumber(payload.defaultDurationMs || payload.durationMs || 0, 0, 0, 365 * 24 * 60 * 60 * 1000);
  const activeUntil = payload.activeUntil
    ? new Date(payload.activeUntil)
    : (fallbackDurationMs > 0 ? new Date(nowTs() + fallbackDurationMs) : null);

  const actorUserId = payload.actorUserId || null;
  const actorIp = normalizeIp(payload.actorIp || '');

  const entry = await SecurityDenylistEntry.findOneAndUpdate(
    { targetType, targetHash, scope },
    {
      $set: {
        targetPreview: getTargetPreview(targetType, targetValue),
        status,
        reason: String(payload.reason || 'manual_denylist_entry').trim().slice(0, 200) || 'manual_denylist_entry',
        source: String(payload.source || 'admin').trim().toLowerCase(),
        activeFrom: Number.isFinite(activeFrom.getTime()) ? activeFrom : now,
        activeUntil: activeUntil && Number.isFinite(activeUntil.getTime()) ? activeUntil : null,
        updatedByUserId: actorUserId,
        updatedByIp: actorIp,
        metadata: sanitizeMetadata(payload.metadata)
      },
      $setOnInsert: {
        createdByUserId: actorUserId,
        createdByIp: actorIp,
        hitCount: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  clearDenylistEvaluationCache();
  return entry;
}

async function getDenylistSnapshot(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  const scope = String(options.scope || '').trim().toLowerCase();
  const targetType = String(options.targetType || '').trim().toLowerCase();

  const query = {};
  if (scope && SCOPE_SET.has(scope)) {
    query.scope = scope;
  }
  if (targetType && TARGET_TYPE_SET.has(targetType)) {
    query.targetType = targetType;
  }

  const now = new Date();
  if (!includeInactive) {
    query.status = 'active';
    query.activeFrom = { $lte: now };
    query.$or = [{ activeUntil: null }, { activeUntil: { $gt: now } }];
  }

  const rows = await SecurityDenylistEntry.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    activeCount: rows.filter((item) => {
      const activeFromMs = item.activeFrom ? new Date(item.activeFrom).getTime() : 0;
      const activeUntilMs = item.activeUntil ? new Date(item.activeUntil).getTime() : 0;
      const ts = nowTs();
      const withinStart = !activeFromMs || activeFromMs <= ts;
      const beforeEnd = !activeUntilMs || activeUntilMs > ts;
      return item.status === 'active' && withinStart && beforeEnd;
    }).length,
    items: rows.map((item) => ({
      id: String(item._id),
      targetType: String(item.targetType || ''),
      targetHash: String(item.targetHash || ''),
      targetPreview: String(item.targetPreview || ''),
      scope: String(item.scope || ''),
      status: String(item.status || ''),
      reason: String(item.reason || ''),
      source: String(item.source || ''),
      activeFrom: item.activeFrom ? new Date(item.activeFrom).toISOString() : null,
      activeUntil: item.activeUntil ? new Date(item.activeUntil).toISOString() : null,
      hitCount: Number(item.hitCount || 0),
      lastHitAt: item.lastHitAt ? new Date(item.lastHitAt).toISOString() : null,
      lastHitPath: String(item.lastHitPath || ''),
      lastHitIp: String(item.lastHitIp || ''),
      lastHitUserId: String(item.lastHitUserId || ''),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
    }))
  };
}

async function releaseDenylistEntries(payload = {}) {
  const clearAll = Boolean(payload.clearAll);
  const id = String(payload.id || '').trim();
  const targetType = String(payload.targetType || '').trim().toLowerCase();
  const targetHash = String(payload.targetHash || '').trim().toLowerCase();
  const scope = String(payload.scope || '').trim().toLowerCase();
  const actorUserId = payload.actorUserId || null;
  const actorIp = normalizeIp(payload.actorIp || '');

  const query = {};
  if (!clearAll) {
    if (id) {
      query._id = id;
    }
    if (targetType && TARGET_TYPE_SET.has(targetType)) {
      query.targetType = targetType;
    }
    if (targetHash && isSha256(targetHash)) {
      query.targetHash = targetHash;
    }
    if (scope && SCOPE_SET.has(scope)) {
      query.scope = scope;
    }
  }

  const result = await SecurityDenylistEntry.updateMany(
    clearAll ? {} : query,
    {
      $set: {
        status: 'disabled',
        updatedByUserId: actorUserId,
        updatedByIp: actorIp
      }
    }
  );

  clearDenylistEvaluationCache();
  return {
    clearAll,
    updatedCount: Number(result?.modifiedCount || 0),
    matchedCount: Number(result?.matchedCount || 0)
  };
}

module.exports = {
  denylistEnforcementMiddleware,
  addOrUpdateDenylistEntry,
  getDenylistSnapshot,
  releaseDenylistEntries,
  isDenylistSha256: isSha256,
  clearDenylistEvaluationCache
};
