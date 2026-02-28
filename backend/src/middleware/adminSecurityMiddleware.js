const env = require('../config/env');
const { getClientIp } = require('../utils/device');

function restrictAdminIp(req, res, next) {
  if (!env.adminAllowedIps.length) {
    return next();
  }

  const ip = getClientIp(req);
  if (!env.adminAllowedIps.includes(ip)) {
    return res.status(403).json({ message: 'Admin login not allowed from this IP' });
  }

  return next();
}

function requireAdmin2FA(req, res, next) {
  if (!req.body.adminOtp || req.body.adminOtp !== '123456') {
    return res.status(401).json({ message: 'Admin 2FA OTP required or invalid' });
  }
  return next();
}

module.exports = {
  restrictAdminIp,
  requireAdmin2FA
};
