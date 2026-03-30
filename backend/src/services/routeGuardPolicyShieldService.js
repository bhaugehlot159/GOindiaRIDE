const SecurityRouteGuardPolicy = require('../models/SecurityRouteGuardPolicy');
const env = require('../config/env');

const METHOD_SET = new Set(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE', '*']);

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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

function normalizeRoutePrefix(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    const error = new Error('routePrefix is required');
    error.statusCode = 400;
    throw error;
  }

  let prefix = normalized.startsWith('/') ? normalized : `/${normalized}`;
  if (!prefix.startsWith('/api/')) {
    const error = new Error('routePrefix must start with /api/');
    error.statusCode = 400;
    throw error;
  }

  if (prefix.length > 200) {
    const error = new Error('routePrefix is too long');
    error.statusCode = 400;
    throw error;
  }

  if (prefix.endsWith('/')) {
    prefix = prefix.slice(0, -1);
  }

  return prefix;
}

function normalizeMethods(methodsInput, methodInput) {
  let methods = [];

  if (Array.isArray(methodsInput) && methodsInput.length) {
    methods = methodsInput;
  } else if (String(methodInput || '').trim()) {
    methods = [methodInput];
  } else {
    methods = ['POST'];
  }

  const normalized = Array.from(new Set(
    methods
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  )).sort();

  if (!normalized.length) {
    const error = new Error('At least one HTTP method is required');
    error.statusCode = 400;
    throw error;
  }

  for (let i = 0; i < normalized.length; i += 1) {
    if (!METHOD_SET.has(normalized[i])) {
      const error = new Error(`Unsupported method: ${normalized[i]}`);
      error.statusCode = 400;
      throw error;
    }
  }

  return normalized;
}

function normalizeDate(value, fallbackMs) {
  if (!value) return new Date(fallbackMs);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(fallbackMs);
  return date;
}

function normalizeObjectIdOrNull(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^[a-f0-9]{24}$/i.test(normalized)) return null;
  return normalized;
}

async function addOrUpdateRouteGuardPolicy(payload = {}) {
  const routePrefix = normalizeRoutePrefix(payload.routePrefix);
  const methods = normalizeMethods(payload.methods, payload.method);
  const priority = normalizeNumber(payload.priority, 100, 0, 1000);
  const reason = String(payload.reason || '').trim().slice(0, 220) || 'admin_manual_route_guard';
  const source = String(payload.source || 'admin').trim().toLowerCase() || 'admin';

  const actorUserId = normalizeObjectIdOrNull(payload.actorUserId);
  const actorIp = normalizeIp(payload.actorIp || '');

  const now = nowTs();
  const activeFrom = normalizeDate(payload.activeFrom, now);
  const defaultDurationMs = normalizeNumber(
    env.routeGuardPolicyDefaultDurationMs,
    60 * 60 * 1000,
    60 * 1000,
    365 * 24 * 60 * 60 * 1000
  );
  const maxDurationMs = normalizeNumber(
    env.routeGuardPolicyMaxDurationMs,
    24 * 60 * 60 * 1000,
    60 * 1000,
    365 * 24 * 60 * 60 * 1000
  );
  const durationMs = normalizeNumber(
    payload.durationMs,
    defaultDurationMs,
    0,
    maxDurationMs
  );
  const activeUntil = payload.activeUntil
    ? normalizeDate(payload.activeUntil, now + durationMs)
    : (durationMs > 0 ? new Date(now + durationMs) : null);

  const doc = await SecurityRouteGuardPolicy.findOneAndUpdate(
    {
      routePrefix,
      methods,
      mode: 'block'
    },
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

async function getRouteGuardPolicySnapshot({ includeInactive = false, status = '', routePrefix = '', limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedRoutePrefix = String(routePrefix || '').trim().toLowerCase();

  const query = {};
  if (normalizedStatus) {
    query.status = normalizedStatus;
  }
  if (normalizedRoutePrefix) {
    query.routePrefix = { $regex: `^${normalizedRoutePrefix}` };
  }

  if (!includeInactive && !normalizedStatus) {
    query.status = 'active';
    const now = new Date();
    query.activeFrom = { $lte: now };
    query.$or = [
      { activeUntil: null },
      { activeUntil: { $gt: now } }
    ];
  }

  const rows = await SecurityRouteGuardPolicy.find(query)
    .sort({ priority: -1, updatedAt: -1, createdAt: -1 })
    .limit(normalizedLimit)
    .lean();

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    activeCount: rows.filter((item) => {
      const activeFromMs = item.activeFrom ? new Date(item.activeFrom).getTime() : 0;
      const activeUntilMs = item.activeUntil ? new Date(item.activeUntil).getTime() : 0;
      const ts = nowTs();
      const afterStart = !activeFromMs || activeFromMs <= ts;
      const beforeEnd = !activeUntilMs || activeUntilMs > ts;
      return item.status === 'active' && afterStart && beforeEnd;
    }).length,
    items: rows.map((item) => ({
      id: String(item._id || ''),
      routePrefix: String(item.routePrefix || ''),
      methods: Array.isArray(item.methods) ? item.methods : [],
      mode: String(item.mode || ''),
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

async function releaseRouteGuardPolicies({ id = '', routePrefix = '', clearAll = false, actorUserId = null, actorIp = '' } = {}) {
  const normalizedId = String(id || '').trim();
  const normalizedRoutePrefix = String(routePrefix || '').trim().toLowerCase();
  const normalizedActorUserId = normalizeObjectIdOrNull(actorUserId);
  const normalizedActorIp = normalizeIp(actorIp || '');

  const query = {};
  if (!clearAll) {
    if (normalizedId) query._id = normalizedId;
    if (normalizedRoutePrefix) query.routePrefix = { $regex: `^${normalizedRoutePrefix}` };
  }

  const result = await SecurityRouteGuardPolicy.updateMany(
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
  addOrUpdateRouteGuardPolicy,
  getRouteGuardPolicySnapshot,
  releaseRouteGuardPolicies
};
