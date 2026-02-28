const express = require('express');
const { authenticate, authorizeRole } = require('../middleware/authMiddleware');
const { getClientIp } = require('../utils/device');
const AdminActionLog = require('../models/AdminActionLog');
const { getSecurityDashboardStats } = require('../services/securityLogService');

const router = express.Router();

router.use(authenticate, authorizeRole('admin'));

router.get('/dashboard', async (req, res) => {
  await AdminActionLog.create({ adminId: req.user.id, action: 'view_dashboard', ip: getClientIp(req) });
  const security = await getSecurityDashboardStats();
  return res.status(200).json({ message: 'Admin-only route access granted', security });
});

module.exports = router;
