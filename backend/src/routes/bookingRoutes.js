const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp, getDeviceMeta } = require('../utils/device');
const Booking = require('../models/Booking');
const WalletAccount = require('../models/WalletAccount');
const WalletPaymentMode = require('../models/WalletPaymentMode');
const User = require('../models/User');
const { detectBookingFraud, detectFakeRideSignals } = require('../services/riskService');
const { trackBehaviorEvent, evaluateBehaviorRisk } = require('../services/behaviorService');
const { verifyFareIntegrity, computeFareHash, estimateTrustedBookingFare } = require('../middleware/fareIntegrityMiddleware');
const { walletCriticalLimiter, bookingFallbackEmailLimiter } = require('../middleware/rateLimiters');
const { verifyApiSignature } = require('../middleware/requestSignatureMiddleware');
const { logSecurityEvent } = require('../services/securityLogService');
const { sendEmail } = require('../utils/mailer');
const { sendWhatsAppMessage, normalizePhone, maskPhone } = require('../utils/whatsapp');
const { sendSms } = require('../utils/sms');
const logger = require('../utils/logger');
const { createBookingPortalNotifications } = require('../services/portalNotificationService');
const {
  createBookingAdminReviewAlert,
  createBookingCustomerReviewNotification
} = require('../services/portalNotificationService');
const {
  collectCustomerPaymentToCommissionWallet,
  resolveCommissionRegion
} = require('../services/commissionWalletService');
const {
  processDriverRideSettlement,
  processDriverRideRefund,
  resolveDriverCommissionRegion
} = require('../services/driverCommissionWalletService');
const { estimateBookingFare } = require('../../../js/booking-fare-calculator');


const router = express.Router();
const BOOKING_STRICT_SIGNATURE = String(process.env.BOOKING_STRICT_SIGNATURE || process.env.STRICT_SECURITY_MODE || 'true').trim().toLowerCase() === 'true';
const BOOKING_CRITICAL_RATE_LIMIT_ENABLED = String(process.env.BOOKING_CRITICAL_RATE_LIMIT_ENABLED || 'true').trim().toLowerCase() === 'true';
const BOOKING_SIGNATURE_INCLUDE_CREATE = String(process.env.BOOKING_SIGNATURE_INCLUDE_CREATE || 'true').trim().toLowerCase() === 'true';
const BOOKING_ALLOW_BROWSER_AUTH_CREATE = String(process.env.BOOKING_ALLOW_BROWSER_AUTH_CREATE || 'true').trim().toLowerCase() === 'true';
const BOOKING_BROWSER_CLIENT_HEADER = String(process.env.BOOKING_BROWSER_CLIENT_HEADER || 'goindiaride-web').trim().toLowerCase();
const BOOKING_FALLBACK_ALERT_ENABLED = String(process.env.BOOKING_FALLBACK_ALERT_ENABLED || 'true').trim().toLowerCase() !== 'false';
const BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER = String(process.env.BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER || 'true').trim().toLowerCase() !== 'false';
const BOOKING_FALLBACK_ALERT_ALLOWED_ORIGINS = [...new Set(
  splitCsvValues(
    process.env.BOOKING_FALLBACK_ALERT_ALLOWED_ORIGINS
    || process.env.BOOKING_FALLBACK_ALERT_ORIGINS
    || process.env.CORS_ORIGIN
    || 'https://goindiaride.in,https://www.goindiaride.in,http://localhost,http://127.0.0.1'
  )
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
)];
const ADMIN_EMAIL_RECIPIENT_VARS = ['BOOKING_ADMIN_ALERT_EMAILS', 'ADMIN_ALERT_EMAILS', 'ADMIN_EMAILS'];
const SMTP_FALLBACK_ADMIN_RECIPIENT_VARS = ['SMTP_FROM_EMAIL', 'SMTP_USER'];
const DEFAULT_ADMIN_ALERT_EMAIL = String(process.env.DEFAULT_ADMIN_ALERT_EMAIL || 'bhaugehlot159@gmail.com').trim().toLowerCase();
const BOOKING_ADMIN_WHATSAPP_ENABLED = String(process.env.BOOKING_ADMIN_WHATSAPP_ENABLED || 'true').trim().toLowerCase() !== 'false';
const BOOKING_ADMIN_WHATSAPP_PROVIDER = String(process.env.BOOKING_ADMIN_WHATSAPP_PROVIDER || process.env.BOOKING_WHATSAPP_PROVIDER || process.env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase();
const BOOKING_ADMIN_WHATSAPP_DEFAULT_COUNTRY = String(process.env.BOOKING_ADMIN_WHATSAPP_DEFAULT_COUNTRY || '91').replace(/\D/g, '') || '91';
const BOOKING_CUSTOMER_SMS_ENABLED = String(process.env.BOOKING_CUSTOMER_SMS_ENABLED || 'true').trim().toLowerCase() !== 'false';
const BOOKING_CUSTOMER_SMS_PROVIDER = resolveBookingCustomerSmsProvider();
const BOOKING_CUSTOMER_SMS_DEFAULT_COUNTRY = String(process.env.BOOKING_CUSTOMER_SMS_DEFAULT_COUNTRY || '91').replace(/\D/g, '') || '91';
const BOOKING_CUSTOMER_SUPPORT_PHONE = String(process.env.BOOKING_CUSTOMER_SUPPORT_PHONE || process.env.DEFAULT_ADMIN_WHATSAPP_NUMBER || '8426891471').replace(/[^\d+]/g, '') || '8426891471';
const ADMIN_WHATSAPP_RECIPIENT_VARS = [
  'BOOKING_ADMIN_WHATSAPP_NUMBERS',
  'BOOKING_ADMIN_WHATSAPP_NUMBER',
  'ADMIN_WHATSAPP_NUMBERS',
  'ADMIN_WHATSAPP_NUMBER'
];
const DEFAULT_ADMIN_WHATSAPP_NUMBER = String(process.env.DEFAULT_ADMIN_WHATSAPP_NUMBER || '8426891471').trim();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BOOKING_FALLBACK_ALERT_DEDUPE_WINDOW_MS = Math.max(
  60 * 1000,
  Math.min(Number(process.env.BOOKING_FALLBACK_ALERT_DEDUPE_WINDOW_MS || 20 * 60 * 1000), 24 * 60 * 60 * 1000)
);
const BOOKING_EMAIL_SINGLE_SMTP_ATTEMPT = String(process.env.BOOKING_EMAIL_SINGLE_SMTP_ATTEMPT || 'false').trim().toLowerCase() === 'true';
const BOOKING_EMAIL_DISPATCH_DEDUPE_WINDOW_MS = Math.max(
  60 * 1000,
  Math.min(Number(process.env.BOOKING_EMAIL_DISPATCH_DEDUPE_WINDOW_MS || 30 * 60 * 1000), 24 * 60 * 60 * 1000)
);
const CUSTOMER_BOOKING_EDIT_MAX_COUNT = 5;
const CUSTOMER_BOOKING_EDITABLE_FIELDS = [
  'pickup',
  'dropoff',
  'rideDate',
  'rideTime',
  'returnDate',
  'returnTime',
  'tripPlan',
  'paymentMethod',
  'vehicleType',
  'passengers',
  'luggage',
  'stop1',
  'stop2',
  'notes',
  'specialRequests',
  'safetyAccessibility'
];
const CUSTOMER_BOOKING_EDIT_WINDOWS = [
  {
    minHours: 72,
    tier: 'full_plus',
    label: '72h+ Premium Edit',
    allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice()
  },
  {
    minHours: 48,
    tier: 'full',
    label: '48-72h Flexible Edit',
    allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice()
  },
  {
    minHours: 24,
    tier: 'standard',
    label: '24-48h Smart Edit',
    allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice()
  },
  {
    minHours: 12,
    tier: 'limited',
    label: '12-24h Priority Edit',
    allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice()
  },
  {
    minHours: 6,
    tier: 'minimal',
    label: '6-12h Fast Edit',
    allowedFields: CUSTOMER_BOOKING_EDITABLE_FIELDS.slice()
  }
];
const CUSTOMER_BOOKING_EDIT_LOCK_HOURS = 6;
const FALLBACK_BOOKING_REVIEW_QUEUE_FILE = process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE
  || path.join(__dirname, '../../../data/runtime/fallback-booking-review-queue.json');
const FALLBACK_BOOKING_REVIEW_QUEUE_MAX = Math.max(
  100,
  Math.min(Number(process.env.FALLBACK_BOOKING_REVIEW_QUEUE_MAX || 1000), 5000)
);
const recentFallbackAdminEmailDispatchCache = new Map();
const recentBookingEmailDispatchCache = new Map();

function hasBearerAuth(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  return authHeader.startsWith('Bearer ');
}

function isBrowserAuthCreateWithoutSignature(req) {
  if (!BOOKING_ALLOW_BROWSER_AUTH_CREATE) return false;

  const method = String(req.method || '').toUpperCase();
  const normalizedPath = String(req.path || '').trim().toLowerCase();
  if (!(method === 'POST' && BOOKING_SIGNATURE_INCLUDE_CREATE && normalizedPath === '/')) {
    return false;
  }

  const signature = String(req.headers['x-signature'] || '').trim();
  if (signature) return false;
  if (!hasBearerAuth(req)) return false;

  const bookingClient = String(req.headers['x-booking-client'] || '').trim().toLowerCase();
  return Boolean(bookingClient && bookingClient === BOOKING_BROWSER_CLIENT_HEADER);
}

function isBookingCriticalMutation(req) {
  const method = String(req.method || '').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return false;

  const normalizedPath = String(req.path || '').trim().toLowerCase();
  if (!normalizedPath) return false;

  if (BOOKING_SIGNATURE_INCLUDE_CREATE && normalizedPath === '/') {
    return true;
  }

  return (
    /\/[^/]+\/complete$/.test(normalizedPath)
    || /\/[^/]+\/refund$/.test(normalizedPath)
    || /\/[^/]+\/cancel$/.test(normalizedPath)
  );
}

function bookingCriticalSecurityShield(req, res, next) {
  if (!isBookingCriticalMutation(req)) {
    return next();
  }

  const applySignatureCheck = () => {
    if (isBrowserAuthCreateWithoutSignature(req)) {
      return next();
    }
    if (!BOOKING_STRICT_SIGNATURE) {
      return next();
    }
    return verifyApiSignature(req, res, next);
  };

  if (!BOOKING_CRITICAL_RATE_LIMIT_ENABLED) {
    return applySignatureCheck();
  }

  return walletCriticalLimiter(req, res, (error) => {
    if (error) return next(error);
    return applySignatureCheck();
  });
}

router.use(bookingCriticalSecurityShield);

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

function sanitizeStringArray(value, maxItems = 8, maxLen = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => sanitizeText(entry, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeBooleanMap(value, maxKeys = 40) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value).slice(0, maxKeys);
  return entries.reduce((acc, [key, raw]) => {
    const safeKey = sanitizeText(key, 60).replace(/\s+/g, '_');
    if (!safeKey) return acc;
    acc[safeKey] = Boolean(raw);
    return acc;
  }, {});
}

function normalizeCoordinatePoint(value) {
  if (!value) return null;
  const source = Array.isArray(value)
    ? { lat: value[0], lng: value[1] }
    : (typeof value === 'object' ? value : {});
  const lat = Number(source.lat ?? source.latitude);
  const lng = Number(source.lng ?? source.lon ?? source.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  const accuracy = Number(source.accuracy ?? source.accuracyMeters ?? source.horizontalAccuracy);
  const point = {
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7)),
    source: sanitizeText(source.source || 'booking_coordinate', 80),
    capturedAt: sanitizeText(source.capturedAt || '', 60)
  };
  if (Number.isFinite(accuracy) && accuracy >= 0) {
    point.accuracy = Math.round(accuracy);
  }
  point.googleMapsUrl = `https://www.google.com/maps?q=${point.lat},${point.lng}`;
  return point;
}

