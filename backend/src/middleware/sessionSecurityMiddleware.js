const User = require('../models/User');
const SecurityIncident = require('../models/SecurityIncident');
const { getClientIp } = require('../utils/device');

function isMutatingMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || '').toUpperCase());
}

async function recordSessionIncident({ req, user, reason, riskScore = null }) {
  try {
    await SecurityIncident.create({
      source: 'server',
      eventType: 'session_policy_violation',
      userId: user?._id || null,
      email: user?.email || null,
      ip: getClientIp(req),
      city: req.headers['x-city'] || 'unknown',
      deviceFingerprint: req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null,
      riskScore: Math.min(100, Math.max(0, Number(riskScore ?? user?.riskScore ?? 0))),
      severity: Number(riskScore ?? user?.riskScore ?? 0) >= 70 ? 'high' : 'medium',
      recommendedAction: 'step_up_auth',
      autoResponse: {
        action: 'session_guard_block',
        applied: false,
        note: reason
      },
      signals: {
        path: req.originalUrl,
        method: req.method,
        accountType: user?.accountType || null,
        role: user?.role || null
      },
      metadata: {
        reason
      },
      timeline: [
        {
          action: 'session_policy_triggered',
          note: reason,
          actorId: user?._id || undefined
        }
      ]
    });
  } catch (error) {
    // intentionally non-blocking
  }
}

function buildSessionSecurityGuard(options = {}) {
  const {
    allowedRoles = null,
    allowedAccountTypes = null,
    requireAdmin2FA = true,
    enforceDeviceFingerprint = false,
    requireOtpForRiskScore = 40,
    blockAboveRiskScore = 85
  } = options;

  return async function sessionSecurityGuard(req, res, next) {
    try {
      const authUser = req.user || req.auth || {};
      const userId = authUser.id || authUser.sub || authUser._id;

      if (!userId) {
        return res.status(401).json({ message: 'Authenticated user context missing' });
      }

      const user = await User.findById(userId).select(
        'email role accountType riskScore accountLockedUntil isTemporarilyBannedUntil trustedDevices isTwoFactorEnabled'
      );

      if (!user) {
        return res.status(401).json({ message: 'User not found for active session' });
      }

      const now = Date.now();
      if (user.accountLockedUntil && new Date(user.accountLockedUntil).getTime() > now) {
        await recordSessionIncident({ req, user, reason: 'Account lock still active', riskScore: user.riskScore });
        return res.status(423).json({ message: 'Account temporarily locked' });
      }

      if (user.isTemporarilyBannedUntil && new Date(user.isTemporarilyBannedUntil).getTime() > now) {
        await recordSessionIncident({ req, user, reason: 'Temporary ban still active', riskScore: user.riskScore });
        return res.status(423).json({ message: 'Account temporarily restricted due to security checks' });
      }

      if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        await recordSessionIncident({ req, user, reason: `Role ${user.role} is not allowed for this route` });
        return res.status(403).json({ message: 'Role-based access denied' });
      }

      if (
        Array.isArray(allowedAccountTypes) &&
        allowedAccountTypes.length > 0 &&
        !allowedAccountTypes.includes(user.accountType)
      ) {
        await recordSessionIncident({ req, user, reason: `Account type ${user.accountType} is not allowed for this route` });
        return res.status(403).json({ message: 'Account type access denied' });
      }

      if (requireAdmin2FA && user.role === 'admin' && user.isTwoFactorEnabled !== true) {
        await recordSessionIncident({ req, user, reason: 'Admin session blocked because 2FA is not enabled' });
        return res.status(403).json({ message: 'Admin 2FA must be enabled before accessing this endpoint' });
      }

      const fingerprintFromHeaders = req.headers['x-device-fingerprint'] || req.body?.deviceFingerprint || null;
      if (enforceDeviceFingerprint && !fingerprintFromHeaders) {
        await recordSessionIncident({ req, user, reason: 'Missing device fingerprint on protected route' });
        return res.status(400).json({ message: 'x-device-fingerprint header required for this route' });
      }

      if (fingerprintFromHeaders && Array.isArray(user.trustedDevices)) {
        const trustedDevice = user.trustedDevices.find((item) => item && item.fingerprint === fingerprintFromHeaders);
        if (trustedDevice && trustedDevice.isBlocked === true) {
          await recordSessionIncident({ req, user, reason: 'Blocked trusted device attempted access', riskScore: 95 });
          return res.status(403).json({ message: 'Blocked device cannot access this route' });
        }
      }

      if (Number(user.riskScore || 0) >= blockAboveRiskScore && isMutatingMethod(req.method)) {
        await recordSessionIncident({ req, user, reason: 'Mutating action blocked due to extreme risk profile', riskScore: user.riskScore });
        return res.status(403).json({ message: 'Action blocked due to elevated account risk' });
      }

      if (
        Number(user.riskScore || 0) >= requireOtpForRiskScore &&
        isMutatingMethod(req.method) &&
        !req.headers['x-otp-verified']
      ) {
        await recordSessionIncident({ req, user, reason: 'Step-up OTP missing for elevated-risk mutating action', riskScore: user.riskScore });
        return res.status(401).json({ message: 'Step-up OTP verification required' });
      }

      req.liveUser = user;
      req.user = {
        ...authUser,
        id: user._id.toString(),
        sub: user._id.toString(),
        role: user.role,
        accountType: user.accountType,
        email: user.email,
        riskScore: user.riskScore
      };

      return next();
    } catch (error) {
      return res.status(500).json({ message: 'Session security check failed' });
    }
  };
}

module.exports = {
  buildSessionSecurityGuard
};
