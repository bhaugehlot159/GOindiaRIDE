const mongoose = require('mongoose');

const Booking = require('../models/Booking');
const LiveLocation = require('../models/LiveLocation');
const Notification = require('../models/Notification');
const { mirrorBookingRealtimeUpdate } = require('./firebaseRealtimeDatabaseService');

const PHASE6_REALTIME_MATCHING_VERSION = 'goindiaride_realtime_matching_phase6_v1';
const MATCHING_POLICY_VERSION = '2026-06-13-realtime-matching-phase6';
const ACTIVE_DRIVER_WINDOW_MS = 8 * 60 * 1000;
const STALE_DRIVER_WINDOW_MS = 15 * 60 * 1000;
const MAX_PICKUP_RADIUS_KM = 70;
const MAX_BATCH_BOOKINGS = 24;
const MAX_DRIVER_LOCATIONS = 180;
const DP_OPTIMAL_LIMIT = 12;
const DEFAULT_CITY_SPEED_KMH = 24;

function isMongoReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function safeText(value, maxLength = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function minutesSince(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return null;
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}

function normalizeCoordinate(value) {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    return normalizeLatLng(value[0], value[1]);
  }

  if (typeof value === 'string') {
    const match = value.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
    return match ? normalizeLatLng(match[1], match[2]) : null;
  }

  if (typeof value === 'object') {
    return normalizeLatLng(
      value.lat ?? value.latitude ?? value.pickupLat ?? value.y,
      value.lng ?? value.lon ?? value.longitude ?? value.pickupLng ?? value.x
    );
  }

  return null;
}

function normalizeLatLng(latValue, lngValue) {
  const lat = toFiniteNumber(latValue);
  const lng = toFiniteNumber(lngValue);
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7))
  };
}

function getBookingPickupPoint(booking = {}) {
  return normalizeCoordinate(booking.pickupCoordinates)
    || normalizeCoordinate(booking.locationPins && booking.locationPins.pickup)
    || normalizeCoordinate(booking.locationPins && booking.locationPins.from)
    || normalizeCoordinate(booking.fareQuote && booking.fareQuote.pickupCoordinates)
    || normalizeCoordinate(booking.fareBreakdown && booking.fareBreakdown.pickupCoordinates)
    || normalizeCoordinate(booking.pickupGoogleMapsUrl)
    || normalizeCoordinate(booking.pickupLocation);
}

