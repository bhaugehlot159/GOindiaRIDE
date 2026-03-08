const jwt = require('jsonwebtoken');
const env = require('../config/env');

const SALT_ROUNDS = 12;
let bcryptLib = null;

function loadBcrypt() {
  if (bcryptLib) return bcryptLib;

  try {
    // Preferred: pure JS implementation (avoids native node-pre-gyp deprecation noise)
    // Optional dependency; install with: npm i bcryptjs
    bcryptLib = require('bcryptjs');
  } catch (error) {
    // Fallback to native bcrypt if bcryptjs is not present.
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
