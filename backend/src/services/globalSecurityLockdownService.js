const GlobalSecurityLockdownState = require('../models/GlobalSecurityLockdownState');
const env = require('../config/env');

const LOCK_KEY = 'global';

function nowTs() {
  return Date.now();
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeReason(value, fallback = 'manual_global_lockdown') {
  const normalized = String(value || '').trim().slice(0, 220);
  return normalized || fallback;
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).slice(0, 50));
}

function computeDurationMs(inputMs) {
  const defaultMs = normalizeNumber(env.globalLockdownDefaultDurationMs, 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000);
  const maxMs = normalizeNumber(env.globalLockdownMaxDurationMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000);
  const candidate = normalizeNumber(inputMs, defaultMs, 60 * 1000, maxMs);
  return Math.min(candidate, maxMs);
}

function normalizeDate(value, fallbackMs) {
  if (!value) return new Date(fallbackMs);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(fallbackMs);
  return date;
}

function buildStatus(lock = null) {
  const now = nowTs();
  const activeFromMs = lock?.activeFrom ? new Date(lock.activeFrom).getTime() : 0;
  const activeUntilMs = lock?.activeUntil ? new Date(lock.activeUntil).getTime() : 0;
  const activeFlag = String(lock?.status || '').toLowerCase() === 'active';
  const started = !activeFromMs || activeFromMs <= now;
  const notExpired = !activeUntilMs || activeUntilMs > now;
  const active = Boolean(activeFlag && started && notExpired);
  return {
    active,
    reason: String(lock?.reason || ''),
    source: String(lock?.source || ''),
    activeFrom: activeFromMs ? new Date(activeFromMs).toISOString() : null,
    activeUntil: activeUntilMs ? new Date(activeUntilMs).toISOString() : null,
    remainingMs: activeUntilMs ? Math.max(0, activeUntilMs - now) : null,
    blockCount: Number(lock?.blockCount || 0),
    lastBlockedAt: lock?.lastBlockedAt ? new Date(lock.lastBlockedAt).toISOString() : null,
    lastBlockedIp: String(lock?.lastBlockedIp || ''),
    lastBlockedPath: String(lock?.lastBlockedPath || ''),
    updatedAt: lock?.updatedAt ? new Date(lock.updatedAt).toISOString() : null
  };
}

async function getGlobalLockdownStatus() {
  const lock = await GlobalSecurityLockdownState.findOne({ lockKey: LOCK_KEY }).lean();
  return {
    generatedAt: new Date().toISOString(),
    lockKey: LOCK_KEY,
    ...buildStatus(lock)
  };
}

async function activateGlobalLockdown({
  durationMs = null,
  activeUntil = null,
  reason = '',
  source = 'admin',
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const now = nowTs();
  const fallbackUntil = now + computeDurationMs(durationMs);
  const requestedUntil = normalizeDate(activeUntil, fallbackUntil).getTime();
  const maxUntil = now + normalizeNumber(env.globalLockdownMaxDurationMs, 24 * 60 * 60 * 1000, 10 * 60 * 1000, 30 * 24 * 60 * 60 * 1000);
  const effectiveUntilMs = Math.max(now + 60 * 1000, Math.min(requestedUntil, maxUntil));
  const nowDate = new Date(now);
  const untilDate = new Date(effectiveUntilMs);

  const doc = await GlobalSecurityLockdownState.findOneAndUpdate(
    { lockKey: LOCK_KEY },
    {
      $set: {
        status: 'active',
        activeFrom: nowDate,
        activeUntil: untilDate,
        reason: normalizeReason(reason, 'manual_global_lockdown'),
        source: String(source || 'admin').trim().toLowerCase(),
        updatedByUserId: actorUserId || null,
        updatedByIp: String(actorIp || '').trim(),
        metadata: sanitizeMetadata(metadata)
      },
      $setOnInsert: {
        lockKey: LOCK_KEY,
        blockCount: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    lockKey: LOCK_KEY,
    ...buildStatus(doc)
  };
}

async function releaseGlobalLockdown({
  reason = '',
  source = 'admin',
  actorUserId = null,
  actorIp = '',
  metadata = {}
} = {}) {
  const nowDate = new Date();

  const doc = await GlobalSecurityLockdownState.findOneAndUpdate(
    { lockKey: LOCK_KEY },
    {
      $set: {
        status: 'released',
        activeUntil: nowDate,
        reason: normalizeReason(reason, 'manual_global_lockdown_release'),
        source: String(source || 'admin').trim().toLowerCase(),
        updatedByUserId: actorUserId || null,
        updatedByIp: String(actorIp || '').trim(),
        metadata: sanitizeMetadata(metadata)
      },
      $setOnInsert: {
        lockKey: LOCK_KEY,
        activeFrom: nowDate,
        blockCount: 0
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    lockKey: LOCK_KEY,
    ...buildStatus(doc)
  };
}

async function registerGlobalLockdownBlock({ path = '', ip = '' } = {}) {
  await GlobalSecurityLockdownState.updateOne(
    { lockKey: LOCK_KEY },
    {
      $set: {
        lastBlockedAt: new Date(),
        lastBlockedPath: String(path || '').slice(0, 260),
        lastBlockedIp: String(ip || '').slice(0, 120)
      },
      $inc: {
        blockCount: 1
      }
    },
    { upsert: true }
  );
}

module.exports = {
  LOCK_KEY,
  getGlobalLockdownStatus,
  activateGlobalLockdown,
  releaseGlobalLockdown,
  registerGlobalLockdownBlock
};
