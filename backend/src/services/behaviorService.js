const BehaviorEvent = require('../models/BehaviorEvent');
const Booking = require('../models/Booking');

async function trackBehaviorEvent(payload) {
  await BehaviorEvent.create(payload);
}

async function evaluateBehaviorRisk(userId) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await BehaviorEvent.find({ userId, createdAt: { $gte: oneDayAgo } }).lean();

  const bookingsToday = events.filter((item) => item.eventType === 'booking_create').length;
  const midnightActivity = events.filter((item) => {
    const hour = new Date(item.createdAt).getHours();
    return hour >= 0 && hour <= 4;
  }).length;

  const suddenHighValueRides = await Booking.countDocuments({
    userId,
    amount: { $gte: 2000 },
    createdAt: { $gte: oneDayAgo }
  });

  const cancellations = events.filter((item) => item.eventType === 'booking_cancel').length;
  const cancelRatio = bookingsToday > 0 ? cancellations / bookingsToday : 0;

  let score = 0;
  if (bookingsToday >= 20) score += 30;
  if (midnightActivity >= 5) score += 20;
  if (suddenHighValueRides >= 3) score += 25;
  if (cancelRatio >= 0.5) score += 25;

  return {
    score,
    flags: {
      bookingsToday,
      midnightActivity,
      suddenHighValueRides,
      cancelRatio
    }
  };
}

module.exports = {
  trackBehaviorEvent,
  evaluateBehaviorRisk
};
