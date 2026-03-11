console.log("AUTH ROUTES LOADED FROM:", __filename);
const QRCode = require("qrcode");
const speakeasy = require("speakeasy");
const express = require('express');
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const Otp = require("../models/Otp");
const { sendEmail } = require("../utils/mailer");
const validator = require('validator');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const LoginLog = require('../models/LoginLog');
const authUtils = require('../utils/auth');
const { hashPassword, comparePassword, signAccessToken, signRefreshToken } = authUtils;
const hashToken = typeof authUtils.hashToken === 'function'
  ? authUtils.hashToken
  : (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const { getClientIp, getDeviceMeta, getCountry } = require('../utils/device');
const { calculateLoginRisk, detectLoginAnomaly } = require('../services/riskService');
const { loginLimiter, otpLimiter } = require("../middleware/rateLimiters");
const { restrictAdminIp, requireAdmin2FA } = require('../middleware/adminSecurityMiddleware');
const { honeypotCheck, submissionTimingCheck, recaptchaPresenceCheck } = require('../middleware/botProtectionMiddleware');
const { proxyVpnRiskCheck } = require('../middleware/networkIntelMiddleware');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');
const env = require('../config/env');

const router = express.Router();

const DEVICE_APPROVAL_ENABLED = true;

function findTrustedDevice(user, deviceFingerprint) {
  if (!user || !Array.isArray(user.trustedDevices) || !deviceFingerprint) return null;

  return (
    user.trustedDevices.find(
      (d) => d && d.fingerprint === deviceFingerprint
    ) || null
  );
}

function isApprovedTrustedDevice(device) {
  if (!device) return false;
  if (device.isBlocked) return false;

  // Purane legacy devices break na hon
  if (
    device.approvalStatus === undefined &&
    device.approvalRequired === undefined
  ) {
    return true;
  }

  if (device.approvalStatus === "approved") return true;
  if (device.approvalRequired === false && device.approvalStatus !== "rejected") {
    return true;
  }

  return false;
}

function buildPendingTrustedDevice({
  deviceFingerprint,
  userAgent = null,
  ip = null,
  label = null,
}) {
  const now = new Date();

  return {
    fingerprint: deviceFingerprint,
    trustScore: 10,
    firstSeenAt: now,
    lastSeenAt: now,
    approvedAt: null,
    label,
    ip,
    userAgent,
    isBlocked: false,
    blockedAt: null,

    approvalStatus: "pending",
    approvalRequired: true,
    approvalRequestedAt: now,
    approvedBySessionId: null,
    approvalMethod: "manual",
    rejectedAt: null,
    rejectionReason: null,
  };
}

function getDeviceApprovalResult(user, deviceFingerprint) {
  const device = findTrustedDevice(user, deviceFingerprint);

  if (!device) {
    return {
      exists: false,
      approved: false,
      blocked: false,
      pending: false,
      rejected: false,
      device: null,
    };
  }

  return {
    exists: true,
    approved: isApprovedTrustedDevice(device),
    blocked: !!device.isBlocked,
    pending: device.approvalStatus === "pending",
    rejected: device.approvalStatus === "rejected",
    device,
  };
}

router.post('/register', honeypotCheck, submissionTimingCheck, recaptchaPresenceCheck, async (req, res) => {
  const { name, email, phone, password, role, accountType } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'name, email, phone, password are required' });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }

  if (!validator.isMobilePhone(String(phone), 'any', { strictMode: false })) {
    return res.status(400).json({ message: 'Invalid phone' });
  }

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    return res.status(409).json({ message: 'Email or phone already registered' });
  }

  const passwordHash = await hashPassword(password);
  const normalizedAccountType = role === 'admin' ? 'admin' : (String(accountType || role || '').toLowerCase() === 'driver' ? 'driver' : 'customer');
  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: role === 'admin' ? 'admin' : 'user',
    accountType: normalizedAccountType
  });

  return res.status(201).json({ id: user._id, email: user.email, phone: user.phone, role: user.role, accountType: user.accountType });
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
    await LoginLog.create({ userId: user._id, email: user.email, ip, country, ...device, status: 'fail', reason: 'Wrong password' });
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  // 🔐 2FA Check for any user
if (user.isTwoFactorEnabled) {

    const otp = req.body.otp;

    if (!otp) {
        return res.status(401).json({
            message: "OTP required",
            requiresOtp: true
        });
    }

    const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: otp,
        window: 1
    });

    if (!isValid) {
        return res.status(401).json({ message: "Invalid OTP" });
    }
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
    return res.status(403).json({ message: 'Login blocked due to high risk score' });
  }

  user.failedLoginAttempts = 0;
  user.accountLockedUntil = null;
  user.lastLoginIp = ip;
  user.riskScore = riskScore;
  user.lastRiskUpdate = new Date();

  if (isNewDevice) {
    user.knownDevices.push(device.fingerprint);
    user.trustedDevices.push({ fingerprint: device.fingerprint, trustScore: 30 });
  } else {
    trustedDevice.trustScore = Math.min(100, trustedDevice.trustScore + 5);
    trustedDevice.lastSeenAt = new Date();
  }

 // 🔐 Extra Admin Protection

if (user.role === "admin") {

    // --------------------------
    // 1) IP restriction check
    // --------------------------
    if (env.adminAllowedIps.length) {
        const ip = getClientIp(req);
        if (!env.adminAllowedIps.includes(ip)) {
            return res.status(403).json({ message: "Admin login not allowed from this IP" });
        }
    }

    // --------------------------
    // 2) Google Authenticator OTP verify
    // --------------------------
    const isValidOtp = speakeasy.totp.verify({
        secret: user.twoFactorSecret,   // DB stored secret
        encoding: "base32",
        token: req.body.adminOtp,       // 🔥 Correct key
        window: 1
    });

    if (!isValidOtp) {
        return res.status(401).json({ message: "Invalid Google Authenticator OTP" });
    }
}
  
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = hashToken(refreshToken);
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
  return res.status(200).json({ accessToken, role: user.role });
});

