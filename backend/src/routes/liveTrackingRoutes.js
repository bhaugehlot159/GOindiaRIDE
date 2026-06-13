const express = require('express');
const LiveLocation = require('../models/LiveLocation');
const Booking = require('../models/Booking');
const { authenticate } = require('../middleware/authMiddleware');
const { getClientIp } = require('../utils/device');
const { mirrorLiveLocationRealtimeUpdate } = require('../services/firebaseRealtimeDatabaseService');
const {
  LIVE_LOCATION_TRACKING_POLICY_VERSION,
  PHASE7_LIVE_LOCATION_TRACKING_VERSION,
  buildLocationSafetyEnvelope,
  getLiveLocationOperationsSnapshot
} = require('../services/liveLocationTrackingService');

const router = express.Router();
const SUBJECT_TYPES = new Set(['customer', 'driver', 'admin']);

function cleanString(value, maxLen = 240) {
  return String(value || '').trim().slice(0, maxLen);
}

function cleanNumber(value, min, max, decimals = 7) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  if (Number.isFinite(min) && numberValue < min) return null;
  if (Number.isFinite(max) && numberValue > max) return null;
  return Number(numberValue.toFixed(decimals));
}

function cleanDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isAdminUser(user = {}) {
  return user.role === 'admin' || user.accountType === 'admin';
}

function entityId(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return cleanString(value._id || value.id, 140);
  }
  return cleanString(value, 140);
}

function getActorId(user = {}) {
  return entityId(user.id || user._id || user.sub);
}

function resolveSubjectType(user = {}, requested) {
  const accountType = cleanString(user.accountType || user.role, 40).toLowerCase();
  const requestedType = cleanString(requested, 40).toLowerCase();
  if (isAdminUser(user) && SUBJECT_TYPES.has(requestedType)) return requestedType;
  if (accountType === 'driver') return 'driver';
  if (accountType === 'admin') return 'admin';
  return 'customer';
}

function normalizeLocationPayload(req, statusOverride) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const lat = cleanNumber(body.lat ?? body.latitude, -90, 90);
  const lng = cleanNumber(body.lng ?? body.lon ?? body.longitude, -180, 180);
  if (lat === null || lng === null) return { error: 'Valid latitude and longitude are required' };

  const subjectType = resolveSubjectType(req.user, body.subjectType);
  const userId = cleanString(req.user.id, 140);
  const bookingId = cleanString(body.bookingId || body.rideId || body.tripId, 120).toUpperCase();
  const sessionId = cleanString(body.sessionId || body.trackingSessionId || `${subjectType}:${userId}:default`, 160);
  const status = statusOverride || (cleanString(body.status, 40).toLowerCase() === 'stopped' ? 'stopped' : 'tracking');
  const capturedAt = cleanDate(body.capturedAt || body.timestamp);
  const receivedAt = new Date();

  return {
    subjectType,
    userId,
    bookingId,
    sessionId,
    lat,
    lng,
    accuracy: cleanNumber(body.accuracy, 0, 100000, 2),
    speed: cleanNumber(body.speed, -1, 500, 2),
    heading: cleanNumber(body.heading, 0, 360, 2),
    altitude: cleanNumber(body.altitude, -1000, 10000, 2),
    status,
    source: cleanString(body.source || 'web_geolocation', 120),
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {},
    ip: cleanString(getClientIp(req), 80),
    userAgent: cleanString(req.get('user-agent'), 300),
    capturedAt,
    lastReportedAt: receivedAt,
    historyPoint: {
      lat,
      lng,
      accuracy: cleanNumber(body.accuracy, 0, 100000, 2),
      speed: cleanNumber(body.speed, -1, 500, 2),
      heading: cleanNumber(body.heading, 0, 360, 2),
      altitude: cleanNumber(body.altitude, -1000, 10000, 2),
      capturedAt,
      receivedAt
    }
  };
}