function normalizeLocationPins(body = {}) {
  const rawPins = body.locationPins && typeof body.locationPins === 'object' ? body.locationPins : {};
  const pickupCoordinates = normalizeCoordinatePoint(
    body.pickupCoordinates
      || body.pickupLocationCoordinates
      || rawPins.pickup?.coordinates
  );
  const dropoffCoordinates = normalizeCoordinatePoint(
    body.dropoffCoordinates
      || body.dropCoordinates
      || body.dropLocationCoordinates
      || rawPins.dropoff?.coordinates
  );
  const rawStops = Array.isArray(body.routeStopLocations)
    ? body.routeStopLocations
    : (Array.isArray(rawPins.stops) ? rawPins.stops : []);
  const routeStopLocations = rawStops
    .map((item, index) => {
      const coordinates = normalizeCoordinatePoint(item?.coordinates || item);
      const address = sanitizeText(item?.address || '', 180);
      if (!coordinates && !address) return null;
      return {
        index: Number(item?.index || index + 1),
        address,
        coordinates,
        googleMapsUrl: coordinates ? coordinates.googleMapsUrl : sanitizeText(item?.googleMapsUrl || '', 240)
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return {
    pickupCoordinates,
    dropoffCoordinates,
    pickupGoogleMapsUrl: sanitizeText(body.pickupGoogleMapsUrl || rawPins.pickup?.googleMapsUrl || pickupCoordinates?.googleMapsUrl || '', 240),
    dropoffGoogleMapsUrl: sanitizeText(body.dropoffGoogleMapsUrl || rawPins.dropoff?.googleMapsUrl || dropoffCoordinates?.googleMapsUrl || '', 240),
    routeStopLocations,
    locationPins: {
      pickup: {
        address: sanitizeText(rawPins.pickup?.address || body.pickup || body.pickupLocation || '', 180),
        coordinates: pickupCoordinates,
        googleMapsUrl: sanitizeText(body.pickupGoogleMapsUrl || rawPins.pickup?.googleMapsUrl || pickupCoordinates?.googleMapsUrl || '', 240)
      },
      dropoff: {
        address: sanitizeText(rawPins.dropoff?.address || body.dropoff || body.drop || body.dropLocation || '', 180),
        coordinates: dropoffCoordinates,
        googleMapsUrl: sanitizeText(body.dropoffGoogleMapsUrl || rawPins.dropoff?.googleMapsUrl || dropoffCoordinates?.googleMapsUrl || '', 240)
      },
      stops: routeStopLocations,
      source: sanitizeText(rawPins.source || 'booking_google_map_exact_location', 80)
    }
  };
}

function normalizeInteger(value, fallback = 1, min = 1, max = 20) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeBookingTimeValue(value) {
  const safeValue = sanitizeText(value, 40);
  const match = safeValue.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return safeValue;
  const hours = Math.max(0, Math.min(23, Number.parseInt(match[1], 10) || 0));
  const minutes = Math.max(0, Math.min(59, Number.parseInt(match[2], 10) || 0));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseBookingRideStartDateTime(booking) {
  if (!booking || typeof booking !== 'object') return null;

  const outbound = booking.outboundDateTime ? new Date(booking.outboundDateTime) : null;
  if (outbound && !Number.isNaN(outbound.getTime())) {
    return outbound;
  }

  const rideDate = sanitizeText(booking.rideDate, 40);
  if (!rideDate) return null;
  const rideTime = normalizeBookingTimeValue(booking.rideTime || '');
  const normalizedTime = /^\d{2}:\d{2}$/.test(rideTime) ? rideTime : '00:00';

  const isoCandidate = new Date(`${rideDate}T${normalizedTime}:00`);
  if (!Number.isNaN(isoCandidate.getTime())) {
    return isoCandidate;
  }

  const looseCandidate = new Date(`${rideDate} ${normalizedTime}`);
  if (!Number.isNaN(looseCandidate.getTime())) {
    return looseCandidate;
  }

  return null;
}

function getBookingEditCount(booking) {
  const directCount = Number(booking && booking.editCount);
  if (Number.isFinite(directCount)) {
    return Math.max(0, directCount);
  }
  const historyLength = Array.isArray(booking && booking.editHistory) ? booking.editHistory.length : 0;
  return Math.max(0, historyLength);
}

function resolveCustomerBookingEditPolicy(booking) {
  const status = sanitizeText(booking?.status, 40).toLowerCase();
  const editCount = getBookingEditCount(booking);
  const rideStart = parseBookingRideStartDateTime(booking);
  const hoursUntilRide = rideStart ? ((rideStart.getTime() - Date.now()) / (60 * 60 * 1000)) : null;

  if (status === 'completed' || status === 'cancelled') {
    return {
      allowed: false,
      windowTier: 'locked',
      reason: 'Booking completed/cancelled hone ke baad edit allowed nahi hai.',
      maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
      usedEdits: editCount,
      remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
      allowedFields: [],
      hoursUntilRide
    };
  }

  if (editCount >= CUSTOMER_BOOKING_EDIT_MAX_COUNT) {
    return {
      allowed: false,
      windowTier: 'locked',
      reason: `Edit limit reach ho gayi hai (${CUSTOMER_BOOKING_EDIT_MAX_COUNT}/${CUSTOMER_BOOKING_EDIT_MAX_COUNT}).`,
      maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
      usedEdits: editCount,
      remainingEdits: 0,
      allowedFields: [],
      hoursUntilRide
    };
  }

  if (Number.isFinite(hoursUntilRide) && hoursUntilRide < CUSTOMER_BOOKING_EDIT_LOCK_HOURS) {
    return {
      allowed: false,
      windowTier: 'locked',
      reason: `${CUSTOMER_BOOKING_EDIT_LOCK_HOURS} hours se kam time me booking edit lock ho jaati hai.`,
      maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
      usedEdits: editCount,
      remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
      allowedFields: [],
      hoursUntilRide
    };
  }

  const selectedWindow = Number.isFinite(hoursUntilRide)
    ? (CUSTOMER_BOOKING_EDIT_WINDOWS.find((windowRule) => hoursUntilRide >= Number(windowRule.minHours || 0))
      || CUSTOMER_BOOKING_EDIT_WINDOWS[CUSTOMER_BOOKING_EDIT_WINDOWS.length - 1])
    : CUSTOMER_BOOKING_EDIT_WINDOWS[0];

  return {
    allowed: true,
    windowTier: selectedWindow.tier,
    windowLabel: selectedWindow.label,
    reason: `${selectedWindow.label} active hai.`,
    maxEdits: CUSTOMER_BOOKING_EDIT_MAX_COUNT,
    usedEdits: editCount,
    remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - editCount),
    allowedFields: Array.isArray(selectedWindow.allowedFields) ? selectedWindow.allowedFields : [],
    hoursUntilRide
  };
}

function buildBookingContext(body = {}) {
  const locationPins = normalizeLocationPins(body);
  return {
    pickupLocation: sanitizeText(body.pickup || body.pickupLocation, 180),
    dropLocation: sanitizeText(body.drop || body.dropoff || body.dropLocation, 180),
    pickupCoordinates: locationPins.pickupCoordinates,
    dropoffCoordinates: locationPins.dropoffCoordinates,
    pickupGoogleMapsUrl: locationPins.pickupGoogleMapsUrl,
    dropoffGoogleMapsUrl: locationPins.dropoffGoogleMapsUrl,
    routeStopLocations: locationPins.routeStopLocations,
    locationPins: locationPins.locationPins,
    rideDate: sanitizeText(body.rideDate, 40),
    rideTime: sanitizeText(body.rideTime, 40),
    returnDate: sanitizeText(body.returnDate, 40),
    returnTime: sanitizeText(body.returnTime, 40),
    tripPlan: sanitizeText(body.tripPlan, 80),
    tripServiceType: sanitizeText(body.tripServiceType || body.serviceType, 80),
    paymentMethod: sanitizeText(body.paymentMethod, 80),
    vehicleType: sanitizeText(body.vehicleType || body.rideType, 80),
    vehicleModel: sanitizeText(body.vehicleModel, 80),
    passengers: normalizeInteger(body.passengers, 1, 1, 20),
    luggage: sanitizeText(body.luggage, 80),
    notes: sanitizeText(body.notes, 600),
    budgetAmount: Math.max(0, normalizeAmount(body.budgetAmount || body.customerBidAmount || 0)),
    stops: sanitizeStringArray(body.stops, 8, 160),
    specialRequests: sanitizeBooleanMap(body.specialRequests, 60),
    safetyAccessibility: sanitizeBooleanMap(body.safetyAccessibility, 60),
    distanceSource: sanitizeText(body.distanceSource, 40)
  };
}

function normalizePersistedAmount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number(fallback || 0) || 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

function safeMixedObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeLocalSyncBooking(raw = {}, user = {}, reqUser = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bookingId = sanitizeText(raw.bookingId || raw.id, 120)
    .replace(/[^A-Za-z0-9:_-]/g, '')
    .toUpperCase()
    .slice(0, 120);
  if (!bookingId) return null;

  const context = buildBookingContext({
    ...raw,
    pickup: raw.pickup || raw.pickupLocation,
    drop: raw.dropoff || raw.drop || raw.dropLocation,
    vehicleType: raw.vehicleType || raw.rideType,
    specialRequests: raw.specialRequests || raw.customerFeatures?.specialRequests,
    safetyAccessibility: raw.safetyAccessibility || raw.customerFeatures?.safetyAccessibility,
    budgetAmount: raw.budgetAmount || raw.fareBreakdown?.budgetAmount,
    customerBidAmount: raw.customerBidAmount || raw.fareBreakdown?.customerBidAmount,
    distanceSource: raw.distanceSource || raw.fareBreakdown?.distanceSource
  });

  const amount = normalizePersistedAmount(raw.amount || raw.totalFare || raw.fareQuote?.amount || raw.fareBreakdown?.totalFare);
  const distanceKm = normalizePersistedAmount(raw.distanceKm || raw.distance || raw.fareQuote?.distanceKm || raw.fareBreakdown?.distanceKm);
  const rawStatus = sanitizeText(raw.status, 40).toLowerCase();
  const status = rawStatus === 'completed' ? 'completed' : (rawStatus === 'cancelled' ? 'cancelled' : 'created');
  const rawAdminReviewStatus = sanitizeText(raw.adminReviewStatus, 40).toLowerCase();
  const adminReviewStatus = ['approved', 'rejected'].includes(rawAdminReviewStatus) ? rawAdminReviewStatus : 'pending';
  const fareBreakdown = safeMixedObject(raw.fareBreakdown);
  const fareQuote = safeMixedObject(raw.fareQuote);
  const payment = safeMixedObject(raw.payment);
  const promo = safeMixedObject(raw.promo);
  const customerFeatures = safeMixedObject(raw.customerFeatures);
  const userId = sanitizeText(reqUser.id || reqUser._id || reqUser.sub || user._id || user.id, 80);

  return {
    bookingId,
    userId,
    cardHash: crypto
      .createHash('sha256')
      .update(`local-sync:${bookingId}:${userId}`)
      .digest('hex'),
    distanceKm,
    amount,
    budgetAmount: normalizePersistedAmount(raw.budgetAmount || fareBreakdown.budgetAmount),
    customerBidAmount: normalizePersistedAmount(raw.customerBidAmount || fareBreakdown.customerBidAmount),
    pickupLocation: context.pickupLocation,
    pickupCoordinates: context.pickupCoordinates,
    pickupGoogleMapsUrl: context.pickupGoogleMapsUrl,
    dropLocation: context.dropLocation,
    dropoffCoordinates: context.dropoffCoordinates,
    dropoffGoogleMapsUrl: context.dropoffGoogleMapsUrl,
    locationPins: context.locationPins,
    routeStopLocations: context.routeStopLocations,
    rideDate: context.rideDate,
    rideTime: context.rideTime,
    outboundDateTime: parseBookingRideStartDateTime({
      outboundDateTime: raw.outboundDateTime,
      rideDate: context.rideDate,
      rideTime: context.rideTime
    }),
    returnDate: context.returnDate || sanitizeText(raw.returnTrip?.returnDate, 40),
    returnTime: context.returnTime || sanitizeText(raw.returnTrip?.returnTime, 40),
    tripPlan: context.tripPlan,
    tripServiceType: context.tripServiceType,
    paymentMethod: context.paymentMethod,
    vehicleType: context.vehicleType,
    vehicleModel: context.vehicleModel,
    passengers: context.passengers,
    luggage: context.luggage,
    notes: context.notes,
    stops: context.stops,
    distanceSource: context.distanceSource,
    specialRequests: context.specialRequests,
    safetyAccessibility: context.safetyAccessibility,
    customerSnapshot: {
      name: sanitizeText(raw.customerName || raw.name || user.name, 140),
      email: sanitizeText(raw.customerEmail || raw.email || user.email || reqUser.email, 180),
      phone: formatCustomerPhoneForEmail(raw.customerPhone || raw.phone || user.phone)
    },
    fareBreakdown,
    fareQuote: {
      ...fareQuote,
      amount: normalizePersistedAmount(fareQuote.amount, amount),
      distanceKm: normalizePersistedAmount(fareQuote.distanceKm, distanceKm),
      source: sanitizeText(fareQuote.source || context.distanceSource, 80)
    },
    fareHash: sanitizeText(raw.fareHash || fareBreakdown.fareHash, 240),
    payment,
    promo,
    customerFeatures: {
      ...customerFeatures,
      locationPins: customerFeatures.locationPins || context.locationPins,
      pickupCoordinates: customerFeatures.pickupCoordinates || context.pickupCoordinates,
      dropoffCoordinates: customerFeatures.dropoffCoordinates || context.dropoffCoordinates,
      routeStopLocations: customerFeatures.routeStopLocations || context.routeStopLocations
    },
    adminReviewStatus,
    status
  };
}

function splitCsvValues(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveBookingCustomerSmsProvider() {
  const explicit = String(process.env.BOOKING_CUSTOMER_SMS_PROVIDER || process.env.BOOKING_SMS_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;

  const genericSmsProvider = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (['whatsapp', 'meta', 'twilio_whatsapp'].includes(genericSmsProvider)) {
    return '';
  }
  return genericSmsProvider;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeIndianPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let normalized = raw.replace(/\s+/g, '');
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith('+')) {
    const digits = normalized.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : '';
  }

  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
    return `+91${digitsOnly}`;
  }

  return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? `+${digitsOnly}` : '';
}

function formatCustomerPhoneForEmail(value) {
  const normalized = normalizeIndianPhone(value);
  return normalized || sanitizeText(value, 40);
}

function normalizeCustomerSmsPhone(value) {
  const direct = normalizeIndianPhone(value);
  if (direct) return direct;
  return normalizePhone(value, BOOKING_CUSTOMER_SMS_DEFAULT_COUNTRY);
}

function isLikelyEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function pruneRecentFallbackAdminEmailDispatchCache() {
  const cutoffMs = Date.now() - BOOKING_FALLBACK_ALERT_DEDUPE_WINDOW_MS;
  for (const [bookingId, entry] of recentFallbackAdminEmailDispatchCache.entries()) {
    if (!entry || Number(entry.sentAtMs || 0) < cutoffMs) {
      recentFallbackAdminEmailDispatchCache.delete(bookingId);
    }
  }
}

function getRecentFallbackAdminEmailDispatch(bookingId) {
  const safeBookingId = sanitizeText(bookingId, 80).toUpperCase();
  if (!safeBookingId) return null;
  pruneRecentFallbackAdminEmailDispatchCache();
  const entry = recentFallbackAdminEmailDispatchCache.get(safeBookingId);
  if (!entry) return null;
  if (Number(entry.sentAtMs || 0) < (Date.now() - BOOKING_FALLBACK_ALERT_DEDUPE_WINDOW_MS)) {
    recentFallbackAdminEmailDispatchCache.delete(safeBookingId);
    return null;
  }
  return entry;
}

function rememberRecentFallbackAdminEmailDispatch(bookingId, payload = {}) {
  const safeBookingId = sanitizeText(bookingId, 80).toUpperCase();
  if (!safeBookingId) return;
  pruneRecentFallbackAdminEmailDispatchCache();
  recentFallbackAdminEmailDispatchCache.set(safeBookingId, {
    sentAtMs: Date.now(),
    payload
  });
}

function pruneRecentBookingEmailDispatchCache() {
  const cutoffMs = Date.now() - BOOKING_EMAIL_DISPATCH_DEDUPE_WINDOW_MS;
  for (const [bookingId, entry] of recentBookingEmailDispatchCache.entries()) {
    if (!entry || Number(entry.sentAtMs || 0) < cutoffMs) {
      recentBookingEmailDispatchCache.delete(bookingId);
    }
  }
}

function getRecentBookingEmailDispatch(bookingId) {
  const safeBookingId = sanitizeText(bookingId, 80).toUpperCase();
  if (!safeBookingId) return null;
  pruneRecentBookingEmailDispatchCache();
  const entry = recentBookingEmailDispatchCache.get(safeBookingId);
  if (!entry) return null;
  if (Number(entry.sentAtMs || 0) < (Date.now() - BOOKING_EMAIL_DISPATCH_DEDUPE_WINDOW_MS)) {
    recentBookingEmailDispatchCache.delete(safeBookingId);
    return null;
  }
  return entry;
}

function rememberRecentBookingEmailDispatch(bookingId, payload = {}) {
  const safeBookingId = sanitizeText(bookingId, 80).toUpperCase();
  if (!safeBookingId) return;
  pruneRecentBookingEmailDispatchCache();
  recentBookingEmailDispatchCache.set(safeBookingId, {
    sentAtMs: Date.now(),
    payload: payload && typeof payload === 'object' ? payload : {}
  });
}

function buildDuplicateSuppressedEmailResult(result = {}, channel = 'email') {
  return {
    ...(result && typeof result === 'object' ? result : {}),
    sent: true,
    skipped: false,
    deduped: true,
    reason: 'duplicate_suppressed',
    message: sanitizeText(result?.message || `${channel}_duplicate_suppressed`, 120)
  };
}

async function resolveFallbackCustomerSnapshot(body = {}) {
  const snapshot = {
    name: sanitizeText(body.customerName || body.fullname || body.name, 140),
    email: normalizeEmail(body.customerEmail || body.email),
    phone: formatCustomerPhoneForEmail(body.customerPhone || body.phone)
  };

  const shouldLookupUser = !snapshot.name || !snapshot.phone || !isLikelyEmail(snapshot.email);
  if (!shouldLookupUser) {
    return snapshot;
  }

  const customerId = sanitizeText(body.customerId, 120);
  let matchedUser = null;
  try {
    if (customerId && /^[a-f\d]{24}$/i.test(customerId)) {
      matchedUser = await User.findById(customerId).select('name email phone').lean();
    }

    if (!matchedUser && isLikelyEmail(snapshot.email)) {
      matchedUser = await User.findOne({ email: snapshot.email }).select('name email phone').lean();
    }
  } catch (error) {
    logger.warn('fallback_customer_snapshot_lookup_failed', {
      customerId,
      email: snapshot.email,
      message: error.message
    });
  }

  if (!matchedUser) {
    return snapshot;
  }

  return {
    name: snapshot.name || sanitizeText(matchedUser.name, 140),
    email: isLikelyEmail(snapshot.email) ? snapshot.email : normalizeEmail(matchedUser.email),
    phone: snapshot.phone || formatCustomerPhoneForEmail(matchedUser.phone)
  };
}

function uniqueEmails(list = []) {
  return [...new Set(list.map(normalizeEmail).filter(isLikelyEmail))];
}

function uniquePhones(list = []) {
  return [...new Set(
    list
      .map((value) => normalizePhone(value, BOOKING_ADMIN_WHATSAPP_DEFAULT_COUNTRY))
      .filter(Boolean)
  )];
}

async function resolveAdminAlertRecipients() {
  const envEmails = ADMIN_EMAIL_RECIPIENT_VARS.flatMap((key) => splitCsvValues(process.env[key]));
  const defaultEmails = splitCsvValues(DEFAULT_ADMIN_ALERT_EMAIL);
  const smtpFallbackEmails = SMTP_FALLBACK_ADMIN_RECIPIENT_VARS.flatMap((key) => splitCsvValues(process.env[key]));
  let adminUserEmails = [];
  try {
    const adminUsers = await User.find({
      $or: [{ role: 'admin' }, { accountType: 'admin' }],
      email: { $exists: true, $ne: null }
    }).select('email').lean();

    adminUserEmails = adminUsers
      .map((user) => normalizeEmail(user.email))
      .filter(isLikelyEmail);
  } catch (error) {
    logger.warn('booking_admin_recipient_lookup_failed', {
      message: error.message
    });
  }

  const preferredRecipients = uniqueEmails([...envEmails, ...defaultEmails, ...adminUserEmails]);
  if (preferredRecipients.length) {
    return preferredRecipients;
  }

  return uniqueEmails(smtpFallbackEmails);
}

function resolveAdminWhatsAppRecipients() {
  const envPhones = ADMIN_WHATSAPP_RECIPIENT_VARS.flatMap((key) => splitCsvValues(process.env[key]));
  const defaultPhones = splitCsvValues(DEFAULT_ADMIN_WHATSAPP_NUMBER);
  return uniquePhones([...envPhones, ...defaultPhones]);
}

function toOrigin(rawValue) {
  try {
    return new URL(String(rawValue || '').trim()).origin.toLowerCase();
  } catch (_error) {
    return '';
  }
}

function resolveRequestOrigin(req) {
  const directOrigin = toOrigin(req.headers.origin);
  if (directOrigin) return directOrigin;
  return toOrigin(req.headers.referer);
}

function isAllowedFallbackAlertOrigin(origin) {
  if (!origin) return false;
  return BOOKING_FALLBACK_ALERT_ALLOWED_ORIGINS.includes(origin);
}

function isAllowedBrowserBookingBridge(req) {
  const bookingClient = String(req.headers['x-booking-client'] || '').trim().toLowerCase();
  if (bookingClient !== BOOKING_BROWSER_CLIENT_HEADER) return false;
  return isAllowedFallbackAlertOrigin(resolveRequestOrigin(req));
}

function readFallbackBookingReviewQueue() {
  try {
    if (!fs.existsSync(FALLBACK_BOOKING_REVIEW_QUEUE_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(FALLBACK_BOOKING_REVIEW_QUEUE_FILE, 'utf8'));
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === 'object')
      : [];
  } catch (error) {
    logger.warn('fallback_booking_review_queue_read_failed', {
      message: error.message
    });
    return [];
  }
}

function writeFallbackBookingReviewQueue(items = []) {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_BOOKING_REVIEW_QUEUE_FILE), { recursive: true });
    const safeItems = Array.isArray(items)
      ? items.filter((item) => item && typeof item === 'object').slice(0, FALLBACK_BOOKING_REVIEW_QUEUE_MAX)
      : [];
    fs.writeFileSync(FALLBACK_BOOKING_REVIEW_QUEUE_FILE, JSON.stringify(safeItems, null, 2), 'utf8');
    return true;
  } catch (error) {
    logger.warn('fallback_booking_review_queue_write_failed', {
      message: error.message
    });
    return false;
  }
}

