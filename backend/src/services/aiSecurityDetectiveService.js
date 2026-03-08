const BehaviorEvent = require('../models/BehaviorEvent');
const Booking = require('../models/Booking');
const LoginLog = require('../models/LoginLog');
const User = require('../models/User');

const EVENT_BASELINE_RISK = {
  login: 16,
  payment: 26,
  booking_create: 14,
  booking_cancel: 8,
  profile_change: 20,
  device_change: 22,
  auth_failure: 28,
  admin_login: 35,
  admin_action: 30,
  referral_claim: 18
};

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function minutesAgo(minutes) {
  return new Date(Date.now() - (minutes * 60 * 1000));
}

function normalizeObject(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const entries = Object.entries(meta).slice(0, 20);
  return Object.fromEntries(entries);
}

function severityFromScore(score) {
  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function actionFromScore(score) {
  if (score >= 90) return 'instant_temp_block';
  if (score >= 75) return 'step_up_and_hold';
  if (score >= 55) return 'step_up_auth';
  if (score >= 40) return 'monitor_realtime';
  return 'allow_with_logging';
}

async function loginBurstSignal({ ip, email }) {
  if (!ip && !email) {
    return { score: 0, label: 'login_burst', evidence: { attempts: 0, uniqueEmails: 0 } };
  }

  const since = minutesAgo(10);
  const query = {
    createdAt: { $gte: since },
    status: 'fail'
  };

  if (ip) query.ip = ip;
  if (email) query.email = email;

  const [attempts, uniqueEmailsByIp] = await Promise.all([
    LoginLog.countDocuments(query),
    ip
      ? LoginLog.distinct('email', { ip, createdAt: { $gte: since }, status: 'fail' })
      : Promise.resolve([])
  ]);

  let score = 0;
  if (attempts >= 8) score += 20;
  if (attempts >= 14) score += 12;
  if (Array.isArray(uniqueEmailsByIp) && uniqueEmailsByIp.length >= 6) score += 16;

  return {
    score,
    label: 'login_burst',
    evidence: {
      attempts,
      uniqueEmails: Array.isArray(uniqueEmailsByIp) ? uniqueEmailsByIp.length : 0
    }
  };
}

async function impossibleTravelSignal({ userId, city, eventAt }) {
  if (!userId || !city || city === 'unknown') {
    return { score: 0, label: 'impossible_travel', evidence: { city, minutesBetweenCities: null } };
  }

  const sixHoursAgo = new Date(eventAt.getTime() - (6 * 60 * 60 * 1000));
  const previousGeoEvent = await BehaviorEvent.findOne({
    userId,
    city: { $nin: ['unknown', '', city] },
    createdAt: { $gte: sixHoursAgo }
  }).sort({ createdAt: -1 }).lean();

  if (!previousGeoEvent) {
    return { score: 0, label: 'impossible_travel', evidence: { city, minutesBetweenCities: null } };
  }

  const previousTime = new Date(previousGeoEvent.createdAt);
  const minutesBetweenCities = Math.max(0, Math.round((eventAt.getTime() - previousTime.getTime()) / 60000));

  let score = 0;
  if (minutesBetweenCities <= 45) score = 36;
  else if (minutesBetweenCities <= 120) score = 20;
  else if (minutesBetweenCities <= 240) score = 10;

  return {
    score,
    label: 'impossible_travel',
    evidence: {
      previousCity: previousGeoEvent.city,
      currentCity: city,
      minutesBetweenCities
    }
  };
}

async function bookingVelocitySignal({ userId, ip, eventType }) {
  if (eventType !== 'booking_create' && eventType !== 'booking_cancel' && eventType !== 'payment') {
    return { score: 0, label: 'booking_velocity', evidence: { userBookings: 0, ipBookings: 0, cancelCount: 0 } };
  }

  const since = minutesAgo(20);
  const [userBookings, ipBookings, cancelCount] = await Promise.all([
    userId ? Booking.countDocuments({ userId, createdAt: { $gte: since } }) : Promise.resolve(0),
    ip ? Booking.countDocuments({ ip, createdAt: { $gte: since } }) : Promise.resolve(0),
    userId ? Booking.countDocuments({ userId, status: 'cancelled', createdAt: { $gte: since } }) : Promise.resolve(0)
  ]);

  let score = 0;
  if (userBookings >= 6) score += 14;
  if (userBookings >= 10) score += 12;
  if (ipBookings >= 12) score += 15;
  if (cancelCount >= 4) score += 10;

  return {
    score,
    label: 'booking_velocity',
    evidence: {
      userBookings,
      ipBookings,
      cancelCount
    }
  };
}

async function deviceTrustSignal({ userId, deviceFingerprint, ip }) {
  if (!userId || !deviceFingerprint) {
    return { score: 0, label: 'device_takeover', evidence: { trusted: true, blocked: false, ipChanged: false } };
  }

  const user = await User.findById(userId).select('trustedDevices knownDevices lastLoginIp riskScore').lean();
  if (!user) {
    return { score: 0, label: 'device_takeover', evidence: { trusted: false, blocked: false, ipChanged: false } };
  }

  const trustedDevices = Array.isArray(user.trustedDevices) ? user.trustedDevices : [];
  const trustedMatch = trustedDevices.find((item) => item && item.fingerprint === deviceFingerprint);

  const isBlockedDevice = Boolean(trustedMatch && trustedMatch.isBlocked);
  const isTrusted = Boolean(trustedMatch && trustedMatch.approvalStatus !== 'rejected');
  const ipChanged = Boolean(user.lastLoginIp && ip && user.lastLoginIp !== ip);

  let score = 0;
  if (!isTrusted) score += 18;
  if (isBlockedDevice) score += 35;
  if (ipChanged) score += 12;
  if ((user.riskScore || 0) >= 70) score += 8;

  return {
    score,
    label: 'device_takeover',
    evidence: {
      trusted: isTrusted,
      blocked: isBlockedDevice,
      ipChanged
    }
  };
}

async function evaluateAiThreat(payload = {}) {
  const eventType = String(payload.eventType || 'unknown').trim().toLowerCase();
  const eventAt = payload.eventAt ? new Date(payload.eventAt) : new Date();

  const normalizedPayload = {
    userId: payload.userId || null,
    ip: payload.ip || null,
    email: payload.email || null,
    city: payload.city || 'unknown',
    deviceFingerprint: payload.deviceFingerprint || null,
    eventType,
    eventAt,
    metadata: normalizeObject(payload.metadata)
  };

  const [burst, travel, velocity, device] = await Promise.all([
    loginBurstSignal(normalizedPayload),
    impossibleTravelSignal(normalizedPayload),
    bookingVelocitySignal(normalizedPayload),
    deviceTrustSignal(normalizedPayload)
  ]);

  const baseScore = EVENT_BASELINE_RISK[eventType] || 10;
  const signalScore = burst.score + travel.score + velocity.score + device.score;
  const metadataBoost = normalizedPayload.metadata && normalizedPayload.metadata.manualRiskBoost
    ? Number(normalizedPayload.metadata.manualRiskBoost)
    : 0;

  const score = clampScore(baseScore + signalScore + metadataBoost);
  const severity = severityFromScore(score);
  const recommendedAction = actionFromScore(score);

  return {
    score,
    severity,
    recommendedAction,
    components: {
      baseScore,
      signalScore,
      metadataBoost: clampScore(metadataBoost)
    },
    signals: {
      [burst.label]: burst.evidence,
      [travel.label]: travel.evidence,
      [velocity.label]: velocity.evidence,
      [device.label]: device.evidence
    }
  };
}

async function applyAutoResponse({ userId, score }) {
  if (!userId) {
    return {
      action: 'no_user_context',
      applied: false,
      note: 'Incident logged without authenticated user context'
    };
  }

  const safeScore = clampScore(score);
  const update = {
    riskScore: safeScore,
    lastRiskUpdate: new Date()
  };

  let action = 'risk_updated';
  let note = 'Risk score updated';

  if (safeScore >= 90) {
    update.isTemporarilyBannedUntil = new Date(Date.now() + (60 * 60 * 1000));
    action = 'temporary_block_60m';
    note = 'Critical score triggered 60 minute temporary ban';
  } else if (safeScore >= 75) {
    update.isTemporarilyBannedUntil = new Date(Date.now() + (20 * 60 * 1000));
    action = 'temporary_block_20m';
    note = 'High score triggered short protective hold';
  }

  await User.findByIdAndUpdate(userId, update);

  return {
    action,
    applied: true,
    note
  };
}

module.exports = {
  evaluateAiThreat,
  applyAutoResponse
};
