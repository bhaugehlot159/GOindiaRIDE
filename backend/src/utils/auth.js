const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
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
    .update(token)
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
