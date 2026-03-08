const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  return null;
}

function unauthorized(res, message = 'Invalid token') {
  return res.status(401).json({ message });
}

async function hydrateUserFromTokenPayload(payload) {
  const userId = payload?.sub || payload?.id || payload?._id;
  if (!userId) return null;

  const user = await User.findById(userId).select(
    'email role accountType riskScore accountLockedUntil isTemporarilyBannedUntil isTwoFactorEnabled'
  );

  return user;
}

async function authenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return unauthorized(res, 'Bearer token required');
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await hydrateUserFromTokenPayload(decoded);

    if (!user) {
      return unauthorized(res, 'Session user not found');
    }

    const now = Date.now();
    if (user.accountLockedUntil && new Date(user.accountLockedUntil).getTime() > now) {
      return res.status(423).json({ message: 'Account temporarily locked' });
    }

    if (user.isTemporarilyBannedUntil && new Date(user.isTemporarilyBannedUntil).getTime() > now) {
      return res.status(423).json({ message: 'Account temporarily restricted due to risk controls' });
    }

    req.user = {
      ...decoded,
      id: user._id.toString(),
      sub: user._id.toString(),
      role: user.role,
      accountType: user.accountType,
      email: user.email,
      riskScore: user.riskScore,
      isTwoFactorEnabled: user.isTwoFactorEnabled === true
    };

    req.auth = req.user;
    return next();
  } catch (error) {
    return unauthorized(res, 'Invalid token');
  }
}

async function optionalAuthenticate(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await hydrateUserFromTokenPayload(decoded);

    if (user) {
      req.user = {
        ...decoded,
        id: user._id.toString(),
        sub: user._id.toString(),
        role: user.role,
        accountType: user.accountType,
        email: user.email,
        riskScore: user.riskScore,
        isTwoFactorEnabled: user.isTwoFactorEnabled === true
      };
      req.auth = req.user;
    }

    return next();
  } catch (error) {
    return next();
  }
}

function authorizeRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    if (req.user.role !== requiredRole) {
      return res.status(403).json({ message: 'Forbidden: role mismatch' });
    }

    return next();
  };
}

module.exports = authenticate;
module.exports.authenticate = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;
module.exports.authorizeRole = authorizeRole;
