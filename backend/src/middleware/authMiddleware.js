const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { checkAccessTokenRevocation } = require('../services/tokenRevocationService');
const { inspectAccessTokenReplay } = require('../services/accessTokenReplayShieldService');
const { inspectUserGeoVelocity } = require('../services/geoVelocityShieldService');
const { inspectUserSessionContextDrift } = require('../services/sessionContextDriftShieldService');
const { inspectUserSessionFanout } = require('../services/sessionFanoutShieldService');
const { inspectUserActionVelocity } = require('../services/userActionVelocityShieldService');
const { inspectUserPrivilegeClaimIntegrity } = require('../services/privilegeClaimIntegrityShieldService');
const { inspectUserStepUpAuth } = require('../services/stepUpAuthShieldService');
const { inspectUserSessionLineage } = require('../services/sessionLineageShieldService');
const { inspectUserTokenTemporalIntegrity } = require('../services/tokenTemporalIntegrityShieldService');
const { inspectUserRoleBoundary } = require('../services/roleBoundaryShieldService');
const { inspectUserDeviceApprovalBoundary } = require('../services/deviceApprovalBoundaryShieldService');
const { inspectUserCriticalPathCooldown } = require('../services/criticalPathCooldownShieldService');
const { inspectUserRefreshInventory } = require('../services/refreshInventoryShieldService');

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

    if (env.privilegeIntegrityShieldEnabled) {
      try {
        const integrityState = await inspectUserPrivilegeClaimIntegrity({
          user,
          payload,
          req
        });
        if (!integrityState || integrityState.ok === false) {
          return res.status(403).json({
            message: 'Privilege integrity shield blocked this session',
            reason: String(integrityState?.reason || 'privilege_integrity_blocked'),
            quarantineUntil: integrityState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.privilegeIntegrityShieldFailOpen) {
          return res.status(503).json({ message: 'Privilege integrity shield unavailable' });
        }
      }
    }

    if (env.roleBoundaryShieldEnabled) {
      try {
        const roleBoundaryState = await inspectUserRoleBoundary({
          user,
          req
        });
        if (!roleBoundaryState || roleBoundaryState.ok === false) {
          return res.status(403).json({
            message: 'Role boundary shield blocked this session',
            reason: String(roleBoundaryState?.reason || 'role_boundary_blocked'),
            requiredRole: roleBoundaryState?.requiredRole || null,
            violationCount: Number(roleBoundaryState?.violationCount || 0),
            violationThreshold: Number(roleBoundaryState?.violationThreshold || 0),
            quarantineUntil: roleBoundaryState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.roleBoundaryShieldFailOpen) {
          return res.status(503).json({ message: 'Role boundary shield unavailable' });
        }
      }
    }

    if (env.deviceApprovalBoundaryShieldEnabled) {
      try {
        const deviceBoundaryState = await inspectUserDeviceApprovalBoundary({
          user,
          req
        });
        if (!deviceBoundaryState || deviceBoundaryState.ok === false) {
          return res.status(403).json({
            message: 'Device approval boundary shield blocked this session',
            reason: String(deviceBoundaryState?.reason || 'device_approval_boundary_blocked'),
            deviceStatus: String(deviceBoundaryState?.deviceStatus || ''),
            violationCount: Number(deviceBoundaryState?.violationCount || 0),
            violationThreshold: Number(deviceBoundaryState?.violationThreshold || 0),
            quarantineUntil: deviceBoundaryState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.deviceApprovalBoundaryShieldFailOpen) {
          return res.status(503).json({ message: 'Device approval boundary shield unavailable' });
        }
      }
    }

    if (env.criticalPathCooldownShieldEnabled) {
      try {
        const cooldownState = await inspectUserCriticalPathCooldown({
          user,
          req
        });
        if (!cooldownState || cooldownState.ok === false) {
          return res.status(429).json({
            message: 'Critical path cooldown shield blocked this request',
            reason: String(cooldownState?.reason || 'critical_path_cooldown_blocked'),
            retryAfterMs: Number(cooldownState?.retryAfterMs || 0),
            violationCount: Number(cooldownState?.violationCount || 0),
            violationThreshold: Number(cooldownState?.violationThreshold || 0),
            quarantineUntil: cooldownState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.criticalPathCooldownShieldFailOpen) {
          return res.status(503).json({ message: 'Critical path cooldown shield unavailable' });
        }
      }
    }

    if (env.refreshInventoryShieldEnabled) {
      try {
        const refreshInventoryState = await inspectUserRefreshInventory({
          user,
          req
        });
        if (!refreshInventoryState || refreshInventoryState.ok === false) {
          return res.status(403).json({
            message: 'Refresh inventory shield blocked this session',
            reason: String(refreshInventoryState?.reason || 'refresh_inventory_blocked'),
            quarantineUntil: refreshInventoryState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.refreshInventoryShieldFailOpen) {
          return res.status(503).json({ message: 'Refresh inventory shield unavailable' });
        }
      }
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

    if (env.stepUpAuthShieldEnabled) {
      try {
        const stepUpState = await inspectUserStepUpAuth({
          user,
          payload,
          req
        });
        if (!stepUpState || stepUpState.ok === false) {
          return res.status(403).json({
            message: 'Step-up authentication shield blocked this session',
            reason: String(stepUpState?.reason || 'step_up_auth_blocked'),
            quarantineUntil: stepUpState?.quarantineUntil || null,
            stepUpRequired: Boolean(stepUpState?.stepUpRequired || false),
            requiredHeaders: Array.isArray(stepUpState?.requiredHeaders) ? stepUpState.requiredHeaders : undefined
          });
        }
      } catch (_error) {
        if (!env.stepUpAuthShieldFailOpen) {
          return res.status(503).json({ message: 'Step-up authentication shield unavailable' });
        }
      }
    }

    if (env.sessionLineageShieldEnabled) {
      try {
        const sessionLineageState = await inspectUserSessionLineage({
          user,
          payload,
          req
        });
        if (!sessionLineageState || sessionLineageState.ok === false) {
          return res.status(403).json({
            message: 'Session lineage shield blocked this session',
            reason: String(sessionLineageState?.reason || 'session_lineage_blocked'),
            quarantineUntil: sessionLineageState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.sessionLineageShieldFailOpen) {
          return res.status(503).json({ message: 'Session lineage shield unavailable' });
        }
      }
    }

    if (env.tokenTemporalIntegrityShieldEnabled) {
      try {
        const temporalIntegrityState = await inspectUserTokenTemporalIntegrity({
          user,
          payload,
          req
        });
        if (!temporalIntegrityState || temporalIntegrityState.ok === false) {
          return res.status(403).json({
            message: 'Token temporal integrity shield blocked this session',
            reason: String(temporalIntegrityState?.reason || 'token_temporal_integrity_blocked'),
            quarantineUntil: temporalIntegrityState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenTemporalIntegrityShieldFailOpen) {
          return res.status(503).json({ message: 'Token temporal integrity shield unavailable' });
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

