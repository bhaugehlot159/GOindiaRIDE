const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp, getDeviceMeta } = require('../utils/device');
const Booking = require('../models/Booking');
const WalletAccount = require('../models/WalletAccount');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const User = require('../models/User');
const { detectBookingFraud, detectFakeRideSignals } = require('../services/riskService');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');
const { verifyFareIntegrity, computeFareHash } = require('../middleware/fareIntegrityMiddleware');
const { logSecurityEvent } = require('../services/securityLogService');
const { createBookingPortalNotifications } = require('../services/portalNotificationService');
const {
  collectCustomerPaymentToCommissionWallet,
  resolveCommissionRegion
} = require('../services/commissionWalletService');


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

const DONATION_SUGGESTIONS = [25, 51, 101, 251, 501, 1100];

function sanitizeText(value, maxLen = 180) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  return Number(parsed.toFixed(2));
}

async function ensureDonationWallet(currency = 'INR') {
  return WalletAccount.findOneAndUpdate(
    { walletType: 'donation', ownerId: 'pool' },
    {
      $setOnInsert: {
        walletType: 'donation',
        ownerId: 'pool',
        currency: String(currency || 'INR').toUpperCase(),
        balance: 0,
        status: 'active',
        metadata: {}
      }
    },
    { new: true, upsert: true }
  );
}

async function buildDonationSuggestion() {
  const donationWallet = await ensureDonationWallet();
  const paymentModes = await WalletPaymentMode
    .find({ enabled: true, flows: 'donation' })
    .sort({ displayOrder: 1, label: 1 })
    .lean();

  return {
    donationWallet: {
      balance: donationWallet.balance,
      currency: donationWallet.currency
    },
    paymentModes,
    suggestedAmounts: DONATION_SUGGESTIONS
  };
}

router.get('/quote', authenticate, continuousRiskGate, async (req, res) => {
  const parsedDistance = Number(req.query.distanceKm || req.query.distance || 10);
  const distanceKm = Number.isFinite(parsedDistance) ? Math.max(parsedDistance, 1) : 10;
  const normalizedDistance = Number(distanceKm.toFixed(2));
  const amount = Number((normalizedDistance * 12).toFixed(2));
  const fareHash = computeFareHash({ distanceKm: normalizedDistance, amount });

  return res.status(200).json({
    distanceKm: normalizedDistance,
    amount,
    fareHash,
    currency: 'INR'
  });
});

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

router.post('/:id/complete', authenticate, continuousRiskGate, async (req, res) => {
  const booking = await Booking.findOne({ bookingId: req.params.id, userId: req.user.id });
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (booking.status === 'cancelled') {
    return res.status(400).json({ message: 'Booking already cancelled' });
  }

  const ip = getClientIp(req);
  const grossAmount = toAmount(booking.amount);
  const currency = sanitizeText(req.body.currency || req.query.currency || 'INR', 8).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const providerReference = sanitizeText(req.body.providerReference, 180);
  const customerRegion = resolveCommissionRegion(req.body.customerRegion || req.headers['x-customer-region'], currency);
  const clientReference = sanitizeText(req.body.clientReference, 140) || `BK_SETTLE_${booking.bookingId}`;

  let paymentSettlement = null;
  if (Number.isFinite(grossAmount) && grossAmount > 0) {
    try {
      paymentSettlement = await collectCustomerPaymentToCommissionWallet({
        bookingId: booking.bookingId,
        customerId: String(req.user.id),
        grossAmount,
        currency,
        paymentMode,
        providerReference,
        clientReference,
        customerRegion,
        actorRole: 'customer',
        actorId: String(req.user.id),
        ip,
        userAgent: sanitizeText(req.headers['user-agent'], 240),
        allowAutoProviderReference: true,
        metadata: {
          source: 'booking_complete',
          distanceKm: Number(booking.distanceKm || 0)
        }
      });

      if (paymentSettlement.autoGeneratedReference) {
        await logSecurityEvent({
          userId: req.user.id,
          action: 'booking_complete_auto_provider_reference_used',
          ip,
          riskScore: 25,
          result: 'warning',
          metadata: {
            bookingId: booking.bookingId,
            paymentMode: paymentSettlement.paymentMode,
            region: paymentSettlement.region
          }
        });
      }
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        message: error.message || 'Customer payment settlement failed before completion'
      });
    }
  }

  if (booking.status !== 'completed') {
    booking.status = 'completed';
    await booking.save();
  }

  let notificationSummary = null;
  try {
    notificationSummary = await createBookingPortalNotifications({
      bookingId: booking.bookingId,
      amount: booking.amount,
      distanceKm: booking.distanceKm,
      action: 'completed',
      customerId: req.user.id
    });
  } catch (error) {
    await logSecurityEvent({
      userId: req.user.id,
      action: 'booking_complete_notification_failed',
      ip,
      riskScore: 0,
      result: 'warning',
      metadata: { message: error.message, bookingId: booking.bookingId }
    });
  }

  const donation = await buildDonationSuggestion();

  return res.status(200).json({
    bookingId: booking.bookingId,
    status: booking.status,
    paymentSettlement,
    donation,
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

