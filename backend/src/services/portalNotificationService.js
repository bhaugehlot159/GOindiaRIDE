const Notification = require('../models/Notification');
const User = require('../models/User');

function sanitizeText(value, maxLen = 140) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function routeLabelFromMetadata(metadata = {}) {
  const pickup = sanitizeText(metadata.pickup || metadata.pickupLocation, 90);
  const drop = sanitizeText(metadata.drop || metadata.dropLocation, 90);

  if (!pickup || !drop) return '';
  return `${pickup} -> ${drop}`;
}

function buildMessage(action, bookingId, amount, distanceKm, metadata = {}) {
  const routeLabel = routeLabelFromMetadata(metadata);
  const distance = Number(distanceKm || 0);
  const fare = Number(amount || 0);
  const safeDistance = Number.isFinite(distance) ? distance.toFixed(1) : '0.0';
  const safeFare = Number.isFinite(fare) ? fare.toFixed(2) : '0.00';
  const bookingSuffix = routeLabel ? ` (${routeLabel})` : '';

  if (action === 'cancelled') {
    return `Booking ${bookingId}${bookingSuffix} was cancelled by customer.`;
  }

  if (action === 'completed') {
    return `Booking ${bookingId}${bookingSuffix} completed. Fare INR ${safeFare}, distance ${safeDistance} km.`;
  }

  return `Booking ${bookingId}${bookingSuffix} created. Fare INR ${safeFare}, distance ${safeDistance} km.`;
}

function buildTitle(audience, action) {
  if (action === 'created') {
    return audience === 'driver' ? 'New trip request' : 'New customer booking';
  }

  if (action === 'completed') {
    return audience === 'driver' ? 'Ride completed' : 'Booking completed';
  }

  if (action === 'cancelled') {
    return audience === 'driver' ? 'Trip cancelled' : 'Booking cancelled';
  }

  return audience === 'driver' ? 'Booking update' : 'Booking update';
}

function uniqueIds(users) {
  return [...new Set(users.map((item) => item._id.toString()))];
}

async function pushAudienceNotifications({
  audience,
  bookingId,
  amount,
  distanceKm,
  action,
  metadata = {}
}) {
  const title = buildTitle(audience, action);
  const message = buildMessage(action, bookingId, amount, distanceKm, metadata);

  const userQuery =
    audience === 'admin'
      ? { $or: [{ role: 'admin' }, { accountType: 'admin' }] }
      : { accountType: 'driver' };

  const users = await User.find(userQuery).select('_id').lean();
  const ids = uniqueIds(users);

  if (!ids.length) {
    await Notification.create({
      userId: null,
      audience,
      bookingId,
      type: `booking_${action}`,
      title,
      message,
      metadata
    });

    return { audience, count: 1, fallback: true };
  }

  const docs = ids.map((id) => ({
    userId: id,
    audience,
    bookingId,
    type: `booking_${action}`,
    title,
    message,
    metadata
  }));

  await Notification.insertMany(docs, { ordered: false });

  return { audience, count: docs.length, fallback: false };
}

async function createBookingPortalNotifications({
  bookingId,
  amount,
  distanceKm,
  action,
  customerId,
  pickup = '',
  drop = '',
  vehicleType = '',
  currency = 'INR'
}) {
  const commonPayload = {
    bookingId,
    amount,
    distanceKm,
    action,
    metadata: {
      customerId,
      source: 'booking_routes',
      pickup: sanitizeText(pickup, 120),
      drop: sanitizeText(drop, 120),
      vehicleType: sanitizeText(vehicleType, 40),
      currency: sanitizeText(currency || 'INR', 8).toUpperCase() || 'INR'
    }
  };

  const [adminResult, driverResult] = await Promise.all([
    pushAudienceNotifications({ ...commonPayload, audience: 'admin' }),
    pushAudienceNotifications({ ...commonPayload, audience: 'driver' })
  ]);

  return {
    admin: adminResult,
    driver: driverResult
  };
}

module.exports = {
  createBookingPortalNotifications
};

async function createBookingAdminReviewAlert({
  bookingId,
  amount,
  distanceKm,
  customerId,
  pickup = '',
  drop = '',
  vehicleType = '',
  currency = 'INR'
}) {
  const payload = {
    bookingId,
    amount,
    distanceKm,
    action: 'admin_pending_review',
    metadata: {
      customerId,
      source: 'booking_routes',
      requiresAdminReview: true,
      pickup: sanitizeText(pickup, 120),
      drop: sanitizeText(drop, 120),
      vehicleType: sanitizeText(vehicleType, 40),
      currency: sanitizeText(currency || 'INR', 8).toUpperCase() || 'INR'
    }
  };

  return pushAudienceNotifications({
    ...payload,
    audience: 'admin'
  });
}

async function createBookingCustomerReviewNotification({
  bookingId,
  customerId,
  decision,
  note = ''
}) {
  const normalizedDecision = String(decision || '').trim().toLowerCase();
  const safeDecision = normalizedDecision === 'approved' ? 'approved' : 'rejected';
  const title = safeDecision === 'approved' ? 'Booking approved' : 'Booking rejected';
  const message = safeDecision === 'approved'
    ? `Booking ${bookingId} approved by admin.`
    : `Booking ${bookingId} rejected by admin.`;

  await Notification.create({
    userId: customerId || null,
    audience: 'customer',
    bookingId,
    type: safeDecision === 'approved' ? 'booking_admin_approved' : 'booking_admin_rejected',
    title,
    message,
    metadata: {
      source: 'booking_admin_review',
      adminReviewStatus: safeDecision,
      adminReviewNote: sanitizeText(note, 260)
    }
  });
}

module.exports.createBookingAdminReviewAlert = createBookingAdminReviewAlert;
module.exports.createBookingCustomerReviewNotification = createBookingCustomerReviewNotification;
