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
const {
  processDriverRideSettlement,
  processDriverRideRefund,
  resolveDriverCommissionRegion
} = require('../services/driverCommissionWalletService');


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

function resolveCompletionActor(req) {
  if (req.user?.role === 'admin' || req.user?.accountType === 'admin') return 'admin';
  if (req.user?.accountType === 'driver') return 'driver';
  return 'customer';
}

function getBookingAmount(req, booking) {
  const bodyAmount = toAmount(req.body.grossAmount ?? req.body.amount);
  if (Number.isFinite(bodyAmount) && bodyAmount > 0) {
    return bodyAmount;
  }
  return toAmount(booking.amount);
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
    const pickup = sanitizeText(req.body.pickup || req.body.pickupLocation, 120);
    const drop = sanitizeText(req.body.drop || req.body.dropLocation, 120);
    const vehicleType = sanitizeText(req.body.vehicleType, 40);

    notificationSummary = await createBookingPortalNotifications({
      bookingId: booking.bookingId,
      amount: req.recalculatedFare,
      distanceKm: booking.distanceKm,
      action: 'created',
      customerId: req.user.id,
      pickup,
      drop,
      vehicleType,
      currency: 'INR'
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
  const actorType = resolveCompletionActor(req);
  const booking = await Booking.findOne({ bookingId: req.params.id });

  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (actorType === 'customer' && String(booking.userId) !== String(req.user.id)) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  const requestedDriverId = sanitizeText(req.body.driverId, 120);
  if (actorType === 'driver') {
    if (booking.driverId && String(booking.driverId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Driver is not assigned to this booking' });
    }

    booking.driverId = String(req.user.id);
  } else if (actorType === 'admin' && requestedDriverId) {
    booking.driverId = requestedDriverId;
  }

  if (booking.status === 'cancelled') {
    return res.status(400).json({ message: 'Booking already cancelled' });
  }

  const ip = getClientIp(req);
  const grossAmount = getBookingAmount(req, booking);
  const currency = sanitizeText(req.body.currency || req.query.currency || 'INR', 8).toUpperCase() || 'INR';
  const paymentMode = sanitizeText(req.body.paymentMode, 80).toLowerCase();
  const providerReference = sanitizeText(req.body.providerReference, 180);
  const clientReference = sanitizeText(req.body.clientReference, 140) || `BK_SETTLE_${booking.bookingId}`;
  const customerId = String(booking.userId);

  const customerRegion = resolveCommissionRegion(req.body.customerRegion || req.headers['x-customer-region'], currency);
  const driverRegion = resolveDriverCommissionRegion(req.body.customerRegion || req.headers['x-customer-region'], currency);
  const shouldSettleToDriverWallet = actorType === 'driver'
    || Boolean(req.body.settleToDriverWallet)
    || (actorType === 'admin' && Boolean(booking.driverId || requestedDriverId || req.body.forceDriverSettlement));

  let paymentSettlement = null;
  let driverSettlement = null;
  let driverSettlementPendingApproval = false;

  if (Number.isFinite(grossAmount) && grossAmount > 0) {
    if (shouldSettleToDriverWallet) {
      const driverId = sanitizeText(booking.driverId || requestedDriverId, 120);
      if (!driverId) {
        return res.status(400).json({ message: 'driverId is required for driver settlement' });
      }

      if (actorType === 'driver' && driverId !== String(req.user.id)) {
        return res.status(403).json({ message: 'Driver ID mismatch' });
      }

      if (actorType !== 'admin') {
        driverSettlementPendingApproval = true;
        booking.driverId = driverId;
        booking.settlementReference = 'pending_admin_approval';

        await logSecurityEvent({
          userId: req.user.id,
          action: 'driver_settlement_admin_approval_required',
          ip,
          riskScore: 15,
          result: 'warning',
          metadata: {
            bookingId: booking.bookingId,
            driverId,
            customerId,
            grossAmount
          }
        });
      } else {
      try {
        driverSettlement = await processDriverRideSettlement({
          bookingId: booking.bookingId,
          driverId,
          customerId,
          grossAmount,
          currency,
          paymentMode,
          providerReference,
          clientReference,
          customerRegion: driverRegion,
          actorRole: actorType,
          actorId: String(req.user.id),
          ip,
          userAgent: sanitizeText(req.headers['user-agent'], 240),
          allowAutoProviderReference: true,
          forceSettle: actorType === 'admin' && Boolean(req.body.forceSettle),
          metadata: {
            source: 'booking_complete',
            distanceKm: Number(booking.distanceKm || 0)
          }
        });

        booking.driverId = driverId;
        booking.driverPaymentSettledAt = booking.driverPaymentSettledAt || new Date();
        booking.customerPaymentSettledAt = booking.customerPaymentSettledAt || new Date();
        booking.settlementReference = driverSettlement.providerReference || driverSettlement.clientReference || booking.settlementReference;

        if (driverSettlement.autoGeneratedReference) {
          await logSecurityEvent({
            userId: req.user.id,
            action: 'booking_complete_driver_auto_provider_reference_used',
            ip,
            riskScore: 25,
            result: 'warning',
            metadata: {
              bookingId: booking.bookingId,
              paymentMode: driverSettlement.paymentMode,
              region: driverSettlement.region,
              driverId
            }
          });
        }
      } catch (error) {
        return res.status(error.statusCode || 400).json({
          message: error.message || 'Driver payment settlement failed before completion'
        });
      }
      }
    } else {
      try {
        paymentSettlement = await collectCustomerPaymentToCommissionWallet({
          bookingId: booking.bookingId,
          customerId,
          grossAmount,
          currency,
          paymentMode,
          providerReference,
          clientReference,
          customerRegion,
          actorRole: actorType,
          actorId: String(req.user.id),
          ip,
          userAgent: sanitizeText(req.headers['user-agent'], 240),
          allowAutoProviderReference: true,
          metadata: {
            source: 'booking_complete',
            distanceKm: Number(booking.distanceKm || 0)
          }
        });

        booking.customerPaymentSettledAt = booking.customerPaymentSettledAt || new Date();
        booking.settlementReference = paymentSettlement.providerReference || paymentSettlement.clientReference || booking.settlementReference;

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
  }

  if (booking.status !== 'completed') {
    booking.status = 'completed';
  }

  booking.completedByAccountType = actorType;
  booking.completedByUserId = String(req.user.id);
  await booking.save();

  let notificationSummary = null;
  try {
    notificationSummary = await createBookingPortalNotifications({
      bookingId: booking.bookingId,
      amount: booking.amount,
      distanceKm: booking.distanceKm,
      action: 'completed',
      customerId
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
    completedByAccountType: booking.completedByAccountType,
    paymentSettlement,
    driverSettlement,
    driverSettlementPendingApproval,
    donation,
    notifications: notificationSummary
  });
});

router.post('/:id/refund', authenticate, continuousRiskGate, async (req, res) => {
  const actorType = resolveCompletionActor(req);
  if (actorType !== 'admin') {
    return res.status(403).json({ message: 'Admin approval required for refunds' });
  }

  const booking = await Booking.findOne({ bookingId: req.params.id });
  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (booking.status !== 'completed') {
    return res.status(400).json({ message: 'Only completed bookings can be refunded' });
  }

  const requestedDriverId = sanitizeText(req.body.driverId, 120);
  const driverId = requestedDriverId || sanitizeText(booking.driverId, 120);
  if (!driverId) {
    return res.status(400).json({ message: 'driverId is required for refund' });
  }


  const ip = getClientIp(req);

  try {
    const refund = await processDriverRideRefund({
      bookingId: booking.bookingId,
      driverId,
      refundAmount: toAmount(req.body.refundAmount ?? req.body.refundGrossAmount),
      currency: sanitizeText(req.body.currency || 'INR', 8).toUpperCase() || 'INR',
      paymentMode: sanitizeText(req.body.paymentMode, 80).toLowerCase(),
      providerReference: sanitizeText(req.body.providerReference, 180),
      clientReference: sanitizeText(req.body.clientReference, 140),
      refundReason: sanitizeText(req.body.refundReason || req.body.reason, 200),
      actorRole: actorType,
      actorId: String(req.user.id),
      ip,
      userAgent: sanitizeText(req.headers['user-agent'], 240),
      metadata: {
        source: 'booking_refund',
        initiatedBy: String(req.user.id)
      }
    });

    booking.driverId = driverId;
    booking.settlementReference = refund.providerReference || refund.clientReference || booking.settlementReference;
    await booking.save();

    return res.status(200).json({
      bookingId: booking.bookingId,
      status: booking.status,
      refund
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      message: error.message || 'Driver refund processing failed'
    });
  }
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

