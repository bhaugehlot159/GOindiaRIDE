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
const { inspectUserRequestFreshness } = require('../services/requestFreshnessShieldService');
const { inspectUserTokenClaimBoundary } = require('../services/tokenClaimBoundaryShieldService');
const { inspectUserTokenHeaderIntegrity } = require('../services/tokenHeaderIntegrityShieldService');
const { inspectUserTokenPayloadHygiene } = require('../services/tokenPayloadHygieneShieldService');
const { inspectUserTokenIdentifierHardening } = require('../services/tokenIdentifierHardeningShieldService');
const { inspectUserTokenTypeSeparation } = require('../services/tokenTypeSeparationShieldService');
const { inspectUserTokenSessionAnchor } = require('../services/tokenSessionAnchorShieldService');
const { inspectUserTokenRotationContinuity } = require('../services/tokenRotationContinuityShieldService');
const { inspectUserTokenClaimProfileContinuity } = require('../services/tokenClaimProfileContinuityShieldService');
const { inspectUserTokenSessionPrincipalBinding } = require('../services/tokenSessionPrincipalBindingShieldService');
const { inspectUserTokenSessionFingerprintBinding } = require('../services/tokenSessionFingerprintBindingShieldService');
const { inspectUserTokenSessionGeoBinding } = require('../services/tokenSessionGeoBindingShieldService');
const { inspectUserTokenSessionNetworkBinding } = require('../services/tokenSessionNetworkBindingShieldService');
const { inspectUserTokenSessionClientBinding } = require('../services/tokenSessionClientBindingShieldService');
const { inspectUserTokenSessionTransportBinding } = require('../services/tokenSessionTransportBindingShieldService');
const { inspectUserTokenSessionTrustBinding } = require('../services/tokenSessionTrustBindingShieldService');

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

    if (env.requestFreshnessShieldEnabled) {
      try {
        const freshnessState = await inspectUserRequestFreshness({
          user,
          req
        });
        if (!freshnessState || freshnessState.ok === false) {
          return res.status(403).json({
            message: 'Request freshness shield blocked this request',
            reason: String(freshnessState?.reason || 'request_freshness_blocked'),
            retryAfterMs: Number(freshnessState?.retryAfterMs || 0),
            violationCount: Number(freshnessState?.violationCount || 0),
            violationThreshold: Number(freshnessState?.violationThreshold || 0),
            quarantineUntil: freshnessState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.requestFreshnessShieldFailOpen) {
          return res.status(503).json({ message: 'Request freshness shield unavailable' });
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

    if (env.tokenClaimBoundaryShieldEnabled) {
      try {
        const tokenClaimBoundaryState = await inspectUserTokenClaimBoundary({
          user,
          payload,
          req
        });
        if (!tokenClaimBoundaryState || tokenClaimBoundaryState.ok === false) {
          return res.status(403).json({
            message: 'Token claim boundary shield blocked this session',
            reason: String(tokenClaimBoundaryState?.reason || 'token_claim_boundary_blocked'),
            violationCount: Number(tokenClaimBoundaryState?.violationCount || 0),
            violationThreshold: Number(tokenClaimBoundaryState?.violationThreshold || 0),
            missingClaimCount: Number(tokenClaimBoundaryState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenClaimBoundaryState?.missingClaimThreshold || 0),
            requiredScopes: Array.isArray(tokenClaimBoundaryState?.requiredScopes)
              ? tokenClaimBoundaryState.requiredScopes
              : undefined,
            quarantineUntil: tokenClaimBoundaryState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenClaimBoundaryShieldFailOpen) {
          return res.status(503).json({ message: 'Token claim boundary shield unavailable' });
        }
      }
    }

    if (env.tokenHeaderIntegrityShieldEnabled) {
      try {
        const tokenHeaderState = await inspectUserTokenHeaderIntegrity({
          user,
          payload,
          token,
          req
        });
        if (!tokenHeaderState || tokenHeaderState.ok === false) {
          return res.status(403).json({
            message: 'Token header integrity shield blocked this session',
            reason: String(tokenHeaderState?.reason || 'token_header_integrity_blocked'),
            violationCount: Number(tokenHeaderState?.violationCount || 0),
            violationThreshold: Number(tokenHeaderState?.violationThreshold || 0),
            missingFieldCount: Number(tokenHeaderState?.missingFieldCount || 0),
            missingFieldThreshold: Number(tokenHeaderState?.missingFieldThreshold || 0),
            quarantineUntil: tokenHeaderState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenHeaderIntegrityShieldFailOpen) {
          return res.status(503).json({ message: 'Token header integrity shield unavailable' });
        }
      }
    }

    if (env.tokenPayloadHygieneShieldEnabled) {
      try {
        const tokenPayloadState = await inspectUserTokenPayloadHygiene({
          user,
          payload,
          token,
          req
        });
        if (!tokenPayloadState || tokenPayloadState.ok === false) {
          return res.status(403).json({
            message: 'Token payload hygiene shield blocked this session',
            reason: String(tokenPayloadState?.reason || 'token_payload_hygiene_blocked'),
            violationCount: Number(tokenPayloadState?.violationCount || 0),
            violationThreshold: Number(tokenPayloadState?.violationThreshold || 0),
            missingClaimCount: Number(tokenPayloadState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenPayloadState?.missingClaimThreshold || 0),
            quarantineUntil: tokenPayloadState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenPayloadHygieneShieldFailOpen) {
          return res.status(503).json({ message: 'Token payload hygiene shield unavailable' });
        }
      }
    }

    if (env.tokenIdentifierHardeningShieldEnabled) {
      try {
        const identifierState = await inspectUserTokenIdentifierHardening({
          user,
          payload,
          req
        });
        if (!identifierState || identifierState.ok === false) {
          return res.status(403).json({
            message: 'Token identifier hardening shield blocked this session',
            reason: String(identifierState?.reason || 'token_identifier_hardening_blocked'),
            violationCount: Number(identifierState?.violationCount || 0),
            violationThreshold: Number(identifierState?.violationThreshold || 0),
            missingClaimCount: Number(identifierState?.missingClaimCount || 0),
            missingClaimThreshold: Number(identifierState?.missingClaimThreshold || 0),
            quarantineUntil: identifierState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenIdentifierHardeningShieldFailOpen) {
          return res.status(503).json({ message: 'Token identifier hardening shield unavailable' });
        }
      }
    }

    if (env.tokenTypeSeparationShieldEnabled) {
      try {
        const tokenTypeState = await inspectUserTokenTypeSeparation({
          user,
          payload,
          req
        });
        if (!tokenTypeState || tokenTypeState.ok === false) {
          return res.status(403).json({
            message: 'Token type separation shield blocked this session',
            reason: String(tokenTypeState?.reason || 'token_type_separation_blocked'),
            violationCount: Number(tokenTypeState?.violationCount || 0),
            violationThreshold: Number(tokenTypeState?.violationThreshold || 0),
            missingClaimCount: Number(tokenTypeState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenTypeState?.missingClaimThreshold || 0),
            quarantineUntil: tokenTypeState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenTypeSeparationShieldFailOpen) {
          return res.status(503).json({ message: 'Token type separation shield unavailable' });
        }
      }
    }

    if (env.tokenSessionAnchorShieldEnabled) {
      try {
        const tokenSessionAnchorState = await inspectUserTokenSessionAnchor({
          user,
          payload,
          req
        });
        if (!tokenSessionAnchorState || tokenSessionAnchorState.ok === false) {
          return res.status(403).json({
            message: 'Token session anchor shield blocked this session',
            reason: String(tokenSessionAnchorState?.reason || 'token_session_anchor_blocked'),
            violationCount: Number(tokenSessionAnchorState?.violationCount || 0),
            violationThreshold: Number(tokenSessionAnchorState?.violationThreshold || 0),
            missingClaimCount: Number(tokenSessionAnchorState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenSessionAnchorState?.missingClaimThreshold || 0),
            quarantineUntil: tokenSessionAnchorState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionAnchorShieldFailOpen) {
          return res.status(503).json({ message: 'Token session anchor shield unavailable' });
        }
      }
    }

    if (env.tokenRotationContinuityShieldEnabled) {
      try {
        const tokenRotationState = await inspectUserTokenRotationContinuity({
          user,
          payload,
          req
        });
        if (!tokenRotationState || tokenRotationState.ok === false) {
          return res.status(403).json({
            message: 'Token rotation continuity shield blocked this session',
            reason: String(tokenRotationState?.reason || 'token_rotation_continuity_blocked'),
            violationCount: Number(tokenRotationState?.violationCount || 0),
            violationThreshold: Number(tokenRotationState?.violationThreshold || 0),
            missingClaimCount: Number(tokenRotationState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenRotationState?.missingClaimThreshold || 0),
            quarantineUntil: tokenRotationState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenRotationContinuityShieldFailOpen) {
          return res.status(503).json({ message: 'Token rotation continuity shield unavailable' });
        }
      }
    }

    if (env.tokenClaimProfileContinuityShieldEnabled) {
      try {
        const tokenClaimProfileState = await inspectUserTokenClaimProfileContinuity({
          user,
          payload,
          req
        });
        if (!tokenClaimProfileState || tokenClaimProfileState.ok === false) {
          return res.status(403).json({
            message: 'Token claim profile continuity shield blocked this session',
            reason: String(tokenClaimProfileState?.reason || 'token_claim_profile_continuity_blocked'),
            violationCount: Number(tokenClaimProfileState?.violationCount || 0),
            violationThreshold: Number(tokenClaimProfileState?.violationThreshold || 0),
            missingClaimCount: Number(tokenClaimProfileState?.missingClaimCount || 0),
            missingClaimThreshold: Number(tokenClaimProfileState?.missingClaimThreshold || 0),
            quarantineUntil: tokenClaimProfileState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenClaimProfileContinuityShieldFailOpen) {
          return res.status(503).json({ message: 'Token claim profile continuity shield unavailable' });
        }
      }
    }

    if (env.tokenSessionPrincipalBindingShieldEnabled) {
      try {
        const sessionPrincipalBindingState = await inspectUserTokenSessionPrincipalBinding({
          user,
          payload,
          req
        });
        if (!sessionPrincipalBindingState || sessionPrincipalBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session principal binding shield blocked this session',
            reason: String(sessionPrincipalBindingState?.reason || 'token_session_principal_binding_blocked'),
            violationCount: Number(sessionPrincipalBindingState?.violationCount || 0),
            violationThreshold: Number(sessionPrincipalBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionPrincipalBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionPrincipalBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionPrincipalBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionPrincipalBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session principal binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionFingerprintBindingShieldEnabled) {
      try {
        const sessionFingerprintBindingState = await inspectUserTokenSessionFingerprintBinding({
          user,
          payload,
          req
        });
        if (!sessionFingerprintBindingState || sessionFingerprintBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session fingerprint binding shield blocked this session',
            reason: String(sessionFingerprintBindingState?.reason || 'token_session_fingerprint_binding_blocked'),
            violationCount: Number(sessionFingerprintBindingState?.violationCount || 0),
            violationThreshold: Number(sessionFingerprintBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionFingerprintBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionFingerprintBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionFingerprintBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionFingerprintBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session fingerprint binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionGeoBindingShieldEnabled) {
      try {
        const sessionGeoBindingState = await inspectUserTokenSessionGeoBinding({
          user,
          payload,
          req
        });
        if (!sessionGeoBindingState || sessionGeoBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session geo binding shield blocked this session',
            reason: String(sessionGeoBindingState?.reason || 'token_session_geo_binding_blocked'),
            violationCount: Number(sessionGeoBindingState?.violationCount || 0),
            violationThreshold: Number(sessionGeoBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionGeoBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionGeoBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionGeoBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionGeoBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session geo binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionNetworkBindingShieldEnabled) {
      try {
        const sessionNetworkBindingState = await inspectUserTokenSessionNetworkBinding({
          user,
          payload,
          req
        });
        if (!sessionNetworkBindingState || sessionNetworkBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session network binding shield blocked this session',
            reason: String(sessionNetworkBindingState?.reason || 'token_session_network_binding_blocked'),
            violationCount: Number(sessionNetworkBindingState?.violationCount || 0),
            violationThreshold: Number(sessionNetworkBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionNetworkBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionNetworkBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionNetworkBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionNetworkBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session network binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionClientBindingShieldEnabled) {
      try {
        const sessionClientBindingState = await inspectUserTokenSessionClientBinding({
          user,
          payload,
          req
        });
        if (!sessionClientBindingState || sessionClientBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session client binding shield blocked this session',
            reason: String(sessionClientBindingState?.reason || 'token_session_client_binding_blocked'),
            violationCount: Number(sessionClientBindingState?.violationCount || 0),
            violationThreshold: Number(sessionClientBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionClientBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionClientBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionClientBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionClientBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session client binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionTransportBindingShieldEnabled) {
      try {
        const sessionTransportBindingState = await inspectUserTokenSessionTransportBinding({
          user,
          payload,
          req
        });
        if (!sessionTransportBindingState || sessionTransportBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session transport binding shield blocked this session',
            reason: String(sessionTransportBindingState?.reason || 'token_session_transport_binding_blocked'),
            violationCount: Number(sessionTransportBindingState?.violationCount || 0),
            violationThreshold: Number(sessionTransportBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionTransportBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionTransportBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionTransportBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionTransportBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session transport binding shield unavailable' });
        }
      }
    }

    if (env.tokenSessionTrustBindingShieldEnabled) {
      try {
        const sessionTrustBindingState = await inspectUserTokenSessionTrustBinding({
          user,
          payload,
          req
        });
        if (!sessionTrustBindingState || sessionTrustBindingState.ok === false) {
          return res.status(403).json({
            message: 'Token session trust binding shield blocked this session',
            reason: String(sessionTrustBindingState?.reason || 'token_session_trust_binding_blocked'),
            violationCount: Number(sessionTrustBindingState?.violationCount || 0),
            violationThreshold: Number(sessionTrustBindingState?.violationThreshold || 0),
            missingClaimCount: Number(sessionTrustBindingState?.missingClaimCount || 0),
            missingClaimThreshold: Number(sessionTrustBindingState?.missingClaimThreshold || 0),
            quarantineUntil: sessionTrustBindingState?.quarantineUntil || null
          });
        }
      } catch (_error) {
        if (!env.tokenSessionTrustBindingShieldFailOpen) {
          return res.status(503).json({ message: 'Token session trust binding shield unavailable' });
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

