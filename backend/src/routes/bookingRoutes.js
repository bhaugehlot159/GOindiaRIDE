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

// === FUTURE_ROUTES_BUSINESS_BOOKINGROUTES_START ===
/*
// Source: backend/src/routes/futureBusinessRoutes.js

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');


  const DATA_DIR = path.join(__dirname, '../../../data/runtime');
  const DATA_FILE = path.join(DATA_DIR, 'future-business-store.json');
  const RAJASTHAN_DETAILS_FILE = path.join(__dirname, '../../../data/format-2-json/states/rajasthan-50-complete.json');

  const MAX_NOTIFICATIONS = 20000;
  const MAX_WALLET_HISTORY = 3000;
  const MAX_RIDES_PER_USER = 5000;
  const MAX_COMMISSIONS = 10000;
  const MAX_TOURISM_PLACES = 10000;
  const MAX_LISTINGS = 20000;
  const MAX_PACKAGES = 8000;
  const MAX_PACKAGE_BOOKINGS = 30000;
  const MAX_REFERRALS = 40000;
  const MAX_REVIEWS = 30000;
  const MAX_TERMS_CONSENTS = 30000;
  const MAX_SUPPORT_TICKETS = 30000;
  const MAX_WEBHOOK_EVENTS = 20000;
  const MAX_OTP_EVENTS = 50000;
  const MAX_AUTH_LOGS = 50000;
  const MAX_BOOKING_ACTIONS = 50000;
  const MAX_DISPUTES = 20000;
  const MAX_FRAUD_ALERTS = 20000;
  const MAX_AI_CHATS = 60000;
  const MAX_SAVED_LOCATIONS = 30000;
  const MAX_FEATURE_STATES = 15000;
  const MAX_FEATURE_ACTIONS = 120000;

  let persistTimer = null;
  let rajasthanDetailsCache = null;

  const seedTourismPlaces = [
    { district: 'Jaipur', name: 'Amer Fort', category: 'Fort', history: '16th century hill fort.', entryFee: '100', openTime: '08:00', closeTime: '17:30', parking: true },
    { district: 'Jaipur', name: 'Hawa Mahal', category: 'Palace', history: 'Pink sandstone palace facade.', entryFee: '50', openTime: '09:00', closeTime: '17:00', parking: true },
    { district: 'Jodhpur', name: 'Mehrangarh Fort', category: 'Fort', history: 'Rao Jodha era fort.', entryFee: '200', openTime: '09:00', closeTime: '17:30', parking: true },
    { district: 'Udaipur', name: 'City Palace', category: 'Palace', history: 'Mewar dynasty royal complex.', entryFee: '300', openTime: '09:30', closeTime: '17:30', parking: true },
    { district: 'Ajmer', name: 'Ajmer Sharif Dargah', category: 'Heritage', history: 'Sufi shrine and spiritual site.', entryFee: '0', openTime: '05:00', closeTime: '22:00', parking: true },
    { district: 'Pushkar', name: 'Brahma Temple', category: 'Temple', history: 'Rare temple dedicated to Lord Brahma.', entryFee: '0', openTime: '06:00', closeTime: '20:00', parking: true }
  ];

  const RAJASTHAN_DISTRICTS = [
    'Ajmer',
    'Alwar',
    'Anupgarh',
    'Balotra',
    'Banswara',
    'Baran',
    'Barmer',
    'Beawar',
    'Bharatpur',
    'Bhilwara',
    'Bikaner',
    'Bundi',
    'Chittorgarh',
    'Churu',
    'Dausa',
    'Deeg',
    'Didwana-Kuchaman',
    'Dholpur',
    'Dungarpur',
    'Gangapur City',
    'Hanumangarh',
    'Jaipur',
    'Jaipur Rural',
    'Jaisalmer',
    'Jalore',
    'Jhalawar',
    'Jhunjhunu',
    'Jodhpur',
    'Jodhpur Rural',
    'Karauli',
    'Kekri',
    'Khairthal-Tijara',
    'Kota',
    'Kotputli-Behror',
    'Nagaur',
    'Neem Ka Thana',
    'Pali',
    'Phalodi',
    'Pratapgarh',
    'Rajsamand',
    'Salumbar',
    'Sanchore',
    'Sawai Madhopur',
    'Shahpura',
    'Sikar',
    'Sirohi',
    'Sri Ganganagar',
    'Tonk',
    'Udaipur',
    'Dudu'
  ];

  const currencyRates = {
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0094,
    AED: 0.044
  };

  const vehicleBaseRates = {
    economy: 10,
    sedan: 15,
    suv: 20,
    premium: 25,
    xl: 28
  };

  function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  function normalizeString(value, maxLength) {
    const str = String(value || '').trim();
    if (!str) return '';
    if (!Number.isFinite(maxLength) || maxLength <= 0) return str;
    return str.slice(0, maxLength);
  }

  function normalizeAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
  }

  function safeObject(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input;
  }

  function clone(input) {
    return JSON.parse(JSON.stringify(input));
  }

  function defaultStore() {
    return {
      wallets: {},
      notifications: [],
      travelCards: {},
      commissions: [],
      listings: [],
      packages: [],
      packageBookings: [],
      referrals: [],
      reviews: [],
      otpEvents: [],
      authLogs: [],
      bookingActions: [],
      disputes: [],
      fraudAlerts: [],
      aiChats: [],
      savedLocations: [],
      featureStates: {},
      featureActions: [],
      termsConsents: [],
      supportTickets: [],
      webhookEvents: [],
      tourismPlaces: seedTourismPlaces.map((item) => ({
        id: crypto.randomUUID(),
        district: item.district,
        name: item.name,
        category: item.category,
        history: item.history,
        entryFee: item.entryFee,
        openTime: item.openTime,
        closeTime: item.closeTime,
        parking: item.parking,
        createdAt: new Date().toISOString()
      })),
      rideHistory: {},
      preferences: {},
      counters: {
        packagesBooked: 0,
        referralsTracked: 0,
        supportTickets: 0,
        webhookEvents: 0
      }
    };
  }

  function loadStore() {
    try {
      if (!fs.existsSync(DATA_FILE)) return defaultStore();
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const store = defaultStore();
      return {
        ...store,
        ...safeObject(parsed),
        wallets: safeObject(parsed.wallets),
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(-MAX_NOTIFICATIONS) : [],
        travelCards: safeObject(parsed.travelCards),
        commissions: Array.isArray(parsed.commissions) ? parsed.commissions.slice(-MAX_COMMISSIONS) : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings.slice(-MAX_LISTINGS) : [],
        packages: Array.isArray(parsed.packages) ? parsed.packages.slice(-MAX_PACKAGES) : [],
        packageBookings: Array.isArray(parsed.packageBookings) ? parsed.packageBookings.slice(-MAX_PACKAGE_BOOKINGS) : [],
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals.slice(-MAX_REFERRALS) : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews.slice(-MAX_REVIEWS) : [],
        otpEvents: Array.isArray(parsed.otpEvents) ? parsed.otpEvents.slice(-MAX_OTP_EVENTS) : [],
        authLogs: Array.isArray(parsed.authLogs) ? parsed.authLogs.slice(-MAX_AUTH_LOGS) : [],
        bookingActions: Array.isArray(parsed.bookingActions) ? parsed.bookingActions.slice(-MAX_BOOKING_ACTIONS) : [],
        disputes: Array.isArray(parsed.disputes) ? parsed.disputes.slice(-MAX_DISPUTES) : [],
        fraudAlerts: Array.isArray(parsed.fraudAlerts) ? parsed.fraudAlerts.slice(-MAX_FRAUD_ALERTS) : [],
        aiChats: Array.isArray(parsed.aiChats) ? parsed.aiChats.slice(-MAX_AI_CHATS) : [],
        savedLocations: Array.isArray(parsed.savedLocations) ? parsed.savedLocations.slice(-MAX_SAVED_LOCATIONS) : [],
        featureStates: safeObject(parsed.featureStates),
        featureActions: Array.isArray(parsed.featureActions) ? parsed.featureActions.slice(-MAX_FEATURE_ACTIONS) : [],
        termsConsents: Array.isArray(parsed.termsConsents) ? parsed.termsConsents.slice(-MAX_TERMS_CONSENTS) : [],
        supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets.slice(-MAX_SUPPORT_TICKETS) : [],
        webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents.slice(-MAX_WEBHOOK_EVENTS) : [],
        tourismPlaces: Array.isArray(parsed.tourismPlaces) && parsed.tourismPlaces.length
          ? parsed.tourismPlaces.slice(-MAX_TOURISM_PLACES)
          : store.tourismPlaces,
        rideHistory: safeObject(parsed.rideHistory),
        preferences: safeObject(parsed.preferences),
        counters: {
          ...safeObject(store.counters),
          ...safeObject(parsed.counters)
        }
      };
    } catch (_error) {
      return defaultStore();
    }
  }

  function loadRajasthanDetails() {
    if (rajasthanDetailsCache && typeof rajasthanDetailsCache === 'object') {
      return rajasthanDetailsCache;
    }
    try {
      const raw = fs.readFileSync(RAJASTHAN_DETAILS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const districts = safeObject(parsed && parsed.districts);
      const index = {};
      Object.keys(districts).forEach((name) => {
        index[normalizeString(name, 120).toLowerCase()] = districts[name];
      });
      rajasthanDetailsCache = {
        ok: true,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: safeObject(parsed && parsed.metadata),
        districts,
        index
      };
      return rajasthanDetailsCache;
    } catch (_error) {
      rajasthanDetailsCache = {
        ok: false,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: {},
        districts: {},
        index: {}
      };
      return rajasthanDetailsCache;
    }
  }

  function resolveDistrictDetailByName(name) {
    const dataset = loadRajasthanDetails();
    const key = normalizeString(name, 120).toLowerCase();
    if (!key) return null;
    if (dataset.index[key]) return dataset.index[key];

    const simplified = key.replace(/[^a-z0-9]/g, '');
    const keys = Object.keys(dataset.index);
    for (let i = 0; i < keys.length; i += 1) {
      const source = keys[i];
      const sourceSimple = source.replace(/[^a-z0-9]/g, '');
      if (sourceSimple === simplified) return dataset.index[source];
    }
    return null;
  }

  function getStore() {
    if (!global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__) {
      global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__ = loadStore();
    }
    return global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__;
  }

  function writeStore() {
    try {
      ensureDir();
      const data = getStore();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (_error) {
      // Non-blocking persistence.
    }
  }

  function queuePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeStore();
    }, 400);
  }

  function walletForUser(store, userKey) {
    if (!store.wallets[userKey]) {
      store.wallets[userKey] = {
        userKey,
        balance: 0,
        history: []
      };
    }
    return store.wallets[userKey];
  }

  function addWalletEntry(wallet, type, amount, meta) {
    const entry = {
      id: crypto.randomUUID(),
      type,
      amount: normalizeAmount(amount),
      meta: safeObject(meta),
      createdAt: new Date().toISOString()
    };
    wallet.history.push(entry);
    if (wallet.history.length > MAX_WALLET_HISTORY) {
      wallet.history = wallet.history.slice(-MAX_WALLET_HISTORY);
    }
    return entry;
  }

  function addRideHistory(store, payload) {
    const userKey = normalizeString(payload.userKey, 80);
    if (!userKey) return null;

    if (!store.rideHistory[userKey]) store.rideHistory[userKey] = [];
    const record = {
      id: crypto.randomUUID(),
      bookingId: normalizeString(payload.bookingId, 100) || `BK-${Date.now()}`,
      from: normalizeString(payload.from, 180),
      to: normalizeString(payload.to, 180),
      distanceKm: normalizeAmount(payload.distanceKm),
      fare: normalizeAmount(payload.fare),
      status: normalizeString(payload.status, 30) || 'completed',
      driverName: normalizeString(payload.driverName, 120),
      rating: normalizeAmount(payload.rating),
      feedback: normalizeString(payload.feedback, 500),
      createdAt: new Date().toISOString()
    };

    store.rideHistory[userKey].push(record);
    if (store.rideHistory[userKey].length > MAX_RIDES_PER_USER) {
      store.rideHistory[userKey] = store.rideHistory[userKey].slice(-MAX_RIDES_PER_USER);
    }
    return record;
  }

  function normalizeVehicleType(value) {
    const key = normalizeString(value, 30).toLowerCase();
    if (vehicleBaseRates[key]) return key;
    if (key.includes('hatch') || key.includes('economy')) return 'economy';
    if (key.includes('prem')) return 'premium';
    if (key.includes('xl')) return 'xl';
    if (key.includes('suv')) return 'suv';
    return 'sedan';
  }

  function normalizeCurrency(value) {
    const key = normalizeString(value, 10).toUpperCase();
    return currencyRates[key] ? key : 'INR';
  }

  function estimateFare(payload) {
    const distanceKm = Math.max(0, normalizeAmount(payload.distanceKm || payload.distance || 0));
    const durationMin = Math.max(0, normalizeAmount(payload.durationMin || payload.duration || 0));
    const vehicleType = normalizeVehicleType(payload.vehicleType || payload.rideType);
    const basePerKm = vehicleBaseRates[vehicleType] || vehicleBaseRates.sedan;
    const seasonMultiplier = Math.max(0.5, Math.min(3, normalizeAmount(payload.seasonMultiplier || 1) || 1));
    const trafficMultiplier = Math.max(0.5, Math.min(2, normalizeAmount(payload.trafficMultiplier || 1) || 1));
    const waitingCharge = Math.max(0, normalizeAmount(payload.waitingCharge || 0));
    const tollCharge = Math.max(0, normalizeAmount(payload.tollCharge || 0));
    const parkingCharge = Math.max(0, normalizeAmount(payload.parkingCharge || 0));
    const offerPercent = Math.max(0, Math.min(80, normalizeAmount(payload.offerPercent || payload.discountPercent || 0)));

    const distanceFare = normalizeAmount(distanceKm * basePerKm);
    const timeFare = normalizeAmount(durationMin * 0.5);
    const grossInr = normalizeAmount((distanceFare + timeFare + waitingCharge + tollCharge + parkingCharge) * seasonMultiplier * trafficMultiplier);
    const discount = normalizeAmount((grossInr * offerPercent) / 100);
    const netInr = Math.max(0, normalizeAmount(grossInr - discount));
    const currency = normalizeCurrency(payload.currency);
    const converted = normalizeAmount(netInr * (currencyRates[currency] || 1));

    return {
      vehicleType,
      currency,
      basePerKm,
      distanceKm,
      durationMin,
      distanceFare,
      timeFare,
      waitingCharge,
      tollCharge,
      parkingCharge,
      seasonMultiplier,
      trafficMultiplier,
      offerPercent,
      grossInr,
      discountInr: discount,
      finalInr: netInr,
      convertedFare: converted,
      calculatedAt: new Date().toISOString()
    };
  }

  function pushWithCap(list, item, maxLimit) {
    list.push(item);
    if (list.length > maxLimit) {
      list.splice(0, list.length - maxLimit);
    }
  }

  function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function normalizeBookingStatus(value) {
    const key = normalizeString(value, 40).toLowerCase();
    if (key.includes('accept')) return 'accepted';
    if (key.includes('pick')) return 'picked_up';
    if (key.includes('start')) return 'started';
    if (key.includes('complete')) return 'completed';
    if (key.includes('cancel')) return 'cancelled';
    if (key.includes('resched')) return 'rescheduled';
    if (key.includes('reject')) return 'rejected';
    return key || 'updated';
  }

  function addAuthLog(store, payload) {
    const item = {
      id: crypto.randomUUID(),
      userKey: normalizeString(payload.userKey, 80) || 'guest-user',
      action: normalizeString(payload.action, 80) || 'auth-event',
      channel: normalizeString(payload.channel, 40) || 'app',
      success: payload.success !== undefined ? Boolean(payload.success) : true,
      message: normalizeString(payload.message, 320),
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.authLogs, item, MAX_AUTH_LOGS);
    return item;
  }

  function buildFeatureStateKey(userKey, featureId) {
    return `${normalizeString(userKey, 80) || 'guest-user'}::${normalizeString(featureId, 80)}`;
  }


  // Route: /booking/action
  router.post('/booking/action', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const bookingId = normalizeString(req.body?.bookingId, 120) || `BK-${Date.now()}`;
    const action = normalizeBookingStatus(req.body?.action);
    const currentStatus = normalizeBookingStatus(req.body?.currentStatus);
    const pickedUp = Boolean(req.body?.pickedUp);

    if (!userKey) return res.status(400).json({ ok: false, message: 'userKey is required' });
    if (!action) return res.status(400).json({ ok: false, message: 'action is required' });

    // Policy example: after pickup, cancel action is blocked.
    if (pickedUp && action === 'cancelled') {
      const blocked = {
        id: crypto.randomUUID(),
        userKey,
        bookingId,
        action,
        currentStatus,
        pickedUp,
        allowed: false,
        message: 'Booking cannot be cancelled after pickup point is reached.',
        createdAt: new Date().toISOString()
      };
      pushWithCap(store.bookingActions, blocked, MAX_BOOKING_ACTIONS);
      queuePersist();
      return res.status(409).json({ ok: false, policyBlocked: true, item: blocked });
    }

    const item = {
      id: crypto.randomUUID(),
      userKey,
      bookingId,
      action,
      currentStatus,
      pickedUp,
      allowed: true,
      message: normalizeString(req.body?.message, 320),
      scheduleAt: normalizeString(req.body?.scheduleAt, 40),
      createdAt: new Date().toISOString()
    };

    pushWithCap(store.bookingActions, item, MAX_BOOKING_ACTIONS);
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /booking/action/:userKey
  router.get('/booking/action/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.bookingActions.filter((item) => item.userKey === userKey).slice(-500);
    return res.status(200).json({ ok: true, count: items.length, items });
  });


  // Route: /history/ride
  router.post('/history/ride', (req, res) => {
    const store = getStore();
    const record = addRideHistory(store, req.body || {});
    if (!record) {
      return res.status(400).json({ ok: false, message: 'userKey is required' });
    }
    queuePersist();
    return res.status(201).json({ ok: true, record });
  });


  // Route: /history/ride/:userKey
  router.get('/history/ride/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const list = Array.isArray(store.rideHistory[userKey]) ? store.rideHistory[userKey] : [];
    return res.status(200).json({ ok: true, count: list.length, items: list.slice(-1000) });
  });


  // Route: /history/ride/:userKey/export.csv
  router.get('/history/ride/:userKey/export.csv', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const list = Array.isArray(store.rideHistory[userKey]) ? store.rideHistory[userKey] : [];
    const headers = ['bookingId', 'from', 'to', 'distanceKm', 'fare', 'status', 'driverName', 'rating', 'createdAt'];
    const rows = [headers.join(',')];

    list.forEach((item) => {
      const line = headers.map((key) => {
        const raw = String(item[key] ?? '').replace(/"/g, '""');
        return `"${raw}"`;
      }).join(',');
      rows.push(line);
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=\"ride-history-${userKey}.csv\"`);
    return res.status(200).send(rows.join('\n'));
  });


  // Route: /packages
  router.post('/packages', (req, res) => {
    const store = getStore();
    const title = normalizeString(req.body?.title, 160);
    const theme = normalizeString(req.body?.theme, 80) || 'heritage';
    const durationDays = Math.max(1, Math.min(30, Math.round(normalizeAmount(req.body?.durationDays || 1))));
    const currency = normalizeCurrency(req.body?.currency || 'INR');
    const priceInr = Math.max(0, normalizeAmount(req.body?.priceInr || req.body?.price || 0));

    if (!title || priceInr <= 0) {
      return res.status(400).json({ ok: false, message: 'title and positive priceInr are required' });
    }

    const item = {
      id: crypto.randomUUID(),
      title,
      theme,
      durationDays,
      localGuide: Boolean(req.body?.localGuide),
      includesVehicle: req.body?.includesVehicle !== undefined ? Boolean(req.body?.includesVehicle) : true,
      meals: normalizeString(req.body?.meals, 120),
      inclusions: Array.isArray(req.body?.inclusions)
        ? req.body.inclusions.map((x) => normalizeString(x, 120)).filter(Boolean).slice(0, 20)
        : [],
      itinerary: Array.isArray(req.body?.itinerary)
        ? req.body.itinerary.map((x) => normalizeString(x, 240)).filter(Boolean).slice(0, 30)
        : [],
      priceInr,
      currency,
      convertedPrice: normalizeAmount(priceInr * (currencyRates[currency] || 1)),
      status: 'active',
      createdAt: new Date().toISOString()
    };

    store.packages.push(item);
    if (store.packages.length > MAX_PACKAGES) {
      store.packages = store.packages.slice(-MAX_PACKAGES);
    }
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /packages
  router.get('/packages', (req, res) => {
    const store = getStore();
    const theme = normalizeString(req.query.theme, 80);
    const q = normalizeString(req.query.q, 140);

    let items = store.packages;
    if (theme) items = items.filter((item) => normalizeString(item.theme, 80) === theme);
    if (q) items = items.filter((item) => normalizeString(`${item.title} ${item.theme} ${(item.inclusions || []).join(' ')}`, 1200).includes(q));
    return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
  });


  // Route: /packages/:packageId/book
  router.post('/packages/:packageId/book', (req, res) => {
    const store = getStore();
    const packageId = normalizeString(req.params.packageId, 80);
    const userKey = normalizeString(req.body?.userKey, 80);
    const packageItem = store.packages.find((item) => item.id === packageId);
    if (!packageItem) return res.status(404).json({ ok: false, message: 'Package not found' });
    if (!userKey) return res.status(400).json({ ok: false, message: 'userKey is required' });

    const booking = {
      id: crypto.randomUUID(),
      bookingCode: `PKG-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      packageId,
      userKey,
      travelers: Math.max(1, Math.min(50, Math.round(normalizeAmount(req.body?.travelers || 1)))),
      startDate: normalizeString(req.body?.startDate, 30),
      paymentMethod: normalizeString(req.body?.paymentMethod, 40) || 'cash',
      amountInr: packageItem.priceInr,
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    store.packageBookings.push(booking);
    if (store.packageBookings.length > MAX_PACKAGE_BOOKINGS) {
      store.packageBookings = store.packageBookings.slice(-MAX_PACKAGE_BOOKINGS);
    }
    store.counters.packagesBooked = (Number(store.counters.packagesBooked || 0) + 1);
    queuePersist();
    return res.status(201).json({ ok: true, booking });
  });


  // Route: /packages/bookings/:userKey
  router.get('/packages/bookings/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.packageBookings.filter((item) => item.userKey === userKey);
    return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
  });


  // Route: /fare/estimate
  router.post('/fare/estimate', (req, res) => {
    const estimate = estimateFare(req.body || {});
    return res.status(200).json({ ok: true, estimate });
  });


  // Route: /currency/rates
  router.get('/currency/rates', (req, res) => {
    return res.status(200).json({
      ok: true,
      base: 'INR',
      rates: currencyRates,
      updatedAt: new Date().toISOString()
    });
  });
*/
// === FUTURE_ROUTES_BUSINESS_BOOKINGROUTES_END ===

module.exports = router;

