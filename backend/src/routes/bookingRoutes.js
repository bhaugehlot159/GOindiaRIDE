const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp, getDeviceMeta } = require('../utils/device');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { detectBookingFraud, detectFakeRideSignals } = require('../services/riskService');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');
const { verifyFareIntegrity } = require('../middleware/fareIntegrityMiddleware');
const { logSecurityEvent } = require('../services/securityLogService');
const { createBookingPortalNotifications } = require('../services/portalNotificationService');

const router = express.Router();

async function continuousRiskGate(req, res, next) {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: 'Unauthorized user' });

  if (user.riskScore > 70) {
    return res.status(403).json({ message: 'Action blocked due to elevated risk score' });
  }
  if (user.riskScore >= 40 && !req.headers['x-otp-verified']) {
    return res.status(401).json({ message: 'OTP verification required for critical action' });
  }
  return next();
}

router.post('/', authenticate, continuousRiskGate, verifyFareIntegrity, async (req, res) => {
  const { cardToken, distanceKm = 0, amount = 0, referralCode = '' } = req.body;
  if (!cardToken) {
    return res.status(400).json({ message: 'cardToken is required' });
  }

  const ip = getClientIp(req);
  const device = getDeviceMeta(req);
  const cardHash = crypto.createHash('sha256').update(cardToken).digest('hex');

  const fraud = await detectBookingFraud({ userId: req.user.id, ip, cardHash });

  const fakeRideSignals = await detectFakeRideSignals({
    ip,
    deviceFingerprint: device.fingerprint,
    referralCode,
    cardHash
  });
  if (fakeRideSignals.suspicious) {
    await User.findByIdAndUpdate(req.user.id, {
      isTemporarilyBannedUntil: new Date(Date.now() + 60 * 60 * 1000),
      riskScore: 90,
      lastRiskUpdate: new Date()
    });
    await logSecurityEvent({ userId: req.user.id, action: 'fake_ride_detected', ip, riskScore: 90, result: 'blocked', metadata: fakeRideSignals });
    return res.status(403).json({ message: 'Fake-ride or promo-abuse pattern detected', fakeRideSignals });
  }

  if (fraud.isFraud) {
    await User.findByIdAndUpdate(req.user.id, {
      isTemporarilyBannedUntil: new Date(Date.now() + 60 * 60 * 1000),
      riskScore: 85,
      lastRiskUpdate: new Date()
    });
    await logSecurityEvent({ userId: req.user.id, action: 'booking_fraud_detected', ip, riskScore: 85, result: 'blocked', metadata: fraud });
    return res.status(403).json({ message: 'Fraud pattern detected, temporary ban applied', fraud });
  }

  const bookingId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const booking = await Booking.create({ userId: req.user.id, bookingId, cardHash, ip, distanceKm, amount: req.recalculatedFare, referralCode, status: 'created' });

  await trackBehaviorEvent({
    userId: req.user.id,
    eventType: 'booking_create',
    ip,
    city: req.headers['x-city'] || 'unknown',
    deviceFingerprint: device.fingerprint,
    metadata: { distanceKm, amount, referralCode }
  });

  const behavior = await evaluateBehaviorRisk(req.user.id);
  await User.findByIdAndUpdate(req.user.id, {
    riskScore: Math.max(behavior.score, 0),
    lastRiskUpdate: new Date()
  });

  let notificationSummary = null;
  try {
    notificationSummary = await createBookingPortalNotifications({
      bookingId: booking.bookingId,
      amount: req.recalculatedFare,
      distanceKm,
      action: 'created',
      customerId: req.user.id
    });
  } catch (error) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'booking_portal_notification_failed',
      ip,
      riskScore: Math.max(behavior.score, 0),
      result: 'warning',
      metadata: { message: error.message, bookingId: booking.bookingId }
    });
  }

  return res.status(201).json({
    bookingId: booking.bookingId,
    status: booking.status,
    riskScore: behavior.score,
    notifications: notificationSummary
  });
});

router.post('/:id/cancel', authenticate, continuousRiskGate, async (req, res) => {
  const booking = await Booking.findOneAndUpdate(
    { bookingId: req.params.id, userId: req.user.id },
    { status: 'cancelled' },
    { new: true }
  );
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  const ip = getClientIp(req);
  await trackBehaviorEvent({
    userId: req.user.id,
    eventType: 'booking_cancel',
    ip,
    city: req.headers['x-city'] || 'unknown',
    metadata: { bookingId: booking.bookingId }
  });

  let notificationSummary = null;
  try {
    notificationSummary = await createBookingPortalNotifications({
      bookingId: booking.bookingId,
      amount: booking.amount,
      distanceKm: booking.distanceKm,
      action: 'cancelled',
      customerId: req.user.id
    });
  } catch (error) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'booking_cancel_notification_failed',
      ip,
      riskScore: 0,
      result: 'warning',
      metadata: { message: error.message, bookingId: booking.bookingId }
    });
  }

  return res.status(200).json({
    bookingId: booking.bookingId,
    status: booking.status,
    notifications: notificationSummary
  });
});

module.exports = router;

