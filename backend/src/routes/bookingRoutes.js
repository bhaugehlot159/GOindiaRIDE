const express = require('express');
const crypto = require('crypto');

const auth = require('../middleware/authMiddleware');
const authenticate = auth.authenticate || auth;
const { bookingWriteLimiter } = require('../middleware/rateLimiters');
const { buildSessionSecurityGuard } = require('../middleware/sessionSecurityMiddleware');
const { requireAnyAccountType } = require('../middleware/accessControlMiddleware');
const { getClientIp, getDeviceMeta } = require('../utils/device');
const Booking = require('../models/Booking');
const User = require('../models/User');
const SecurityIncident = require('../models/SecurityIncident');
const { detectBookingFraud, detectFakeRideSignals } = require('../services/riskService');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');

const router = express.Router();

const bookingSessionGuard = buildSessionSecurityGuard({
  allowedAccountTypes: ['customer', 'admin'],
  enforceDeviceFingerprint: true,
  requireOtpForRiskScore: 40,
  blockAboveRiskScore: 80
});

async function continuousRiskGate(req, res, next) {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(401).json({ message: 'Unauthorized user' });

  if (user.riskScore > 70) {
    return res.status(403).json({ message: 'Action blocked due to elevated risk score' });
  }

  if (user.riskScore >= 40 && !req.headers['x-otp-verified']) {
    return res.status(401).json({ message: 'OTP verification required for critical action' });
  }

  req.liveUser = user;
  return next();
}

async function recordBookingIncident(req, payload) {
  try {
    await SecurityIncident.create({
      source: 'server',
      eventType: payload.eventType,
      userId: req.user.id,
      email: req.user.email || null,
      ip: getClientIp(req),
      city: req.headers['x-city'] || 'unknown',
      deviceFingerprint: req.headers['x-device-fingerprint'] || null,
      riskScore: payload.riskScore,
      severity: payload.severity,
      recommendedAction: payload.recommendedAction,
      autoResponse: payload.autoResponse || { action: 'none', applied: false, note: '' },
      signals: payload.signals || {},
      metadata: payload.metadata || {},
      timeline: [
        {
          action: 'booking_risk_event',
          note: payload.note || payload.eventType,
          actorId: req.user.id
        }
      ]
    });
  } catch (error) {
    // non-blocking
  }
}

router.post(
  '/',
  authenticate,
  bookingSessionGuard,
  requireAnyAccountType('customer', 'admin'),
  bookingWriteLimiter,
  continuousRiskGate,
  async (req, res) => {
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

      await recordBookingIncident(req, {
        eventType: 'booking_fake_ride_detected',
        riskScore: 90,
        severity: 'critical',
        recommendedAction: 'temporary_block_60m',
        note: 'Fake-ride pattern detected',
        signals: fakeRideSignals,
        autoResponse: {
          action: 'temporary_block_60m',
          applied: true,
          note: 'Auto-ban for fake-ride pattern'
        }
      });

      return res.status(403).json({ message: 'Fake-ride or promo-abuse pattern detected', fakeRideSignals });
    }

    if (fraud.isFraud) {
      await User.findByIdAndUpdate(req.user.id, {
        isTemporarilyBannedUntil: new Date(Date.now() + 60 * 60 * 1000),
        riskScore: 85,
        lastRiskUpdate: new Date()
      });

      await recordBookingIncident(req, {
        eventType: 'booking_fraud_detected',
        riskScore: 85,
        severity: 'high',
        recommendedAction: 'temporary_block_60m',
        note: 'Fraud pattern detected',
        signals: fraud,
        autoResponse: {
          action: 'temporary_block_60m',
          applied: true,
          note: 'Auto-ban for fraud pattern'
        }
      });

      return res.status(403).json({ message: 'Fraud pattern detected, temporary ban applied', fraud });
    }

    const bookingId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const booking = await Booking.create({
      userId: req.user.id,
      bookingId,
      cardHash,
      ip,
      distanceKm,
      amount,
      referralCode,
      status: 'created'
    });

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

    return res.status(201).json({ bookingId: booking.bookingId, status: booking.status, riskScore: behavior.score });
  }
);

router.post(
  '/:id/cancel',
  authenticate,
  bookingSessionGuard,
  requireAnyAccountType('customer', 'admin'),
  bookingWriteLimiter,
  continuousRiskGate,
  async (req, res) => {
    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.id, userId: req.user.id },
      { status: 'cancelled' },
      { new: true }
    );

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    await trackBehaviorEvent({
      userId: req.user.id,
      eventType: 'booking_cancel',
      ip: getClientIp(req),
      city: req.headers['x-city'] || 'unknown',
      metadata: { bookingId: booking.bookingId }
    });

    return res.status(200).json({ bookingId: booking.bookingId, status: booking.status });
  }
);

router.patch(
  '/:id/driver-status',
  authenticate,
  buildSessionSecurityGuard({ allowedAccountTypes: ['driver', 'admin'], enforceDeviceFingerprint: true, requireOtpForRiskScore: 35 }),
  requireAnyAccountType('driver', 'admin'),
  bookingWriteLimiter,
  async (req, res) => {
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const allowed = new Set(['driver_assigned', 'ride_started', 'completed']);

    if (!allowed.has(nextStatus)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const booking = await Booking.findOneAndUpdate(
      { bookingId: req.params.id },
      { status: nextStatus },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    return res.status(200).json({
      message: 'Booking status updated securely',
      bookingId: booking.bookingId,
      status: booking.status
    });
  }
);

module.exports = router;