function normalizeFallbackQueueBooking(raw = {}, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const bookingId = sanitizeText(options.bookingId || raw.bookingId || raw.id, 120)
    .replace(/[^A-Za-z0-9:_-]/g, '')
    .toUpperCase()
    .slice(0, 120);
  if (!bookingId || !/^(RID|BK|LOCAL)[A-Z0-9:_-]{6,}$/.test(bookingId)) return null;

  const context = options.bookingContext || buildBookingContext({
    ...raw,
    pickup: raw.pickup || raw.pickupLocation,
    drop: raw.dropoff || raw.drop || raw.dropLocation,
    vehicleType: raw.vehicleType || raw.rideType,
    specialRequests: raw.specialRequests || raw.customerFeatures?.specialRequests,
    safetyAccessibility: raw.safetyAccessibility || raw.customerFeatures?.safetyAccessibility,
    budgetAmount: raw.budgetAmount || raw.fareBreakdown?.budgetAmount,
    customerBidAmount: raw.customerBidAmount || raw.fareBreakdown?.customerBidAmount,
    distanceSource: raw.distanceSource || raw.fareBreakdown?.distanceSource
  });
  if (!context.pickupLocation || !context.dropLocation) return null;

  const providedFare = raw.fareBreakdown && typeof raw.fareBreakdown === 'object' ? raw.fareBreakdown : {};
  const estimate = options.fareEstimate || estimateBookingFare({
    ...raw,
    pickup: context.pickupLocation,
    drop: context.dropLocation,
    tripPlan: context.tripPlan,
    tripServiceType: context.tripServiceType,
    vehicleType: context.vehicleType,
    vehicleModel: context.vehicleModel,
    passengers: context.passengers,
    luggage: context.luggage,
    stops: context.stops,
    specialRequests: context.specialRequests,
    safetyAccessibility: context.safetyAccessibility,
    paymentMethod: context.paymentMethod,
    budgetAmount: context.budgetAmount,
    distanceSource: context.distanceSource
  });
  const amount = normalizePersistedAmount(
    raw.amount || raw.totalFare || raw.fare || raw.finalFare || raw.fareQuote?.amount || estimate.totalFare
  );
  const distanceKm = normalizePersistedAmount(
    raw.distanceKm || raw.distance || raw.fareQuote?.distanceKm || providedFare.distanceKm || estimate.distanceKm
  );
  const customerSnapshot = options.customerSnapshot && typeof options.customerSnapshot === 'object'
    ? options.customerSnapshot
    : {
        name: sanitizeText(raw.customerName || raw.name, 140),
        email: normalizeEmail(raw.customerEmail || raw.email || raw.userEmail),
        phone: formatCustomerPhoneForEmail(raw.customerPhone || raw.phone || raw.mobile || raw.contact)
      };
  const rawReviewStatus = sanitizeText(raw.adminReviewStatus, 40).toLowerCase();
  const adminReviewStatus = ['approved', 'rejected'].includes(rawReviewStatus) ? rawReviewStatus : 'pending';
  const rawStatus = sanitizeText(raw.status || raw.backendStatus, 40).toLowerCase();
  const status = adminReviewStatus === 'approved'
    ? (rawStatus && rawStatus !== 'pending' ? rawStatus : 'approved')
    : (adminReviewStatus === 'rejected' ? 'rejected' : 'created');

  return {
    id: bookingId,
    bookingId,
    status,
    adminReviewStatus,
    backendStatus: sanitizeText(raw.backendStatus || 'fallback_admin_review_queue', 80),
    sourceKey: sanitizeText(options.sourceKey || raw.sourceKey || 'fallback_admin_review_queue', 120),
    mode: sanitizeText(raw.mode || options.mode || 'fallback_admin_review_queue', 80),
    customerId: sanitizeText(raw.customerId || raw.userId || raw.backendUserId, 120),
    customerName: sanitizeText(raw.customerName || customerSnapshot.name || 'Customer', 140),
    customerEmail: normalizeEmail(raw.customerEmail || customerSnapshot.email || ''),
    customerPhone: formatCustomerPhoneForEmail(raw.customerPhone || customerSnapshot.phone || ''),
    customerSnapshot: {
      name: sanitizeText(customerSnapshot.name || raw.customerName || 'Customer', 140),
      email: normalizeEmail(customerSnapshot.email || raw.customerEmail || ''),
      phone: formatCustomerPhoneForEmail(customerSnapshot.phone || raw.customerPhone || '')
    },
    pickup: context.pickupLocation,
    pickupLocation: context.pickupLocation,
    pickupCoordinates: context.pickupCoordinates,
    pickupGoogleMapsUrl: context.pickupGoogleMapsUrl,
    dropoff: context.dropLocation,
    drop: context.dropLocation,
    dropLocation: context.dropLocation,
    dropoffCoordinates: context.dropoffCoordinates,
    dropoffGoogleMapsUrl: context.dropoffGoogleMapsUrl,
    locationPins: context.locationPins,
    routeStopLocations: context.routeStopLocations,
    rideDate: context.rideDate,
    rideTime: context.rideTime,
    outboundDateTime: parseBookingRideStartDateTime({
      outboundDateTime: raw.outboundDateTime,
      rideDate: context.rideDate,
      rideTime: context.rideTime
    }),
    returnDate: context.returnDate || sanitizeText(raw.returnTrip?.returnDate, 40),
    returnTime: context.returnTime || sanitizeText(raw.returnTrip?.returnTime, 40),
    returnTrip: raw.returnTrip && typeof raw.returnTrip === 'object' ? raw.returnTrip : {
      enabled: Boolean(context.returnDate),
      returnDate: context.returnDate,
      returnTime: context.returnTime
    },
    tripPlan: context.tripPlan,
    tripServiceType: context.tripServiceType,
    paymentMethod: context.paymentMethod,
    vehicleType: context.vehicleType,
    vehicleModel: context.vehicleModel,
    passengers: context.passengers,
    luggage: context.luggage,
    notes: context.notes,
    stops: context.stops,
    distanceSource: context.distanceSource || sanitizeText(estimate.distanceSource || providedFare.distanceSource, 80),
    distanceKm,
    amount,
    totalFare: amount,
    fare: amount,
    budgetAmount: normalizePersistedAmount(raw.budgetAmount || providedFare.budgetAmount || estimate.budgetAmount),
    customerBidAmount: normalizePersistedAmount(raw.customerBidAmount || providedFare.customerBidAmount || estimate.customerBidAmount),
    fareBreakdown: {
      ...providedFare,
      ...estimate,
      totalFare: amount,
      amount,
      distanceKm
    },
    fareQuote: raw.fareQuote && typeof raw.fareQuote === 'object'
      ? {
          ...raw.fareQuote,
          amount: normalizePersistedAmount(raw.fareQuote.amount, amount),
          distanceKm: normalizePersistedAmount(raw.fareQuote.distanceKm, distanceKm)
        }
      : {
          amount,
          distanceKm,
          source: context.distanceSource || sanitizeText(estimate.distanceSource || '', 80)
        },
    payment: raw.payment && typeof raw.payment === 'object' ? raw.payment : {},
    promo: raw.promo && typeof raw.promo === 'object' ? raw.promo : {},
    specialRequests: context.specialRequests,
    safetyAccessibility: context.safetyAccessibility,
    customerFeatures: {
      ...(raw.customerFeatures && typeof raw.customerFeatures === 'object'
        ? raw.customerFeatures
        : {
            specialRequests: context.specialRequests,
            safetyAccessibility: context.safetyAccessibility,
            hasStops: context.stops.length > 0,
            hasReturnTrip: Boolean(context.returnDate)
          }),
      locationPins: (raw.customerFeatures && typeof raw.customerFeatures === 'object' && raw.customerFeatures.locationPins) || context.locationPins,
      pickupCoordinates: (raw.customerFeatures && typeof raw.customerFeatures === 'object' && raw.customerFeatures.pickupCoordinates) || context.pickupCoordinates,
      dropoffCoordinates: (raw.customerFeatures && typeof raw.customerFeatures === 'object' && raw.customerFeatures.dropoffCoordinates) || context.dropoffCoordinates,
      routeStopLocations: (raw.customerFeatures && typeof raw.customerFeatures === 'object' && raw.customerFeatures.routeStopLocations) || context.routeStopLocations
    },
    adminEmailDispatch: raw.adminEmailDispatch && typeof raw.adminEmailDispatch === 'object' ? raw.adminEmailDispatch : {},
    customerEmailDispatch: raw.customerEmailDispatch && typeof raw.customerEmailDispatch === 'object' ? raw.customerEmailDispatch : {},
    adminWhatsAppDispatch: raw.adminWhatsAppDispatch && typeof raw.adminWhatsAppDispatch === 'object' ? raw.adminWhatsAppDispatch : {},
    customerSmsDispatch: raw.customerSmsDispatch && typeof raw.customerSmsDispatch === 'object' ? raw.customerSmsDispatch : {},
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fallbackQueuedAt: raw.fallbackQueuedAt || new Date().toISOString()
  };
}

