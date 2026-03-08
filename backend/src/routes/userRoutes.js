const express = require('express');
const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const { buildSessionSecurityGuard } = require('../middleware/sessionSecurityMiddleware');
const { requireAnyRole, requireAnyAccountType } = require('../middleware/accessControlMiddleware');
const SecurityIncident = require('../models/SecurityIncident');

const router = express.Router();

const baseSessionGuard = buildSessionSecurityGuard({
  enforceDeviceFingerprint: false,
  requireOtpForRiskScore: 45,
  blockAboveRiskScore: 85
});

router.get('/dashboard', authenticate, baseSessionGuard, (req, res) => {
  return res.json({
    message: 'Secure Dashboard Access',
    user: req.user,
    security: {
      level: 'hardened',
      riskScore: req.user?.riskScore || 0,
      accountType: req.user?.accountType || null
    }
  });
});

router.get(
  '/customer/dashboard',
  authenticate,
  buildSessionSecurityGuard({ allowedAccountTypes: ['customer'], requireOtpForRiskScore: 40 }),
  requireAnyAccountType('customer'),
  (req, res) => {
    return res.status(200).json({
      message: 'Customer secure dashboard access granted',
      role: req.user.role,
      accountType: req.user.accountType,
      riskScore: req.user.riskScore || 0
    });
  }
);

router.get(
  '/driver/dashboard',
  authenticate,
  buildSessionSecurityGuard({ allowedAccountTypes: ['driver'], requireOtpForRiskScore: 40 }),
  requireAnyAccountType('driver'),
  (req, res) => {
    return res.status(200).json({
      message: 'Driver secure dashboard access granted',
      role: req.user.role,
      accountType: req.user.accountType,
      riskScore: req.user.riskScore || 0
    });
  }
);

router.get(
  '/admin/dashboard-secure',
  authenticate,
  buildSessionSecurityGuard({ allowedRoles: ['admin'], enforceDeviceFingerprint: true }),
  requireAnyRole('admin'),
  (req, res) => {
    return res.status(200).json({
      message: 'Admin secure dashboard access granted',
      role: req.user.role,
      accountType: req.user.accountType,
      riskScore: req.user.riskScore || 0
    });
  }
);

router.get('/me/security-profile', authenticate, baseSessionGuard, async (req, res) => {
  const incidents = await SecurityIncident.find({ userId: req.user.id })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('incidentId eventType riskScore severity status createdAt recommendedAction')
    .lean();

  return res.status(200).json({
    message: 'Security profile fetched',
    profile: {
      userId: req.user.id,
      role: req.user.role,
      accountType: req.user.accountType,
      riskScore: req.user.riskScore || 0,
      recentIncidents: incidents
    }
  });
});

module.exports = router;
