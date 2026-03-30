const SecurityNetworkIntelPolicy = require('../models/SecurityNetworkIntelPolicy');
const env = require('../config/env');

const TARGET_TYPES = new Set(['ip_prefix', 'asn_hint', 'country_code']);
const SCOPE_TYPES = new Set(['all', 'auth', 'wallet', 'booking', 'security', 'admin', 'sensitive']);

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeObjectIdOrNull(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^[a-f0-9]{24}$/i.test(normalized)) return null;
  return normalized;
}

function sanitizeMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return Object.fromEntries(Object.entries(input).slice(0, 40));
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

function normalizeScope(value, fallback = 'all') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (!SCOPE_TYPES.has(normalized)) {
    const error = new Error('scope must be one of all, auth, wallet, booking, security, admin, sensitive');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeTargetType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!TARGET_TYPES.has(normalized)) {
    const error = new Error('targetType must be one of ip_prefix, asn_hint, country_code');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function normalizeMatchValue(targetType, value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    const error = new Error('matchValue is required');
    error.statusCode = 400;
    throw error;
  }

  if (targetType === 'ip_prefix') {
    if (raw.length > 40 || !/^[0-9a-f.:/]+$/.test(raw)) {
      const error = new Error('Invalid ip_prefix matchValue');
      error.statusCode = 400;
      throw error;
    }
    return raw;
  }

  if (targetType === 'country_code') {
    const cc = raw.replace(/[^a-z]/g, '').slice(0, 2);
    if (!/^[a-z]{2}$/.test(cc)) {
      const error = new Error('country_code must be a 2-letter code');
      error.statusCode = 400;
      throw error;
    }
    return cc;
  }

  if (raw.length > 120) {
    const error = new Error('asn_hint matchValue is too long');
    error.statusCode = 400;
    throw error;
  }

  return raw;
}

function normalizeDate(value, fallbackMs) {
  if (!value) return new Date(fallbackMs);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(fallbackMs);
  return date;
}

async function addOrUpdateNetworkIntelPolicy(payload = {}) {
  const targetType = normalizeTargetType(payload.targetType);
  const matchValue = normalizeMatchValue(targetType, payload.matchValue);
  const scope = normalizeScope(payload.scope, 'all');
  const priority = normalizeNumber(payload.priority, 100, 0, 1000);
  const reason = String(payload.reason || '').trim().slice(0, 220) || 'admin_manual_network_intel_policy';
  const source = String(payload.source || 'admin').trim().toLowerCase() || 'admin';

  const actorUserId = normalizeObjectIdOrNull(payload.actorUserId);
  const actorIp = normalizeIp(payload.actorIp || '');

  const now = nowTs();
  const activeFrom = normalizeDate(payload.activeFrom, now);
  const defaultDurationMs = normalizeNumber(
    env.networkIntelDefaultDurationMs,
    24 * 60 * 60 * 1000,
    60 * 1000,
    365 * 24 * 60 * 60 * 1000
  );
  const maxDurationMs = normalizeNumber(
    env.networkIntelMaxDurationMs,
    7 * 24 * 60 * 60 * 1000,
    60 * 1000,
    365 * 24 * 60 * 60 * 1000
  );
  const durationMs = normalizeNumber(payload.durationMs, defaultDurationMs, 0, maxDurationMs);
  const activeUntil = payload.activeUntil
    ? normalizeDate(payload.activeUntil, now + durationMs)
    : (durationMs > 0 ? new Date(now + durationMs) : null);

  const doc = await SecurityNetworkIntelPolicy.findOneAndUpdate(
    { targetType, matchValue, scope },
    {
      $set: {
        status: 'active',
        priority,
        reason,
        source,
        activeFrom,
        activeUntil,
        metadata: sanitizeMetadata(payload.metadata),
        updatedByUserId: actorUserId,
        updatedByIp: actorIp
      },
      $setOnInsert: {
        createdByUserId: actorUserId,
        createdByIp: actorIp,
        hitCount: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

async function getNetworkIntelPolicySnapshot({ includeInactive = false, status = '', targetType = '', scope = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedType = String(targetType || '').trim().toLowerCase();
  const normalizedScope = String(scope || '').trim().toLowerCase();

  const query = {};
  if (normalizedStatus) {
    query.status = normalizedStatus;
  }
  if (normalizedType && TARGET_TYPES.has(normalizedType)) {
    query.targetType = normalizedType;
  }
  if (normalizedScope && SCOPE_TYPES.has(normalizedScope)) {
    query.scope = normalizedScope;
  }

  if (!includeInactive && !normalizedStatus) {
    query.status = 'active';
    const now = new Date();
    query.activeFrom = { $lte: now };
    query.$or = [{ activeUntil: null }, { activeUntil: { $gt: now } }];
  }

  const rows = await SecurityNetworkIntelPolicy.find(query)
    .sort({ priority: -1, updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    activeCount: rows.filter((item) => {
      const fromMs = item.activeFrom ? new Date(item.activeFrom).getTime() : 0;
      const untilMs = item.activeUntil ? new Date(item.activeUntil).getTime() : 0;
      const ts = nowTs();
      return item.status === 'active' && (!fromMs || fromMs <= ts) && (!untilMs || untilMs > ts);
    }).length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      targetType: String(item.targetType || ''),
      matchValue: String(item.matchValue || ''),
      scope: String(item.scope || ''),
      status: String(item.status || ''),
      priority: Number(item.priority || 0),
      reason: String(item.reason || ''),
      source: String(item.source || ''),
      activeFrom: item.activeFrom ? new Date(item.activeFrom).toISOString() : null,
      activeUntil: item.activeUntil ? new Date(item.activeUntil).toISOString() : null,
      hitCount: Number(item.hitCount || 0),
      lastHitAt: item.lastHitAt ? new Date(item.lastHitAt).toISOString() : null,
      lastHitPath: String(item.lastHitPath || ''),
      lastHitMethod: String(item.lastHitMethod || ''),
      lastHitIp: String(item.lastHitIp || ''),
      lastHitUserId: String(item.lastHitUserId || ''),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
    }))
  };
}

async function releaseNetworkIntelPolicies({ id = '', targetType = '', matchValue = '', scope = '', clearAll = false, actorUserId = null, actorIp = '' } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedType = String(targetType || '').trim().toLowerCase();
  const normalizedValue = String(matchValue || '').trim().toLowerCase();
  const normalizedScope = String(scope || '').trim().toLowerCase();
  const normalizedActorUserId = normalizeObjectIdOrNull(actorUserId);
  const normalizedActorIp = normalizeIp(actorIp || '');

  const query = {};
  if (!clearAll) {
    if (normalizedId) query._id = normalizedId;
    if (normalizedType && TARGET_TYPES.has(normalizedType)) query.targetType = normalizedType;
    if (normalizedValue) query.matchValue = normalizedValue;
    if (normalizedScope && SCOPE_TYPES.has(normalizedScope)) query.scope = normalizedScope;
  }

  const result = await SecurityNetworkIntelPolicy.updateMany(
    clearAll ? {} : query,
    {
      $set: {
        status: 'released',
        updatedByUserId: normalizedActorUserId,
        updatedByIp: normalizedActorIp
      }
    }
  );

  return {
    clearAll: Boolean(clearAll),
    matchedCount: Number(result?.matchedCount || 0),
    updatedCount: Number(result?.modifiedCount || 0)
  };
}

module.exports = {
  addOrUpdateNetworkIntelPolicy,
  getNetworkIntelPolicySnapshot,
  releaseNetworkIntelPolicies
};
