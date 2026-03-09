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
