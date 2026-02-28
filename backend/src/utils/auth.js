const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SALT_ROUNDS = 12;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signAccessToken(user) {
  return jwt.sign({ sub: user._id, role: user.role }, env.jwtSecret, { expiresIn: env.accessTokenTtl });
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user._id, role: user.role, type: 'refresh' }, env.jwtRefreshSecret, { expiresIn: env.refreshTokenTtl });
}

module.exports = {
  SALT_ROUNDS,
  hashPassword,
  comparePassword,
  signAccessToken,
  signRefreshToken
};
