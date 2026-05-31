const crypto = require('crypto');
const validator = require('validator');
const User = require('../models/User');
const {
  signAccessToken,
  signRefreshToken,
  hashToken
} = require('../utils/auth');

const LOGIN_USER_FIELDS = [
  'name',
  'email',
  'phone',
  'username',
  'passwordHash',
  'role',
  'accountType',
  'failedLoginAttempts',
  'accountLockedUntil',
  'knownDevices',
  'lastLoginIp',
  'refreshToken',
  'refreshTokens',
  'twoFactorSecret',
  'isTwoFactorEnabled',
  'riskScore',
  'lastRiskUpdate',
  'trustedDevices',
  'isTemporarilyBannedUntil',
  'isPhoneVerified'
].join(' ');

const SESSION_CACHE_TTL_MS = 45 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 300;
const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const sessionTokenCache = new Map();

function normalizeLoginPrincipal(body = {}) {
  return String(body.email || body.username || body.identifier || '')
    .trim()
    .toLowerCase()
    .slice(0, 180);
}

function buildLoginLookupQuery(principal) {
  if (!principal) return null;
  if (validator.isEmail(principal)) return { email: principal };
  return { username: principal };
}

async function findLoginUser(principal) {
  const query = buildLoginLookupQuery(principal);
  if (!query) return null;
  return User.findOne(query).select(LOGIN_USER_FIELDS).exec();
}

function randomSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function compactCache(now = Date.now()) {
  for (const [key, entry] of sessionTokenCache) {
    if (!entry || entry.expiresAt <= now) sessionTokenCache.delete(key);
  }

  while (sessionTokenCache.size > SESSION_CACHE_MAX_ENTRIES) {
    const oldest = sessionTokenCache.keys().next().value;
    if (!oldest) break;
    sessionTokenCache.delete(oldest);
  }
}

function buildSessionCacheKey(user, deviceFingerprint) {
  const passwordVersion = hashToken(user.passwordHash || '').slice(0, 24);
  return [
    String(user._id),
    deviceFingerprint || 'unknown-device',
    user.role || 'user',
    user.accountType || 'customer',
    passwordVersion
  ].join(':');
}

function issueLoginSession(user, options = {}) {
  const deviceFingerprint = options.device?.fingerprint || null;
  const cacheKey = buildSessionCacheKey(user, deviceFingerprint);
  const current = Date.now();
  compactCache(current);

  const cached = sessionTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > current) {
    return { ...cached.session, fromCache: true };
  }

  const sessionId = randomSessionId();
  const accessToken = signAccessToken(user, { sid: sessionId });
  const refreshToken = signRefreshToken(user, { sid: sessionId });
  const issuedAt = new Date(current);
  const session = {
    accessToken,
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
    sessionId,
    issuedAt,
    expiresAt: new Date(current + DEFAULT_REFRESH_TTL_MS),
    fromCache: false
  };

  sessionTokenCache.set(cacheKey, {
    expiresAt: current + SESSION_CACHE_TTL_MS,
    session
  });

  return session;
}

function attachRefreshSession(user, session, options = {}) {
  const deviceFingerprint = options.device?.fingerprint || null;
  const userAgent = String(options.userAgent || '').slice(0, 500);
  const maxSessions = Math.max(1, Number(options.maxSessions || 8));

  user.refreshToken = session.refreshTokenHash;
  if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];

  user.refreshTokens = user.refreshTokens
    .filter((item) => item && item.tokenHash !== session.refreshTokenHash)
    .slice(-(maxSessions - 1));

  user.refreshTokens.push({
    tokenHash: session.refreshTokenHash,
    createdAt: session.issuedAt,
    expiresAt: session.expiresAt,
    ip: options.ip || null,
    deviceFingerprint,
    userAgent,
    lastUsedAt: session.issuedAt,
    sessionId: session.sessionId,
    sessionStartedAt: session.issuedAt
  });
}

module.exports = {
  normalizeLoginPrincipal,
  findLoginUser,
  issueLoginSession,
  attachRefreshSession
};