function serializeLocation(row) {
  const source = row && typeof row === 'object' ? row : {};
  return {
    id: cleanString(source._id || source.id, 120),
    subjectType: source.subjectType,
    userId: source.userId,
    bookingId: source.bookingId || '',
    sessionId: source.sessionId,
    lat: source.lat,
    lng: source.lng,
    accuracy: source.accuracy ?? null,
    speed: source.speed ?? null,
    heading: source.heading ?? null,
    altitude: source.altitude ?? null,
    status: source.status,
    source: source.source,
    capturedAt: source.capturedAt,
    updatedAt: source.updatedAt || source.lastReportedAt,
    lastReportedAt: source.lastReportedAt,
    metadata: source.metadata || {},
    history: Array.isArray(source.history) ? source.history : undefined
  };
}

async function resolveParticipantLocationAccess(req, bookingId, requestedSubjectType) {
  if (!bookingId) {
    return { error: 'bookingId is required to read another participant location', status: 400 };
  }

  const booking = await Booking.findOne({ bookingId }).lean();
  const actorSubjectType = resolveSubjectType(req.user);
  const actorId = getActorId(req.user);
  const bookingCustomerId = entityId(booking && booking.userId);
  const bookingDriverId = entityId(booking && booking.driverId);

  if (!booking || !actorId) {
    return { error: 'Booking participant access required for live location', status: 403 };
  }

  if (actorSubjectType === 'customer') {
    if (bookingCustomerId !== actorId || requestedSubjectType !== 'driver') {
      return { error: 'Booking participant access required for live location', status: 403 };
    }
    if (!bookingDriverId) {
      return { empty: true, accessScope: 'customer_waiting_for_assigned_driver' };
    }
    return {
      accessScope: 'customer_assigned_driver_location',
      filter: {
        subjectType: 'driver',
        userId: bookingDriverId
      }
    };
  }

  if (actorSubjectType === 'driver') {
    if (bookingDriverId !== actorId || requestedSubjectType !== 'customer') {
      return { error: 'Booking participant access required for live location', status: 403 };
    }
    if (!bookingCustomerId) {
      return { empty: true, accessScope: 'driver_waiting_for_customer_location' };
    }
    return {
      accessScope: 'driver_assigned_customer_location',
      filter: {
        subjectType: 'customer',
        userId: bookingCustomerId
      }
    };
  }

  return { error: 'Booking participant access required for live location', status: 403 };
}

async function mirrorLocation(row, eventType, req) {
  return mirrorLiveLocationRealtimeUpdate(row, {
    eventType,
    actorRole: req.user.accountType || req.user.role,
    actorId: req.user.id,
    source: 'backend_live_tracking'
  });
}

router.post('/location', authenticate, async (req, res) => {
  const normalized = normalizeLocationPayload(req);
  if (normalized.error) {
    return res.status(400).json({ ok: false, message: normalized.error });
  }

  const filter = {
    subjectType: normalized.subjectType,
    userId: normalized.userId,
    sessionId: normalized.sessionId,
    bookingId: normalized.bookingId || ''
  };
  const update = {
    $set: {
      subjectType: normalized.subjectType,
      userId: normalized.userId,
      bookingId: normalized.bookingId || '',
      sessionId: normalized.sessionId,
      lat: normalized.lat,
      lng: normalized.lng,
      accuracy: normalized.accuracy,
      speed: normalized.speed,
      heading: normalized.heading,
      altitude: normalized.altitude,
      status: normalized.status,
      source: normalized.source,
      metadata: normalized.metadata,
      ip: normalized.ip,
      userAgent: normalized.userAgent,
      capturedAt: normalized.capturedAt,
      lastReportedAt: normalized.lastReportedAt
    },
    $push: {
      history: {
        $each: [normalized.historyPoint],
        $slice: -120
      }
    }
  };

  const location = await LiveLocation.findOneAndUpdate(filter, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  }).lean();
  const realtime = await mirrorLocation(location, 'live_location_updated', req);
  const safety = buildLocationSafetyEnvelope(location);

  return res.status(200).json({
    ok: true,
    version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
    policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
    location: serializeLocation(location),
    safety,
    realtime: {
      ok: Boolean(realtime && realtime.ok),
      skipped: Boolean(realtime && realtime.skipped),
      reason: realtime && realtime.reason
    }
  });
});