router.post('/2fa/setup', async (req, res) => {

  if (process.env.NODE_ENV === "production") {
   return res.status(403).json({ message: "Use /2fa/setup-secure" });
 }

  try {

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `GoIndiaRide (${user.email})`
    });

    user.twoFactorSecret = secret.base32;
    user.isTwoFactorEnabled = false;
    await user.save();

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      message: "Scan QR with Google Authenticator",
      qrCode: qrCodeUrl,
      manualKey: secret.base32
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

 router.post('/2fa/setup-secure', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.sub;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `GoIndiaRide (${user.email})`
    });

    user.twoFactorSecret = secret.base32;
    user.isTwoFactorEnabled = false;
    await user.save();

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      message: "Scan QR with Google Authenticator",
      qrCode: qrCodeUrl,
      manualKey: secret.base32
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

 router.post('/2fa/confirm-secure', authenticate, async (req, res) => {

  if (process.env.NODE_ENV === "production") {
  return res.status(403).json({ message: "Use /2fa/confirm-secure" });
 }

  try {
    const otp = req.body.otp;

    if (!otp) {
      return res.status(400).json({ message: "OTP required" });
    }

    const userId = req.user?.id || req.user?._id || req.user?.sub;
    const user = await User.findById(userId);

    if (!user || !user.twoFactorSecret) {
      return res.status(404).json({ message: "2FA setup not found" });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: otp,
      window: 1
    });

    if (!isValid) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    user.isTwoFactorEnabled = true;
    await user.save();

    return res.status(200).json({ message: "2FA enabled successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
       
 router.post('/2fa/confirm', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP required" });
    }

    const user = await User.findOne({ email });

    if (!user || !user.twoFactorSecret) {
      return res.status(404).json({ message: "2FA setup not found" });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: otp,
      window: 1
    });

    if (!isValid) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    user.isTwoFactorEnabled = true;
    await user.save();

    return res.status(200).json({
      message: "2FA enabled successfully"
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
  
/* router.post('/refresh-token', async (req, res) => {

 const tokenHash = hashToken(token);

// ✅ New rotation check (array)
const hasTokenInArray = Array.isArray(user.refreshTokens) &&
  user.refreshTokens.some(t => t.tokenHash === tokenHash);

if (!hasTokenInArray) {
  // 🔁 fallback to old single-token (backward compatible)
  if (!user.refreshToken || user.refreshToken !== tokenHash) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
}
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: 'Missing refresh token' });

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, env.jwtRefreshSecret);
    const user = await User.findById(payload.sub);
    if (!user || user.refreshToken !== hashToken(token)) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    // ✅ ROTATION START
const oldHash = hashToken(token);

// 1) पुराना refresh token array से remove करो (अगर मौजूद है)
if (Array.isArray(user.refreshTokens)) {
  user.refreshTokens = user.refreshTokens.filter(t => t.tokenHash !== oldHash);
}

// 2) नया access + refresh issue करो
const newAccessToken = signAccessToken(user);
const newRefreshToken = signRefreshToken(user);

// 3) DB में save करो (backward compatible)
user.refreshToken = hashToken(newRefreshToken);

if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
user.refreshTokens.push({
  tokenHash: hashToken(newRefreshToken),
  createdAt: new Date(),
  ip: req.ip,
  deviceFingerprint: req.headers['x-device-fingerprint'] || 'unknown'
});

await user.save();

// 4) Cookie में नया refresh token set करो
res.cookie('refreshToken', newRefreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60 * 1000
});
// ✅ ROTATION END
  // const accessToken = signAccessToken(user);
    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});*/
  router.post('/refresh-token', async (req, res) => {
  const token = req.cookies?.refreshToken; // ✅ पहले token
  if (!token) return res.status(401).json({ message: 'Missing refresh token' });

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(token, env.jwtRefreshSecret);

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    const oldHash = hashToken(token);

    // ✅ 1) Check: array में token है?
    const hasInArray =
      Array.isArray(user.refreshTokens) &&
      user.refreshTokens.some((t) => t.tokenHash === oldHash);

    // ✅ 2) Backward compatible: पुराना single refreshToken check
    const hasLegacy = user.refreshToken && user.refreshToken === oldHash;

    if (!hasInArray && !hasLegacy) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    // ✅ ADD: carry-forward session & telemetry BEFORE old token is removed
const _oldEntryCF = Array.isArray(user.refreshTokens)
  ? user.refreshTokens.find((t) => t.tokenHash === oldHash)
  : null;

const _cryptoCF = require("crypto");
const _sessionIdCF =
  _oldEntryCF?.sessionId ||
  (_cryptoCF.randomUUID
    ? _cryptoCF.randomUUID()
    : _cryptoCF.randomBytes(16).toString("hex"));

const _sessionStartedAtCF = _oldEntryCF?.sessionStartedAt || new Date();
const _userAgentCF = _oldEntryCF?.userAgent || req.headers["user-agent"] || "";
    // ✅ ROTATION: old हटाओ
    if (Array.isArray(user.refreshTokens)) {
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== oldHash);
    }

    // ✅ नया tokens issue करो
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user); // Step-2 में इसे unique करेंगे

    // ✅ DB save (legacy + array दोनों)
    user.refreshToken = hashToken(newRefreshToken);

    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];
    user.refreshTokens.push({
      tokenHash: hashToken(newRefreshToken),
      createdAt: new Date(),
      ip: req.ip || 'unknown',
      deviceFingerprint: req.headers['x-device-fingerprint'] || 'unknown',
    });

    await user.save();

    // ✅ Cookie update
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',          // ✅ localhost पर false रखो (production में true)
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // ✅ Response
    return res.status(200).json({
      accessToken: newAccessToken,
      // refreshToken: newRefreshToken, // ✅ सिर्फ testing के लिए; prod में मत भेजना
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// Add this route BELOW your existing /refresh-token route (do NOT delete anything).

router.post("/refresh-token-v2", async (req, res) => {
  // token: cookies OR body OR header (backward compatible)
  const token =
    req.cookies?.refreshToken ||
    req.cookies?.rt ||
    req.body?.refreshToken ||
    req.headers["x-refresh-token"];

  if (!token) {
    return res.status(401).json({ message: "Missing refresh token" });
  }

  // deviceFingerprint mandatory (Uber/Ola style)
  const df =
    req.body?.deviceFingerprint ||
    req.headers["x-device-fingerprint"] ||
    null;

  if (!df) {
    return res.status(400).json({ message: "deviceFingerprint required" });
  }

  try {
    const jwt = require("jsonwebtoken");

    // verify refresh token
    const payload = jwt.verify(token, env.jwtRefreshSecret);
    const userId = payload?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const oldHash = hashToken(token);

    // 1) Check: array में token है?
    const hasInArray =
      Array.isArray(user.refreshTokens) &&
      user.refreshTokens.some((t) => t.tokenHash === oldHash);

    // 2) Backward compatible: पुराना single refreshToken check
    const hasLegacy = user.refreshToken && user.refreshToken === oldHash;

    if (!hasInArray && !hasLegacy) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // old entry (if exists) for device match + carry-forward
    const oldEntry = Array.isArray(user.refreshTokens)
      ? user.refreshTokens.find((t) => t.tokenHash === oldHash)
      : null;

    // device match enforce (अगर entry मिली है तो)
    if (oldEntry?.deviceFingerprint && oldEntry.deviceFingerprint !== df) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    // carry-forward session/telemetry (rotation के बाद fields गायब नहीं होंगे)
    const cryptoModule = require("crypto");

    const carrySessionId =
      oldEntry?.sessionId ||
      (cryptoModule.randomUUID
        ? cryptoModule.randomUUID()
        : cryptoModule.randomBytes(16).toString("hex"));

    const carrySessionStartedAt = oldEntry?.sessionStartedAt || new Date();
    const carryUserAgent = oldEntry?.userAgent || req.headers["user-agent"] || "";

    // ROTATION: old हटाओ (sirf array case)
    if (Array.isArray(user.refreshTokens)) {
      user.refreshTokens = user.refreshTokens.filter(
        (t) => t.tokenHash !== oldHash
      );
    }

    // नया tokens issue करो
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // DB save (legacy + array दोनों)
    user.refreshToken = hashToken(newRefreshToken);

    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];

    user.refreshTokens.push({
      tokenHash: hashToken(newRefreshToken),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // optional
      ip: req.ip || "unknown",
      deviceFingerprint: df,

      // telemetry + session
      userAgent: carryUserAgent,
      lastUsedAt: new Date(),
      sessionId: carrySessionId,
      sessionStartedAt: carrySessionStartedAt,
    });

    await user.save();

    // Cookie update
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      accessToken: newAccessToken,
      // refreshToken: newRefreshToken, // testing only
    });
  } catch (error) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

  router.post("/otp/verify", async (req, res) => {
  try {
    // ✅ email + sms दोनों support (पुराने frontend के लिए defaults)
    const {
      channel = "email",
      accountType = "customer",
      email,
      phone,
      otp,
      deviceFingerprint,
    } = req.body;

    if (!otp) return res.status(400).json({ message: "OTP required" });

    if (!["email", "sms"].includes(channel)) {
      return res.status(400).json({ message: "Invalid channel (email/sms)" });
    }

    if (!["customer", "driver", "admin"].includes(accountType)) {
      return res.status(400).json({ message: "Invalid accountType" });
    }

    // ✅ identifier normalize
    let identifier = null;
    let cleanEmail = null;
    let cleanPhone = null;

    if (channel === "email") {
      if (!email) return res.status(400).json({ message: "Email required" });
      cleanEmail = String(email).trim().toLowerCase();
      identifier = cleanEmail;
    } else {
      if (!phone) return res.status(400).json({ message: "Phone required" });
      cleanPhone = String(phone).trim();
      identifier = cleanPhone;
    }

    // ✅ OTP doc find
    const otpDoc = await Otp.findOne({
      identifier,
      channel,
      accountType,
      purpose: "login",
    });

    if (!otpDoc) {
      return res
        .status(400)
        .json({ message: "OTP not found. Please request again." });
    }

    // ✅ one-time use
    if (otpDoc.verifiedAt) {
      return res
        .status(400)
        .json({ message: "OTP already used. Please request a new one." });
    }

    // ✅ expiry
    if (new Date(otpDoc.expiresAt).getTime() < Date.now()) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res
        .status(400)
        .json({ message: "OTP expired. Please request again." });
    }

    // ✅ attempts limit (server-side)
    const isTest = String(process.env.TEST_MODE || "")
      .toLowerCase()
      .trim() === "true";
    const OTP_ATTEMPTS_LIMIT = Number(
      process.env.OTP_VERIFY_ATTEMPTS || (isTest ? 100 : 5)
    );

    if ((otpDoc.attempts || 0) >= OTP_ATTEMPTS_LIMIT) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res
        .status(429)
        .json({ message: "Too many wrong attempts. Request new OTP." });
    }

    // ✅ compare OTP
    const ok = await bcrypt.compare(String(otp).trim(), otpDoc.otpHash);
    if (!ok) {
      otpDoc.attempts = (otpDoc.attempts || 0) + 1;
      await otpDoc.save();
      return res.status(401).json({
        message: "Invalid OTP",
        attemptsLeft: Math.max(0, OTP_ATTEMPTS_LIMIT - (otpDoc.attempts || 0)),
      });
    }

    // ✅ mark used
    otpDoc.verifiedAt = new Date();
    await otpDoc.save();

    // ✅ find user
    let user = null;
    if (channel === "email") user = await User.findOne({ email: cleanEmail });
    else user = await User.findOne({ phone: cleanPhone });

    // ✅ if not found: admin नहीं बनेगा; customer/driver auto-create
    if (!user) {
      if (accountType === "admin") {
        return res.status(403).json({ message: "Admin not found. Contact support." });
      }

      const safeName =
        channel === "email"
          ? (cleanEmail.split("@")[0] || "New User")
          : "New User";

      // NOTE: अगर आपके schema में phone/email required है, तो fallback values दे रहे हैं
      const fallbackPhone = cleanPhone || "9100000000";
      const fallbackEmail = cleanEmail || `otp_${Date.now()}@example.com`;

      const generatedHash = await bcrypt.hash(
        `OTP_LOGIN_ONLY_${identifier}_${Date.now()}`,
        12
      );

      user = new User({
        name: safeName,
        email: fallbackEmail,
        phone: fallbackPhone,
        passwordHash: generatedHash,
        accountType,
        role: "user",
      });

      await user.save();
    }

    // ✅ accountType guard (portal separation)
    if (user.accountType && user.accountType !== accountType) {
      return res.status(403).json({
        message: `Account type mismatch. This account is registered as ${user.accountType}`,
      });
    }
    if (!user.accountType) user.accountType = accountType;
    
    const clientIp =
  req.ip ||
  req.headers["x-forwarded-for"] ||
  req.socket?.remoteAddress ||
  null;

const clientUserAgent = req.headers["user-agent"] || null;

const approvalCheck = getDeviceApprovalResult(user, deviceFingerprint);
const hasAnyTrustedDevices =
  Array.isArray(user.trustedDevices) && user.trustedDevices.length > 0;

// 1) Blocked device
if (approvalCheck.blocked) {
  return res.status(403).json({
    message: "Device blocked",
    code: "DEVICE_BLOCKED"
  });
}

// 2) Pending device
if (approvalCheck.pending) {
  return res.status(403).json({
    message: "Device approval required",
    code: "DEVICE_APPROVAL_REQUIRED",
    approvalStatus: "pending"
  });
}

// 3) Rejected device
if (approvalCheck.rejected) {
  return res.status(403).json({
    message: "Device rejected",
    code: "DEVICE_REJECTED",
    approvalStatus: "rejected"
  });
}

// 4) First-ever device -> auto approve (taaki user lock na ho)
if (DEVICE_APPROVAL_ENABLED && !approvalCheck.exists && !hasAnyTrustedDevices) {
  const now = new Date();

  if (!Array.isArray(user.trustedDevices)) {
    user.trustedDevices = [];
  }

  user.trustedDevices.push({
    fingerprint: deviceFingerprint,
    trustScore: 80,
    firstSeenAt: now,
    lastSeenAt: now,
    approvedAt: now,
    label: null,
    ip: clientIp,
    userAgent: clientUserAgent,
    isBlocked: false,
    blockedAt: null,

    approvalStatus: "approved",
    approvalRequired: false,
    approvalRequestedAt: null,
    approvedBySessionId: null,
    approvalMethod: "legacy_auto",
    rejectedAt: null,
    rejectionReason: null
  });

  await user.save();
}

// 5) New unknown device -> pending save + deny full login
if (DEVICE_APPROVAL_ENABLED && !approvalCheck.exists && hasAnyTrustedDevices) {
  if (!Array.isArray(user.trustedDevices)) {
    user.trustedDevices = [];
  }

  user.trustedDevices.push(
    buildPendingTrustedDevice({
      deviceFingerprint,
      userAgent: clientUserAgent,
      ip: clientIp,
      label: null
    })
  );

  await user.save();

  return res.status(403).json({
    message: "New device approval required",
    code: "NEW_DEVICE_APPROVAL_REQUIRED",
    approvalStatus: "pending"
  });
}
    // ✅ tokens
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // ✅ refresh token store
    const ip = req.ip;
    const df = deviceFingerprint || req.headers["x-device-fingerprint"] || null;

    user.refreshToken = hashToken(refreshToken);
    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];

    // ✅ TTL parse (default 30d)
    const ttl = String(process.env.REFRESH_TOKEN_TTL || "30d").trim();
    const m = ttl.match(/^(\d+)\s*([smhd])$/i);
    let ms = 30 * 24 * 60 * 60 * 1000;
    if (m) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      ms =
        u === "s"
          ? n * 1000
          : u === "m"
          ? n * 60 * 1000
          : u === "h"
          ? n * 60 * 60 * 1000
          : n * 24 * 60 * 60 * 1000;
    }
  {
    const ip = req.ip;
    
    const crypto = require("crypto");
    const sessionId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString("hex");
    const sessionStartedAt = new Date();

    user.refreshTokens.push({
      tokenHash: hashToken(refreshToken),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ms),
      deviceFingerprint: df,
      userAgent: req.headers["user-agent"],
      lastUsedAt: new Date(),
      sessionId,
      sessionStartedAt,
      ip,
    });

    await user.save();
  }
    return res.status(200).json({
      message: "OTP verified successfully",
      accessToken,
      refreshToken, // testing के लिए; production में cookie में रख सकते हो
      role: user.role,
      accountType: user.accountType,
    });
  } catch (error) {
    console.error("OTP VERIFY ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});
// 🔄 Refresh access token
router.post("/refresh", async (req, res) => {
  try {

    const refreshToken =
  req.cookies?.refreshToken ||
  req.cookies?.rt ||
  req.body?.refreshToken ||
  req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const tokenHash = hashToken(refreshToken);
    const df = req.body?.deviceFingerprint || req.headers["x-device-fingerprint"] || null;
    if (!df) {
      return res.status(400).json({ message: "deviceFingerprint required" });
    }

    const user = await User.findOne({
  refreshTokens: {
    $elemMatch: {
      tokenHash: tokenHash,
      deviceFingerprint: df,
    },
  },
});

    if (!user) {
  const sameTokenUser = await User.findOne({
  refreshTokens: { $elemMatch: { tokenHash: tokenHash } },
});

if (sameTokenUser) {
  console.warn("Refresh denied: device mismatch", {
    ip: req.ip,
    ua: req.headers["user-agent"],
    deviceFingerprint: df,
  });
  return res.status(403).json({ message: "Invalid refresh token" }); // same generic msg
}
  console.warn("Possible refresh token reuse detected:", {
    ip: req.ip,
    ua: req.headers["user-agent"],
  });

    // ✅ Reuse detected: अगर token valid है तो userId निकालकर "logout all sessions" कर दो
  try {
    const jwt = require("jsonwebtoken");
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const victimUserId = payload?.sub;

    if (victimUserId) {
      await User.updateOne(
        { _id: victimUserId },
        { $set: { refreshTokens: [] } } // सभी sessions logout
      );
    }
  } catch (e) {
    // token verify नहीं हुआ तो ignore
  }
  return res.status(403).json({ message: "Invalid refresh token" });
}

    const newAccessToken = signAccessToken(user);

// ✅ ROTATION: नया refresh token बनाओ
const newRefreshToken = signRefreshToken(user);

// ✅ पुराने refresh token को remove करो, और नया add करो
const oldHash = hashToken(refreshToken);
const newHash = hashToken(newRefreshToken);

// ✅ ADD: old session info carry forward
const oldEntry =
  (user.refreshTokens || []).find((t) => t.tokenHash === oldHash) || null;

const carrySessionId = oldEntry?.sessionId || null;
const carrySessionStartedAt = oldEntry?.sessionStartedAt || null;
// ✅ ADD: define final session fields (fallback if carry is null)
const _cryptoFix2 = require("crypto");

const _finalSessionId2 =
  carrySessionId ||
  (_cryptoFix2.randomUUID
    ? _cryptoFix2.randomUUID()
    : _cryptoFix2.randomBytes(16).toString("hex"));

const _finalSessionStartedAt2 = carrySessionStartedAt || new Date();
// ✅ Old token hash remove + new add (NO updateOne conflict)
user.refreshTokens = (user.refreshTokens || []).filter(
  (t) => t.tokenHash !== oldHash
);

user.refreshTokens.push({
  tokenHash: newHash,
  createdAt: new Date(),
  ip: req.ip,
  deviceFingerprint: df,
  userAgent: req.headers["user-agent"],
  sessionId: _finalSessionId2,
  sessionStartedAt: _finalSessionStartedAt2,
  lastUsedAt: new Date(),
});

await user.save();

// ✅ अब response में दोनों दो (testing)
return res.status(200).json({
  accessToken: newAccessToken,
  refreshToken: newRefreshToken,
});
  } catch (error) {
    console.error("REFRESH TOKEN ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ✅ REQUEST OTP (EMAIL/SMS) — अभी email भेज रहे हैं (Google Workspace SMTP)
router.post("/request-otp", async (req, res) => {
  try {
    const { channel, accountType, email, phone } = req.body;

    // 1) Basic validation
    if (!channel || !["email", "sms"].includes(channel)) {
      return res.status(400).json({ message: "Invalid channel (email/sms)" });
    }
    if (!accountType || !["customer", "driver", "admin"].includes(accountType)) {
      return res.status(400).json({ message: "Invalid accountType" });
    }

    // 2) Identify + normalize
    let identifier = null;
    let cleanEmail = null;
    let cleanPhone = null;

    if (channel === "email") {
      if (!email) return res.status(400).json({ message: "Email required" });
      cleanEmail = String(email).trim().toLowerCase();
      identifier = cleanEmail;
    } else {
      if (!phone) return res.status(400).json({ message: "Phone required" });
      cleanPhone = String(phone).trim();
      identifier = cleanPhone;
    }

    // 3) Load existing OTP doc (for cooldown + sendCount)
    const existing = await Otp.findOne({
      identifier,
      channel,
      accountType,
      purpose: "login",
    });

    // 4) Rate control (429) - test mode friendly
    const isTest = String(process.env.TEST_MODE || "").toLowerCase().trim() === "true";

    const OTP_COOLDOWN_MS = isTest
      ? 1000
      : Number(process.env.OTP_COOLDOWN_MS || 30000); // default 30s

    const OTP_MAX_SEND = isTest
      ? 1000
      : Number(process.env.OTP_MAX_SEND || 10); // default 10

    // Cooldown check
    if (existing?.lastSentAt) {
      const diffMs = Date.now() - new Date(existing.lastSentAt).getTime();
      if (diffMs < OTP_COOLDOWN_MS) {
        return res.status(429).json({
          message: `Please wait ${Math.ceil(
            (OTP_COOLDOWN_MS - diffMs) / 1000
          )} seconds before requesting OTP again`,
        });
      }
    }

    // sendCount limit check
    if ((existing?.sendCount || 0) >= OTP_MAX_SEND) {
      return res.status(429).json({
        message: "OTP request limit reached. Try later.",
      });
    }

    // 5) Generate OTP (6 digit) + hash
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 12);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // 6) Upsert OTP doc (unique index के अनुसार)
    const update = {
      $set: {
        email: cleanEmail,
        phone: cleanPhone,
        otpHash,
        expiresAt,
        attempts: 0,
        verifiedAt: null,
        ip: req.ip,
      },
      $setOnInsert: {
        purpose: "login",
      },
      $inc: { sendCount: 1 },
      $currentDate: { lastSentAt: true },
    };

    await Otp.findOneAndUpdate(
      { identifier, channel, accountType, purpose: "login" },
      update,
      { upsert: true, new: true }
    );

    // 7) Send OTP
    if (channel === "email") {
      await sendEmail({
        to: cleanEmail,
        subject: "Your GOIndiaRIDE Login OTP",
        text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height:1.6">
            <h2>GOIndiaRIDE OTP</h2>
            <p>Your login OTP is:</p>
            <div style="font-size:22px; font-weight:bold; letter-spacing:2px">${otp}</div>
            <p>This OTP will expire in <b>5 minutes</b>.</p>
            <p>If you did not request this, ignore this email.</p>
          </div>
        `,
      });
    } else {
      // SMS sending not implemented yet
    }

    // 8) Response (devOtp only in non-production)
    const isProd = String(process.env.NODE_ENV || "").toLowerCase().trim() === "production";
    return res.status(200).json({
      message: "OTP sent successfully",
      ...(isProd ? {} : { devOtp: otp }),
    });
  } catch (err) {
    console.error("request-otp error:", err);
    return res.status(500).json({ message: "Server error in request-otp" });
  }
});

   router.post("/logout", async (req, res) => {
  try {
    const refreshToken =
      req.body?.refreshToken ||
      req.cookies?.refreshToken ||
      req.cookies?.rt ||
      req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(200).json({ message: "Logged out" });
    }

    const tokenHash = hashToken(refreshToken);

    await User.updateOne(
      { "refreshTokens.tokenHash": tokenHash },
      { $pull: { refreshTokens: { tokenHash } } }
    );

    try {
      res.clearCookie("refreshToken");
      res.clearCookie("rt");
    } catch (_) {}

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
});
// Helper: Access token verify (for trusted-devices management endpoints)
function _getAccessSecret(envObj) {
  return (
    envObj?.jwtAccessSecret ||
    envObj?.jwtAccessTokenSecret ||
    envObj?.accessTokenSecret ||
    envObj?.accessSecret ||
    envObj?.jwtSecret ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_TOKEN_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.ACCESS_SECRET ||
    process.env.JWT_SECRET ||
    process.env.JWT_SECRET_KEY
  );
}

function _requireAccessToken(envObj) {
  const jwt = require("jsonwebtoken");
  const secret = _getAccessSecret(envObj);

  return (req, res, next) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!token) return res.status(401).json({ message: "Missing access token" });
      if (!secret) return res.status(500).json({ message: "Access secret not configured" });

      const payload = jwt.verify(token, secret);
      req._auth = payload;
      next();
    } catch (e) {
      return res.status(401).json({ message: "Invalid access token" });
    }
  };
}

// Helper: find trusted device entry
function _findTrustedDevice(user, fingerprint) {
  if (!user || !fingerprint) return null;
  if (!Array.isArray(user.trustedDevices)) return null;
  return user.trustedDevices.find((d) => d.fingerprint === fingerprint) || null;
}

// Helper: upsert trusted device entry
async function _upsertTrustedDevice(user, fingerprint, req, opts = {}) {
  const {
    autoApprove = true, // if true => approvedAt set on first time
    label = null,
  } = opts;

  if (!Array.isArray(user.trustedDevices)) user.trustedDevices = [];

  let d = user.trustedDevices.find((x) => x.fingerprint === fingerprint);
  const now = new Date();

  if (!d) {
    d = {
      fingerprint,
      trustScore: 50,
      firstSeenAt: now,
      lastSeenAt: now,
      approvedAt: autoApprove ? now : null,
      label: label,
      ip: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      isBlocked: false,
    };
    user.trustedDevices.push(d);
  } else {
    d.lastSeenAt = now;
    d.ip = req.ip || d.ip || null;
    d.userAgent = req.headers["user-agent"] || d.userAgent || null;
    if (label && !d.label) d.label = label;
  }
}

// Helper: enforce trusted device (optional via env flag)
function _isTrustedDevicesEnforced() {
  return (
    process.env.REQUIRE_DEVICE_APPROVAL === "1" ||
    process.env.REQUIRE_DEVICE_APPROVAL === "true" ||
    process.env.ENFORCE_TRUSTED_DEVICES === "1" ||
    process.env.ENFORCE_TRUSTED_DEVICES === "true"
  );
}

/**
 * NEW: Refresh route (secure)
 * - Does NOT replace your old /refresh or /refresh-token.
 * - Use this for production-grade flow.
 */
router.post("/refresh-secure", async (req, res) => {
  // Refresh token: cookies OR body OR header
  const refreshToken =
    req.cookies?.refreshToken ||
    req.cookies?.rt ||
    req.body?.refreshToken ||
    req.headers["x-refresh-token"];

  if (!refreshToken) {
    return res.status(401).json({ message: "Missing refresh token" });
  }

  // deviceFingerprint mandatory
  const df = req.body?.deviceFingerprint || req.headers["x-device-fingerprint"] || null;
  if (!df) {
    return res.status(400).json({ message: "deviceFingerprint required" });
  }

  try {
    const jwt = require("jsonwebtoken");

    // verify refresh token
    const payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
    const userId = payload?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const oldHash = hashToken(refreshToken);

    // Check: token exists in array
    const hasInArray =
      Array.isArray(user.refreshTokens) &&
      user.refreshTokens.some((t) => t.tokenHash === oldHash);

    // Legacy single refreshToken support
    const hasLegacy = user.refreshToken && user.refreshToken === oldHash;

    if (!hasInArray && !hasLegacy) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find oldEntry (only for array case)
    const oldEntry = Array.isArray(user.refreshTokens)
      ? user.refreshTokens.find((t) => t.tokenHash === oldHash) || null
      : null;

    // Device match enforce if we have oldEntry
    if (oldEntry?.deviceFingerprint && oldEntry.deviceFingerprint !== df) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    // Trusted device upsert + optional enforcement
    await _upsertTrustedDevice(user, df, req, { autoApprove: !_isTrustedDevicesEnforced() });
    const tdev = _findTrustedDevice(user, df);

if (tdev?.isBlocked) {
  await user.save();
  return res.status(403).json({
    message: "Device blocked",
    code: "DEVICE_BLOCKED",
    approvalStatus: tdev?.approvalStatus || null,
    deviceFingerprint: df,
  });
}

if (_isTrustedDevicesEnforced()) {
  if (tdev?.approvalStatus === "rejected") {
    await user.save();
    return res.status(403).json({
      message: "Device rejected",
      code: "DEVICE_REJECTED",
      approvalStatus: "rejected",
      deviceFingerprint: df,
    });
  }

  if (tdev?.approvalStatus === "pending" || tdev?.approvalRequired === true) {
    await user.save();
    return res.status(403).json({
      message: "Device approval required",
      code: "DEVICE_APPROVAL_REQUIRED",
      approvalStatus: "pending",
      deviceFingerprint: df,
    });
  }

  const isApprovedDevice =
    (tdev?.approvalStatus === "approved" && tdev?.approvalRequired !== true) ||
    !!tdev?.approvedAt;

  if (!isApprovedDevice) {
    await user.save();
    return res.status(403).json({
      message: "Device approval required",
      code: "DEVICE_APPROVAL_REQUIRED",
      approvalStatus: tdev?.approvalStatus || "pending",
      deviceFingerprint: df,
    });
  }
}

if (tdev) {
  const refreshNow = new Date();

  tdev.lastSeenAt = refreshNow;
  tdev.ip =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    tdev.ip ||
    null;
  tdev.userAgent = req.headers["user-agent"] || tdev.userAgent || null;

  if (
    tdev.approvalStatus === "approved" &&
    tdev.approvalRequired !== true &&
    !tdev.approvedAt
  ) {
    tdev.approvedAt = refreshNow;
  }

  if (typeof tdev.trustScore === "number") {
    tdev.trustScore = Math.max(tdev.trustScore, 80);
  } else {
    tdev.trustScore = 80;
  }
}

    // Carry-forward session fields
    const crypto = require("crypto");
    const sessionId =
      oldEntry?.sessionId ||
      (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex"));

    const sessionStartedAt = oldEntry?.sessionStartedAt || new Date();
    const userAgent = oldEntry?.userAgent || req.headers["user-agent"] || "";

    // ROTATION: remove old entry from array
    if (Array.isArray(user.refreshTokens)) {
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenHash !== oldHash);
    }

    // Issue new tokens
    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // Legacy field update
    user.refreshToken = hashToken(newRefreshToken);

    // Ensure refreshTokens array exists
    if (!Array.isArray(user.refreshTokens)) user.refreshTokens = [];

    // Push new entry
    user.refreshTokens.push({
      tokenHash: hashToken(newRefreshToken),
      createdAt: new Date(),
      expiresAt: oldEntry?.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ip: req.ip || "unknown",
      deviceFingerprint: df,

      userAgent: userAgent,
      lastUsedAt: new Date(),
      sessionId: sessionId,
      sessionStartedAt: sessionStartedAt,
    });

    await user.save();

    // Cookie update
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    // Response (debug optional)
    const debug = req.query?.debug === "1";
    return res.status(200).json({
      accessToken: newAccessToken,
      ...(debug ? { refreshToken: newRefreshToken } : {}),
    });
  } catch (e) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
});

/**
 * Trusted devices management (needs access token)
 */
router.get("/trusted-devices", _requireAccessToken(env), async (req, res) => {
  try {
    const userId = req._auth?.id || req._auth?.sub;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      devices: (user.trustedDevices || []).map((d) => ({
        fingerprint: d.fingerprint,
        label: d.label || null,
        trustScore: d.trustScore,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        approvedAt: d.approvedAt || null,
        isBlocked: !!d.isBlocked,
        ip: d.ip || null,
        userAgent: d.userAgent || null,
      })),
    });
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/trusted-devices/approve", _requireAccessToken(env), async (req, res) => {
  try {
    const { deviceFingerprint, label } = req.body || {};
    if (!deviceFingerprint) {
      return res.status(400).json({ message: "deviceFingerprint required" });
    }

    const userId = req._auth?.id || req._auth?.sub;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await _upsertTrustedDevice(user, deviceFingerprint, req, { autoApprove: true, label: label || null });
    const d = _findTrustedDevice(user, deviceFingerprint);
    if (d) d.approvedAt = new Date();
    if (d) d.isBlocked = false;

    await user.save();
    return res.status(200).json({ message: "Device approved" });
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
});
// ==============================
// LIST PENDING TRUSTED DEVICES
// ==============================
router.post("/trusted-devices/pending", authenticate, async (req, res) => {
  try {

    console.log("AUTH HEADER:", req.headers.authorization);
    console.log("REQ.AUTH:", req.auth);

    const userId = req.user?.id || req.user?.sub;

    if (!userId) {
      return res.status(401).json({ message: "Invalid access token" });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const pendingDevices = Array.isArray(user.trustedDevices)
      ? user.trustedDevices
          .filter(
            (d) =>
              d &&
              (
                d.approvalStatus === "pending" ||
                d.approvalRequired === true
              )
          )
          .map((d) => ({
            fingerprint: d.fingerprint || null,
            label: d.label || null,
            trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
            firstSeenAt: d.firstSeenAt || null,
            lastSeenAt: d.lastSeenAt || null,
            approvedAt: d.approvedAt || null,
            approvalStatus: d.approvalStatus || "pending",
            approvalRequired: d.approvalRequired === true,
            approvalRequestedAt: d.approvalRequestedAt || null,
            approvedBySessionId: d.approvedBySessionId || null,
            approvalMethod: d.approvalMethod || null,
            rejectedAt: d.rejectedAt || null,
            rejectionReason: d.rejectionReason || null,
            isBlocked: d.isBlocked === true,
            blockedAt: d.blockedAt || null,
            ip: d.ip || null,
            userAgent: d.userAgent || null,
          }))
      : [];

    return res.status(200).json({
      message: "Pending trusted devices fetched",
      count: pendingDevices.length,
      devices: pendingDevices,
    });
  } catch (e) {
    console.error("pending trusted devices error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

// ==============================
// REJECT TRUSTED DEVICE
// ==============================
router.post("/trusted-devices/reject", _requireAccessToken(env), async (req, res) => {
  try {
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.body?.fingerprint ||
      req.headers["x-device-fingerprint"] ||
      null;

    const rejectionReason =
      req.body?.rejectionReason ||
      req.body?.reason ||
      "Rejected by user";

    if (!deviceFingerprint) {
      return res.status(400).json({
        message: "deviceFingerprint required",
      });
    }

    const userId = req._auth?.id || req._auth?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const d = _findTrustedDevice(user, deviceFingerprint);

    if (!d) {
      return res.status(404).json({
        message: "Device not found",
      });
    }

    if (d.approvalStatus === "approved" && d.approvalRequired === false) {
      return res.status(409).json({
        message: "Approved device cannot be rejected from this route. Use block route instead.",
      });
    }

    d.approvalStatus = "rejected";
    d.approvalRequired = false;
    d.rejectedAt = new Date();
    d.rejectionReason = rejectionReason;
    d.approvedAt = null;
    d.approvedBySessionId = null;
    d.approvalMethod = "manual";
    d.lastSeenAt = new Date();

    await user.save();

    return res.status(200).json({
      message: "Device rejected",
      device: {
        fingerprint: d.fingerprint || null,
        approvalStatus: d.approvalStatus || null,
        approvalRequired: d.approvalRequired === true,
        rejectedAt: d.rejectedAt || null,
        rejectionReason: d.rejectionReason || null,
      },
    });
  } catch (e) {
    console.error("reject trusted device error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==============================
// TRUSTED DEVICE STATUS
// ==============================
router.post("/trusted-devices/status", _requireAccessToken(env), async (req, res) => {
  try {
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.body?.fingerprint ||
      req.headers["x-device-fingerprint"] ||
      null;

    if (!deviceFingerprint) {
      return res.status(400).json({
        message: "deviceFingerprint required",
      });
    }

    const userId = req._auth?.id || req._auth?.sub || req._auth?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const d = findTrustedDevice(user, deviceFingerprint);

    if (!d) {
      return res.status(404).json({
        message: "Device not found",
        exists: false,
      });
    }

    return res.status(200).json({
      message: "Trusted device status fetched",
      exists: true,
      device: {
        fingerprint: d.fingerprint || null,
        label: d.label || null,
        trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
        firstSeenAt: d.firstSeenAt || null,
        lastSeenAt: d.lastSeenAt || null,
        approvedAt: d.approvedAt || null,
        approvalStatus: d.approvalStatus || "approved",
        approvalRequired: d.approvalRequired === true,
        approvalRequestedAt: d.approvalRequestedAt || null,
        approvedBySessionId: d.approvedBySessionId || null,
        approvalMethod: d.approvalMethod || null,
        rejectedAt: d.rejectedAt || null,
        rejectionReason: d.rejectionReason || null,
        isBlocked: d.isBlocked === true,
        blockedAt: d.blockedAt || null,
        ip: d.ip || null,
        userAgent: d.userAgent || null,
      },
    });
  } catch (e) {
    console.error("trusted device status error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==============================
// TRUSTED DEVICES OVERVIEW
// ==============================
router.post("/trusted-devices/overview", _requireAccessToken(env), async (req, res) => {
  try {
    const userId = req._auth?.id || req._auth?.sub || req._auth?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const devices = Array.isArray(user.trustedDevices)
      ? user.trustedDevices.map((d) => ({
          fingerprint: d?.fingerprint || null,
          label: d?.label || null,
          trustScore: typeof d?.trustScore === "number" ? d.trustScore : 0,
          firstSeenAt: d?.firstSeenAt || null,
          lastSeenAt: d?.lastSeenAt || null,
          approvedAt: d?.approvedAt || null,
          approvalStatus: d?.approvalStatus || "approved",
          approvalRequired: d?.approvalRequired === true,
          approvalRequestedAt: d?.approvalRequestedAt || null,
          approvedBySessionId: d?.approvedBySessionId || null,
          approvalMethod: d?.approvalMethod || null,
          rejectedAt: d?.rejectedAt || null,
          rejectionReason: d?.rejectionReason || null,
          isBlocked: d?.isBlocked === true,
          blockedAt: d?.blockedAt || null,
          ip: d?.ip || null,
          userAgent: d?.userAgent || null,
        }))
      : [];

    const approvedDevices = devices.filter(
      (d) => d.approvalStatus === "approved" && d.isBlocked !== true
    );

    const pendingDevices = devices.filter(
      (d) => d.approvalStatus === "pending" || d.approvalRequired === true
    );

    const rejectedDevices = devices.filter(
      (d) => d.approvalStatus === "rejected"
    );

    const blockedDevices = devices.filter(
      (d) => d.isBlocked === true
    );

    return res.status(200).json({
      message: "Trusted devices overview fetched",
      summary: {
        total: devices.length,
        approved: approvedDevices.length,
        pending: pendingDevices.length,
        rejected: rejectedDevices.length,
        blocked: blockedDevices.length,
      },
      devices,
    });
  } catch (e) {
    console.error("trusted devices overview error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==============================
// APPROVED TRUSTED DEVICES
// ==============================
router.post("/trusted-devices/approved", _requireAccessToken(env), async (req, res) => {
  try {
    const userId = req._auth?.id || req._auth?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const approvedDevices = Array.isArray(user.trustedDevices)
      ? user.trustedDevices
          .filter(
            (d) =>
              d &&
              d.approvalStatus === "approved" &&
              d.approvalRequired !== true &&
              d.isBlocked !== true
          )
          .map((d) => ({
            fingerprint: d.fingerprint || null,
            label: d.label || null,
            trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
            firstSeenAt: d.firstSeenAt || null,
            lastSeenAt: d.lastSeenAt || null,
            approvedAt: d.approvedAt || null,
            approvalStatus: d.approvalStatus || "approved",
            approvalRequired: d.approvalRequired === true,
            approvalRequestedAt: d.approvalRequestedAt || null,
            approvedBySessionId: d.approvedBySessionId || null,
            approvalMethod: d.approvalMethod || null,
            isBlocked: d.isBlocked === true,
            blockedAt: d.blockedAt || null,
            ip: d.ip || null,
            userAgent: d.userAgent || null,
          }))
      : [];

    return res.status(200).json({
      message: "Approved trusted devices fetched",
      count: approvedDevices.length,
      devices: approvedDevices,
    });
  } catch (e) {
    console.error("approved trusted devices error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==============================
// BLOCKED TRUSTED DEVICES
// ==============================
router.post("/trusted-devices/blocked", _requireAccessToken(env), async (req, res) => {
  try {
    const userId = req._auth?.id || req._auth?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const blockedDevices = Array.isArray(user.trustedDevices)
      ? user.trustedDevices
          .filter((d) => d && d.isBlocked === true)
          .map((d) => ({
            fingerprint: d.fingerprint || null,
            label: d.label || null,
            trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
            firstSeenAt: d.firstSeenAt || null,
            lastSeenAt: d.lastSeenAt || null,
            approvedAt: d.approvedAt || null,
            approvalStatus: d.approvalStatus || null,
            approvalRequired: d.approvalRequired === true,
            approvalRequestedAt: d.approvalRequestedAt || null,
            approvedBySessionId: d.approvedBySessionId || null,
            approvalMethod: d.approvalMethod || null,
            rejectedAt: d.rejectedAt || null,
            rejectionReason: d.rejectionReason || null,
            isBlocked: d.isBlocked === true,
            blockedAt: d.blockedAt || null,
            ip: d.ip || null,
            userAgent: d.userAgent || null,
          }))
      : [];

    return res.status(200).json({
      message: "Blocked trusted devices fetched",
      count: blockedDevices.length,
      devices: blockedDevices,
    });
  } catch (e) {
    console.error("blocked trusted devices error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

// ==============================
// REJECTED TRUSTED DEVICES
// ==============================
router.post("/trusted-devices/rejected", _requireAccessToken(env), async (req, res) => {
  try {
    const userId = req._auth?.id || req._auth?.sub;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId).select("trustedDevices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const rejectedDevices = Array.isArray(user.trustedDevices)
      ? user.trustedDevices
          .filter((d) => d && d.approvalStatus === "rejected")
          .map((d) => ({
            fingerprint: d.fingerprint || null,
            label: d.label || null,
            trustScore: typeof d.trustScore === "number" ? d.trustScore : 0,
            firstSeenAt: d.firstSeenAt || null,
            lastSeenAt: d.lastSeenAt || null,
            approvedAt: d.approvedAt || null,
            approvalStatus: d.approvalStatus || "rejected",
            approvalRequired: d.approvalRequired === true,
            approvalRequestedAt: d.approvalRequestedAt || null,
            approvedBySessionId: d.approvedBySessionId || null,
            approvalMethod: d.approvalMethod || null,
            rejectedAt: d.rejectedAt || null,
            rejectionReason: d.rejectionReason || null,
            isBlocked: d.isBlocked === true,
            blockedAt: d.blockedAt || null,
            ip: d.ip || null,
            userAgent: d.userAgent || null,
          }))
      : [];

    return res.status(200).json({
      message: "Rejected trusted devices fetched",
      count: rejectedDevices.length,
      devices: rejectedDevices,
    });
  } catch (e) {
    console.error("rejected trusted devices error:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});
// ===============================
// BLOCK TRUSTED DEVICE
// ===============================
router.post("/trusted-devices/block", _requireAccessToken(env), async (req, res) => {
  try {
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.body?.fingerprint ||
      req.headers["x-device-fingerprint"] ||
      null;

    if (!deviceFingerprint) {
      return res.status(400).json({
        message: "deviceFingerprint required",
      });
    }

    const userId = req._auth?.id || req._auth?.sub || req._auth?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const updatedUser = await User.findOneAndUpdate(
  {
    _id: userId,
    "trustedDevices.fingerprint": deviceFingerprint,
  },
  {
    $set: {
      "trustedDevices.$.isBlocked": true,
      "trustedDevices.$.blockedAt": new Date(),
      "trustedDevices.$.lastSeenAt": new Date(),
      "trustedDevices.$.ip":
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        null,
      "trustedDevices.$.userAgent": req.headers["user-agent"] || null,
    },
  },
  {
    new: true,
  }
).lean();

    if (!updatedUser) {
      return res.status(404).json({
        message: "Device not found",
      });
    }

    const updatedDevice = (updatedUser.trustedDevices || []).find(
      (d) => d.fingerprint === deviceFingerprint
    );

    return res.status(200).json({
      message: "Device blocked",
      device: updatedDevice || null,
    });
  } catch (e) {
    console.error("BLOCK DEVICE ERROR:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});


// ===============================
// UNBLOCK TRUSTED DEVICE
// ===============================
router.post("/trusted-devices/unblock", _requireAccessToken(env), async (req, res) => {
  try {
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.body?.fingerprint ||
      req.headers["x-device-fingerprint"] ||
      null;

    if (!deviceFingerprint) {
      return res.status(400).json({
        message: "deviceFingerprint required",
      });
    }

    const userId = req._auth?.id || req._auth?.sub || req._auth?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const device = findTrustedDevice(user, deviceFingerprint);

    if (!device) {
      return res.status(404).json({
        message: "Device not found",
        code: "DEVICE_NOT_FOUND",
      });
    }

    const now = new Date();

    device.isBlocked = false;
    device.blockedAt = null;
    device.lastSeenAt = now;
    device.ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      device.ip ||
      null;
    device.userAgent = req.headers["user-agent"] || device.userAgent || null;

    const isLegacyApprovalStateMissing =
      (device.approvalStatus === undefined || device.approvalStatus === null) &&
      device.approvalRequired === undefined;

    if (isLegacyApprovalStateMissing) {
      device.approvalStatus = "approved";
      device.approvalRequired = false;
      device.approvedAt = device.approvedAt || now;
      device.approvalMethod = device.approvalMethod || "legacy_auto";
    }

    await user.save();

    return res.status(200).json({
      message: "Device unblocked",
      code: "DEVICE_UNBLOCKED",
      device: {
        fingerprint: device.fingerprint || null,
        approvalStatus: device.approvalStatus || null,
        approvalRequired: device.approvalRequired === true,
        approvedAt: device.approvedAt || null,
        isBlocked: device.isBlocked === true,
        blockedAt: device.blockedAt || null,
        lastSeenAt: device.lastSeenAt || null,
      },
    });
  } catch (e) {
    console.error("UNBLOCK DEVICE ERROR:", e);
    return res.status(500).json({
      message: "Server error",
    });
  }
});
router.post("/trusted-devices/approve", _requireAccessToken(env), async (req, res) => {
  try {
    const deviceFingerprint =
      req.body?.deviceFingerprint ||
      req.body?.fingerprint ||
      req.headers["x-device-fingerprint"] ||
      null;

    if (!deviceFingerprint) {
      return res.status(400).json({
        message: "deviceFingerprint required",
      });
    }

    const userId = req._auth?.id || req._auth?.sub || req._auth?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid access token",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const device = findTrustedDevice(user, deviceFingerprint);

    if (!device) {
      return res.status(404).json({
        message: "Device not found",
        code: "DEVICE_NOT_FOUND",
      });
    }

    if (device.isBlocked) {
      return res.status(403).json({
        message: "Blocked device cannot be approved",
        code: "DEVICE_BLOCKED",
      });
    }

    if (device.approvalStatus === "approved" && device.approvalRequired === false) {
      return res.status(200).json({
        message: "Device already approved",
        code: "DEVICE_ALREADY_APPROVED",
      });
    }

    const now = new Date();

    device.approvalStatus = "approved";
    device.approvalRequired = false;
    device.approvedAt = now;
    device.approvedBySessionId = null;
    device.approvalMethod = "manual";
    device.rejectedAt = null;
    device.rejectionReason = null;
    device.isBlocked = false;
    device.blockedAt = null;
    device.lastSeenAt = now;
    device.ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      device.ip ||
      null;
    device.userAgent = req.headers["user-agent"] || device.userAgent || null;

    if (typeof device.trustScore === "number") {
      device.trustScore = Math.max(device.trustScore, 80);
    } else {
      device.trustScore = 80;
    }

    await user.save();

    return res.status(200).json({
      message: "Device approved successfully",
      code: "DEVICE_APPROVED",
      device: {
        fingerprint: device.fingerprint,
        approvalStatus: device.approvalStatus,
        approvalRequired: device.approvalRequired,
        approvedAt: device.approvedAt,
        isBlocked: device.isBlocked,
      },
    });
  } catch (error) {
    console.error("approve trusted device error:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
});

module.exports = router;




