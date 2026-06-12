const LoginLog = require('../models/LoginLog');
const Booking = require('../models/Booking');
const User = require('../models/User');
const SecurityIncident = require('../models/SecurityIncident');
const {
  evaluateBookingFraudPhase1,
  extractBookingContact
} = require('./fraudDetectionService');

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

async function detectBookingFraud({
  userId,
  ip,
  cardHash,
  booking = {},
  deviceFingerprint = '',
  referralCode = ''
}) {
  const since = new Date(Date.now() - 20 * 60 * 1000);
  const contact = extractBookingContact(booking);
  const activeContactQuery = [];
  if (contact.phone) activeContactQuery.push({ 'customerSnapshot.phone': contact.phone });
  if (contact.email) activeContactQuery.push({ 'customerSnapshot.email': contact.email });

  const [rapidCancellations, cardReuse, ipVelocity, activeContactBookings] = await Promise.all([
    userId
      ? Booking.countDocuments({
          userId,
          status: 'cancelled',
          createdAt: { $gte: since }
        })
      : Promise.resolve(0),
    cardHash
      ? Booking.countDocuments({
          cardHash,
          createdAt: { $gte: since }
        })
      : Promise.resolve(0),
    ip
      ? Booking.countDocuments({
          ip,
          createdAt: { $gte: since }
        })
      : Promise.resolve(0),
    activeContactQuery.length
      ? Booking.countDocuments({
          status: 'created',
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          $or: activeContactQuery
        })
      : Promise.resolve(0)
  ]);

  const phase1 = evaluateBookingFraudPhase1({
    booking,
    context: {
      userId,
      ip,
      cardHash,
      deviceFingerprint,
      referralCode,
      rapidCancellations,
      cardReuse,
      ipVelocity,
      activeContactBookings
    }
  });

  return {
    isFraud: phase1.isFraud,
    riskScore: phase1.riskScore,
    severity: phase1.severity,
    recommendedAction: phase1.recommendedAction,
    rapidCancellations,
    cardReuse,
    ipVelocity,
    activeContactBookings,
    phase1
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

  const phase1 = evaluateBookingFraudPhase1({
    booking: {
      referralCode
    },
    context: {
      ip,
      cardHash,
      deviceFingerprint,
      referralCode,
      referralBurst,
      cardReuse: cardAcrossUsers
    }
  });

  return {
    suspicious: ipBulkTriggered || cardAcrossUsersTriggered || referralAbuse || phase1.isFraud || Boolean(deviceFingerprint && deviceFingerprint.includes('emulator')),
    ipBulkAccounts,
    cardAcrossUsers,
    referralBurst,
    phase1
  };
}

async function recordFraudDetectionIncident({
  userId,
  email,
  ip,
  deviceFingerprint,
  eventType = 'phase1_fraud_detected',
  fraudResult = {},
  metadata = {}
}) {
  try {
    const phase1 = fraudResult.phase1 || fraudResult;
    const riskScore = Math.max(85, Number(phase1.riskScore || fraudResult.riskScore || 0));
    const severity = phase1.severity || (riskScore >= 90 ? 'critical' : 'high');

    const incident = await SecurityIncident.create({
      source: 'server',
      eventType,
      userId: userId || null,
      email: email || null,
      ip,
      deviceFingerprint,
      riskScore,
      severity,
      recommendedAction: phase1.recommendedAction || 'temporary_block_and_admin_review',
      autoResponse: {
        action: 'temporary_block',
        applied: true,
        note: 'Phase 1 fraud detection blocked the booking request'
      },
      signals: {
        version: phase1.version,
        algorithms: phase1.algorithms || [],
        signals: phase1.signals || [],
        evidence: phase1.evidence || {}
      },
      metadata,
      timeline: [
        {
          action: 'phase1_fraud_detection_triggered',
          note: `Fraud score ${riskScore}; action ${phase1.recommendedAction || 'temporary_block_and_admin_review'}`
        }
      ]
    });

    return incident;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  calculateLoginRisk,
  detectLoginAnomaly,
  detectBookingFraud,
  detectFakeRideSignals,
  recordFraudDetectionIncident
};
