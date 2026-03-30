const crypto = require('crypto');
const AccessTokenRevocation = require('../models/AccessTokenRevocation');
const UserAccessTokenCutoff = require('../models/UserAccessTokenCutoff');
const env = require('../config/env');

const SHA256_REGEX = /^[a-f0-9]{64}$/i;

function nowTs() {
  return Date.now();
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function isSha256(value) {
  return SHA256_REGEX.test(String(value || ''));
}

function normalizeReason(value, fallback = 'manual_revocation') {
  const normalized = String(value || '').trim().slice(0, 200);
  return normalized || fallback;
}

function normalizeDate(value, fallbackMs) {
  if (!value) return new Date(fallbackMs);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(fallbackMs);
  return date;
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).slice(0, 40);
  return Object.fromEntries(entries);
}

function hashJti(jti) {
  return hashValue(jti);
}

function parseIatMs(payload = {}) {
  const iatSeconds = Number(payload.iat || 0);
  if (!Number.isFinite(iatSeconds) || iatSeconds <= 0) return 0;
  return Math.floor(iatSeconds * 1000);
}

async function checkAccessTokenRevocation({ payload = {}, userId = null } = {}) {
  const enforceJtiRevocation = Boolean(env.accessTokenRevocationEnabled);
  const enforceUserCutoff = Boolean(env.accessTokenCutoffEnabled);

  if (!enforceJtiRevocation && !enforceUserCutoff) {
    return { revoked: false, reason: '' };
  }

  const effectiveUserId = String(userId || payload.sub || '').trim();
  if (enforceUserCutoff && effectiveUserId) {
    const cutoff = await UserAccessTokenCutoff.findOne({ userId: effectiveUserId }).lean();
    if (cutoff && cutoff.revokeBefore) {
      const tokenIatMs = parseIatMs(payload);
      const cutoffMs = new Date(cutoff.revokeBefore).getTime();
      if (tokenIatMs > 0 && cutoffMs > 0 && tokenIatMs <= cutoffMs) {
        return {
          revoked: true,
          reason: 'user_cutoff',
          evidence: {
            revokeBefore: new Date(cutoffMs).toISOString(),
            tokenIat: new Date(tokenIatMs).toISOString()
          }
        };
      }
    }
  }

  if (enforceJtiRevocation) {
    const jti = String(payload.jti || '').trim();
    if (jti) {
      const jtiHash = hashJti(jti);
      const revocation = await AccessTokenRevocation.findOne({
        jtiHash,
        status: 'active',
        expiresAt: { $gt: new Date() }
      }).lean();

      if (revocation) {
        return {
          revoked: true,
          reason: 'jti_revoked',
          evidence: {
            revokedAt: revocation.revokedAt ? new Date(revocation.revokedAt).toISOString() : null,
            revocationReason: String(revocation.reason || ''),
            expiresAt: revocation.expiresAt ? new Date(revocation.expiresAt).toISOString() : null
          }
        };
      }
    }
  }

  return { revoked: false, reason: '' };
}

async function revokeAccessTokenByJti({
  jti = '',
  jtiHash = '',
  userId = null,
  reason = 'manual_revocation',
  source = 'admin',
  actorUserId = null,
  actorIp = '',
  expiresAt = null,
  metadata = {}
} = {}) {
  const normalizedJti = String(jti || '').trim();
  const normalizedProvidedHash = String(jtiHash || '').trim().toLowerCase();
  const resolvedHash = normalizedProvidedHash || (normalizedJti ? hashJti(normalizedJti) : '');

  if (!resolvedHash || !isSha256(resolvedHash)) {
    const error = new Error('Valid jti or jtiHash is required');
    error.statusCode = 400;
    throw error;
  }

  const defaultExpiryMs = nowTs() + Math.max(60 * 1000, Number(env.accessTokenRevocationDefaultTtlMs || 24 * 60 * 60 * 1000));
  const normalizedExpiry = normalizeDate(expiresAt, defaultExpiryMs);
  const minExpiryMs = nowTs() + 60 * 1000;
  const effectiveExpiry = normalizedExpiry.getTime() < minExpiryMs ? new Date(minExpiryMs) : normalizedExpiry;
  const now = new Date();

  const doc = await AccessTokenRevocation.findOneAndUpdate(
    { jtiHash: resolvedHash },
    {
      $set: {
        userId: userId || null,
        reason: normalizeReason(reason, 'manual_revocation'),
        source: String(source || 'admin').trim().toLowerCase(),
        status: 'active',
        revokedAt: now,
        revokedByUserId: actorUserId || null,
        revokedByIp: String(actorIp || '').trim(),
        metadata: sanitizeMetadata(metadata),
        expiresAt: effectiveExpiry
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

async function revokeAllAccessTokensForUser({
  userId,
  revokeBefore = null,
  reason = 'manual_user_session_revocation',
  source = 'admin',
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

  const candidate = normalizeDate(revokeBefore, nowTs());
  const existing = await UserAccessTokenCutoff.findOne({ userId: normalizedUserId }).lean();
  const existingMs = existing?.revokeBefore ? new Date(existing.revokeBefore).getTime() : 0;
  const candidateMs = candidate.getTime();
  const effectiveMs = Math.max(existingMs, candidateMs);

  const doc = await UserAccessTokenCutoff.findOneAndUpdate(
    { userId: normalizedUserId },
    {
      $set: {
        revokeBefore: new Date(effectiveMs),
        reason: normalizeReason(reason, 'manual_user_session_revocation'),
        source: String(source || 'admin').trim().toLowerCase(),
        updatedByUserId: actorUserId || null,
        updatedByIp: String(actorIp || '').trim(),
        metadata: sanitizeMetadata(metadata)
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return doc;
}

async function getAccessTokenRevocationSnapshot({ userId = '', includeExpired = false, limit = 100 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit || 100), 2000));
  const normalizedUserId = String(userId || '').trim();

  const revocationQuery = {};
  if (!includeExpired) {
    revocationQuery.expiresAt = { $gt: new Date() };
  }
  if (normalizedUserId) {
    revocationQuery.userId = normalizedUserId;
  }

  const [revocations, cutoffs] = await Promise.all([
    AccessTokenRevocation.find(revocationQuery)
      .sort({ revokedAt: -1, createdAt: -1 })
      .limit(normalizedLimit)
      .lean(),
    UserAccessTokenCutoff.find(normalizedUserId ? { userId: normalizedUserId } : {})
      .sort({ updatedAt: -1 })
      .limit(normalizedLimit)
      .lean()
  ]);

  return {
    generatedAt: new Date().toISOString(),
    count: revocations.length,
    cutoffCount: cutoffs.length,
    revocations: revocations.map((item) => ({
      id: String(item._id),
      jtiHash: String(item.jtiHash || ''),
      userId: item.userId ? String(item.userId) : null,
      reason: String(item.reason || ''),
      source: String(item.source || ''),
      status: String(item.status || ''),
      revokedAt: item.revokedAt ? new Date(item.revokedAt).toISOString() : null,
      expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString() : null
    })),
    cutoffs: cutoffs.map((item) => ({
      id: String(item._id),
      userId: item.userId ? String(item.userId) : null,
      revokeBefore: item.revokeBefore ? new Date(item.revokeBefore).toISOString() : null,
      reason: String(item.reason || ''),
      source: String(item.source || ''),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
    }))
  };
}

module.exports = {
  hashJti,
  isTokenRevocationSha256: isSha256,
  checkAccessTokenRevocation,
  revokeAccessTokenByJti,
  revokeAllAccessTokensForUser,
  getAccessTokenRevocationSnapshot
};
