const crypto = require('crypto');
const AdminAuditChainEntry = require('../models/AdminAuditChainEntry');
const env = require('../config/env');

const GENESIS_HASH = 'GENESIS';
const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function signHash(value) {
  const secret = String(env.adminAuditChainSecret || env.jwtSecret || '');
  return crypto.createHmac('sha256', secret).update(String(value || '')).digest('hex');
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).slice(0, 50));
}

function canonicalStringify(input) {
  if (input === null || input === undefined) return 'null';
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) {
    return `[${input.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(input).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(input[key])}`).join(',')}}`;
}

function computeAuditPayloadHash(payload = {}) {
  const compact = {
    body: payload.body || {},
    query: payload.query || {},
    params: payload.params || {}
  };
  return hashValue(canonicalStringify(compact));
}

function normalizeString(value, maxLen = 200) {
  return String(value || '').trim().slice(0, maxLen);
}

function buildHashBase(entry = {}) {
  return canonicalStringify({
    auditTimestamp: normalizeString(entry.auditTimestamp, 64),
    prevHash: normalizeString(entry.prevHash, 128),
    action: normalizeString(entry.action, 120),
    routePath: normalizeString(entry.routePath, 220),
    method: normalizeString(entry.method, 20).toUpperCase(),
    actorUserId: normalizeString(entry.actorUserId, 120),
    actorRole: normalizeString(entry.actorRole, 40),
    actorEmail: normalizeString(entry.actorEmail, 180),
    actorIp: normalizeString(entry.actorIp, 120),
    requestId: normalizeString(entry.requestId, 120),
    payloadHash: normalizeString(entry.payloadHash, 128),
    statusCode: Number.isFinite(Number(entry.statusCode)) ? Number(entry.statusCode) : null,
    outcome: normalizeString(entry.outcome, 50)
  });
}

function normalizeOutcome(statusCode) {
  const code = Number(statusCode || 0);
  if (code >= 500) return 'server_error';
  if (code >= 400) return 'blocked_or_failed';
  if (code >= 300) return 'redirected';
  if (code >= 200) return 'ok';
  return 'unknown';
}

async function appendAdminAuditChainEntry(payload = {}) {
  const latest = await AdminAuditChainEntry.findOne({})
    .sort({ auditTimestamp: -1, _id: -1 })
    .select('entryHash')
    .lean();

  const now = new Date();
  const prevHash = latest?.entryHash || GENESIS_HASH;
  const statusCode = Number(payload.statusCode || 0) || null;
  const entrySeed = {
    auditTimestamp: now.toISOString(),
    prevHash,
    action: normalizeString(payload.action, 120) || 'admin_action',
    routePath: normalizeString(payload.routePath, 220),
    method: normalizeString(payload.method, 20).toUpperCase(),
    actorUserId: normalizeString(payload.actorUserId, 120),
    actorRole: normalizeString(payload.actorRole, 40),
    actorEmail: normalizeString(payload.actorEmail, 180),
    actorIp: normalizeString(payload.actorIp, 120),
    requestId: normalizeString(payload.requestId, 120),
    payloadHash: normalizeString(payload.payloadHash, 128),
    statusCode,
    outcome: normalizeString(payload.outcome, 50) || normalizeOutcome(statusCode)
  };

  const entryHash = hashValue(buildHashBase(entrySeed));
  const entrySignature = signHash(entryHash);

  const doc = await AdminAuditChainEntry.create({
    auditTimestamp: now,
    prevHash,
    entryHash,
    entrySignature,
    action: entrySeed.action,
    routePath: entrySeed.routePath,
    method: entrySeed.method,
    actorUserId: entrySeed.actorUserId,
    actorRole: entrySeed.actorRole,
    actorEmail: entrySeed.actorEmail,
    actorIp: entrySeed.actorIp,
    requestId: entrySeed.requestId,
    payloadHash: entrySeed.payloadHash,
    statusCode,
    outcome: entrySeed.outcome,
    metadata: sanitizeMetadata(payload.metadata)
  });

  return doc.toObject ? doc.toObject() : doc;
}

function toSnapshotRow(item = {}) {
  return {
    id: String(item._id || ''),
    auditTimestamp: item.auditTimestamp ? new Date(item.auditTimestamp).toISOString() : null,
    prevHash: String(item.prevHash || ''),
    entryHash: String(item.entryHash || ''),
    action: String(item.action || ''),
    routePath: String(item.routePath || ''),
    method: String(item.method || ''),
    actorUserId: String(item.actorUserId || ''),
    actorRole: String(item.actorRole || ''),
    actorEmail: String(item.actorEmail || ''),
    actorIp: String(item.actorIp || ''),
    requestId: String(item.requestId || ''),
    payloadHash: String(item.payloadHash || ''),
    statusCode: Number(item.statusCode || 0) || null,
    outcome: String(item.outcome || ''),
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
  };
}

async function getAdminAuditChainSnapshot(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 2000));
  const actorUserId = normalizeString(options.actorUserId, 120);
  const action = normalizeString(options.action, 120);

  const query = {};
  if (actorUserId) query.actorUserId = actorUserId;
  if (action) query.action = action;

  const rows = await AdminAuditChainEntry.find(query)
    .sort({ auditTimestamp: -1, _id: -1 })
    .limit(limit)
    .lean();

  const latestHash = rows.length ? String(rows[0].entryHash || '') : GENESIS_HASH;

  return {
    generatedAt: new Date().toISOString(),
    count: rows.length,
    latestHash,
    items: rows.map(toSnapshotRow)
  };
}

async function verifyAdminAuditChain(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 2000), Number(env.adminAuditChainMaxVerifyLimit || 10000)));
  const rows = await AdminAuditChainEntry.find({})
    .sort({ auditTimestamp: 1, _id: 1 })
    .limit(limit)
    .lean();

  let previousHash = GENESIS_HASH;
  const errors = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const expectedPrev = previousHash;
    const actualPrev = String(row.prevHash || '');
    if (actualPrev !== expectedPrev) {
      errors.push({
        id: String(row._id || ''),
        type: 'prev_hash_mismatch',
        expected: expectedPrev,
        actual: actualPrev
      });
    }

    const seed = {
      auditTimestamp: row.auditTimestamp ? new Date(row.auditTimestamp).toISOString() : '',
      prevHash: actualPrev,
      action: row.action,
      routePath: row.routePath,
      method: row.method,
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      actorEmail: row.actorEmail,
      actorIp: row.actorIp,
      requestId: row.requestId,
      payloadHash: row.payloadHash,
      statusCode: row.statusCode,
      outcome: row.outcome
    };

    const recomputedHash = hashValue(buildHashBase(seed));
    const storedHash = String(row.entryHash || '');
    if (recomputedHash !== storedHash) {
      errors.push({
        id: String(row._id || ''),
        type: 'entry_hash_mismatch',
        expected: recomputedHash,
        actual: storedHash
      });
    }

    const signatureOk = timingSafeEqual(String(row.entrySignature || ''), signHash(storedHash));
    if (!signatureOk) {
      errors.push({
        id: String(row._id || ''),
        type: 'signature_mismatch'
      });
    }

    previousHash = storedHash || previousHash;
  }

  return {
    generatedAt: new Date().toISOString(),
    checkedCount: rows.length,
    invalidCount: errors.length,
    ok: errors.length === 0,
    latestHash: rows.length ? String(rows[rows.length - 1].entryHash || '') : GENESIS_HASH,
    errors: errors.slice(0, 200)
  };
}

module.exports = {
  isAdminAuditChainSha256: isSha256,
  computeAuditPayloadHash,
  appendAdminAuditChainEntry,
  getAdminAuditChainSnapshot,
  verifyAdminAuditChain,
  GENESIS_HASH
};
