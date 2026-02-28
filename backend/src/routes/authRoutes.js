const express = require('express');
const validator = require('validator');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const { hashPassword, comparePassword, signAccessToken, signRefreshToken } = require('../utils/auth');
const { getClientIp, getDeviceMeta, getCountry } = require('../utils/device');
const { calculateLoginRisk, detectLoginAnomaly } = require('../services/riskService');
const { loginLimiter, otpLimiter } = require('../middleware/rateLimiters');
const { restrictAdminIp, requireAdmin2FA } = require('../middleware/adminSecurityMiddleware');
const env = require('../config/env');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, password are required' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ name, email, passwordHash, role: role === 'admin' ? 'admin' : 'user' });

  return res.status(201).json({ id: user._id, email: user.email, role: user.role });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const ip = getClientIp(req);
  const country = getCountry(req);
  const device = getDeviceMeta(req);

  const user = await User.findOne({ email });
  if (!user) {
    await LoginLog.create({ email, ip, country, ...device, status: 'fail', reason: 'User not found' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    return res.status(423).json({ message: 'Account locked for 30 minutes due to failed login attempts' });
  }

  if (await detectLoginAnomaly(ip)) {
    user.isTemporarilyBannedUntil = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    return res.status(403).json({ message: 'Anomalous traffic detected. Temporary ban applied.' });
  }

  const matched = await comparePassword(password, user.passwordHash);
  if (!matched) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await LoginLog.create({ userId: user._id, email, ip, country, ...device, status: 'fail', reason: 'Wrong password' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const isNewDevice = !user.knownDevices.includes(device.fingerprint);
  const geoMismatch = country !== 'unknown' && user.lastLoginIp && user.lastLoginIp !== ip;
  const riskScore = await calculateLoginRisk({ email, ip, isNewDevice });

  if (riskScore > 70) {
    user.isTemporarilyBannedUntil = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    await LoginLog.create({ userId: user._id, email, ip, country, ...device, status: 'fail', reason: `Blocked risk score ${riskScore}` });
    return res.status(403).json({ message: 'Login blocked due to high risk score' });
  }

  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  user.lastLoginIp = ip;
  if (isNewDevice) user.knownDevices.push(device.fingerprint);

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();

  await LoginLog.create({ userId: user._id, email, ip, country, ...device, status: 'success', reason: geoMismatch || isNewDevice ? 'Extra verification advised' : 'ok' });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return res.json({
    accessToken,
    role: user.role,
    requiresExtraOtp: isNewDevice || geoMismatch
  });
});

router.post('/admin/login', loginLimiter, restrictAdminIp, requireAdmin2FA, async (req, res, next) => {
  req.body.role = 'admin';
  next();
}, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, role: 'admin' });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid admin credentials' });
  }
  const accessToken = signAccessToken(user);
  return res.json({ accessToken, role: user.role });
});

router.post('/refresh-token', async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: 'Missing refresh token' });

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, env.jwtRefreshSecret);
    const user = await User.findById(payload.sub);
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const accessToken = signAccessToken(user);
    return res.json({ accessToken });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/otp/verify', otpLimiter, async (req, res) => {
  const { otp } = req.body;
  if (otp !== '111111') {
    return res.status(401).json({ message: 'Invalid OTP' });
  }
  return res.json({ message: 'OTP verified' });
});

module.exports = router;
