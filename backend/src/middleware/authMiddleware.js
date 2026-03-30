const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { checkAccessTokenRevocation } = require('../services/tokenRevocationService');
const { inspectAccessTokenReplay } = require('../services/accessTokenReplayShieldService');
const { inspectUserGeoVelocity } = require('../services/geoVelocityShieldService');
const { inspectUserSessionContextDrift } = require('../services/sessionContextDriftShieldService');
const { inspectUserSessionFanout } = require('../services/sessionFanoutShieldService');
const { inspectUserActionVelocity } = require('../services/userActionVelocityShieldService');

async function authenticate(req, res, next) {
  const bearer = req.headers.authorization || '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (String(token).length > 5000) {
    return res.status(401).json({ message: 'Invalid token format' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256']
    });
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({ message: 'Invalid token user' });
    }

    if (user.isTemporarilyBannedUntil && user.isTemporarilyBannedUntil > new Date()) {
      return res.status(403).json({ message: 'Temporarily banned due to suspicious activity' });
    }

    if (env.accessTokenRevocationEnabled || env.accessTokenCutoffEnabled) {
      try {
        const revocationState = await checkAccessTokenRevocation({
          payload,
          userId: user._id
        });
        if (revocationState && revocationState.revoked) {
          return res.status(401).json({ message: 'Access token revoked' });
        }
      } catch (_error) {
        if (!env.accessTokenRevocationFailOpen) {
          return res.status(503).json({ message: 'Token revocation service unavailable' });
        }
      }
    }

    if (env.accessTokenReplayShieldEnabled) {
      try {
        const replayState = await inspectAccessTokenReplay({
          payload,
          user,
          req
        });
        if (!replayState || replayState.ok === false) {
          return res.status(401).json({ message: 'Access token replay detected' });
        }
      } catch (_error) {
        if (!env.accessTokenReplayShieldFailOpen) {
          return res.status(503).json({ message: 'Access token replay shield unavailable' });
        }
      }
    }

    if (env.geoVelocityShieldEnabled) {
      try {
        const geoVelocityState = await inspectUserGeoVelocity({
          user,
          req
        });
        if (!geoVelocityState || geoVelocityState.ok === false) {
          return res.status(403).json({
            message: 'Geo-velocity shield blocked this session',
            reason: String(geoVelocityState?.reason || 'geo_velocity_blocked'),
            quarantineUntil: geoVelocityState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.geoVelocityShieldFailOpen) {
          return res.status(503).json({ message: 'Geo-velocity shield unavailable' });
        }
      }
    }

    if (env.sessionContextDriftShieldEnabled) {
      try {
        const sessionContextState = await inspectUserSessionContextDrift({
          user,
          req
        });
        if (!sessionContextState || sessionContextState.ok === false) {
          return res.status(403).json({
            message: 'Session context drift shield blocked this session',
            reason: String(sessionContextState?.reason || 'session_context_drift_blocked'),
            quarantineUntil: sessionContextState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.sessionContextDriftShieldFailOpen) {
          return res.status(503).json({ message: 'Session context drift shield unavailable' });
        }
      }
    }

    if (env.sessionFanoutShieldEnabled) {
      try {
        const fanoutState = await inspectUserSessionFanout({
          user,
          req
        });
        if (!fanoutState || fanoutState.ok === false) {
          return res.status(403).json({
            message: 'Session fanout shield blocked this session',
            reason: String(fanoutState?.reason || 'session_fanout_blocked'),
            quarantineUntil: fanoutState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.sessionFanoutShieldFailOpen) {
          return res.status(503).json({ message: 'Session fanout shield unavailable' });
        }
      }
    }

    if (env.actionVelocityShieldEnabled) {
      try {
        const actionVelocityState = await inspectUserActionVelocity({
          user,
          req
        });
        if (!actionVelocityState || actionVelocityState.ok === false) {
          return res.status(403).json({
            message: 'Action velocity shield blocked this session',
            reason: String(actionVelocityState?.reason || 'action_velocity_blocked'),
            quarantineUntil: actionVelocityState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.actionVelocityShieldFailOpen) {
          return res.status(503).json({ message: 'Action velocity shield unavailable' });
        }
      }
    }

    req.user = { id: user._id.toString(), role: user.role, accountType: user.accountType, email: user.email };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden for this role' });
    }
    return next();
  };
}

module.exports = {
  authenticate,
  authorizeRole
};