function upsertFallbackBookingReviewQueue(record) {
  if (!record || typeof record !== 'object' || !record.bookingId) return { queued: false, state: 'invalid' };
  const existingQueue = readFallbackBookingReviewQueue();
  const bookingId = sanitizeText(record.bookingId || record.id, 120).toUpperCase();
  const byId = new Map();
  existingQueue.forEach((item) => {
    const id = sanitizeText(item.bookingId || item.id, 120).toUpperCase();
    if (id) byId.set(id, item);
  });
  const existing = byId.get(bookingId) || {};
  const merged = {
    ...existing,
    ...record,
    id: bookingId,
    bookingId,
    createdAt: existing.createdAt || record.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  byId.delete(bookingId);
  const nextQueue = [merged, ...Array.from(byId.values())]
    .sort((left, right) => {
      return (Date.parse(right.updatedAt || right.createdAt || '') || 0)
        - (Date.parse(left.updatedAt || left.createdAt || '') || 0);
    })
    .slice(0, FALLBACK_BOOKING_REVIEW_QUEUE_MAX);
  const written = writeFallbackBookingReviewQueue(nextQueue);
  return {
    queued: written,
    state: existing.bookingId ? 'existing' : 'queued',
    item: merged
  };
}

function queueFallbackBookingForAdminReview(raw = {}, options = {}) {
  const normalized = normalizeFallbackQueueBooking(raw, options);
  if (!normalized) return { queued: false, state: 'invalid', item: null };
  return upsertFallbackBookingReviewQueue(normalized);
}

function updateFallbackBookingReviewDecision(bookingId, { decision, note, reviewedBy } = {}) {
  const safeBookingId = sanitizeText(bookingId, 120).toUpperCase();
  if (!safeBookingId) return null;
  const queue = readFallbackBookingReviewQueue();
  const index = queue.findIndex((item) => sanitizeText(item.bookingId || item.id, 120).toUpperCase() === safeBookingId);
  if (index < 0) return null;
  const reviewedAt = new Date().toISOString();
  const updated = {
    ...queue[index],
    id: safeBookingId,
    bookingId: safeBookingId,
    adminReviewStatus: decision,
    status: decision === 'approved' ? 'approved' : 'rejected',
    adminReviewedBy: sanitizeText(reviewedBy, 120) || null,
    adminReviewedAt: reviewedAt,
    adminReviewNote: sanitizeText(note, 280) || null,
    updatedAt: reviewedAt
  };
  queue[index] = updated;
  writeFallbackBookingReviewQueue(queue);
  return updated;
}

function updateFallbackBookingReviewEdit(bookingId, { updates = {}, changedFields = [], reason = '', editedBy = '' } = {}) {
  const safeBookingId = sanitizeText(bookingId, 120).toUpperCase();
  if (!safeBookingId) return null;
  const queue = readFallbackBookingReviewQueue();
  const index = queue.findIndex((item) => sanitizeText(item.bookingId || item.id, 120).toUpperCase() === safeBookingId);
  if (index < 0) return null;

  const now = new Date().toISOString();
  const current = queue[index] || {};
  const normalized = normalizeFallbackQueueBooking({
    ...current,
    ...updates,
    id: safeBookingId,
    bookingId: safeBookingId,
    updatedAt: now
  }, {
    sourceKey: current.sourceKey || 'fallback_admin_review_queue',
    mode: 'admin_edit'
  });
  if (!normalized) return null;

  const editHistory = Array.isArray(current.editHistory) ? current.editHistory.slice(-49) : [];
  editHistory.push({
    editedAt: now,
    by: 'admin',
    source: 'admin_portal',
    reason: sanitizeText(reason || 'Updated by admin portal.', 180),
    changedFields: Array.isArray(changedFields) ? changedFields.slice(0, 40) : []
  });
  normalized.editHistory = editHistory;
  normalized.editCount = Math.max(Number(current.editCount || 0), editHistory.length);
  normalized.lastEditedAt = now;
  normalized.adminLastEditedAt = now;
  normalized.adminEditReason = sanitizeText(reason || 'Updated by admin portal.', 180);
  normalized.adminEditedBy = sanitizeText(editedBy, 120) || null;

  const statusHistory = Array.isArray(current.statusHistory) ? current.statusHistory.slice(-49) : [];
  statusHistory.push({
    status: 'admin_edited',
    at: now,
    source: 'admin_portal',
    note: normalized.adminEditReason
  });
  normalized.statusHistory = statusHistory;

  queue[index] = normalized;
  writeFallbackBookingReviewQueue(queue);
  return normalized;
}

function isFallbackQueueRowVisibleForStatus(row = {}, status = 'pending') {
  const reviewStatus = sanitizeText(row.adminReviewStatus, 40).toLowerCase() || 'pending';
  const requestedStatus = sanitizeText(status, 20).toLowerCase();
  if (requestedStatus === 'approved' || requestedStatus === 'rejected') {
    return reviewStatus === requestedStatus;
  }

  const rowStatus = sanitizeText(row.status, 40).toLowerCase() || 'created';
  return reviewStatus === 'pending' && ['created', 'pending', 'pending_admin_review'].includes(rowStatus);
}

function mapFallbackQueueRowForAdmin(row = {}) {
  return {
    bookingId: row.bookingId,
    status: row.status || 'created',
    adminReviewStatus: row.adminReviewStatus || 'pending',
    distanceKm: Number(row.distanceKm || 0),
    amount: Number(row.amount || row.totalFare || row.fare || 0),
    referralCode: row.referralCode || row.promo?.code || '',
    pickupLocation: row.pickupLocation || row.pickup || '',
    dropLocation: row.dropLocation || row.dropoff || row.drop || '',
    rideDate: row.rideDate || '',
    rideTime: row.rideTime || '',
    outboundDateTime: row.outboundDateTime || null,
    returnDate: row.returnDate || row.returnTrip?.returnDate || '',
    returnTime: row.returnTime || row.returnTrip?.returnTime || '',
    tripPlan: row.tripPlan || '',
    paymentMethod: row.paymentMethod || row.payment?.method || '',
    vehicleType: row.vehicleType || row.rideType || '',
    vehicleModel: row.vehicleModel || '',
    tripServiceType: row.tripServiceType || '',
    passengers: Number(row.passengers || 1),
    luggage: row.luggage || '',
    notes: row.notes || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    editCount: getBookingEditCount(row),
    lastEditedAt: row.lastEditedAt || null,
    editPolicyVersion: row.editPolicyVersion || '',
    editHistory: Array.isArray(row.editHistory) ? row.editHistory : [],
    specialRequests: row.specialRequests && typeof row.specialRequests === 'object' ? row.specialRequests : {},
    safetyAccessibility: row.safetyAccessibility && typeof row.safetyAccessibility === 'object' ? row.safetyAccessibility : {},
    customerSnapshot: row.customerSnapshot && typeof row.customerSnapshot === 'object'
      ? {
          name: row.customerSnapshot.name || row.customerName || '',
          email: row.customerSnapshot.email || row.customerEmail || '',
          phone: row.customerSnapshot.phone || row.customerPhone || ''
        }
      : {
          name: row.customerName || '',
          email: row.customerEmail || '',
          phone: row.customerPhone || ''
        },
    customerName: row.customerName || row.customerSnapshot?.name || '',
    customerEmail: row.customerEmail || row.customerSnapshot?.email || '',
    customerPhone: row.customerPhone || row.customerSnapshot?.phone || '',
    fareBreakdown: row.fareBreakdown && typeof row.fareBreakdown === 'object' ? row.fareBreakdown : {},
    fareQuote: row.fareQuote && typeof row.fareQuote === 'object' ? row.fareQuote : {},
    payment: row.payment && typeof row.payment === 'object' ? row.payment : {},
    promo: row.promo && typeof row.promo === 'object' ? row.promo : {},
    customerFeatures: row.customerFeatures && typeof row.customerFeatures === 'object' ? row.customerFeatures : {},
    adminEmailDispatch: row.adminEmailDispatch && typeof row.adminEmailDispatch === 'object' ? row.adminEmailDispatch : {},
    customerEmailDispatch: row.customerEmailDispatch && typeof row.customerEmailDispatch === 'object' ? row.customerEmailDispatch : {},
    adminWhatsAppDispatch: row.adminWhatsAppDispatch && typeof row.adminWhatsAppDispatch === 'object' ? row.adminWhatsAppDispatch : {},
    customerSmsDispatch: row.customerSmsDispatch && typeof row.customerSmsDispatch === 'object' ? row.customerSmsDispatch : {},
    driverId: row.driverId || null,
    adminReviewedBy: row.adminReviewedBy || null,
    adminReviewedAt: row.adminReviewedAt || null,
    adminReviewNote: row.adminReviewNote || null,
    sourceKey: row.sourceKey || 'fallback_admin_review_queue',
    fallbackQueuedAt: row.fallbackQueuedAt || null,
    customer: null,
    createdAt: row.createdAt || row.fallbackQueuedAt || null,
    updatedAt: row.updatedAt || null
  };
}

function isBookingDatabaseReady() {
  return !Booking.db || Number(Booking.db.readyState) === 1;
}

function mapStoredBookingRowForAdmin(row = {}) {
  return {
    bookingId: row.bookingId,
    status: row.status,
    adminReviewStatus: row.adminReviewStatus || 'pending',
    distanceKm: Number(row.distanceKm || 0),
    amount: Number(row.amount || 0),
    referralCode: row.referralCode || '',
    pickupLocation: row.pickupLocation || '',
    dropLocation: row.dropLocation || '',
    rideDate: row.rideDate || '',
    rideTime: row.rideTime || '',
    outboundDateTime: row.outboundDateTime || null,
    returnDate: row.returnDate || '',
    returnTime: row.returnTime || '',
    tripPlan: row.tripPlan || '',
    paymentMethod: row.paymentMethod || '',
    vehicleType: row.vehicleType || '',
    passengers: Number(row.passengers || 1),
    luggage: row.luggage || '',
    notes: row.notes || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    editCount: getBookingEditCount(row),
    lastEditedAt: row.lastEditedAt || null,
    editPolicyVersion: row.editPolicyVersion || '',
    editHistory: Array.isArray(row.editHistory) ? row.editHistory : [],
    specialRequests: row.specialRequests && typeof row.specialRequests === 'object' ? row.specialRequests : {},
    safetyAccessibility: row.safetyAccessibility && typeof row.safetyAccessibility === 'object' ? row.safetyAccessibility : {},
    customerSnapshot: row.customerSnapshot && typeof row.customerSnapshot === 'object'
      ? {
          name: row.customerSnapshot.name || '',
          email: row.customerSnapshot.email || '',
          phone: row.customerSnapshot.phone || ''
        }
      : null,
    adminEmailDispatch: row.adminEmailDispatch && typeof row.adminEmailDispatch === 'object' ? row.adminEmailDispatch : {},
    customerEmailDispatch: row.customerEmailDispatch && typeof row.customerEmailDispatch === 'object' ? row.customerEmailDispatch : {},
    adminWhatsAppDispatch: row.adminWhatsAppDispatch && typeof row.adminWhatsAppDispatch === 'object' ? row.adminWhatsAppDispatch : {},
    customerSmsDispatch: row.customerSmsDispatch && typeof row.customerSmsDispatch === 'object' ? row.customerSmsDispatch : {},
    driverId: row.driverId || null,
    adminReviewedBy: row.adminReviewedBy || null,
    adminReviewedAt: row.adminReviewedAt || null,
    adminReviewNote: row.adminReviewNote || null,
    sourceKey: 'backend_booking_collection',
    customer: row.userId && typeof row.userId === 'object'
      ? {
          id: String(row.userId._id || ''),
          name: row.userId.name || '',
          email: row.userId.email || '',
          phone: row.userId.phone || '',
          accountType: row.userId.accountType || ''
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function listEnabledFlags(map = {}) {
  const enabled = Object.entries(map || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => humanizeKey(key));
  return enabled.length ? enabled.join(', ') : 'None';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function formatMoneyDelta(value) {
  const amount = Number(value || 0);
  const prefix = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${prefix}${formatMoney(Math.abs(amount))}`;
}

function getBookingFareSummary(booking = {}) {
  const fare = booking && booking.fareBreakdown && typeof booking.fareBreakdown === 'object'
    ? booking.fareBreakdown
    : {};
  const totalFare = Number(fare.totalFare ?? fare.finalFare ?? booking.amount ?? booking.totalFare ?? 0);
  const budgetAmount = Number(
    fare.customerBidAmount ??
    fare.budgetAmount ??
    booking.customerBidAmount ??
    booking.budgetAmount ??
    0
  );

  return {
    fare,
    totalFare,
    budgetAmount,
    distanceKm: Number(fare.distanceKm ?? booking.distanceKm ?? 0),
    estimatedDurationMin: Number(fare.estimatedDurationMin ?? 0),
    pickupState: sanitizeText(fare.pickupState || '', 80),
    dropState: sanitizeText(fare.dropState || '', 80),
    routeCategory: sanitizeText(fare.routeCategory || '', 80),
    distanceSource: sanitizeText(fare.distanceSource || booking.distanceSource || '', 80),
    interState: Boolean(fare.interState),
    budgetGap: Number.isFinite(Number(fare.budgetGap)) ? Number(fare.budgetGap) : Math.round(budgetAmount - totalFare)
  };
}

function buildFareBreakdownRows(booking = {}) {
  const summary = getBookingFareSummary(booking);
  const fare = summary.fare || {};
  const rows = [];
  const distanceSourceLabel = String(summary.distanceSource || 'manual').replace(/_/g, ' ');
  const routeCategoryLabel = String(summary.routeCategory || 'local_route').replace(/_/g, ' ');
  const includedDistanceKm = Number(fare.includedDistanceKm || 0);
  const extraDistanceKm = Number(fare.extraDistanceKm || 0);
  const includedDurationMin = Number(fare.includedDurationMin || 0);
  const extraTimeMin = Number(fare.extraTimeMin || 0);

  if (summary.budgetAmount > 0) {
    rows.push(['Customer Bid / Budget', formatMoney(summary.budgetAmount)]);
    rows.push(['Budget Gap vs Estimate', formatMoneyDelta(summary.budgetGap)]);
  }

  rows.push(['Distance Source', distanceSourceLabel]);
  rows.push(['Route Category', routeCategoryLabel]);
  rows.push(['Estimated Duration', summary.estimatedDurationMin ? `${summary.estimatedDurationMin} min` : 'N/A']);
  rows.push(['Pickup State', summary.pickupState || 'N/A']);
  rows.push(['Drop State', summary.dropState || 'N/A']);
  rows.push(['Inter-State', summary.interState ? 'Yes' : 'No']);
  rows.push(['Included Distance', includedDistanceKm ? `${includedDistanceKm} km` : 'N/A']);
  rows.push(['Base Fare', formatMoney(fare.baseFare || 0)]);
  rows.push(['Distance Fare', formatMoney(fare.distanceFare || 0)]);
  rows.push(['Extra Kilometer Charge', formatMoney(fare.extraDistanceFare || 0)]);
  rows.push(['Included Duration', includedDurationMin ? `${includedDurationMin} min` : 'N/A']);
  rows.push(['Time / Traffic Charge', formatMoney(fare.timeFare || 0)]);
  rows.push(['Extra Time Charge', formatMoney(fare.extraTimeFare || 0)]);
  rows.push(['Passenger Surcharge', formatMoney(fare.passengerFare || 0)]);
  rows.push(['Trip Plan Surcharge', formatMoney(fare.tripPlanFare || 0)]);
  rows.push(['Luggage Charge', formatMoney(fare.luggageFare || 0)]);
  rows.push(['Special Requests', formatMoney(fare.extrasFare || 0)]);
  rows.push(['Safety & Accessibility', formatMoney(fare.safetyFare || 0)]);
  rows.push(['Stopover Charge', formatMoney(fare.stopFare || 0)]);
  rows.push(['Round Trip Charge', formatMoney(fare.roundTripCharge || fare.returnTripFare || 0)]);
  rows.push(['Toll Charge', formatMoney(fare.tollCharge || 0)]);
  rows.push(['Parking Charge', formatMoney(fare.parkingCharge || 0)]);
  rows.push(['Other State Tax', formatMoney(fare.otherStateTax || fare.stateTax || 0)]);
  rows.push(['Driver Night Bhatta', formatMoney(fare.driverNightBatta || fare.nightCharge || 0)]);
  rows.push(['Payment Fee', formatMoney(fare.paymentFee || 0)]);
  rows.push(['GST / Service Tax', formatMoney(fare.taxesFare || 0)]);
  rows.push(['Promo Discount', `-${formatMoney(fare.promoDiscount || 0)}`]);
  rows.push(['Total Fare', formatMoney(summary.totalFare || 0)]);

  return rows;
}

function buildFareBreakdownText(booking = {}) {
  return buildFareBreakdownRows(booking)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
}

function formatCoordinateSummary(point) {
  const normalized = normalizeCoordinatePoint(point);
  if (!normalized) return '';
  const accuracy = Number.isFinite(Number(normalized.accuracy)) ? ` GPS ±${normalized.accuracy}m` : '';
  return `${normalized.lat},${normalized.lng}${accuracy}`;
}

function buildBookingAdminEmailText({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(' | ') : 'None';
  const customerPhone = formatCustomerPhoneForEmail(customer.phone);
  const pickupCoords = formatCoordinateSummary(context.pickupCoordinates);
  const dropoffCoords = formatCoordinateSummary(context.dropoffCoordinates);
  return [
    `New booking pending admin review`,
    `Booking ID: ${booking.bookingId}`,
    `Status: ${booking.status}`,
    `Admin Review: ${booking.adminReviewStatus || 'pending'}`,
    `Amount: INR ${Number(booking.amount || 0).toFixed(2)}`,
    `Distance: ${Number(booking.distanceKm || 0).toFixed(2)} km`,
    `Pickup: ${context.pickupLocation || 'N/A'}`,
    `Pickup GPS: ${pickupCoords || 'N/A'}`,
    `Pickup Map: ${context.pickupGoogleMapsUrl || 'N/A'}`,
    `Drop: ${context.dropLocation || 'N/A'}`,
    `Drop GPS: ${dropoffCoords || 'N/A'}`,
    `Drop Map: ${context.dropoffGoogleMapsUrl || 'N/A'}`,
    `Stops: ${stopsText}`,
    `Ride Date/Time: ${(context.rideDate || 'N/A')} ${(context.rideTime || '')}`.trim(),
    `Return Date/Time: ${(context.returnDate || 'N/A')} ${(context.returnTime || '')}`.trim(),
    `Trip Plan: ${context.tripPlan || 'N/A'}`,
    `Vehicle Type: ${context.vehicleType || 'N/A'}`,
    `Payment Method: ${context.paymentMethod || 'N/A'}`,
    `Passengers: ${context.passengers || 1}`,
    `Luggage: ${context.luggage || 'N/A'}`,
    `Customer Bid / Budget: ${Number(booking.customerBidAmount || booking.budgetAmount || 0) > 0 ? formatMoney(booking.customerBidAmount || booking.budgetAmount || 0) : 'N/A'}`,
    `Special Requests: ${listEnabledFlags(context.specialRequests)}`,
    `Safety & Accessibility: ${listEnabledFlags(context.safetyAccessibility)}`,
    `Notes: ${context.notes || 'None'}`,
    `Customer Name: ${customer.name || 'N/A'}`,
    `Customer Email: ${customer.email || 'N/A'}`,
    `Customer Phone: ${customerPhone || 'N/A'}`,
    `Fare Breakdown:\n${buildFareBreakdownText(booking)}`,
    `Created At: ${booking.createdAt ? new Date(booking.createdAt).toISOString() : new Date().toISOString()}`
  ].join('\n');
}

function buildBookingAdminWhatsAppText({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(' | ') : 'None';
  const customerPhone = formatCustomerPhoneForEmail(customer.phone);
  const pickupCoords = formatCoordinateSummary(context.pickupCoordinates);
  const dropoffCoords = formatCoordinateSummary(context.dropoffCoordinates);
  return [
    '[GO India RIDE] New Booking Pending Admin Review',
    `Booking ID: ${booking.bookingId}`,
    `Status: ${booking.status}`,
    `Admin Review: ${booking.adminReviewStatus || 'pending'}`,
    `Amount: INR ${Number(booking.amount || 0).toFixed(2)}`,
    `Customer Bid / Budget: ${Number(booking.customerBidAmount || booking.budgetAmount || 0) > 0 ? formatMoney(booking.customerBidAmount || booking.budgetAmount || 0) : 'N/A'}`,
    `Distance: ${Number(booking.distanceKm || 0).toFixed(2)} km`,
    `Pickup: ${context.pickupLocation || 'N/A'}`,
    `Pickup GPS: ${pickupCoords || 'N/A'}`,
    `Pickup Map: ${context.pickupGoogleMapsUrl || 'N/A'}`,
    `Drop: ${context.dropLocation || 'N/A'}`,
    `Drop GPS: ${dropoffCoords || 'N/A'}`,
    `Drop Map: ${context.dropoffGoogleMapsUrl || 'N/A'}`,
    `Stops: ${stopsText}`,
    `Ride Date/Time: ${(context.rideDate || 'N/A')} ${(context.rideTime || '')}`.trim(),
    `Return Date/Time: ${(context.returnDate || 'N/A')} ${(context.returnTime || '')}`.trim(),
    `Trip Plan: ${context.tripPlan || 'N/A'}`,
    `Vehicle Type: ${context.vehicleType || 'N/A'}`,
    `Payment Method: ${context.paymentMethod || 'N/A'}`,
    `Passengers: ${context.passengers || 1}`,
    `Luggage: ${context.luggage || 'N/A'}`,
    `Special Requests: ${listEnabledFlags(context.specialRequests)}`,
    `Safety & Accessibility: ${listEnabledFlags(context.safetyAccessibility)}`,
    `Notes: ${context.notes || 'None'}`,
    `Customer Name: ${customer.name || 'N/A'}`,
    `Customer Email: ${customer.email || 'N/A'}`,
    `Customer Phone: ${customerPhone || 'N/A'}`,
    `Fare Breakdown:\n${buildFareBreakdownText(booking)}`,
    `Created At: ${booking.createdAt ? new Date(booking.createdAt).toISOString() : new Date().toISOString()}`
  ].join('\n');
}

function buildBookingAdminEmailHtml({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(', ') : 'None';
  const customerPhone = formatCustomerPhoneForEmail(customer.phone);
  const pickupCoords = formatCoordinateSummary(context.pickupCoordinates);
  const dropoffCoords = formatCoordinateSummary(context.dropoffCoordinates);
  const dataRows = [
    ['Booking ID', booking.bookingId],
    ['Status', booking.status],
    ['Admin Review', booking.adminReviewStatus || 'pending'],
    ['Amount', `INR ${Number(booking.amount || 0).toFixed(2)}`],
    ['Distance', `${Number(booking.distanceKm || 0).toFixed(2)} km`],
    ['Pickup', context.pickupLocation || 'N/A'],
    ['Pickup GPS', pickupCoords || 'N/A'],
    ['Pickup Map', context.pickupGoogleMapsUrl || 'N/A'],
    ['Drop', context.dropLocation || 'N/A'],
    ['Drop GPS', dropoffCoords || 'N/A'],
    ['Drop Map', context.dropoffGoogleMapsUrl || 'N/A'],
    ['Stops', stopsText],
    ['Ride Date/Time', `${context.rideDate || 'N/A'} ${context.rideTime || ''}`.trim()],
    ['Return Date/Time', `${context.returnDate || 'N/A'} ${context.returnTime || ''}`.trim()],
    ['Trip Plan', context.tripPlan || 'N/A'],
    ['Vehicle Type', context.vehicleType || 'N/A'],
    ['Payment Method', context.paymentMethod || 'N/A'],
    ['Passengers', String(context.passengers || 1)],
    ['Luggage', context.luggage || 'N/A'],
    ['Special Requests', listEnabledFlags(context.specialRequests)],
    ['Safety & Accessibility', listEnabledFlags(context.safetyAccessibility)],
    ['Notes', context.notes || 'None'],
    ['Customer Name', customer.name || 'N/A'],
    ['Customer Email', customer.email || 'N/A'],
    ['Customer Phone', customerPhone || 'N/A'],
    ['Created At', booking.createdAt ? new Date(booking.createdAt).toISOString() : new Date().toISOString()]
  ];

  const rows = dataRows
    .map(([label, value]) => `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`)
    .join('');
  const fareRows = buildFareBreakdownRows(booking)
    .map(([label, value]) => `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<div style="font-family:Arial,sans-serif;color:#1f2d3d;line-height:1.5;">
<h2 style="margin:0 0 12px;color:#0b2f5c;">New Booking Pending Admin Review</h2>
<p style="margin:0 0 14px;">A new customer booking has been created and is waiting for admin approval.</p>
<h3 style="margin:16px 0 10px;color:#0b2f5c;">Booking Details</h3>
<table style="border-collapse:collapse;width:100%;max-width:820px;background:#ffffff;">${rows}</table>
<h3 style="margin:16px 0 10px;color:#0b2f5c;">Fare Breakdown</h3>
<table style="border-collapse:collapse;width:100%;max-width:820px;background:#ffffff;">${fareRows}</table>
</div>`;
}

async function sendBookingAdminAlertEmail({ booking, context, customer, recipients: providedRecipients = null }) {
  const normalizedProvidedRecipients = Array.isArray(providedRecipients)
    ? uniqueEmails(providedRecipients)
    : [];
  const recipients = normalizedProvidedRecipients.length
    ? normalizedProvidedRecipients
    : await resolveAdminAlertRecipients();
  if (!recipients.length) {
    logger.warn('booking_admin_email_skipped', {
      bookingId: booking.bookingId,
      reason: 'no_admin_recipients'
    });
    return { sent: false, skipped: true, reason: 'no_admin_recipients' };
  }

  const subject = `[GO India RIDE] New booking pending admin review - ${booking.bookingId}`;
  const text = buildBookingAdminEmailText({ booking, context, customer });
  const html = buildBookingAdminEmailHtml({ booking, context, customer });

  try {
    const mailResult = await sendEmail({
      to: recipients.join(','),
      subject,
      text,
      html,
      disablePortFallback: BOOKING_EMAIL_SINGLE_SMTP_ATTEMPT
    });

    if (mailResult && mailResult.skipped) {
      return {
        sent: false,
        skipped: true,
        reason: 'smtp_not_configured'
      };
    }

    return {
      sent: true,
      skipped: false,
      recipients: recipients.length
    };
  } catch (error) {
    logger.error('booking_admin_email_failed', {
      bookingId: booking.bookingId,
      message: error.message
    });
    return {
      sent: false,
      skipped: false,
      reason: 'send_failed',
      message: error.message
    };
  }
}

function buildBookingCustomerEmailText({ booking, context, customer }) {
  const stopsText = context.stops.length ? context.stops.join(' | ') : 'None';
  return [
    'Your booking has been received by GO India RIDE.',
    `Booking ID: ${booking.bookingId}`,
    `Status: ${booking.status || 'created'}`,
    `Admin Review: ${booking.adminReviewStatus || 'pending'}`,
    `Pickup: ${context.pickupLocation || 'N/A'}`,
    `Drop: ${context.dropLocation || 'N/A'}`,
    `Ride Date/Time: ${(context.rideDate || 'N/A')} ${(context.rideTime || '')}`.trim(),
    `Return Date/Time: ${(context.returnDate || 'N/A')} ${(context.returnTime || '')}`.trim(),
    `Vehicle Type: ${context.vehicleType || 'N/A'}`,
    `Trip Plan: ${context.tripPlan || 'N/A'}`,
    `Payment Method: ${context.paymentMethod || 'N/A'}`,
    `Stops: ${stopsText}`,
    `Passengers: ${context.passengers || 1}`,
    `Estimated Fare: INR ${Number(booking.amount || 0).toFixed(2)}`,
    `Customer Bid / Budget: ${Number(booking.customerBidAmount || booking.budgetAmount || 0) > 0 ? formatMoney(booking.customerBidAmount || booking.budgetAmount || 0) : 'N/A'}`,
    `Fare Breakdown:\n${buildFareBreakdownText(booking)}`,
    '',
    'Thanks for booking with GO India RIDE.',
    'A driver will be assigned after admin approval.',
    `Customer: ${customer.name || 'N/A'}`
  ].join('\n');
}

function buildBookingCustomerEmailHtml({ booking, context, customer }) {
  const rows = [
    ['Booking ID', booking.bookingId],
    ['Status', booking.status || 'created'],
    ['Admin Review', booking.adminReviewStatus || 'pending'],
    ['Pickup', context.pickupLocation || 'N/A'],
    ['Drop', context.dropLocation || 'N/A'],
    ['Ride Date/Time', `${context.rideDate || 'N/A'} ${context.rideTime || ''}`.trim()],
    ['Return Date/Time', `${context.returnDate || 'N/A'} ${context.returnTime || ''}`.trim()],
    ['Vehicle Type', context.vehicleType || 'N/A'],
    ['Trip Plan', context.tripPlan || 'N/A'],
    ['Payment Method', context.paymentMethod || 'N/A'],
    ['Passengers', String(context.passengers || 1)],
    ['Estimated Fare', `INR ${Number(booking.amount || 0).toFixed(2)}`],
    ['Customer Bid / Budget', Number(booking.customerBidAmount || booking.budgetAmount || 0) > 0 ? formatMoney(booking.customerBidAmount || booking.budgetAmount || 0) : 'N/A']
  ];

  const rowHtml = rows
    .map(([label, value]) => `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`)
    .join('');
  const fareRows = buildFareBreakdownRows(booking)
    .map(([label, value]) => `<tr><td style="padding:8px 10px;border:1px solid #e3eaf8;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 10px;border:1px solid #e3eaf8;">${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<div style="font-family:Arial,sans-serif;color:#1f2d3d;line-height:1.5;">
<h2 style="margin:0 0 12px;color:#0b2f5c;">Booking Received</h2>
<p style="margin:0 0 14px;">Hi ${escapeHtml(customer.name || 'Customer')}, your booking has been received successfully. It is currently pending admin review.</p>
<table style="border-collapse:collapse;width:100%;max-width:760px;background:#ffffff;">${rowHtml}</table>
<h3 style="margin:16px 0 10px;color:#0b2f5c;">Fare Breakdown</h3>
<table style="border-collapse:collapse;width:100%;max-width:760px;background:#ffffff;">${fareRows}</table>
<p style="margin-top:14px;">Thanks for choosing GO India RIDE.</p>
</div>`;
}

async function sendBookingCustomerConfirmationEmail({ booking, context, customer }) {
  const customerEmail = normalizeEmail(customer && customer.email);
  if (!isLikelyEmail(customerEmail)) {
    return {
      sent: false,
      skipped: true,
      reason: 'missing_customer_email'
    };
  }

  const subject = `[GO India RIDE] Booking received - ${booking.bookingId}`;
  const text = buildBookingCustomerEmailText({ booking, context, customer });
  const html = buildBookingCustomerEmailHtml({ booking, context, customer });

  try {
    const mailResult = await sendEmail({
      to: customerEmail,
      subject,
      text,
      html,
      disablePortFallback: BOOKING_EMAIL_SINGLE_SMTP_ATTEMPT
    });

    if (mailResult && mailResult.skipped) {
      return {
        sent: false,
        skipped: true,
        reason: 'smtp_not_configured'
      };
    }

    return {
      sent: true,
      skipped: false,
      recipient: customerEmail
    };
  } catch (error) {
    logger.error('booking_customer_email_failed', {
      bookingId: booking.bookingId,
      customerEmail,
      message: error.message
    });
    return {
      sent: false,
      skipped: false,
      reason: 'send_failed',
      message: error.message
    };
  }
}

function buildBookingCustomerSmsText({ booking, context }) {
  const rideDateTime = `${context.rideDate || 'date pending'} ${context.rideTime || ''}`.trim();
  const fare = Number(booking.amount || booking.totalFare || 0);
  const fareText = Number.isFinite(fare) && fare > 0 ? `INR ${Math.round(fare)}` : 'fare pending';
  const route = `${context.pickupLocation || 'Pickup pending'} to ${context.dropLocation || 'Drop pending'}`;
  return [
    `GO India RIDE booking received.`,
    `Ref: ${booking.bookingId}.`,
    `Route: ${route}.`,
    `When: ${rideDateTime}.`,
    `Est fare: ${fareText}.`,
    `Use this ref to edit booking. Support: ${BOOKING_CUSTOMER_SUPPORT_PHONE}`
  ].join(' ');
}

async function sendBookingCustomerReferenceSms({ booking, context, customer }) {
  if (!BOOKING_CUSTOMER_SMS_ENABLED) {
    return { sent: false, skipped: true, reason: 'sms_disabled' };
  }

  const recipient = normalizeCustomerSmsPhone(
    customer?.phone
    || booking?.customerPhone
    || booking?.customerSnapshot?.phone
  );

  if (!recipient) {
    return { sent: false, skipped: true, reason: 'missing_customer_phone' };
  }

  const text = buildBookingCustomerSmsText({ booking, context });
  const result = await sendSms({
    to: recipient,
    text,
    provider: BOOKING_CUSTOMER_SMS_PROVIDER
  });

  return {
    ...(result && typeof result === 'object' ? result : { sent: false, reason: 'sms_unknown_response' }),
    channel: 'sms',
    recipientMasked: (result && result.recipientMasked) || maskPhone(recipient),
    bookingReference: booking.bookingId
  };
}

async function sendBookingAdminWhatsAppAlert({ booking, context, customer }) {
  if (!BOOKING_ADMIN_WHATSAPP_ENABLED) {
    return { sent: false, skipped: true, reason: 'whatsapp_disabled' };
  }

  const recipients = resolveAdminWhatsAppRecipients();
  if (!recipients.length) {
    logger.warn('booking_admin_whatsapp_skipped', {
      bookingId: booking.bookingId,
      reason: 'no_admin_whatsapp_recipients'
    });
    return { sent: false, skipped: true, reason: 'no_admin_whatsapp_recipients' };
  }

  const messageText = buildBookingAdminWhatsAppText({ booking, context, customer });
  const primaryRecipient = recipients[0];
  try {
    const result = await sendWhatsAppMessage({
      to: primaryRecipient,
      text: messageText,
      provider: BOOKING_ADMIN_WHATSAPP_PROVIDER,
      defaultCountryCode: BOOKING_ADMIN_WHATSAPP_DEFAULT_COUNTRY
    });
    if (!result || typeof result !== 'object') {
      return {
        sent: false,
        skipped: false,
        reason: 'whatsapp_unknown_response'
      };
    }

    return {
      ...result,
      recipientMasked: result.recipientMasked || maskPhone(primaryRecipient)
    };
  } catch (error) {
    logger.error('booking_admin_whatsapp_failed', {
      bookingId: booking.bookingId,
      message: error.message
    });
    return {
      sent: false,
      skipped: false,
      reason: 'whatsapp_send_failed',
      message: error.message
    };
  }
}

function normalizeEmailDispatchResult(result, fallbackReason = 'send_failed') {
  if (result && typeof result === 'object') {
    return result;
  }
  return {
    sent: false,
    skipped: false,
    reason: fallbackReason
  };
}

async function dispatchBookingEmails({ booking, context, customer, source = 'booking' }) {
  const safeBookingId = sanitizeText(booking?.bookingId, 80).toUpperCase();
  const cachedDispatch = safeBookingId ? getRecentBookingEmailDispatch(safeBookingId) : null;
  const cachedPayload = cachedDispatch && cachedDispatch.payload && typeof cachedDispatch.payload === 'object'
    ? cachedDispatch.payload
    : {};
  const cachedAdminSent = Boolean(cachedPayload.adminEmail && cachedPayload.adminEmail.sent === true);
  const cachedCustomerSent = Boolean(cachedPayload.customerEmail && cachedPayload.customerEmail.sent === true);
  const cachedAdminWhatsAppSent = Boolean(cachedPayload.adminWhatsApp && cachedPayload.adminWhatsApp.sent === true);
  const cachedCustomerSmsSent = Boolean(cachedPayload.customerSms && cachedPayload.customerSms.sent === true);
  const customerEmailAddress = normalizeEmail(customer && customer.email);
  let adminRecipients = [];
  try {
    adminRecipients = await resolveAdminAlertRecipients();
  } catch (error) {
    logger.warn('booking_admin_recipient_resolve_failed_before_dispatch', {
      bookingId: booking?.bookingId,
      source,
      message: error.message
    });
  }
  const skipCustomerEmailBecauseAdminRecipient = (
    isLikelyEmail(customerEmailAddress)
    && Array.isArray(adminRecipients)
    && adminRecipients.includes(customerEmailAddress)
  );

  if (
    cachedAdminSent
    && cachedCustomerSent
    && (!BOOKING_ADMIN_WHATSAPP_ENABLED || cachedAdminWhatsAppSent)
    && (!BOOKING_CUSTOMER_SMS_ENABLED || cachedCustomerSmsSent)
  ) {
    return {
      adminEmail: buildDuplicateSuppressedEmailResult(cachedPayload.adminEmail, 'admin_email'),
      customerEmail: buildDuplicateSuppressedEmailResult(cachedPayload.customerEmail, 'customer_email'),
      adminWhatsApp: BOOKING_ADMIN_WHATSAPP_ENABLED
        ? buildDuplicateSuppressedEmailResult(cachedPayload.adminWhatsApp, 'admin_whatsapp')
        : { sent: false, skipped: true, reason: 'whatsapp_disabled' },
      customerSms: BOOKING_CUSTOMER_SMS_ENABLED
        ? buildDuplicateSuppressedEmailResult(cachedPayload.customerSms, 'customer_sms')
        : { sent: false, skipped: true, reason: 'sms_disabled' }
    };
  }

  const adminEmailPromise = cachedAdminSent
    ? Promise.resolve(buildDuplicateSuppressedEmailResult(cachedPayload.adminEmail, 'admin_email'))
    : sendBookingAdminAlertEmail({ booking, context, customer, recipients: adminRecipients });

  const shouldSendCustomerEmail = source !== 'fallback_admin_alert';
  const customerEmailPromise = !shouldSendCustomerEmail
    ? Promise.resolve({
        sent: false,
        skipped: true,
        reason: 'disabled_for_fallback_admin_alert'
      })
    : cachedCustomerSent
    ? Promise.resolve(buildDuplicateSuppressedEmailResult(cachedPayload.customerEmail, 'customer_email'))
    : (
      skipCustomerEmailBecauseAdminRecipient
        ? Promise.resolve({
            sent: false,
            skipped: true,
            reason: 'same_as_admin_recipient'
          })
        : sendBookingCustomerConfirmationEmail({ booking, context, customer })
    );

  const adminWhatsAppPromise = !BOOKING_ADMIN_WHATSAPP_ENABLED
    ? Promise.resolve({ sent: false, skipped: true, reason: 'whatsapp_disabled' })
    : (
      cachedAdminWhatsAppSent
        ? Promise.resolve(buildDuplicateSuppressedEmailResult(cachedPayload.adminWhatsApp, 'admin_whatsapp'))
        : sendBookingAdminWhatsAppAlert({ booking, context, customer })
    );

  const customerSmsPromise = !BOOKING_CUSTOMER_SMS_ENABLED
    ? Promise.resolve({ sent: false, skipped: true, reason: 'sms_disabled' })
    : (
      cachedCustomerSmsSent
        ? Promise.resolve(buildDuplicateSuppressedEmailResult(cachedPayload.customerSms, 'customer_sms'))
        : sendBookingCustomerReferenceSms({ booking, context, customer })
    );

  const [adminOutcome, customerOutcome, adminWhatsAppOutcome, customerSmsOutcome] = await Promise.allSettled([
    adminEmailPromise,
    customerEmailPromise,
    adminWhatsAppPromise,
    customerSmsPromise
  ]);

  const adminEmail = adminOutcome.status === 'fulfilled'
    ? normalizeEmailDispatchResult(adminOutcome.value)
    : {
        sent: false,
        skipped: false,
        reason: 'send_failed',
        message: adminOutcome.reason?.message || 'send_failed'
      };

  const customerEmail = customerOutcome.status === 'fulfilled'
    ? normalizeEmailDispatchResult(customerOutcome.value)
    : {
        sent: false,
        skipped: false,
        reason: 'send_failed',
        message: customerOutcome.reason?.message || 'send_failed'
      };

  const adminWhatsApp = adminWhatsAppOutcome.status === 'fulfilled'
    ? normalizeEmailDispatchResult(adminWhatsAppOutcome.value)
    : {
        sent: false,
        skipped: false,
        reason: 'send_failed',
        message: adminWhatsAppOutcome.reason?.message || 'send_failed'
      };

  const customerSms = customerSmsOutcome.status === 'fulfilled'
    ? normalizeEmailDispatchResult(customerSmsOutcome.value)
    : {
        sent: false,
        skipped: false,
        reason: 'send_failed',
        message: customerSmsOutcome.reason?.message || 'send_failed'
      };

  if (adminOutcome.status !== 'fulfilled') {
    logger.error('booking_admin_email_dispatch_failed', {
      bookingId: booking.bookingId,
      source,
      message: adminOutcome.reason?.message || 'send_failed'
    });
  }
  if (customerOutcome.status !== 'fulfilled') {
    logger.error('booking_customer_email_dispatch_failed', {
      bookingId: booking.bookingId,
      source,
      message: customerOutcome.reason?.message || 'send_failed'
    });
  }
  if (adminWhatsAppOutcome.status !== 'fulfilled') {
    logger.error('booking_admin_whatsapp_dispatch_failed', {
      bookingId: booking.bookingId,
      source,
      message: adminWhatsAppOutcome.reason?.message || 'send_failed'
    });
  }
  if (customerSmsOutcome.status !== 'fulfilled') {
    logger.error('booking_customer_sms_dispatch_failed', {
      bookingId: booking.bookingId,
      source,
      message: customerSmsOutcome.reason?.message || 'send_failed'
    });
  }

  const cacheAdminEmail = adminEmail && adminEmail.sent === true
    ? { ...adminEmail, deduped: false }
    : (cachedPayload.adminEmail || adminEmail);
  const cacheCustomerEmail = customerEmail && customerEmail.sent === true
    ? { ...customerEmail, deduped: false }
    : (cachedPayload.customerEmail || customerEmail);
  const cacheAdminWhatsApp = adminWhatsApp && adminWhatsApp.sent === true
    ? { ...adminWhatsApp, deduped: false }
    : (cachedPayload.adminWhatsApp || adminWhatsApp);
  const cacheCustomerSms = customerSms && customerSms.sent === true
    ? { ...customerSms, deduped: false }
    : (cachedPayload.customerSms || customerSms);
  if (
    safeBookingId
    && (
      (cacheAdminEmail && cacheAdminEmail.sent === true)
      || (cacheCustomerEmail && cacheCustomerEmail.sent === true)
      || (cacheAdminWhatsApp && cacheAdminWhatsApp.sent === true)
      || (cacheCustomerSms && cacheCustomerSms.sent === true)
    )
  ) {
    rememberRecentBookingEmailDispatch(safeBookingId, {
      adminEmail: cacheAdminEmail,
      customerEmail: cacheCustomerEmail,
      adminWhatsApp: cacheAdminWhatsApp,
      customerSms: cacheCustomerSms,
      source
    });
  }

  return { adminEmail, customerEmail, adminWhatsApp, customerSms };
}

function sendBookingCustomerConfirmationEmailAsync({ booking, context, customer, source = 'unknown' }) {
  setImmediate(async () => {
    try {
      const result = await sendBookingCustomerConfirmationEmail({
        booking,
        context,
        customer
      });
      if (!result || result.sent !== true) {
        logger.warn('booking_customer_email_async_not_sent', {
          bookingId: booking.bookingId,
          source,
          reason: result?.reason || 'unknown'
        });
      }
    } catch (error) {
      logger.error('booking_customer_email_async_failed', {
        bookingId: booking.bookingId,
        source,
        message: error.message
      });
    }
  });
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

function isAdminUser(user) {
  return Boolean(user && (user.role === 'admin' || user.accountType === 'admin'));
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

router.get('/fallback/admin-review-queue', bookingFallbackEmailLimiter, async (req, res) => {
  if (!BOOKING_FALLBACK_ALERT_ENABLED) {
    return res.status(403).json({ message: 'Fallback admin review queue is disabled' });
  }

  if (!isAllowedBrowserBookingBridge(req)) {
    return res.status(403).json({ message: 'Booking client or origin not allowed for fallback admin review queue' });
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const status = sanitizeText(req.query.status, 20).toLowerCase();
  const query = {
    adminReviewStatus: status === 'approved' || status === 'rejected' ? status : 'pending'
  };

  if (query.adminReviewStatus === 'pending') {
    query.status = 'created';
  }

  let storedRows = [];
  if (isBookingDatabaseReady()) {
    try {
      storedRows = await Booking.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name email phone accountType')
        .lean();
    } catch (error) {
      logger.warn('fallback_admin_review_public_db_read_failed', {
        message: error.message
      });
      storedRows = [];
    }
  }

  const queue = readFallbackBookingReviewQueue();
  const fallbackRows = queue
    .filter((row) => isFallbackQueueRowVisibleForStatus(row, status))
    .slice(0, Math.max(limit - storedRows.length, 0))
    .map(mapFallbackQueueRowForAdmin);
  const rows = [...storedRows.map(mapStoredBookingRowForAdmin), ...fallbackRows]
    .sort((left, right) => {
      return (Date.parse(right.updatedAt || right.createdAt || '') || 0)
        - (Date.parse(left.updatedAt || left.createdAt || '') || 0);
    })
    .slice(0, limit);
  const pendingStoredCount = isBookingDatabaseReady()
    ? await Booking.countDocuments({ adminReviewStatus: 'pending', status: 'created' }).catch(() => 0)
    : 0;
  const pendingFallbackCount = queue.filter((row) => isFallbackQueueRowVisibleForStatus(row, 'pending')).length;

  return res.status(200).json({
    ok: true,
    count: rows.length,
    pendingCount: pendingStoredCount + pendingFallbackCount,
    fallbackCount: queue.length,
    storedCount: storedRows.length,
    items: rows
  });
});

router.post('/fallback/admin-review-queue', bookingFallbackEmailLimiter, async (req, res) => {
  if (!BOOKING_FALLBACK_ALERT_ENABLED) {
    return res.status(403).json({ message: 'Fallback admin review queue is disabled' });
  }

  if (!isAllowedBrowserBookingBridge(req)) {
    return res.status(403).json({ message: 'Booking client or origin not allowed for fallback admin review queue' });
  }

  const rows = Array.isArray(req.body?.bookings)
    ? req.body.bookings.slice(0, 150)
    : [req.body || {}];
  const result = {
    ok: true,
    queued: 0,
    existing: 0,
    invalid: 0,
    items: []
  };

  rows.forEach((row) => {
    const sourceKey = sanitizeText(req.body?.source || row?.sourceKey || 'customer_dashboard_public_sync', 120);
    const mode = sanitizeText(row?.mode || req.body?.mode || sourceKey, 80);
    const queued = queueFallbackBookingForAdminReview(row, { sourceKey, mode });
    const bookingId = sanitizeText(row?.bookingId || row?.id || '', 120).toUpperCase();
    if (!queued.queued) {
      result.invalid += 1;
      result.items.push({ bookingId, state: queued.state || 'invalid' });
      return;
    }
    if (queued.state === 'existing') result.existing += 1;
    else result.queued += 1;
    result.items.push({
      bookingId: queued.item.bookingId,
      state: queued.state,
      adminReviewStatus: queued.item.adminReviewStatus,
      status: queued.item.status
    });
  });

  return res.status(result.queued || result.existing ? 200 : 202).json(result);
});

router.post('/fallback/admin-alert-email', bookingFallbackEmailLimiter, async (req, res) => {
  if (!BOOKING_FALLBACK_ALERT_ENABLED) {
    return res.status(403).json({ message: 'Fallback admin email alert is disabled' });
  }

  const bookingClient = String(req.headers['x-booking-client'] || '').trim().toLowerCase();
  if (BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER && bookingClient !== BOOKING_BROWSER_CLIENT_HEADER) {
    return res.status(403).json({ message: 'Booking client not allowed for fallback admin email alert' });
  }

  const requestOrigin = resolveRequestOrigin(req);
  if (!isAllowedFallbackAlertOrigin(requestOrigin)) {
    return res.status(403).json({ message: 'Origin not allowed for fallback admin email alert' });
  }

  const bookingId = sanitizeText(req.body.bookingId || req.body.id, 80).toUpperCase();
  if (!bookingId || !/^(RID|BK)[A-Z0-9_-]{6,}$/.test(bookingId)) {
    return res.status(400).json({ message: 'Valid bookingId is required' });
  }

  const cachedDispatch = getRecentFallbackAdminEmailDispatch(bookingId);
  if (cachedDispatch && cachedDispatch.payload) {
    return res.status(200).json({
      ok: true,
      bookingId,
      message: 'Fallback admin alert already sent recently',
      deduped: true,
      adminEmail: {
        ...(cachedDispatch.payload.adminEmail || {}),
        sent: true,
        deduped: true,
        reason: 'duplicate_suppressed'
      },
      customerEmail: cachedDispatch.payload.customerEmail || null,
      adminWhatsApp: cachedDispatch.payload.adminWhatsApp || null,
      customerSms: cachedDispatch.payload.customerSms || null,
      notifications: {
        adminReview: cachedDispatch.payload.reviewAlert || null
      }
    });
  }

  const bookingContext = buildBookingContext(req.body || {});
  if (!bookingContext.pickupLocation || !bookingContext.dropLocation) {
    return res.status(400).json({ message: 'Pickup and drop locations are required' });
  }

  const fareEstimate = estimateBookingFare({
    ...req.body,
    pickup: bookingContext.pickupLocation,
    drop: bookingContext.dropLocation,
    tripPlan: bookingContext.tripPlan,
    tripServiceType: bookingContext.tripServiceType,
    vehicleType: bookingContext.vehicleType,
    vehicleModel: bookingContext.vehicleModel,
    passengers: bookingContext.passengers,
    luggage: bookingContext.luggage,
    stops: bookingContext.stops,
    specialRequests: bookingContext.specialRequests,
    safetyAccessibility: bookingContext.safetyAccessibility,
    paymentMethod: bookingContext.paymentMethod,
    budgetAmount: bookingContext.budgetAmount,
    distanceSource: bookingContext.distanceSource
  });

  const booking = {
    bookingId,
    status: 'created',
    adminReviewStatus: 'pending',
    amount: fareEstimate.totalFare,
    distanceKm: fareEstimate.distanceKm,
    budgetAmount: fareEstimate.budgetAmount,
    customerBidAmount: fareEstimate.customerBidAmount,
    fareBreakdown: fareEstimate,
    createdAt: new Date().toISOString()
  };

  const customerSnapshot = await resolveFallbackCustomerSnapshot(req.body || {});
  if (!customerSnapshot.phone) {
    return res.status(400).json({ message: 'Customer mobile number is required for booking emails' });
  }

  const queueResult = queueFallbackBookingForAdminReview(req.body || {}, {
    bookingId,
    bookingContext,
    fareEstimate,
    customerSnapshot,
    sourceKey: 'fallback_admin_alert_email',
    mode: 'fallback_admin_alert_email'
  });

  let reviewAlert = null;
  try {
    reviewAlert = await createBookingAdminReviewAlert({
      bookingId,
      amount: booking.amount,
      distanceKm: booking.distanceKm,
      customerId: sanitizeText(req.body.customerId, 120) || null,
      pickup: bookingContext.pickupLocation,
      pickupCoordinates: bookingContext.pickupCoordinates,
      pickupGoogleMapsUrl: bookingContext.pickupGoogleMapsUrl,
      drop: bookingContext.dropLocation,
      dropoffCoordinates: bookingContext.dropoffCoordinates,
      dropoffGoogleMapsUrl: bookingContext.dropoffGoogleMapsUrl,
      locationPins: bookingContext.locationPins,
      routeStopLocations: bookingContext.routeStopLocations,
      vehicleType: bookingContext.vehicleType,
      rideDate: bookingContext.rideDate,
      rideTime: bookingContext.rideTime,
      returnDate: bookingContext.returnDate,
      returnTime: bookingContext.returnTime,
      tripPlan: bookingContext.tripPlan,
      paymentMethod: bookingContext.paymentMethod,
      passengers: bookingContext.passengers,
      luggage: bookingContext.luggage,
      notes: bookingContext.notes,
      stops: bookingContext.stops,
      specialRequests: bookingContext.specialRequests,
      safetyAccessibility: bookingContext.safetyAccessibility,
      customerSnapshot,
      currency: sanitizeText(req.body.currency || 'INR', 8).toUpperCase() || 'INR'
    });
  } catch (error) {
    logger.warn('fallback_booking_admin_review_notification_failed', {
      bookingId,
      message: error.message
    });
  }

  const { adminEmail, customerEmail, adminWhatsApp, customerSms } = await dispatchBookingEmails({
    booking,
    context: bookingContext,
    customer: customerSnapshot,
    source: 'fallback_admin_alert'
  });

  const dispatchPatch = {
    adminEmailDispatch: adminEmail || { sent: false, reason: 'unknown' },
    customerEmailDispatch: customerEmail || { sent: false, reason: 'unknown' },
    adminWhatsAppDispatch: adminWhatsApp || { sent: false, reason: 'unknown' },
    customerSmsDispatch: customerSms || { sent: false, reason: 'unknown' }
  };
  const dispatchQueueResult = queueFallbackBookingForAdminReview({
    ...req.body,
    ...dispatchPatch
  }, {
    bookingId,
    bookingContext,
    fareEstimate,
    customerSnapshot,
    sourceKey: 'fallback_admin_alert_email',
    mode: 'fallback_admin_alert_email'
  });

  if (!adminEmail || adminEmail.sent !== true) {
    return res.status(202).json({
      ok: false,
      bookingId,
      message: 'Admin email not sent in fallback flow',
      adminEmail: adminEmail || { sent: false, reason: 'unknown' },
      customerEmail: customerEmail || { sent: false, reason: 'unknown' },
      adminWhatsApp: adminWhatsApp || { sent: false, reason: 'unknown' },
      customerSms: customerSms || { sent: false, reason: 'unknown' },
      adminReviewQueue: (dispatchQueueResult.queued || queueResult.queued) ? {
        state: dispatchQueueResult.state || queueResult.state,
        sourceKey: dispatchQueueResult.item?.sourceKey || queueResult.item?.sourceKey || 'fallback_admin_alert_email'
      } : {
        state: dispatchQueueResult.state || queueResult.state || 'not_queued'
      },
      notifications: {
        adminReview: reviewAlert
      }
    });
  }

  rememberRecentFallbackAdminEmailDispatch(bookingId, {
    adminEmail,
    customerEmail,
    adminWhatsApp,
    customerSms,
    reviewAlert
  });

  return res.status(200).json({
    ok: true,
    bookingId,
    message: 'Fallback admin alert email sent',
    adminEmail,
    customerEmail,
    adminWhatsApp,
    customerSms,
    adminReviewQueue: (dispatchQueueResult.queued || queueResult.queued) ? {
      state: dispatchQueueResult.state || queueResult.state,
      sourceKey: dispatchQueueResult.item?.sourceKey || queueResult.item?.sourceKey || 'fallback_admin_alert_email'
    } : {
      state: dispatchQueueResult.state || queueResult.state || 'not_queued'
    },
    notifications: {
      adminReview: reviewAlert
    }
  });
});

router.get('/quote', authenticate, continuousRiskGate, async (req, res) => {
  const estimate = estimateTrustedBookingFare({
    ...req.query,
    distanceKm: req.query.distanceKm || req.query.distance || 10,
    currency: req.query.currency || 'INR'
  });
  if (!estimate.distanceTrusted) {
    return res.status(422).json({ message: 'Trusted route distance unavailable for fare estimate' });
  }
  const fareHash = computeFareHash({ distanceKm: estimate.distanceKm, amount: estimate.totalFare });

  return res.status(200).json({
    distanceKm: estimate.distanceKm,
    amount: estimate.totalFare,
    fareHash,
    currency: 'INR',
    estimate
  });
});

router.post('/', authenticate, continuousRiskGate, verifyFareIntegrity, async (req, res) => {
  const { cardToken, distanceKm = 0, amount = 0, referralCode = '' } = req.body;
  if (!cardToken) {
    return res.status(400).json({ message: 'cardToken is required' });
  }

  const ip = getClientIp(req);
  const device = getDeviceMeta(req);
  const bookingContext = buildBookingContext(req.body);
  const customerRecord = await User.findById(req.user.id).select('name email phone isPhoneVerified').lean();
  const requestedCustomerPhone = normalizeIndianPhone(req.body.customerPhone || req.body.phone);
  const normalizedCustomerPhone = normalizeIndianPhone(customerRecord?.phone) || requestedCustomerPhone;
  if (!normalizedCustomerPhone) {
    return res.status(400).json({ message: 'Customer mobile number is required before booking' });
  }
  if ((!normalizeIndianPhone(customerRecord?.phone) || customerRecord?.isPhoneVerified !== true) && requestedCustomerPhone) {
    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        phone: requestedCustomerPhone,
        isPhoneVerified: true
      }
    });
  }
  const customerSnapshot = {
    name: sanitizeText(customerRecord?.name, 140),
    email: sanitizeText(customerRecord?.email || req.user.email, 180),
    phone: formatCustomerPhoneForEmail(normalizedCustomerPhone)
  };
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

  const fareEstimate = req.fareEstimate || estimateBookingFare({
    ...req.body,
    ...bookingContext,
    pickup: bookingContext.pickupLocation,
    drop: bookingContext.dropLocation,
    vehicleType: bookingContext.vehicleType,
    vehicleModel: bookingContext.vehicleModel,
    tripPlan: bookingContext.tripPlan,
    tripServiceType: bookingContext.tripServiceType,
    paymentMethod: bookingContext.paymentMethod,
    passengers: bookingContext.passengers,
    luggage: bookingContext.luggage,
    stops: bookingContext.stops,
    specialRequests: bookingContext.specialRequests,
    safetyAccessibility: bookingContext.safetyAccessibility,
    budgetAmount: bookingContext.budgetAmount,
    distanceSource: bookingContext.distanceSource,
    promoCode: referralCode
  });

  const bookingId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const booking = await Booking.create({
    userId: req.user.id,
    bookingId,
    cardHash,
    ip,
    distanceKm: fareEstimate.distanceKm || distanceKm,
    amount: fareEstimate.totalFare,
    referralCode: sanitizeText(referralCode, 80),
    budgetAmount: fareEstimate.budgetAmount,
    customerBidAmount: fareEstimate.customerBidAmount,
    fareBreakdown: fareEstimate,
    fareHash: sanitizeText(req.body.fareHash || '', 240),
    fareQuote: {
      amount: fareEstimate.totalFare,
      distanceKm: fareEstimate.distanceKm,
      source: fareEstimate.distanceSource,
      routeCategory: fareEstimate.routeCategory
    },
    pickupLocation: bookingContext.pickupLocation,
    pickupCoordinates: bookingContext.pickupCoordinates,
    pickupGoogleMapsUrl: bookingContext.pickupGoogleMapsUrl,
    dropLocation: bookingContext.dropLocation,
    dropoffCoordinates: bookingContext.dropoffCoordinates,
    dropoffGoogleMapsUrl: bookingContext.dropoffGoogleMapsUrl,
    locationPins: bookingContext.locationPins,
    routeStopLocations: bookingContext.routeStopLocations,
    rideDate: bookingContext.rideDate,
    rideTime: bookingContext.rideTime,
    outboundDateTime: parseBookingRideStartDateTime({
      rideDate: bookingContext.rideDate,
      rideTime: bookingContext.rideTime
    }),
    returnDate: bookingContext.returnDate,
    returnTime: bookingContext.returnTime,
    tripPlan: bookingContext.tripPlan,
    tripServiceType: bookingContext.tripServiceType,
    paymentMethod: bookingContext.paymentMethod,
    vehicleType: bookingContext.vehicleType,
    vehicleModel: bookingContext.vehicleModel,
    passengers: bookingContext.passengers,
    luggage: bookingContext.luggage,
    notes: bookingContext.notes,
    stops: bookingContext.stops,
    distanceSource: fareEstimate.distanceSource,
    specialRequests: bookingContext.specialRequests,
    safetyAccessibility: bookingContext.safetyAccessibility,
    customerSnapshot,
    payment: req.body.payment && typeof req.body.payment === 'object' ? req.body.payment : {},
    promo: {
      code: sanitizeText(referralCode, 80),
      discount: fareEstimate.promoDiscount
    },
    customerFeatures: {
      ...safeMixedObject(req.body.customerFeatures),
      specialRequests: bookingContext.specialRequests,
      safetyAccessibility: bookingContext.safetyAccessibility,
      hasStops: bookingContext.stops.length > 0,
      hasReturnTrip: Boolean(bookingContext.returnDate),
      locationPins: bookingContext.locationPins,
      pickupCoordinates: bookingContext.pickupCoordinates,
      dropoffCoordinates: bookingContext.dropoffCoordinates,
      routeStopLocations: bookingContext.routeStopLocations
    },
    status: 'created'
  });
  await Booking.updateOne(
    { _id: booking._id },
    {
      $set: {
        adminReviewStatus: 'pending',
        adminReviewedBy: null,
        adminReviewedAt: null,
        adminReviewNote: null
      }
    }
  );
  booking.adminReviewStatus = 'pending';

  await trackBehaviorEvent({
    userId: req.user.id,
    eventType: 'booking_create',
    ip,
    city: req.headers['x-city'] || 'unknown',
    deviceFingerprint: device.fingerprint,
    metadata: {
      distanceKm,
      amount: fareEstimate.totalFare,
      referralCode,
      pickup: bookingContext.pickupLocation,
      drop: bookingContext.dropLocation,
      tripPlan: bookingContext.tripPlan,
      paymentMethod: bookingContext.paymentMethod
    }
  });

  const behavior = await evaluateBehaviorRisk(req.user.id);
  await User.findByIdAndUpdate(req.user.id, {
    riskScore: Math.max(behavior.score, 0),
    lastRiskUpdate: new Date()
  });

  let notificationSummary = null;
  let adminEmail = null;
  let customerEmail = null;
  let adminWhatsApp = null;
  let customerSms = null;
  try {
    const reviewAlert = await createBookingAdminReviewAlert({
      bookingId: booking.bookingId,
      amount: booking.amount,
      distanceKm: booking.distanceKm,
      customerId: req.user.id,
      pickup: bookingContext.pickupLocation,
      pickupCoordinates: bookingContext.pickupCoordinates,
      pickupGoogleMapsUrl: bookingContext.pickupGoogleMapsUrl,
      drop: bookingContext.dropLocation,
      dropoffCoordinates: bookingContext.dropoffCoordinates,
      dropoffGoogleMapsUrl: bookingContext.dropoffGoogleMapsUrl,
      locationPins: bookingContext.locationPins,
      routeStopLocations: bookingContext.routeStopLocations,
      vehicleType: bookingContext.vehicleType,
      rideDate: bookingContext.rideDate,
      rideTime: bookingContext.rideTime,
      returnDate: bookingContext.returnDate,
      returnTime: bookingContext.returnTime,
      tripPlan: bookingContext.tripPlan,
      paymentMethod: bookingContext.paymentMethod,
      passengers: bookingContext.passengers,
      luggage: bookingContext.luggage,
      notes: bookingContext.notes,
      stops: bookingContext.stops,
      specialRequests: bookingContext.specialRequests,
      safetyAccessibility: bookingContext.safetyAccessibility,
      customerSnapshot,
      currency: 'INR'
    });

    notificationSummary = {
      adminReview: reviewAlert,
      driverDispatch: {
        skipped: true,
        reason: 'awaiting_admin_review'
      }
    };

    const emailDispatch = await dispatchBookingEmails({
      booking,
      context: bookingContext,
      customer: customerSnapshot,
      source: 'live_booking_create'
    });
    adminEmail = emailDispatch.adminEmail;
    customerEmail = emailDispatch.customerEmail;
    adminWhatsApp = emailDispatch.adminWhatsApp;
    customerSms = emailDispatch.customerSms;
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          adminEmailDispatch: adminEmail || {},
          customerEmailDispatch: customerEmail || {},
          adminWhatsAppDispatch: adminWhatsApp || {},
          customerSmsDispatch: customerSms || {}
        }
      }
    );
    if (adminEmail && adminEmail.sent === true) {
      rememberRecentFallbackAdminEmailDispatch(booking.bookingId, {
        adminEmail,
        customerEmail,
        adminWhatsApp,
        customerSms,
        reviewAlert
      });
    }
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
    adminReviewStatus: booking.adminReviewStatus || 'pending',
    riskScore: behavior.score,
    notifications: notificationSummary,
    adminEmail,
    customerEmail,
    adminWhatsApp,
    customerSms
  });
});

router.get('/my', authenticate, continuousRiskGate, async (req, res) => {
  const actorType = resolveCompletionActor(req);
  const limit = Math.min(Math.max(Number(req.query.limit || 60), 1), 300);

  let query = {};
  if (actorType === 'customer') {
    query = { userId: req.user.id };
  } else if (actorType === 'driver') {
    query = { driverId: String(req.user.id) };
  }

  const rows = await Booking.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const items = rows.map((row) => ({
    bookingId: row.bookingId,
    status: row.status || 'created',
    adminReviewStatus: row.adminReviewStatus || 'pending',
    adminReviewedAt: row.adminReviewedAt || null,
    adminReviewedBy: row.adminReviewedBy || null,
    adminReviewNote: row.adminReviewNote || null,
    pickupLocation: row.pickupLocation || '',
    pickupCoordinates: row.pickupCoordinates || row.customerFeatures?.pickupCoordinates || row.locationPins?.pickup?.coordinates || null,
    pickupGoogleMapsUrl: row.pickupGoogleMapsUrl || row.locationPins?.pickup?.googleMapsUrl || '',
    dropLocation: row.dropLocation || '',
    dropoffCoordinates: row.dropoffCoordinates || row.customerFeatures?.dropoffCoordinates || row.locationPins?.dropoff?.coordinates || null,
    dropoffGoogleMapsUrl: row.dropoffGoogleMapsUrl || row.locationPins?.dropoff?.googleMapsUrl || '',
    locationPins: row.locationPins && typeof row.locationPins === 'object' ? row.locationPins : (row.customerFeatures?.locationPins || {}),
    routeStopLocations: Array.isArray(row.routeStopLocations) ? row.routeStopLocations : (row.customerFeatures?.routeStopLocations || []),
    rideDate: row.rideDate || '',
    rideTime: row.rideTime || '',
    outboundDateTime: row.outboundDateTime || null,
    returnDate: row.returnDate || '',
    returnTime: row.returnTime || '',
    tripPlan: row.tripPlan || '',
    paymentMethod: row.paymentMethod || '',
    vehicleType: row.vehicleType || '',
    passengers: Number(row.passengers || 1),
    luggage: row.luggage || '',
    notes: row.notes || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    budgetAmount: Number(row.budgetAmount || 0),
    customerBidAmount: Number(row.customerBidAmount || 0),
    distanceSource: row.distanceSource || '',
    vehicleModel: row.vehicleModel || '',
    tripServiceType: row.tripServiceType || '',
    specialRequests: row.specialRequests && typeof row.specialRequests === 'object' ? row.specialRequests : {},
    safetyAccessibility: row.safetyAccessibility && typeof row.safetyAccessibility === 'object' ? row.safetyAccessibility : {},
    amount: Number(row.amount || 0),
    distanceKm: Number(row.distanceKm || 0),
    driverId: row.driverId || null,
    customerSnapshot: row.customerSnapshot && typeof row.customerSnapshot === 'object' ? row.customerSnapshot : {},
    fareBreakdown: row.fareBreakdown && typeof row.fareBreakdown === 'object' ? row.fareBreakdown : {},
    fareQuote: row.fareQuote && typeof row.fareQuote === 'object' ? row.fareQuote : {},
    fareHash: row.fareHash || '',
    payment: row.payment && typeof row.payment === 'object' ? row.payment : {},
    promo: row.promo && typeof row.promo === 'object' ? row.promo : {},
    customerFeatures: row.customerFeatures && typeof row.customerFeatures === 'object' ? row.customerFeatures : {},
    editCount: getBookingEditCount(row),
    lastEditedAt: row.lastEditedAt || null,
    editPolicyVersion: row.editPolicyVersion || '',
    editHistory: Array.isArray(row.editHistory) ? row.editHistory : [],
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  }));

  return res.status(200).json({
    count: items.length,
    items
  });
});

router.post('/sync-local', authenticate, continuousRiskGate, async (req, res) => {
  const rows = Array.isArray(req.body?.bookings) ? req.body.bookings.slice(0, 150) : [];
  if (!rows.length) {
    return res.status(200).json({
      ok: true,
      synced: 0,
      existing: 0,
      skipped: 0,
      invalid: 0,
      items: []
    });
  }

  let customer = {};
  try {
    const foundCustomer = await User.findById(req.user.id).select('name fullname email phone mobile').lean();
    customer = foundCustomer || {};
  } catch (error) {
    logger.warn('booking_local_sync_customer_lookup_failed', {
      userId: req.user.id,
      message: error.message
    });
  }

  const result = {
    ok: true,
    synced: 0,
    existing: 0,
    skipped: 0,
    invalid: 0,
    items: []
  };
  const ip = getClientIp(req);

  for (const row of rows) {
    const normalized = normalizeLocalSyncBooking(row, customer, req.user);
    if (!normalized || !normalized.bookingId || !normalized.userId) {
      result.invalid += 1;
      continue;
    }

    const itemResult = { bookingId: normalized.bookingId };
    try {
      const existing = await Booking.findOne({ bookingId: normalized.bookingId }).lean();
      if (existing) {
        if (String(existing.userId || '') !== String(req.user.id || '')) {
          result.skipped += 1;
          result.items.push({ ...itemResult, state: 'skipped_owner_mismatch' });
          continue;
        }
        result.existing += 1;
        result.items.push({ ...itemResult, state: 'existing' });
        continue;
      }

      await Booking.create({
        ...normalized,
        ip,
        statusHistory: [{
          status: normalized.status || 'created',
          source: 'customer_dashboard_local_sync',
          note: 'Recovered from customer browser storage after login'
        }]
      });
      result.synced += 1;
      result.items.push({ ...itemResult, state: 'synced' });
    } catch (error) {
      if (error && error.code === 11000) {
        result.existing += 1;
        result.items.push({ ...itemResult, state: 'existing' });
        continue;
      }
      result.skipped += 1;
      result.items.push({
        ...itemResult,
        state: 'failed',
        message: sanitizeText(error.message, 180)
      });
    }
  }

  return res.status(200).json(result);
});

router.post('/:id/edit', authenticate, continuousRiskGate, async (req, res) => {
  const actorType = resolveCompletionActor(req);
  if (actorType !== 'customer') {
    return res.status(403).json({ message: 'Only customer can edit booking from this endpoint' });
  }

  const bookingId = sanitizeText(req.params.id, 120).toUpperCase();
  if (!bookingId) {
    return res.status(400).json({ message: 'booking id is required' });
  }

  const booking = await Booking.findOne({ bookingId });
  if (!booking) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  if (String(booking.userId) !== String(req.user.id)) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  const policy = resolveCustomerBookingEditPolicy(booking);
  if (!policy.allowed) {
    return res.status(409).json({
      message: policy.reason,
      editPolicy: policy
    });
  }

  const allowedSet = new Set(Array.isArray(policy.allowedFields) ? policy.allowedFields : []);
  const updates = {
    pickup: sanitizeText(req.body.pickup || req.body.pickupLocation, 180),
    dropoff: sanitizeText(req.body.drop || req.body.dropoff || req.body.dropLocation, 180),
    rideDate: sanitizeText(req.body.rideDate, 40),
    rideTime: normalizeBookingTimeValue(req.body.rideTime),
    returnDate: sanitizeText(req.body.returnDate, 40),
    returnTime: normalizeBookingTimeValue(req.body.returnTime),
    tripPlan: sanitizeText(req.body.tripPlan, 80),
    paymentMethod: sanitizeText(req.body.paymentMethod, 80),
    vehicleType: sanitizeText(req.body.vehicleType || req.body.rideType, 80),
    passengers: normalizeInteger(req.body.passengers, Number(booking.passengers || 1), 1, 20),
    luggage: sanitizeText(req.body.luggage, 80),
    notes: sanitizeText(req.body.notes, 600),
    stops: sanitizeStringArray(req.body.stops, 2, 160),
    specialRequests: sanitizeBooleanMap(req.body.specialRequests, 60),
    safetyAccessibility: sanitizeBooleanMap(req.body.safetyAccessibility, 60)
  };

  const changedFields = [];
  const previous = {
    pickupLocation: booking.pickupLocation || '',
    dropLocation: booking.dropLocation || '',
    rideDate: booking.rideDate || '',
    rideTime: booking.rideTime || '',
    returnDate: booking.returnDate || '',
    returnTime: booking.returnTime || '',
    tripPlan: booking.tripPlan || '',
    paymentMethod: booking.paymentMethod || '',
    vehicleType: booking.vehicleType || '',
    passengers: Number(booking.passengers || 1),
    luggage: booking.luggage || '',
    notes: booking.notes || '',
    stops: Array.isArray(booking.stops) ? booking.stops : [],
    specialRequests: booking.specialRequests && typeof booking.specialRequests === 'object' ? booking.specialRequests : {},
    safetyAccessibility: booking.safetyAccessibility && typeof booking.safetyAccessibility === 'object' ? booking.safetyAccessibility : {}
  };

  if (allowedSet.has('pickup') && updates.pickup && updates.pickup !== previous.pickupLocation) {
    booking.pickupLocation = updates.pickup;
    changedFields.push('pickup');
  }
  if (allowedSet.has('dropoff') && updates.dropoff && updates.dropoff !== previous.dropLocation) {
    booking.dropLocation = updates.dropoff;
    changedFields.push('dropoff');
  }
  if (allowedSet.has('rideDate') && updates.rideDate && updates.rideDate !== previous.rideDate) {
    booking.rideDate = updates.rideDate;
    changedFields.push('rideDate');
  }
  if (allowedSet.has('rideTime') && updates.rideTime && updates.rideTime !== previous.rideTime) {
    booking.rideTime = updates.rideTime;
    changedFields.push('rideTime');
  }
  if (allowedSet.has('returnDate') && updates.returnDate !== previous.returnDate) {
    booking.returnDate = updates.returnDate;
    changedFields.push('returnDate');
  }
  if (allowedSet.has('returnTime') && updates.returnTime !== previous.returnTime) {
    booking.returnTime = updates.returnTime;
    changedFields.push('returnTime');
  }
  if (allowedSet.has('tripPlan') && updates.tripPlan && updates.tripPlan !== previous.tripPlan) {
    booking.tripPlan = updates.tripPlan;
    changedFields.push('tripPlan');
  }
  if (allowedSet.has('paymentMethod') && updates.paymentMethod && updates.paymentMethod !== previous.paymentMethod) {
    booking.paymentMethod = updates.paymentMethod;
    changedFields.push('paymentMethod');
  }
  if (allowedSet.has('vehicleType') && updates.vehicleType && updates.vehicleType !== previous.vehicleType) {
    booking.vehicleType = updates.vehicleType;
    changedFields.push('vehicleType');
  }
  if (allowedSet.has('passengers') && updates.passengers !== previous.passengers) {
    booking.passengers = updates.passengers;
    changedFields.push('passengers');
  }
  if (allowedSet.has('luggage') && updates.luggage !== previous.luggage) {
    booking.luggage = updates.luggage;
    changedFields.push('luggage');
  }
  if (allowedSet.has('notes') && updates.notes !== previous.notes) {
    booking.notes = updates.notes;
    changedFields.push('notes');
  }
  if ((allowedSet.has('stop1') || allowedSet.has('stop2'))
    && JSON.stringify(updates.stops) !== JSON.stringify(previous.stops)) {
    booking.stops = updates.stops;
    changedFields.push('stops');
  }
  if (allowedSet.has('specialRequests')
    && JSON.stringify(updates.specialRequests) !== JSON.stringify(previous.specialRequests)) {
    booking.specialRequests = updates.specialRequests;
    changedFields.push('specialRequests');
  }
  if (allowedSet.has('safetyAccessibility')
    && JSON.stringify(updates.safetyAccessibility) !== JSON.stringify(previous.safetyAccessibility)) {
    booking.safetyAccessibility = updates.safetyAccessibility;
    changedFields.push('safetyAccessibility');
  }

  if (!changedFields.length) {
    return res.status(200).json({
      message: 'No editable changes detected',
      changedFields,
      editPolicy: policy
    });
  }

  const now = new Date();
  const nextEditCount = getBookingEditCount(booking) + 1;
  booking.lastEditedAt = now;
  booking.editCount = nextEditCount;
  booking.editPolicyVersion = 'customer_dashboard_v3';

  booking.outboundDateTime = parseBookingRideStartDateTime({
    outboundDateTime: booking.outboundDateTime,
    rideDate: booking.rideDate,
    rideTime: booking.rideTime
  });

  const fareAffectingFields = new Set([
    'pickup',
    'dropoff',
    'rideTime',
    'returnDate',
    'returnTime',
    'tripPlan',
    'paymentMethod',
    'vehicleType',
    'passengers',
    'luggage',
    'stops',
    'specialRequests',
    'safetyAccessibility'
  ]);
  const shouldRefreshFare = changedFields.some((field) => fareAffectingFields.has(field));
  if (shouldRefreshFare) {
    const updatedFareEstimate = estimateTrustedBookingFare({
      pickup: booking.pickupLocation,
      drop: booking.dropLocation,
      rideDate: booking.rideDate,
      rideTime: booking.rideTime,
      returnDate: booking.returnDate,
      returnTime: booking.returnTime,
      tripPlan: booking.tripPlan,
      tripServiceType: booking.tripServiceType,
      vehicleType: booking.vehicleType,
      vehicleModel: booking.vehicleModel,
      paymentMethod: booking.paymentMethod,
      passengers: booking.passengers,
      luggage: booking.luggage,
      stops: booking.stops,
      specialRequests: booking.specialRequests,
      safetyAccessibility: booking.safetyAccessibility,
      budgetAmount: booking.budgetAmount,
      customerBidAmount: booking.customerBidAmount,
      promoCode: booking.referralCode
    });

    if (!updatedFareEstimate.distanceTrusted) {
      return res.status(422).json({
        message: 'Trusted route distance unavailable after booking edit',
        changedFields,
        editPolicy: policy
      });
    }

    const updatedFareHash = computeFareHash({
      distanceKm: updatedFareEstimate.distanceKm,
      amount: updatedFareEstimate.totalFare
    });
    booking.amount = updatedFareEstimate.totalFare;
    booking.distanceKm = updatedFareEstimate.distanceKm;
    booking.distanceSource = updatedFareEstimate.distanceSource || booking.distanceSource || '';
    booking.fareBreakdown = updatedFareEstimate;
    booking.fareHash = updatedFareHash;
    booking.fareQuote = {
      amount: updatedFareEstimate.totalFare,
      distanceKm: updatedFareEstimate.distanceKm,
      source: updatedFareEstimate.distanceSource,
      routeCategory: updatedFareEstimate.routeCategory
    };
  }

  booking.editHistory = Array.isArray(booking.editHistory) ? booking.editHistory : [];
  booking.editHistory.push({
    editedAt: now,
    by: 'customer',
    source: 'customer_dashboard',
    windowTier: policy.windowTier,
    hoursUntilRide: Number.isFinite(policy.hoursUntilRide) ? Number(policy.hoursUntilRide.toFixed(2)) : null,
    changedFields
  });

  booking.statusHistory = Array.isArray(booking.statusHistory) ? booking.statusHistory : [];
  booking.statusHistory.push({
    status: 'edited',
    at: now,
    source: 'customer_dashboard',
    note: `customer_edit_${policy.windowTier}`
  });

  await booking.save();

  return res.status(200).json({
    message: 'Booking updated successfully',
    booking: {
      bookingId: booking.bookingId,
      pickupLocation: booking.pickupLocation || '',
      dropLocation: booking.dropLocation || '',
      rideDate: booking.rideDate || '',
      rideTime: booking.rideTime || '',
      returnDate: booking.returnDate || '',
      returnTime: booking.returnTime || '',
      tripPlan: booking.tripPlan || '',
      paymentMethod: booking.paymentMethod || '',
      vehicleType: booking.vehicleType || '',
      passengers: Number(booking.passengers || 1),
      luggage: booking.luggage || '',
      notes: booking.notes || '',
      stops: Array.isArray(booking.stops) ? booking.stops : [],
      specialRequests: booking.specialRequests && typeof booking.specialRequests === 'object' ? booking.specialRequests : {},
      safetyAccessibility: booking.safetyAccessibility && typeof booking.safetyAccessibility === 'object' ? booking.safetyAccessibility : {},
      amount: Number(booking.amount || 0),
      distanceKm: Number(booking.distanceKm || 0),
      distanceSource: booking.distanceSource || '',
      fareBreakdown: booking.fareBreakdown && typeof booking.fareBreakdown === 'object' ? booking.fareBreakdown : {},
      fareQuote: booking.fareQuote && typeof booking.fareQuote === 'object' ? booking.fareQuote : {},
      fareHash: booking.fareHash || '',
      editCount: getBookingEditCount(booking),
      lastEditedAt: booking.lastEditedAt || null,
      outboundDateTime: booking.outboundDateTime || null
    },
    changedFields,
    editPolicy: {
      ...policy,
      usedEdits: getBookingEditCount(booking),
      remainingEdits: Math.max(0, CUSTOMER_BOOKING_EDIT_MAX_COUNT - getBookingEditCount(booking))
    }
  });
});

router.post('/:id/admin/edit', authenticate, continuousRiskGate, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const bookingId = sanitizeText(req.params.id, 120).toUpperCase();
  if (!bookingId) {
    return res.status(400).json({ message: 'booking id is required' });
  }

  const reason = sanitizeText(req.body.reason || req.body.adminEditReason || 'Updated by admin portal.', 180);
  const updates = {
    customerName: sanitizeText(req.body.customerName || req.body.customerSnapshot?.name, 140),
    customerEmail: normalizeEmail(req.body.customerEmail || req.body.customerSnapshot?.email || ''),
    customerPhone: formatCustomerPhoneForEmail(req.body.customerPhone || req.body.customerSnapshot?.phone || ''),
    pickupLocation: sanitizeText(req.body.pickup || req.body.pickupLocation || req.body.from, 180),
    dropLocation: sanitizeText(req.body.dropoff || req.body.drop || req.body.dropLocation || req.body.to, 180),
    rideDate: sanitizeText(req.body.rideDate, 40),
    rideTime: normalizeBookingTimeValue(req.body.rideTime),
    returnDate: sanitizeText(req.body.returnDate || req.body.returnTrip?.returnDate, 40),
    returnTime: normalizeBookingTimeValue(req.body.returnTime || req.body.returnTrip?.returnTime),
    tripPlan: sanitizeText(req.body.tripPlan, 80),
    paymentMethod: sanitizeText(req.body.paymentMethod || req.body.payment?.method, 80),
    vehicleType: sanitizeText(req.body.vehicleType || req.body.rideType, 80),
    vehicleModel: sanitizeText(req.body.vehicleModel, 80),
    passengers: normalizeInteger(req.body.passengers, 1, 1, 20),
    luggage: sanitizeText(req.body.luggage, 80),
    notes: sanitizeText(req.body.notes, 600),
    stops: sanitizeStringArray(req.body.stops, 8, 160),
    specialRequests: sanitizeBooleanMap(req.body.specialRequests || req.body.customerFeatures?.specialRequests, 60),
    safetyAccessibility: sanitizeBooleanMap(req.body.safetyAccessibility || req.body.customerFeatures?.safetyAccessibility, 60),
    amount: normalizePersistedAmount(req.body.amount || req.body.totalFare || req.body.fare || req.body.finalFare),
    distanceKm: normalizePersistedAmount(req.body.distanceKm || req.body.distance),
    driverId: sanitizeText(req.body.driverId, 120),
    driverName: sanitizeText(req.body.driverName, 140),
    adminReviewStatus: sanitizeText(req.body.adminReviewStatus, 40).toLowerCase()
  };

  const booking = await Booking.findOne({ bookingId });
  if (!booking) {
    const fallbackUpdates = {
      ...req.body,
      ...updates,
      customerSnapshot: {
        name: updates.customerName,
        email: updates.customerEmail,
        phone: updates.customerPhone
      },
      pickup: updates.pickupLocation,
      dropoff: updates.dropLocation,
      drop: updates.dropLocation,
      totalFare: updates.amount,
      fare: updates.amount,
      amount: updates.amount,
      status: sanitizeText(req.body.status || 'pending_admin_review', 40),
      adminReviewStatus: ['approved', 'rejected'].includes(updates.adminReviewStatus) ? updates.adminReviewStatus : 'pending',
      fareBreakdown: safeMixedObject(req.body.fareBreakdown),
      fareQuote: safeMixedObject(req.body.fareQuote),
      customerFeatures: {
        ...safeMixedObject(req.body.customerFeatures),
        specialRequests: updates.specialRequests,
        safetyAccessibility: updates.safetyAccessibility
      }
    };
    const fallbackBooking = updateFallbackBookingReviewEdit(bookingId, {
      updates: fallbackUpdates,
      changedFields: Array.isArray(req.body.changedFields) ? req.body.changedFields : [],
      reason,
      editedBy: String(req.user.id)
    });
    if (!fallbackBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    return res.status(200).json({
      message: 'Fallback booking updated by admin',
      booking: mapFallbackQueueRowForAdmin(fallbackBooking),
      changedFields: Array.isArray(req.body.changedFields) ? req.body.changedFields : [],
      sourceKey: fallbackBooking.sourceKey || 'fallback_admin_review_queue'
    });
  }

  const previous = {
    customerName: booking.customerSnapshot?.name || '',
    customerEmail: booking.customerSnapshot?.email || '',
    customerPhone: booking.customerSnapshot?.phone || '',
    pickupLocation: booking.pickupLocation || '',
    dropLocation: booking.dropLocation || '',
    rideDate: booking.rideDate || '',
    rideTime: booking.rideTime || '',
    returnDate: booking.returnDate || '',
    returnTime: booking.returnTime || '',
    tripPlan: booking.tripPlan || '',
    paymentMethod: booking.paymentMethod || '',
    vehicleType: booking.vehicleType || '',
    vehicleModel: booking.vehicleModel || '',
    passengers: Number(booking.passengers || 1),
    luggage: booking.luggage || '',
    notes: booking.notes || '',
    stops: Array.isArray(booking.stops) ? booking.stops : [],
    specialRequests: safeMixedObject(booking.specialRequests),
    safetyAccessibility: safeMixedObject(booking.safetyAccessibility),
    amount: Number(booking.amount || 0),
    distanceKm: Number(booking.distanceKm || 0),
    driverId: booking.driverId || '',
    adminReviewStatus: booking.adminReviewStatus || 'pending'
  };

  const changedFields = [];
  const setIfChanged = (field, nextValue, apply) => {
    if (nextValue === '' && !['returnDate', 'returnTime', 'driverId', 'driverName', 'notes', 'luggage', 'vehicleModel'].includes(field)) return;
    if (JSON.stringify(previous[field] ?? null) === JSON.stringify(nextValue ?? null)) return;
    apply();
    changedFields.push(field);
  };

  setIfChanged('customerName', updates.customerName, () => { booking.customerSnapshot.name = updates.customerName; });
  setIfChanged('customerEmail', updates.customerEmail, () => { booking.customerSnapshot.email = updates.customerEmail; });
  setIfChanged('customerPhone', updates.customerPhone, () => { booking.customerSnapshot.phone = updates.customerPhone; });
  setIfChanged('pickupLocation', updates.pickupLocation, () => { booking.pickupLocation = updates.pickupLocation; });
  setIfChanged('dropLocation', updates.dropLocation, () => { booking.dropLocation = updates.dropLocation; });
  setIfChanged('rideDate', updates.rideDate, () => { booking.rideDate = updates.rideDate; });
  setIfChanged('rideTime', updates.rideTime, () => { booking.rideTime = updates.rideTime; });
  setIfChanged('returnDate', updates.returnDate, () => { booking.returnDate = updates.returnDate; });
  setIfChanged('returnTime', updates.returnTime, () => { booking.returnTime = updates.returnTime; });
  setIfChanged('tripPlan', updates.tripPlan, () => { booking.tripPlan = updates.tripPlan; });
  setIfChanged('paymentMethod', updates.paymentMethod, () => { booking.paymentMethod = updates.paymentMethod; });
  setIfChanged('vehicleType', updates.vehicleType, () => { booking.vehicleType = updates.vehicleType; });
  setIfChanged('vehicleModel', updates.vehicleModel, () => { booking.vehicleModel = updates.vehicleModel; });
  setIfChanged('passengers', updates.passengers, () => { booking.passengers = updates.passengers; });
  setIfChanged('luggage', updates.luggage, () => { booking.luggage = updates.luggage; });
  setIfChanged('notes', updates.notes, () => { booking.notes = updates.notes; });
  setIfChanged('stops', updates.stops, () => { booking.stops = updates.stops; });
  setIfChanged('specialRequests', updates.specialRequests, () => { booking.specialRequests = updates.specialRequests; });
  setIfChanged('safetyAccessibility', updates.safetyAccessibility, () => { booking.safetyAccessibility = updates.safetyAccessibility; });
  setIfChanged('amount', updates.amount, () => { booking.amount = updates.amount; });
  setIfChanged('distanceKm', updates.distanceKm, () => { booking.distanceKm = updates.distanceKm; });
  setIfChanged('driverId', updates.driverId, () => { booking.driverId = updates.driverId || null; });

  if (['pending', 'approved', 'rejected'].includes(updates.adminReviewStatus)) {
    setIfChanged('adminReviewStatus', updates.adminReviewStatus, () => {
      booking.adminReviewStatus = updates.adminReviewStatus;
      booking.adminReviewedBy = String(req.user.id);
      booking.adminReviewedAt = new Date();
      booking.adminReviewNote = reason;
    });
  }

  const requestedStatus = sanitizeText(req.body.status, 40).toLowerCase();
  if (requestedStatus === 'completed') booking.status = 'completed';
  else if (requestedStatus === 'cancelled' || requestedStatus === 'rejected') booking.status = 'cancelled';
  else if (booking.status !== 'completed' && booking.status !== 'cancelled') booking.status = 'created';

  if (!changedFields.length) {
    return res.status(200).json({
      message: 'No admin edit changes detected',
      booking: mapStoredBookingRowForAdmin(booking.toObject()),
      changedFields
    });
  }

  const now = new Date();
  booking.lastEditedAt = now;
  booking.editCount = getBookingEditCount(booking) + 1;
  booking.editPolicyVersion = 'admin_portal_full_control_v1';
  booking.outboundDateTime = parseBookingRideStartDateTime({
    rideDate: booking.rideDate,
    rideTime: booking.rideTime
  });
  booking.fareBreakdown = {
    ...safeMixedObject(booking.fareBreakdown),
    ...safeMixedObject(req.body.fareBreakdown),
    totalFare: Number(booking.amount || 0),
    amount: Number(booking.amount || 0),
    distanceKm: Number(booking.distanceKm || 0),
    adminEditedAt: now.toISOString()
  };
  booking.fareQuote = {
    ...safeMixedObject(booking.fareQuote),
    ...safeMixedObject(req.body.fareQuote),
    amount: Number(booking.amount || 0),
    distanceKm: Number(booking.distanceKm || 0),
    source: req.body.fareQuote?.source || booking.fareQuote?.source || 'admin_edit'
  };
  booking.customerFeatures = {
    ...safeMixedObject(booking.customerFeatures),
    specialRequests: booking.specialRequests,
    safetyAccessibility: booking.safetyAccessibility
  };

  booking.editHistory = Array.isArray(booking.editHistory) ? booking.editHistory : [];
  booking.editHistory.push({
    editedAt: now,
    by: 'admin',
    source: 'admin_portal',
    windowTier: 'admin_full_control',
    hoursUntilRide: null,
    changedFields
  });
  booking.statusHistory = Array.isArray(booking.statusHistory) ? booking.statusHistory : [];
  booking.statusHistory.push({
    status: 'admin_edited',
    at: now,
    source: 'admin_portal',
    note: reason
  });

  await booking.save();

  return res.status(200).json({
    message: 'Booking updated by admin',
    booking: mapStoredBookingRowForAdmin(booking.toObject()),
    changedFields,
    sourceKey: 'backend_booking_collection'
  });
});

router.post('/:id/complete', authenticate, continuousRiskGate, async (req, res) => {
  const actorType = resolveCompletionActor(req);
  const booking = await Booking.findOne({ bookingId: req.params.id });

  if (!booking) return res.status(404).json({ message: 'Booking not found' });

  if (actorType === 'customer' && String(booking.userId) !== String(req.user.id)) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  const adminReviewStatus = String(booking.adminReviewStatus || 'pending').toLowerCase();
  if (actorType !== 'admin' && adminReviewStatus !== 'approved') {
    return res.status(403).json({
      message: 'Booking pending admin approval',
      adminReviewStatus
    });
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

router.get('/admin/pending', authenticate, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const status = sanitizeText(req.query.status, 20).toLowerCase();
  const query = {
    adminReviewStatus: status === 'approved' || status === 'rejected' ? status : 'pending'
  };

  if (query.adminReviewStatus === 'pending') {
    query.status = 'created';
  }

  const rows = await Booking.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'name email phone accountType')
    .lean();

  const pendingCount = await Booking.countDocuments({ adminReviewStatus: 'pending', status: 'created' });
  const fallbackQueue = readFallbackBookingReviewQueue();
  const fallbackRows = fallbackQueue
    .filter((row) => {
      const reviewStatus = sanitizeText(row.adminReviewStatus, 40).toLowerCase() || 'pending';
      if (query.adminReviewStatus !== reviewStatus) return false;
      if (query.adminReviewStatus === 'pending') {
        const rowStatus = sanitizeText(row.status, 40).toLowerCase() || 'created';
        return rowStatus === 'created' || rowStatus === 'pending' || rowStatus === 'pending_admin_review';
      }
      return true;
    })
    .slice(0, Math.max(limit - rows.length, 0));
  const pendingFallbackCount = fallbackQueue.filter((row) => {
    const reviewStatus = sanitizeText(row.adminReviewStatus, 40).toLowerCase() || 'pending';
    const rowStatus = sanitizeText(row.status, 40).toLowerCase() || 'created';
    return reviewStatus === 'pending' && (rowStatus === 'created' || rowStatus === 'pending' || rowStatus === 'pending_admin_review');
  }).length;

  const items = rows.map((row) => ({
    bookingId: row.bookingId,
    status: row.status,
    adminReviewStatus: row.adminReviewStatus || 'pending',
    distanceKm: Number(row.distanceKm || 0),
    amount: Number(row.amount || 0),
    referralCode: row.referralCode || '',
    pickupLocation: row.pickupLocation || '',
    dropLocation: row.dropLocation || '',
    rideDate: row.rideDate || '',
    rideTime: row.rideTime || '',
    outboundDateTime: row.outboundDateTime || null,
    returnDate: row.returnDate || '',
    returnTime: row.returnTime || '',
    tripPlan: row.tripPlan || '',
    paymentMethod: row.paymentMethod || '',
    vehicleType: row.vehicleType || '',
    passengers: Number(row.passengers || 1),
    luggage: row.luggage || '',
    notes: row.notes || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    editCount: getBookingEditCount(row),
    lastEditedAt: row.lastEditedAt || null,
    editPolicyVersion: row.editPolicyVersion || '',
    editHistory: Array.isArray(row.editHistory) ? row.editHistory : [],
    specialRequests: row.specialRequests && typeof row.specialRequests === 'object' ? row.specialRequests : {},
    safetyAccessibility: row.safetyAccessibility && typeof row.safetyAccessibility === 'object' ? row.safetyAccessibility : {},
    customerSnapshot: row.customerSnapshot && typeof row.customerSnapshot === 'object'
      ? {
          name: row.customerSnapshot.name || '',
          email: row.customerSnapshot.email || '',
          phone: row.customerSnapshot.phone || ''
        }
      : null,
    driverId: row.driverId || null,
    adminReviewedBy: row.adminReviewedBy || null,
    adminReviewedAt: row.adminReviewedAt || null,
    adminReviewNote: row.adminReviewNote || null,
    sourceKey: 'backend_booking_collection',
    customer: row.userId && typeof row.userId === 'object'
      ? {
          id: String(row.userId._id || ''),
          name: row.userId.name || '',
          email: row.userId.email || '',
          phone: row.userId.phone || '',
          accountType: row.userId.accountType || ''
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  })).concat(fallbackRows.map((row) => ({
    bookingId: row.bookingId,
    status: row.status || 'created',
    adminReviewStatus: row.adminReviewStatus || 'pending',
    distanceKm: Number(row.distanceKm || 0),
    amount: Number(row.amount || row.totalFare || row.fare || 0),
    referralCode: row.referralCode || row.promo?.code || '',
    pickupLocation: row.pickupLocation || row.pickup || '',
    dropLocation: row.dropLocation || row.dropoff || row.drop || '',
    rideDate: row.rideDate || '',
    rideTime: row.rideTime || '',
    outboundDateTime: row.outboundDateTime || null,
    returnDate: row.returnDate || row.returnTrip?.returnDate || '',
    returnTime: row.returnTime || row.returnTrip?.returnTime || '',
    tripPlan: row.tripPlan || '',
    paymentMethod: row.paymentMethod || row.payment?.method || '',
    vehicleType: row.vehicleType || row.rideType || '',
    vehicleModel: row.vehicleModel || '',
    tripServiceType: row.tripServiceType || '',
    passengers: Number(row.passengers || 1),
    luggage: row.luggage || '',
    notes: row.notes || '',
    stops: Array.isArray(row.stops) ? row.stops : [],
    editCount: getBookingEditCount(row),
    lastEditedAt: row.lastEditedAt || null,
    editPolicyVersion: row.editPolicyVersion || '',
    editHistory: Array.isArray(row.editHistory) ? row.editHistory : [],
    specialRequests: row.specialRequests && typeof row.specialRequests === 'object' ? row.specialRequests : {},
    safetyAccessibility: row.safetyAccessibility && typeof row.safetyAccessibility === 'object' ? row.safetyAccessibility : {},
    customerSnapshot: row.customerSnapshot && typeof row.customerSnapshot === 'object'
      ? {
          name: row.customerSnapshot.name || row.customerName || '',
          email: row.customerSnapshot.email || row.customerEmail || '',
          phone: row.customerSnapshot.phone || row.customerPhone || ''
        }
      : {
          name: row.customerName || '',
          email: row.customerEmail || '',
          phone: row.customerPhone || ''
        },
    customerName: row.customerName || row.customerSnapshot?.name || '',
    customerEmail: row.customerEmail || row.customerSnapshot?.email || '',
    customerPhone: row.customerPhone || row.customerSnapshot?.phone || '',
    fareBreakdown: row.fareBreakdown && typeof row.fareBreakdown === 'object' ? row.fareBreakdown : {},
    fareQuote: row.fareQuote && typeof row.fareQuote === 'object' ? row.fareQuote : {},
    payment: row.payment && typeof row.payment === 'object' ? row.payment : {},
    promo: row.promo && typeof row.promo === 'object' ? row.promo : {},
    customerFeatures: row.customerFeatures && typeof row.customerFeatures === 'object' ? row.customerFeatures : {},
    adminEmailDispatch: row.adminEmailDispatch && typeof row.adminEmailDispatch === 'object' ? row.adminEmailDispatch : {},
    customerEmailDispatch: row.customerEmailDispatch && typeof row.customerEmailDispatch === 'object' ? row.customerEmailDispatch : {},
    adminWhatsAppDispatch: row.adminWhatsAppDispatch && typeof row.adminWhatsAppDispatch === 'object' ? row.adminWhatsAppDispatch : {},
    customerSmsDispatch: row.customerSmsDispatch && typeof row.customerSmsDispatch === 'object' ? row.customerSmsDispatch : {},
    driverId: row.driverId || null,
    adminReviewedBy: row.adminReviewedBy || null,
    adminReviewedAt: row.adminReviewedAt || null,
    adminReviewNote: row.adminReviewNote || null,
    sourceKey: row.sourceKey || 'fallback_admin_review_queue',
    fallbackQueuedAt: row.fallbackQueuedAt || null,
    customer: null,
    createdAt: row.createdAt || row.fallbackQueuedAt || null,
    updatedAt: row.updatedAt || null
  }))).sort((left, right) => {
    return (Date.parse(right.updatedAt || right.createdAt || '') || 0)
      - (Date.parse(left.updatedAt || left.createdAt || '') || 0);
  });

  return res.status(200).json({
    count: items.length,
    pendingCount: pendingCount + pendingFallbackCount,
    fallbackCount: fallbackRows.length,
    items
  });
});

router.post('/:id/admin/review', authenticate, continuousRiskGate, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const decision = sanitizeText(req.body.decision || req.body.action, 20).toLowerCase();
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ message: 'decision must be approved or rejected' });
  }

  const note = sanitizeText(req.body.note || req.body.reason, 260);
  const requestedDriverId = sanitizeText(req.body.driverId, 120);

  const booking = await Booking.findOne({ bookingId: req.params.id });
  if (!booking) {
    const fallbackBooking = updateFallbackBookingReviewDecision(req.params.id, {
      decision,
      note,
      reviewedBy: String(req.user.id)
    });
    if (!fallbackBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    return res.status(200).json({
      bookingId: fallbackBooking.bookingId,
      status: fallbackBooking.status,
      adminReviewStatus: fallbackBooking.adminReviewStatus,
      adminReviewedBy: fallbackBooking.adminReviewedBy,
      adminReviewedAt: fallbackBooking.adminReviewedAt,
      adminReviewNote: fallbackBooking.adminReviewNote,
      driverId: fallbackBooking.driverId || null,
      sourceKey: fallbackBooking.sourceKey || 'fallback_admin_review_queue'
    });
  }

  if (booking.status === 'completed') {
    return res.status(400).json({ message: 'Completed bookings cannot be reviewed' });
  }

  booking.adminReviewStatus = decision;
  booking.adminReviewedBy = String(req.user.id);
  booking.adminReviewedAt = new Date();
  booking.adminReviewNote = note || null;

  if (decision === 'approved' && requestedDriverId) {
    booking.driverId = requestedDriverId;
  }

  if (decision === 'rejected' && booking.status === 'created') {
    booking.status = 'cancelled';
  }

  await booking.save();

  try {
    await createBookingCustomerReviewNotification({
      bookingId: booking.bookingId,
      customerId: booking.userId,
      decision,
      note
    });
  } catch (error) {
    await logSecurityEvent({
      userId: String(req.user.id),
      action: 'booking_admin_review_customer_notification_failed',
      ip: getClientIp(req),
      riskScore: 10,
      result: 'warning',
      metadata: { bookingId: booking.bookingId, message: error.message }
    });
  }

  return res.status(200).json({
    bookingId: booking.bookingId,
    status: booking.status,
    adminReviewStatus: booking.adminReviewStatus,
    adminReviewedBy: booking.adminReviewedBy,
    adminReviewedAt: booking.adminReviewedAt,
    adminReviewNote: booking.adminReviewNote,
    driverId: booking.driverId || null
  });
});

// === FUTURE_ROUTES_BUSINESS_BOOKINGROUTES_START ===
{
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
    return estimateBookingFare(payload);
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
    const estimate = estimateTrustedBookingFare(req.body || {});
    if (!estimate.distanceTrusted) {
      return res.status(422).json({
        ok: false,
        message: 'Trusted route distance unavailable for fare estimate'
      });
    }
    const fareHash = computeFareHash({ distanceKm: estimate.distanceKm, amount: estimate.totalFare });
    return res.status(200).json({
      ok: true,
      estimate: {
        ...estimate,
        fareHash,
        currency: 'INR'
      },
      fareHash
    });
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
}
// === FUTURE_ROUTES_BUSINESS_BOOKINGROUTES_END ===

module.exports = router;

