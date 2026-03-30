const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const SALT_ROUNDS = 12;
let bcryptLib = null;

function loadBcrypt() {
  if (bcryptLib) return bcryptLib;

  try {
    bcryptLib = require('bcryptjs');
  } catch (error) {
    bcryptLib = require('bcrypt');
  }

  return bcryptLib;
}

async function hashPassword(password) {
  return loadBcrypt().hash(password, SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return loadBcrypt().compare(password, passwordHash);
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function signAccessToken(user, extras = {}) {
  const payload = {
    sub: user._id,
    role: user.role,
    accountType: user.accountType || 'customer',
    sid: extras.sid || randomId(),
    jti: randomId()
  };

  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtl });
}

function signRefreshToken(user, extras = {}) {
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    accountType: user.accountType || 'customer',
    sid: extras.sid || randomId(),
    jti: randomId(),
    type: 'refresh'
  };

  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: env.refreshTokenTtl || '30d' });
}

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(String(token))
    .digest('hex');
}

module.exports = {
  SALT_ROUNDS,
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken,
  hashToken
};

function normalizeAccountTypeForScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'customer';
  if (normalized === 'user') return 'customer';
  if (normalized === 'admin' || normalized === 'driver' || normalized === 'customer') return normalized;
  return 'customer';
}

function splitScopeString(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function dedupeScopes(scopes = []) {
  return Array.from(new Set((Array.isArray(scopes) ? scopes : [])
    .map((scope) => String(scope || '').trim().toLowerCase())
    .filter(Boolean)));
}

function resolveDefaultScopes(accountType) {
  const type = normalizeAccountTypeForScope(accountType);
  if (type === 'admin') {
    return dedupeScopes(env.jwtAccessScopesAdmin || []);
  }
  if (type === 'driver') {
    return dedupeScopes(env.jwtAccessScopesDriver || []);
  }
  return dedupeScopes(env.jwtAccessScopesCustomer || []);
}

function resolveScopeClaim(user = {}, extras = {}) {
  if (Array.isArray(extras.scopes) && extras.scopes.length) {
    return dedupeScopes(extras.scopes);
  }
  if (typeof extras.scope === 'string' && extras.scope.trim()) {
    return dedupeScopes(splitScopeString(extras.scope));
  }
  return resolveDefaultScopes(user.accountType || user.role || 'customer');
}

function buildJwtSignOptions(base = {}) {
  const options = { ...(base || {}) };
  if (env.jwtIssuer) {
    options.issuer = env.jwtIssuer;
  }
  if (env.jwtAudience) {
    options.audience = env.jwtAudience;
  }
  return options;
}

function signAccessTokenWithClaims(user, extras = {}) {
  const scopes = resolveScopeClaim(user, extras);
  const payload = {
    sub: user._id,
    role: user.role,
    accountType: user.accountType || 'customer',
    sid: extras.sid || randomId(),
    jti: randomId(),
    scope: scopes.join(' '),
    scp: scopes
  };

  return jwt.sign(
    payload,
    env.jwtSecret,
    buildJwtSignOptions({ expiresIn: env.accessTokenTtl })
  );
}

function signRefreshTokenWithClaims(user, extras = {}) {
  const scopes = resolveScopeClaim(user, extras);
  const payload = {
    sub: user._id.toString(),
    role: user.role,
    accountType: user.accountType || 'customer',
    sid: extras.sid || randomId(),
    jti: randomId(),
    type: 'refresh',
    scope: scopes.join(' '),
    scp: scopes
  };

  return jwt.sign(
    payload,
    env.jwtRefreshSecret,
    buildJwtSignOptions({ expiresIn: env.refreshTokenTtl || '30d' })
  );
}

module.exports.signAccessToken = signAccessTokenWithClaims;
module.exports.signRefreshToken = signRefreshTokenWithClaims;
