const speakeasy = require('speakeasy');

const env = require('../config/env');
const User = require('../models/User');
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

function normalizeOtp(rawValue) {
  return String(rawValue || '').trim();
}

async function verifyDatabaseTotp({ email, otp }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, reason: 'missing_email' };
  }

  const admin = await User.findOne({ email: normalizedEmail, role: 'admin' })
    .select('twoFactorSecret isTwoFactorEnabled')
    .lean();

  if (!admin) {
    return { ok: false, reason: 'admin_not_found' };
  }

  if (!admin.twoFactorSecret || admin.isTwoFactorEnabled !== true) {
    return { ok: false, reason: 'admin_2fa_not_enabled' };
  }

  const ok = speakeasy.totp.verify({
    secret: admin.twoFactorSecret,
    encoding: 'base32',
    token: otp,
    window: 1
  });

  if (!ok) {
    return { ok: false, reason: 'invalid_admin_totp' };
  }

  return { ok: true, reason: 'verified' };
}

function verifyStaticSecret(otp) {
  if (!env.admin2FASecret) return false;
  return normalizeOtp(env.admin2FASecret) === normalizeOtp(otp);
}

async function requireAdmin2FA(req, res, next) {
  const otp = normalizeOtp(req.body?.adminOtp || req.body?.otp);
  if (!otp) {
    return res.status(401).json({ message: 'Admin OTP required' });
  }

  const strictMode = env.strictSecurityMode === true;
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (email) {
    const dbCheck = await verifyDatabaseTotp({ email, otp });

    if (dbCheck.ok) {
      return next();
    }

    if (strictMode && dbCheck.reason !== 'admin_not_found') {
      if (dbCheck.reason === 'admin_2fa_not_enabled') {
        return res.status(403).json({ message: 'Admin Google Authenticator setup required' });
      }
      return res.status(401).json({ message: 'Invalid admin OTP' });
    }
  }

  if (verifyStaticSecret(otp)) {
    return next();
  }

  return res.status(401).json({ message: 'Admin 2FA OTP required or invalid' });
}

module.exports = {
  restrictAdminIp,
  requireAdmin2FA
};
