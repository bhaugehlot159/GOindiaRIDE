const express = require('express');
const validator = require('validator');
const User = require('../models/User');
const LoginLog = require('../models/LoginLog');
const { hashPassword, comparePassword, signAccessToken, signRefreshToken } = require('../utils/auth');
const { getClientIp, getDeviceMeta, getCountry } = require('../utils/device');
const { calculateLoginRisk, detectLoginAnomaly } = require('../services/riskService');
const { loginLimiter, otpLimiter } = require('../middleware/rateLimiters');
const { restrictAdminIp, requireAdmin2FA } = require('../middleware/adminSecurityMiddleware');
const { honeypotCheck, submissionTimingCheck, recaptchaPresenceCheck } = require('../middleware/botProtectionMiddleware');
const { proxyVpnRiskCheck } = require('../middleware/networkIntelMiddleware');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');
const { authenticate } = require('../middleware/authMiddleware');
const env = require('../config/env');
const { logSecurityEvent } = require('../services/securityLogService');
const { sendSecurityAlert } = require('../services/alertService');

const router = express.Router();

router.post('/register', honeypotCheck, submissionTimingCheck, recaptchaPresenceCheck, async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'name, email, phone, password are required' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }

  if (!validator.isMobilePhone(phone, 'en-IN')) {
    return res.status(400).json({ message: 'Invalid phone' });
  }

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    return res.status(409).json({ message: 'Email or phone already registered' });
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ name, email, phone, passwordHash, role: role === 'admin' ? 'admin' : 'user' });

  return res.status(201).json({ id: user._id, email: user.email, phone: user.phone, role: user.role });
});

router.post('/login', loginLimiter, honeypotCheck, submissionTimingCheck, proxyVpnRiskCheck, async (req, res) => {
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
    await logSecurityEvent({ userId: user._id, action: 'failed_login', ip, riskScore: user.riskScore || 0, result: 'flagged' });
    if (user.failedLoginAttempts >= 3) {
      await sendSecurityAlert({ type: 'multiple_failed_login', payload: { email, ip, attempts: user.failedLoginAttempts } });
    }
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const trustedDevice = user.trustedDevices.find((item) => item.fingerprint === device.fingerprint);
  const isNewDevice = !trustedDevice;
  const geoMismatch = country !== 'unknown' && user.lastLoginIp && user.lastLoginIp !== ip;
  const riskScore = await calculateLoginRisk({ email, ip, isNewDevice });

  if (riskScore > 70) {
    user.isTemporarilyBannedUntil = new Date(Date.now() + 30 * 60 * 1000);
    user.riskScore = riskScore;
    user.lastRiskUpdate = new Date();
    await user.save();
    await LoginLog.create({ userId: user._id, email, ip, country, ...device, status: 'fail', reason: `Blocked risk score ${riskScore}` });
    await logSecurityEvent({ userId: user._id, action: 'user_blocked', ip, riskScore, result: 'blocked' });
    await sendSecurityAlert({ type: 'high_risk_block', payload: { email, ip, riskScore } });
    return res.status(403).json({ message: 'Login blocked due to high risk score' });
  }

  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  user.lastLoginIp = ip;
  user.riskScore = riskScore;
  user.lastRiskUpdate = new Date();

  if (isNewDevice) {
    user.knownDevices.push(device.fingerprint);
    user.trustedDevices.push({
      fingerprint: device.fingerprint,
      trustScore: 30,
      approvalStatus: 'pending',
      approvalRequired: true,
      isBlocked: false
    });

    await user.save();
    await LoginLog.create({
      userId: user._id,
      email,
      ip,
      country,
      ...device,
      status: 'fail',
      reason: 'New device pending approval'
    });

    return res.status(403).json({
      message: 'New device detected. Approval required before login is allowed.',
      requiresDeviceApproval: true,
      deviceFingerprint: device.fingerprint
    });
  }

  if (trustedDevice.isBlocked) {
    await user.save();
    return res.status(403).json({ message: 'This device is blocked. Please use an approved device.' });
  }

  if (trustedDevice.approvalStatus !== 'approved') {
    await user.save();
    return res.status(403).json({ message: 'Device approval is pending.', requiresDeviceApproval: true });
  }

  trustedDevice.approvalRequired = false;
  trustedDevice.trustScore = Math.min(100, trustedDevice.trustScore + 5);
  trustedDevice.lastSeenAt = new Date();

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();

  await trackBehaviorEvent({
    userId: user._id,
    eventType: 'login',
    ip,
    city: req.headers['x-city'] || 'unknown',
    deviceFingerprint: device.fingerprint,
    metadata: { country }
  });

  const behavior = await evaluateBehaviorRisk(user._id);
  if (behavior.score > 70) {
    user.isTemporarilyBannedUntil = new Date(Date.now() + 30 * 60 * 1000);
    user.riskScore = behavior.score;
    user.lastRiskUpdate = new Date();
    await user.save();
    await logSecurityEvent({ userId: user._id, action: 'behavior_high_risk', ip, riskScore: behavior.score, result: 'flagged' });
    if (behavior.score > 80) {
      await sendSecurityAlert({ type: 'risk_score_over_80', payload: { email, ip, riskScore: behavior.score } });
    }
  }

  await LoginLog.create({ userId: user._id, email, ip, country, ...device, status: 'success', reason: geoMismatch || isNewDevice ? 'Extra verification advised' : 'ok' });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  return res.status(200).json({
    accessToken,
    role: user.role,
    riskScore: user.riskScore,
    requiresExtraOtp: isNewDevice || geoMismatch || behavior.score >= 40
  });
});

