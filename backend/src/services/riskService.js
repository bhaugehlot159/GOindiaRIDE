const LoginLog = require('../models/LoginLog');
const Booking = require('../models/Booking');
const User = require('../models/User');

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
  const referralAbuse = referralCode && referralBurst >= 8;

  return {
    suspicious: ipBulkAccounts >= 5 || cardAcrossUsers >= 4 || referralAbuse || Boolean(deviceFingerprint && deviceFingerprint.includes('emulator')),
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
