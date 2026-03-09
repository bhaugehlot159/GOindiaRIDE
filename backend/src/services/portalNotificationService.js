const Notification = require('../models/Notification');
const User = require('../models/User');

function buildMessage(action, bookingId, amount, distanceKm) {
  if (action === 'cancelled') {
    return `Booking ${bookingId} was cancelled by customer.`;
  }

  return `Booking ${bookingId} created. Fare INR ${amount}, distance ${distanceKm} km.`;
}

function buildTitle(audience, action) {
  if (action === 'cancelled') {
    return audience === 'driver' ? 'Trip cancelled' : 'Booking cancelled';
  }

  return audience === 'driver' ? 'New trip request' : 'New customer booking';
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
  const message = buildMessage(action, bookingId, amount, distanceKm);

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
  customerId
}) {
  const commonPayload = {
    bookingId,
    amount,
    distanceKm,
    action,
    metadata: {
      customerId,
      source: 'booking_routes'
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