router.post('/trusted-devices/approve', authenticate, async (req, res) => {
  const { fingerprint } = req.body;

  if (!fingerprint) {
    return res.status(400).json({ message: 'fingerprint is required' });
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const device = user.trustedDevices.find((item) => item.fingerprint === fingerprint);
  if (!device) {
    return res.status(404).json({ message: 'Device not found' });
  }

  if (device.isBlocked) {
    return res.status(409).json({ message: 'Blocked device cannot be approved until unblocked' });
  }

  device.approvalStatus = 'approved';
  device.approvalRequired = false;
  device.approvedAt = new Date();
  device.lastSeenAt = new Date();
  device.trustScore = Math.max(device.trustScore, 50);
  await user.save();

  return res.status(200).json({ message: 'Device approved successfully', fingerprint });
});

router.get('/trusted-devices', authenticate, async (req, res) => {
  const user = await User.findById(req.user.id).select('trustedDevices');
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.status(200).json({ trustedDevices: user.trustedDevices });
});

router.post('/admin/login', loginLimiter, restrictAdminIp, requireAdmin2FA, honeypotCheck, submissionTimingCheck, proxyVpnRiskCheck, async (req, res, next) => {
  req.body.role = 'admin';
  next();
}, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, role: 'admin' });
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid admin credentials' });
  }
  const accessToken = signAccessToken(user);
  await logSecurityEvent({ userId: user._id, action: 'admin_login', ip: getClientIp(req), riskScore: user.riskScore || 0, result: 'allowed' });
  await sendSecurityAlert({ type: 'admin_login', payload: { adminEmail: user.email, ip: getClientIp(req) } });
  return res.status(200).json({ accessToken, role: user.role });
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

    const device = getDeviceMeta(req);
    const trustedDevice = user.trustedDevices.find((item) => item.fingerprint === device.fingerprint);

    if (!trustedDevice) {
      return res.status(403).json({ message: 'New device is not approved for refresh', requiresDeviceApproval: true });
    }

    if (trustedDevice.isBlocked) {
      return res.status(403).json({ message: 'Blocked device cannot refresh token' });
    }

    if (trustedDevice.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Device approval is pending', requiresDeviceApproval: true });
    }

    trustedDevice.lastSeenAt = new Date();
    trustedDevice.approvalRequired = false;
    await user.save();

    const accessToken = signAccessToken(user);
    return res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/otp/verify', otpLimiter, async (req, res) => {
  const { otp } = req.body;
  if (otp !== '111111') {
    return res.status(401).json({ message: 'Invalid OTP' });
  }
  return res.status(200).json({ message: 'OTP verified' });
});

module.exports = router;
