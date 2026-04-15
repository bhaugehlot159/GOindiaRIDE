const LoginLog = require('../models/LoginLog');
const Booking = require('../models/Booking');
const User = require('../models/User');

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FAKE_RIDE_IP_BULK_THRESHOLD = Math.max(5, Number(process.env.FAKE_RIDE_IP_BULK_THRESHOLD || 25));
const FAKE_RIDE_CARD_ACROSS_USERS_THRESHOLD = Math.max(2, Number(process.env.FAKE_RIDE_CARD_ACROSS_USERS_THRESHOLD || 4));
const FAKE_RIDE_REFERRAL_BURST_THRESHOLD = Math.max(3, Number(process.env.FAKE_RIDE_REFERRAL_BURST_THRESHOLD || 8));

function isLoopbackIp(ip) {
  const normalized = String(ip || '').trim().toLowerCase();
  return LOOPBACK_IPS.has(normalized);
}

async function calculateLoginRisk({ email, ip, isNewDevice, failedOtpAttempts = 0 }) {
  const failedAttempts = await LoginLog.countDocuments({
    email,
    status: 'fail',
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
  });

  let score = 0;
  score += failedAttempts * 10;
  if (isNewDevice) score += 30;

  const recentIpMismatch = await LoginLog.exists({
    email,
    ip: { $ne: ip },
    status: 'success',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });

  if (recentIpMismatch) score += 20;
  score += failedOtpAttempts * 15;

  return score;
}

async function detectLoginAnomaly(ip) {
  const attempts = await LoginLog.countDocuments({
    ip,
    createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
  });
  return attempts >= 20;
}

async function detectBookingFraud({ userId, ip, cardHash }) {
  const since = new Date(Date.now() - 20 * 60 * 1000);

  const rapidCancellations = await Booking.countDocuments({
    userId,
    status: 'cancelled',
    createdAt: { $gte: since }
  });

  const cardReuse = await Booking.countDocuments({
    cardHash,
    createdAt: { $gte: since }
  });

  const ipVelocity = await Booking.countDocuments({
    ip,
    createdAt: { $gte: since }
  });

  return {
    isFraud: rapidCancellations >= 3 || cardReuse >= 5 || ipVelocity >= 10,
    rapidCancellations,
    cardReuse,
    ipVelocity
  };
}

async function detectFakeRideSignals({ ip, deviceFingerprint, referralCode, cardHash }) {
  const [ipBulkAccounts, sameCardAcrossUsers, referralBurst] = await Promise.all([
    User.countDocuments({ lastLoginIp: ip }),
    Booking.aggregate([
      { $match: { cardHash, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
      { $group: { _id: '$userId' } },
      { $count: 'users' }
    ]),
    Booking.countDocuments({ referralCode, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
  ]);

  const cardAcrossUsers = sameCardAcrossUsers[0]?.users || 0;
  const referralAbuse = referralCode && referralBurst >= FAKE_RIDE_REFERRAL_BURST_THRESHOLD;
  const ipBulkTriggered = !isLoopbackIp(ip) && ipBulkAccounts >= FAKE_RIDE_IP_BULK_THRESHOLD;
  const cardAcrossUsersTriggered = cardAcrossUsers >= FAKE_RIDE_CARD_ACROSS_USERS_THRESHOLD;

  return {
    suspicious: ipBulkTriggered || cardAcrossUsersTriggered || referralAbuse || Boolean(deviceFingerprint && deviceFingerprint.includes('emulator')),
    ipBulkAccounts,
    cardAcrossUsers,
    referralBurst
  };
}

module.exports = {
  calculateLoginRisk,
  detectLoginAnomaly,
  detectBookingFraud,
  detectFakeRideSignals
};