router.post('/location/stop', authenticate, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const subjectType = resolveSubjectType(req.user, body.subjectType);
  const userId = cleanString(req.user.id, 140);
  const sessionId = cleanString(body.sessionId || body.trackingSessionId || `${subjectType}:${userId}:default`, 160);
  const bookingId = cleanString(body.bookingId || body.rideId || body.tripId, 120).toUpperCase();
  const filter = {
    subjectType,
    userId,
    sessionId,
    bookingId: bookingId || ''
  };

  let update = {
    $set: {
      status: 'stopped',
      source: cleanString(body.source || 'web_geolocation', 120),
      lastReportedAt: new Date(),
      metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {}
    }
  };
  const normalized = normalizeLocationPayload(req, 'stopped');
  if (!normalized.error) {
    update = {
      $set: {
        ...update.$set,
        lat: normalized.lat,
        lng: normalized.lng,
        accuracy: normalized.accuracy,
        speed: normalized.speed,
        heading: normalized.heading,
        altitude: normalized.altitude,
        capturedAt: normalized.capturedAt,
        ip: normalized.ip,
        userAgent: normalized.userAgent
      },
      $push: {
        history: {
          $each: [normalized.historyPoint],
          $slice: -120
        }
      }
    };
  }

  const location = await LiveLocation.findOneAndUpdate(filter, update, {
    new: true,
    sort: { updatedAt: -1 }
  }).lean();

  if (!location) {
    return res.status(200).json({
      ok: true,
      version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
      policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
      stopped: false,
      message: 'No active live tracking session found'
    });
  }

  const realtime = await mirrorLocation(location, 'live_location_stopped', req);
  const safety = buildLocationSafetyEnvelope(location);
  return res.status(200).json({
    ok: true,
    version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
    policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
    stopped: true,
    location: serializeLocation(location),
    safety,
    realtime: {
      ok: Boolean(realtime && realtime.ok),
      skipped: Boolean(realtime && realtime.skipped),
      reason: realtime && realtime.reason
    }
  });
});

router.get('/operations', authenticate, async (req, res) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ ok: false, message: 'Admin access required for live location operations' });
  }

  const snapshot = await getLiveLocationOperationsSnapshot({
    actor: req.user,
    limit: req.query.limit
  });
  return res.status(200).json(snapshot);
});

router.get('/locations', authenticate, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 250);
  const bookingId = cleanString(req.query.bookingId || req.query.rideId || req.query.tripId, 120).toUpperCase();
  const subjectType = cleanString(req.query.subjectType, 40).toLowerCase();
  const requestedSubjectType = SUBJECT_TYPES.has(subjectType) ? subjectType : '';
  const status = cleanString(req.query.status, 40).toLowerCase();
  const filter = {};
  let accessScope = isAdminUser(req.user) ? 'admin' : 'self';

  if (bookingId) filter.bookingId = bookingId;
  if (status === 'tracking' || status === 'stopped') filter.status = status;

  if (isAdminUser(req.user)) {
    if (requestedSubjectType) filter.subjectType = requestedSubjectType;
    if (req.query.userId) filter.userId = cleanString(req.query.userId, 140);
  } else {
    const actorSubjectType = resolveSubjectType(req.user);
    if (bookingId && requestedSubjectType && requestedSubjectType !== actorSubjectType) {
      const participantAccess = await resolveParticipantLocationAccess(req, bookingId, requestedSubjectType);
      if (participantAccess.error) {
        return res.status(participantAccess.status || 403).json({ ok: false, message: participantAccess.error });
      }
      accessScope = participantAccess.accessScope || 'participant';
      if (participantAccess.empty) {
        return res.status(200).json({
          ok: true,
          version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
          policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
          accessScope,
          count: 0,
          items: []
        });
      }
      Object.assign(filter, participantAccess.filter || {});
    } else {
      filter.userId = getActorId(req.user);
      filter.subjectType = actorSubjectType;
    }
  }

  let query = LiveLocation.find(filter).sort({ updatedAt: -1 }).limit(limit);
  if (String(req.query.includeHistory || '').toLowerCase() !== 'true') {
    query = query.select('-history');
  }

  const items = await query.lean();
  return res.status(200).json({
    ok: true,
    version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
    policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
    accessScope,
    count: items.length,
    items: items.map((item) => ({
      ...serializeLocation(item),
      safety: buildLocationSafetyEnvelope(item)
    }))
  });
});

module.exports = router;
