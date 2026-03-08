const express = require('express');
const rateLimit = require('express-rate-limit');

const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const { buildSessionSecurityGuard } = require('../middleware/sessionSecurityMiddleware');
const { requireAnyRole } = require('../middleware/accessControlMiddleware');
const { adminCriticalLimiter } = require('../middleware/rateLimiters');
const { getClientIp } = require('../utils/device');
const SecurityIncident = require('../models/SecurityIncident');
const User = require('../models/User');

let AdminActionLog = null;
try {
  AdminActionLog = require('../models/AdminActionLog');
} catch (e) {
  AdminActionLog = null;
}

const router = express.Router();

const adminLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many admin requests. Try later.' }
});

const adminSessionGuard = buildSessionSecurityGuard({
  allowedRoles: ['admin'],
  requireAdmin2FA: true,
  enforceDeviceFingerprint: true,
  requireOtpForRiskScore: 35,
  blockAboveRiskScore: 80
});

async function logAdminAction(req, action, meta = {}) {
  if (!AdminActionLog) return;

  try {
    await AdminActionLog.create({
      adminId: req.user?.id || req.user?._id || req.user?.sub,
      action,
      ip: getClientIp(req),
      meta
    });
  } catch (error) {
    // non-blocking logging
  }
}

router.use(adminLimiter);
router.use(authenticate);
router.use(adminSessionGuard);
router.use(requireAnyRole('admin'));

router.get('/dashboard', async (req, res) => {
  await logAdminAction(req, 'view_dashboard', {
    riskScore: req.user?.riskScore || 0
  });

  return res.json({
    message: 'Admin-only route access granted',
    securityStatus: 'hardened',
    accountType: req.user?.accountType || null,
    riskScore: req.user?.riskScore || 0
  });
});

router.get('/security-command-center', async (req, res) => {
  await logAdminAction(req, 'view_security_command_center');

  const since = new Date(Date.now() - (24 * 60 * 60 * 1000));

  const [openIncidents, criticalIncidents, topSignals, activeRiskUsers] = await Promise.all([
    SecurityIncident.countDocuments({ status: { $in: ['open', 'investigating'] } }),
    SecurityIncident.countDocuments({
      severity: 'critical',
      status: { $in: ['open', 'investigating'] },
      createdAt: { $gte: since }
    }),
    SecurityIncident.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]),
    User.countDocuments({ riskScore: { $gte: 70 } })
  ]);

  return res.status(200).json({
    windowHours: 24,
    openIncidents,
    criticalIncidents,
    activeRiskUsers,
    topSignals
  });
});

router.post('/users/:id/risk-lock', adminCriticalLimiter, async (req, res) => {
  const targetUserId = req.params.id;
  const lockMinutes = Math.min(Math.max(Number(req.body?.lockMinutes) || 30, 5), 180);
  const riskScore = Math.min(Math.max(Number(req.body?.riskScore) || 90, 70), 100);

  const user = await User.findByIdAndUpdate(
    targetUserId,
    {
      riskScore,
      isTemporarilyBannedUntil: new Date(Date.now() + lockMinutes * 60 * 1000),
      lastRiskUpdate: new Date()
    },
    { new: true }
  ).select('email role accountType riskScore isTemporarilyBannedUntil');

  if (!user) {
    return res.status(404).json({ message: 'Target user not found' });
  }

  await logAdminAction(req, 'risk_lock_user', {
    targetUserId,
    lockMinutes,
    riskScore
  });

  await SecurityIncident.create({
    source: 'admin',
    eventType: 'admin_risk_lock',
    userId: user._id,
    email: user.email,
    ip: getClientIp(req),
    city: req.headers['x-city'] || 'unknown',
    deviceFingerprint: req.headers['x-device-fingerprint'] || null,
    riskScore,
    severity: 'critical',
    recommendedAction: 'manual_admin_lock',
    autoResponse: {
      action: 'admin_manual_lock',
      applied: true,
      note: `Admin lock applied for ${lockMinutes} minutes`
    },
    signals: {
      lockMinutes,
      actorAdmin: req.user?.email || req.user?.id || null
    },
    metadata: {
      action: 'risk_lock_user'
    },
    timeline: [
      {
        action: 'admin_manual_lock',
        note: `Risk lock enforced for ${lockMinutes} minutes`,
        actorId: req.user?.id || req.user?.sub || undefined
      }
    ]
  });

  return res.status(200).json({
    message: 'User risk lock applied',
    user
  });
});

router.get('/audit/recent', async (req, res) => {
  if (!AdminActionLog) {
    return res.status(200).json({ count: 0, actions: [] });
  }

  const limit = Math.min(Math.max(Number(req.query?.limit) || 25, 1), 200);
  const actions = await AdminActionLog.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.status(200).json({
    count: actions.length,
    actions
  });
});

module.exports = router;