function getDriverPoint(driver = {}) {
  return normalizeCoordinate(driver)
    || normalizeCoordinate(driver.location)
    || normalizeCoordinate(driver.currentLocation)
    || normalizeCoordinate(driver.metadata && driver.metadata.location);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(from, to) {
  if (!from || !to) return null;
  const radiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((radiusKm * c).toFixed(3));
}

function estimateEtaMinutes(distanceKm, speedKmh = DEFAULT_CITY_SPEED_KMH) {
  const distance = Math.max(0, Number(distanceKm || 0));
  const speed = Math.max(8, Number(speedKmh || DEFAULT_CITY_SPEED_KMH));
  return Math.max(1, Math.ceil((distance / speed) * 60 + 2));
}

function cleanVehicleType(value) {
  return safeText(value, 40).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function getDriverVehicleType(driver = {}) {
  return cleanVehicleType(
    driver.vehicleType
      || driver.metadata?.vehicleType
      || driver.metadata?.vehicleCategory
      || driver.metadata?.carType
  );
}

function getBookingVehicleType(booking = {}) {
  return cleanVehicleType(booking.vehicleType || booking.tripServiceType || booking.vehicleModel);
}

function vehicleCompatibilityPenalty(booking = {}, driver = {}) {
  const requested = getBookingVehicleType(booking);
  const offered = getDriverVehicleType(driver);
  if (!requested || !offered) return 0;
  if (requested === offered) return 0;
  if (requested.includes('suv') && offered.includes('suv')) return 0;
  if (requested.includes('sedan') && (offered.includes('sedan') || offered.includes('suv'))) return 4;
  if (requested.includes('economy') && offered) return 2;
  return 18;
}

function normalizeBooking(row = {}) {
  const pickup = getBookingPickupPoint(row);
  return {
    mongoId: row._id ? String(row._id) : '',
    bookingId: safeText(row.bookingId || row.id || row._id, 100),
    customerUserId: row.userId || null,
    pickup,
    pickupLabel: safeText(row.pickupLocation || row.pickup || row.from, 180),
    dropLabel: safeText(row.dropLocation || row.dropoff || row.drop || row.to, 180),
    amount: Number(row.amount || row.totalFare || row.fare || 0),
    vehicleType: getBookingVehicleType(row),
    createdAt: row.createdAt || null,
    adminReviewStatus: safeText(row.adminReviewStatus || 'pending', 40).toLowerCase(),
    status: safeText(row.status || 'created', 40).toLowerCase(),
    driverId: safeText(row.driverId, 120),
    raw: row
  };
}

function normalizeDriver(row = {}, now = new Date()) {
  const point = getDriverPoint(row);
  const updatedAt = row.updatedAt || row.lastReportedAt || row.capturedAt || null;
  const freshnessMinutes = minutesSince(updatedAt, now);
  return {
    locationId: row._id ? String(row._id) : '',
    driverId: safeText(row.userId || row.driverId || row.id || row._id, 120),
    sessionId: safeText(row.sessionId, 160),
    point,
    status: safeText(row.status || 'tracking', 40).toLowerCase(),
    vehicleType: getDriverVehicleType(row),
    accuracy: Number(row.accuracy || 0),
    speed: Number(row.speed || 0),
    updatedAt,
    freshnessMinutes,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    raw: row
  };
}

function dedupeLatestDrivers(driverLocations = [], now = new Date()) {
  const sorted = driverLocations
    .map((row) => normalizeDriver(row, now))
    .filter((row) => row.driverId && row.point)
    .sort((a, b) => {
      const at = toDate(a.updatedAt)?.getTime() || 0;
      const bt = toDate(b.updatedAt)?.getTime() || 0;
      return bt - at;
    });
  const seen = new Set();
  const deduped = [];
  for (const row of sorted) {
    if (seen.has(row.driverId)) continue;
    seen.add(row.driverId);
    deduped.push(row);
  }
  return deduped;
}

function scoreCandidate(booking, driver, options = {}) {
  const now = options.now || new Date();
  const maxRadiusKm = Number(options.maxPickupRadiusKm || MAX_PICKUP_RADIUS_KM);
  const maxFreshnessMinutes = Number(options.maxDriverFreshnessMinutes || ACTIVE_DRIVER_WINDOW_MS / 60000);
  const pickup = booking.pickup;
  const driverPoint = driver.point;

  if (!pickup) return { eligible: false, reason: 'missing_pickup_coordinates' };
  if (!driverPoint) return { eligible: false, reason: 'missing_driver_coordinates' };
  if (driver.status && driver.status !== 'tracking') return { eligible: false, reason: 'driver_not_tracking' };

  const freshnessMinutes = driver.freshnessMinutes ?? minutesSince(driver.updatedAt, now);
  if (freshnessMinutes === null) return { eligible: false, reason: 'driver_location_time_missing' };
  if (freshnessMinutes > maxFreshnessMinutes) return { eligible: false, reason: 'driver_location_stale' };

  const distanceKm = haversineDistanceKm(driverPoint, pickup);
  if (distanceKm === null) return { eligible: false, reason: 'distance_unavailable' };
  if (distanceKm > maxRadiusKm) return { eligible: false, reason: 'outside_pickup_radius', distanceKm };

  const etaMinutes = estimateEtaMinutes(distanceKm, options.citySpeedKmh || DEFAULT_CITY_SPEED_KMH);
  const freshnessPenalty = Math.max(0, freshnessMinutes) * 11;
  const accuracyPenalty = Math.max(0, Number(driver.accuracy || 0) - 60) / 8;
  const vehiclePenalty = vehicleCompatibilityPenalty(booking.raw || booking, driver.raw || driver) * 100;
  const ageMinutes = minutesSince(booking.createdAt, now) || 0;
  const queueAgeCredit = Math.min(500, ageMinutes * 8);
  const cost = Math.max(1, Math.round(
    etaMinutes * 100
      + distanceKm * 18
      + freshnessPenalty
      + accuracyPenalty
      + vehiclePenalty
      - queueAgeCredit
  ));
  const confidence = Math.max(35, Math.min(99, Math.round(
    100
      - Math.min(35, etaMinutes * 1.4)
      - Math.min(20, freshnessMinutes * 2)
      - Math.min(15, Number(driver.accuracy || 0) / 80)
      - Math.min(18, vehiclePenalty / 100)
  )));

  return {
    eligible: true,
    bookingId: booking.bookingId,
    bookingMongoId: booking.mongoId,
    customerUserId: booking.customerUserId,
    driverId: driver.driverId,
    driverLocationId: driver.locationId,
    distanceKm,
    etaMinutes,
    freshnessMinutes,
    confidence,
    cost,
    pickup: booking.pickupLabel,
    drop: booking.dropLabel,
    vehicleType: booking.vehicleType,
    driverVehicleType: driver.vehicleType,
    reason: 'eligible'
  };
}

function comparePlanResult(a, b) {
  if (a.matchCount !== b.matchCount) return a.matchCount > b.matchCount ? a : b;
  if (a.totalCost !== b.totalCost) return a.totalCost < b.totalCost ? a : b;
  return a;
}

function solveSmallOptimal(assignableBookings, drivers, candidateByKey) {
  const memo = new Map();

  function visit(index, usedMask) {
    const key = `${index}:${usedMask}`;
    if (memo.has(key)) return memo.get(key);
    if (index >= assignableBookings.length) {
      return { matchCount: 0, totalCost: 0, picks: [] };
    }

    let best = visit(index + 1, usedMask);
    const booking = assignableBookings[index];
    for (let driverIndex = 0; driverIndex < drivers.length; driverIndex += 1) {
      if (usedMask & (1 << driverIndex)) continue;
      const candidate = candidateByKey.get(`${booking.bookingId}:${drivers[driverIndex].driverId}`);
      if (!candidate) continue;
      const next = visit(index + 1, usedMask | (1 << driverIndex));
      const withCandidate = {
        matchCount: next.matchCount + 1,
        totalCost: next.totalCost + candidate.cost,
        picks: [candidate, ...next.picks]
      };
      best = comparePlanResult(withCandidate, best);
    }

    memo.set(key, best);
    return best;
  }

  return visit(0, 0).picks;
}

function solveGreedy(candidates = []) {
  const usedBookings = new Set();
  const usedDrivers = new Set();
  const assignments = [];
  const sorted = candidates.slice().sort((a, b) => a.cost - b.cost || a.etaMinutes - b.etaMinutes);

  for (const candidate of sorted) {
    if (usedBookings.has(candidate.bookingId) || usedDrivers.has(candidate.driverId)) continue;
    usedBookings.add(candidate.bookingId);
    usedDrivers.add(candidate.driverId);
    assignments.push(candidate);
  }

  return assignments;
}

function buildRealtimeMatchingPlan({ bookings = [], driverLocations = [], now = new Date(), options = {} } = {}) {
  const normalizedBookings = bookings
    .map(normalizeBooking)
    .filter((booking) => booking.bookingId)
    .filter((booking) => booking.adminReviewStatus === 'approved')
    .filter((booking) => booking.status === 'created')
    .filter((booking) => !booking.driverId);
  const drivers = dedupeLatestDrivers(driverLocations, now)
    .filter((driver) => driver.status === 'tracking')
    .filter((driver) => driver.freshnessMinutes !== null && driver.freshnessMinutes <= (options.maxDriverFreshnessMinutes || ACTIVE_DRIVER_WINDOW_MS / 60000));

  const candidates = [];
  const rejected = [];
  const candidateByKey = new Map();

  for (const booking of normalizedBookings) {
    for (const driver of drivers) {
      const candidate = scoreCandidate(booking, driver, { ...options, now });
      if (candidate.eligible) {
        candidates.push(candidate);
        candidateByKey.set(`${booking.bookingId}:${driver.driverId}`, candidate);
      } else {
        rejected.push({
          bookingId: booking.bookingId,
          driverId: driver.driverId,
          reason: candidate.reason,
          distanceKm: candidate.distanceKm
        });
      }
    }
  }

  const assignments = normalizedBookings.length <= DP_OPTIMAL_LIMIT && drivers.length <= DP_OPTIMAL_LIMIT
    ? solveSmallOptimal(normalizedBookings, drivers, candidateByKey)
    : solveGreedy(candidates);
  const assignedBookingIds = new Set(assignments.map((row) => row.bookingId));
  const assignedDriverIds = new Set(assignments.map((row) => row.driverId));
  const rankedCandidates = candidates
    .slice()
    .sort((a, b) => a.cost - b.cost || a.etaMinutes - b.etaMinutes)
    .slice(0, 50);

  return {
    ok: true,
    active: true,
    version: PHASE6_REALTIME_MATCHING_VERSION,
    generatedAt: now.toISOString(),
    policy: {
      version: MATCHING_POLICY_VERSION,
      maxPickupRadiusKm: MAX_PICKUP_RADIUS_KM,
      activeDriverWindowMinutes: ACTIVE_DRIVER_WINDOW_MS / 60000,
      staleDriverWindowMinutes: STALE_DRIVER_WINDOW_MS / 60000,
      solver: normalizedBookings.length <= DP_OPTIMAL_LIMIT && drivers.length <= DP_OPTIMAL_LIMIT
        ? 'bounded_optimal_assignment'
        : 'ranked_greedy_assignment'
    },
    counts: {
      eligibleBookings: normalizedBookings.length,
      liveDrivers: drivers.length,
      candidateEdges: candidates.length,
      matchedBookings: assignments.length,
      unmatchedBookings: Math.max(0, normalizedBookings.length - assignments.length),
      unusedDrivers: Math.max(0, drivers.length - assignedDriverIds.size)
    },
    assignments,
    rankedCandidates,
    unmatchedBookings: normalizedBookings
      .filter((booking) => !assignedBookingIds.has(booking.bookingId))
      .map((booking) => ({
        bookingId: booking.bookingId,
        pickup: booking.pickupLabel,
        reason: booking.pickup ? 'no_driver_within_sla' : 'missing_pickup_coordinates'
      })),
    rejected,
    goldenSignals: {
      matchRate: {
        label: 'Match rate',
        value: normalizedBookings.length ? Math.round((assignments.length / normalizedBookings.length) * 100) : 100,
        unit: 'percent'
      },
      medianEta: {
        label: 'Median ETA',
        value: median(assignments.map((row) => row.etaMinutes)),
        unit: 'minutes'
      },
      supplyDemandRatio: {
        label: 'Supply demand',
        value: normalizedBookings.length ? Number((drivers.length / normalizedBookings.length).toFixed(2)) : drivers.length,
        unit: 'drivers_per_booking'
      },
      staleDriverShare: {
        label: 'Stale driver share',
        value: 0,
        unit: 'percent'
      }
    }
  };
}

function median(values = []) {
  const sorted = values.filter((value) => Number.isFinite(Number(value))).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function getRealtimeMatchingEngineStatus() {
  return {
    ok: true,
    active: true,
    productionReady: true,
    version: PHASE6_REALTIME_MATCHING_VERSION,
    policyVersion: MATCHING_POLICY_VERSION,
    mode: 'phase6-production-realtime-matching-engine',
    standards: [
      'Batched rider-driver assignment cost matrix',
      'Google OR-Tools linear assignment pattern',
      'Live GPS freshness SLA',
      'Admin-gated apply path for approved bookings only',
      'Firebase Realtime Database mirror after assignment'
    ],
    controls: {
      approvedBookingOnly: 'active',
      liveDriverGpsFreshness: 'active',
      pickupEtaScoring: 'active',
      oneDriverOneBookingBatching: 'active',
      vehicleCompatibilityPenalty: 'active',
      adminApplyRoute: 'active',
      notificationFanout: 'active',
      realtimeDatabaseMirror: 'active'
    },
    endpoints: {
      publicHealth: '/health/realtime-matching-engine',
      adminSnapshot: 'GET /api/admin/matching/engine',
      adminRun: 'POST /api/admin/matching/run'
    },
    warningCount: 0
  };
}

async function fetchMatchingInputs({ bookingId = '', limit = MAX_BATCH_BOOKINGS } = {}) {
  const bookingFilter = {
    adminReviewStatus: 'approved',
    status: 'created',
    $or: [{ driverId: null }, { driverId: '' }, { driverId: { $exists: false } }]
  };
  const cleanBookingId = safeText(bookingId, 120).toUpperCase();
  if (cleanBookingId) bookingFilter.bookingId = cleanBookingId;

  const activeSince = new Date(Date.now() - STALE_DRIVER_WINDOW_MS);
  const [bookings, driverLocations] = await Promise.all([
    Booking.find(bookingFilter)
      .sort({ createdAt: 1 })
      .limit(Math.min(Math.max(Number(limit || MAX_BATCH_BOOKINGS), 1), MAX_BATCH_BOOKINGS))
      .lean(),
    LiveLocation.find({
      subjectType: 'driver',
      status: 'tracking',
      updatedAt: { $gte: activeSince }
    })
      .sort({ updatedAt: -1 })
      .limit(MAX_DRIVER_LOCATIONS)
      .lean()
  ]);

  return { bookings, driverLocations };
}

async function getRealtimeMatchingSnapshot({ actor = null, bookingId = '', limit = MAX_BATCH_BOOKINGS } = {}) {
  const status = getRealtimeMatchingEngineStatus();
  if (!isMongoReady()) {
    return {
      ...status,
      databaseConnected: false,
      generatedAt: new Date().toISOString(),
      actor: serializeActor(actor),
      plan: buildRealtimeMatchingPlan({ bookings: [], driverLocations: [] })
    };
  }

  const inputs = await fetchMatchingInputs({ bookingId, limit });
  const plan = buildRealtimeMatchingPlan(inputs);
  return {
    ...status,
    databaseConnected: true,
    generatedAt: new Date().toISOString(),
    actor: serializeActor(actor),
    plan
  };
}

function serializeActor(actor) {
  return actor ? {
    id: safeText(actor.id, 80),
    role: safeText(actor.role, 40),
    accountType: safeText(actor.accountType, 40)
  } : null;
}

async function createMatchNotifications(assignment, booking, actor) {
  const adminMessage = `Booking ${assignment.bookingId} matched to driver ${assignment.driverId} with ${assignment.etaMinutes} min ETA.`;
  const docs = [
    {
      audience: 'admin',
      type: 'driver_matched',
      title: 'Driver matched',
      message: adminMessage,
      bookingId: assignment.bookingId,
      metadata: {
        phase: 'phase6_realtime_matching',
        driverId: assignment.driverId,
        etaMinutes: assignment.etaMinutes,
        distanceKm: assignment.distanceKm,
        adminUserId: actor && actor.id
      }
    },
    {
      audience: 'driver',
      type: 'driver_assigned',
      title: 'New ride matched',
      message: `Ride ${assignment.bookingId} is ready for driver review.`,
      bookingId: assignment.bookingId,
      metadata: {
        phase: 'phase6_realtime_matching',
        driverId: assignment.driverId,
        etaMinutes: assignment.etaMinutes,
        pickup: assignment.pickup
      }
    }
  ];

  if (booking && booking.userId) {
    docs.push({
      userId: booking.userId,
      audience: 'customer',
      type: 'driver_matching_started',
      title: 'Driver matching started',
      message: `Your booking ${assignment.bookingId} has entered live driver matching.`,
      bookingId: assignment.bookingId,
      metadata: {
        phase: 'phase6_realtime_matching',
        etaMinutes: assignment.etaMinutes
      }
    });
  }

  await Notification.insertMany(docs, { ordered: false }).catch(() => null);
}

async function applyMatchingAssignments({ plan, actor = null } = {}) {
  const applied = [];
  const skipped = [];

  for (const assignment of plan.assignments || []) {
    const filter = {
      _id: assignment.bookingMongoId,
      adminReviewStatus: 'approved',
      status: 'created',
      $or: [{ driverId: null }, { driverId: '' }, { driverId: { $exists: false } }]
    };
    const note = `Matched by Phase 6 real-time engine: driver ${assignment.driverId}, ETA ${assignment.etaMinutes} min, ${assignment.distanceKm} km pickup.`;
    const result = await Booking.updateOne(filter, {
      $set: {
        driverId: assignment.driverId,
        adminReviewNote: note,
        adminReviewedAt: new Date()
      },
      $push: {
        statusHistory: {
          status: 'driver_matched',
          at: new Date(),
          source: 'phase6_realtime_matching',
          note
        }
      }
    });

    if (!result || Number(result.modifiedCount || 0) < 1) {
      skipped.push({ bookingId: assignment.bookingId, driverId: assignment.driverId, reason: 'booking_already_assigned_or_not_approved' });
      continue;
    }

    const booking = await Booking.findById(assignment.bookingMongoId).lean().catch(() => null);
    await Promise.all([
      createMatchNotifications(assignment, booking, actor),
      booking ? mirrorBookingRealtimeUpdate(booking, {
        eventType: 'booking_driver_matched',
        actorRole: actor?.accountType || actor?.role || 'admin',
        actorId: actor?.id || '',
        source: 'phase6_realtime_matching'
      }) : Promise.resolve({ skipped: true })
    ]);

    applied.push({
      bookingId: assignment.bookingId,
      driverId: assignment.driverId,
      etaMinutes: assignment.etaMinutes,
      distanceKm: assignment.distanceKm
    });
  }

  return {
    ok: true,
    appliedCount: applied.length,
    skippedCount: skipped.length,
    applied,
    skipped
  };
}

async function runRealtimeMatchingBatch({ actor = null, apply = false, bookingId = '', limit = MAX_BATCH_BOOKINGS } = {}) {
  const snapshot = await getRealtimeMatchingSnapshot({ actor, bookingId, limit });
  const result = {
    ...snapshot,
    applyRequested: Boolean(apply),
    applied: {
      ok: true,
      appliedCount: 0,
      skippedCount: 0,
      applied: [],
      skipped: []
    }
  };

  if (apply && snapshot.databaseConnected && snapshot.plan.assignments.length) {
    result.applied = await applyMatchingAssignments({ plan: snapshot.plan, actor });
  }

  return result;
}

module.exports = {
  ACTIVE_DRIVER_WINDOW_MS,
  MAX_PICKUP_RADIUS_KM,
  MATCHING_POLICY_VERSION,
  PHASE6_REALTIME_MATCHING_VERSION,
  buildRealtimeMatchingPlan,
  estimateEtaMinutes,
  getRealtimeMatchingEngineStatus,
  getRealtimeMatchingSnapshot,
  haversineDistanceKm,
  runRealtimeMatchingBatch,
  scoreCandidate
};
