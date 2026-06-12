const crypto = require('crypto');
const fs = require('fs');

const logger = require('../utils/logger');

const FIREBASE_DATABASE_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.database'
];
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;
let loggedSkipReasons = new Set();

function cleanString(value, maxLen = 2000) {
  return String(value || '').trim().slice(0, maxLen);
}

function isDisabledFlag(value) {
  return ['0', 'false', 'off', 'no', 'disabled'].includes(String(value || '').trim().toLowerCase());
}

function normalizeDatabaseUrl(value) {
  const raw = cleanString(value, 500).replace(/\/+$/, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = String(parsed.hostname || '').toLowerCase();
    const isFirebaseHost = host.endsWith('.firebaseio.com') || host.endsWith('.firebasedatabase.app');
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    if (parsed.protocol === 'http:' && !isLocalHost) return '';
    if (!isFirebaseHost && !isLocalHost) return '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (_error) {
    return '';
  }
}

function getRealtimeConfig() {
  return {
    enabled: !isDisabledFlag(process.env.FIREBASE_REALTIME_DATABASE_ENABLED),
    databaseURL: normalizeDatabaseUrl(
      process.env.FIREBASE_REALTIME_DATABASE_URL
      || process.env.FIREBASE_DATABASE_URL
      || process.env.FIREBASE_RTDB_URL
    ),
    namespace: cleanString(process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE || 'goindiaride', 80)
      .replace(/[.#$/[\]\s]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'goindiaride',
    timeoutMs: Math.max(
      500,
      Math.min(Number(process.env.FIREBASE_REALTIME_DATABASE_TIMEOUT_MS || 3500), 15000)
    ),
    allowUnauthenticated: String(process.env.FIREBASE_REALTIME_DATABASE_ALLOW_UNAUTHENTICATED || '')
      .trim()
      .toLowerCase() === 'true'
  };
}

function readJsonFile(filePath) {
  const safePath = cleanString(filePath, 1000);
  if (!safePath) return null;
  try {
    const raw = fs.readFileSync(safePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function parseServiceAccountFromEnv() {
  const inlineJson = cleanString(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 20000);
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson);
    } catch (_error) {
      return null;
    }
  }

  const base64Json = cleanString(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 40000);
  if (base64Json) {
    try {
      return JSON.parse(Buffer.from(base64Json, 'base64').toString('utf8'));
    } catch (_error) {
      return null;
    }
  }

  const credentialsFile = cleanString(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    1000
  );
  const fileAccount = readJsonFile(credentialsFile);
  if (fileAccount) return fileAccount;

  const clientEmail = cleanString(process.env.FIREBASE_CLIENT_EMAIL, 500);
  const privateKey = cleanString(process.env.FIREBASE_PRIVATE_KEY, 8000).replace(/\\n/g, '\n');
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey
    };
  }

  return null;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwtWithServiceAccount(serviceAccount) {
  const clientEmail = cleanString(serviceAccount && serviceAccount.client_email, 500);
  const privateKey = cleanString(serviceAccount && serviceAccount.private_key, 8000).replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error('firebase_realtime_service_account_incomplete');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  const payload = {
    iss: clientEmail,
    scope: FIREBASE_DATABASE_SCOPES.join(' '),
    aud: GOOGLE_OAUTH_TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsignedJwt).sign(privateKey);
  return `${unsignedJwt}.${base64Url(signature)}`;
}

async function requestServiceAccountAccessToken(serviceAccount, timeoutMs) {
  if (cachedAccessToken && cachedAccessTokenExpiresAt - Date.now() > 60 * 1000) {
    return cachedAccessToken;
  }
  if (typeof fetch !== 'function') {
    throw new Error('fetch_unavailable_for_firebase_realtime_token');
  }

  const assertion = signJwtWithServiceAccount(serviceAccount);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body,
      signal: controller ? controller.signal : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(`firebase_realtime_token_http_${response.status}`);
    }
    cachedAccessToken = cleanString(data.access_token, 5000);
    cachedAccessTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000;
    return cachedAccessToken;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getRequestAuth(timeoutMs) {
  const bearerToken = cleanString(
    process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN
    || process.env.FIREBASE_DATABASE_ACCESS_TOKEN
    || process.env.GOOGLE_OAUTH_ACCESS_TOKEN,
    5000
  );
  if (bearerToken) {
    return {
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    };
  }

  const serviceAccount = parseServiceAccountFromEnv();
  if (serviceAccount) {
    const accessToken = await requestServiceAccountAccessToken(serviceAccount, timeoutMs);
    return {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };
  }

  const authToken = cleanString(
    process.env.FIREBASE_REALTIME_DATABASE_AUTH_TOKEN
    || process.env.FIREBASE_DATABASE_AUTH_TOKEN
    || process.env.FIREBASE_DATABASE_SECRET,
    5000
  );
  if (authToken) {
    return {
      queryAuth: authToken
    };
  }

  return null;
}

function toRealtimeKey(value) {
  const raw = cleanString(value, 180);
  if (!raw) return '';
  return raw.replace(/[.#$/[\]]+/g, '_').replace(/\s+/g, '_').slice(0, 180);
}

function encodeRealtimePath(pathValue) {
  return String(pathValue || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function toIsoString(value) {
  if (!value) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? cleanString(value, 80) : date.toISOString();
}

function toPlainObject(value, depth = 0) {
  if (value == null) return null;
  if (value instanceof Date) return toIsoString(value);
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => toPlainObject(item, depth + 1));
  if (typeof value !== 'object') {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value;
    return cleanString(value, 1200);
  }
  if (depth > 4) return cleanString(value.toString ? value.toString() : '', 300);
  if (typeof value.toObject === 'function') {
    return toPlainObject(value.toObject({ depopulate: true }), depth + 1);
  }
  if (typeof value.toJSON === 'function' && value.constructor && value.constructor.name === 'ObjectId') {
    return cleanString(value.toString(), 120);
  }

  const output = {};
  Object.entries(value).slice(0, 120).forEach(([key, entry]) => {
    if (entry === undefined || typeof entry === 'function') return;
    output[key] = toPlainObject(entry, depth + 1);
  });
  return output;
}

function safeMixedObject(value) {
  const plain = toPlainObject(value);
  return plain && typeof plain === 'object' && !Array.isArray(plain) ? plain : {};
}

function normalizeEntityId(value) {
  if (!value) return '';
  if (typeof value === 'string' || typeof value === 'number') return cleanString(value, 140);
  if (typeof value.toString === 'function' && value.constructor && value.constructor.name === 'ObjectId') {
    return cleanString(value.toString(), 140);
  }
  const source = value && typeof value === 'object' ? value : {};
  return cleanString(
    source._id
    || source.id
    || source.userId
    || source.driverId
    || (typeof value.toString === 'function' && value.toString() !== '[object Object]' ? value.toString() : ''),
    140
  );
}

function normalizeBookingSnapshot(booking) {
  const source = safeMixedObject(booking);
  const bookingId = cleanString(source.bookingId || source.id, 120).toUpperCase();
  if (!bookingId) return null;

  const customerSnapshot = safeMixedObject(source.customerSnapshot);
  const fareBreakdown = safeMixedObject(source.fareBreakdown);
  const fareQuote = safeMixedObject(source.fareQuote);
  const customerFeatures = safeMixedObject(source.customerFeatures);

  return {
    bookingId,
    userId: normalizeEntityId(source.userId || source.customerId || source.customerUserId),
    driverId: normalizeEntityId(source.driverId) || null,
    status: cleanString(source.status || 'created', 40),
    adminReviewStatus: cleanString(source.adminReviewStatus || 'pending', 40),
    adminReviewedBy: cleanString(source.adminReviewedBy, 140) || null,
    adminReviewedAt: toIsoString(source.adminReviewedAt) || null,
    adminReviewNote: cleanString(source.adminReviewNote, 280) || null,
    amount: Number(source.amount || source.totalFare || source.fare || 0) || 0,
    distanceKm: Number(source.distanceKm || source.distance || 0) || 0,
    pickupLocation: cleanString(source.pickupLocation || source.pickup, 180),
    dropLocation: cleanString(source.dropLocation || source.dropoff || source.drop, 180),
    pickupCoordinates: toPlainObject(source.pickupCoordinates),
    dropoffCoordinates: toPlainObject(source.dropoffCoordinates),
    pickupGoogleMapsUrl: cleanString(source.pickupGoogleMapsUrl, 240),
    dropoffGoogleMapsUrl: cleanString(source.dropoffGoogleMapsUrl, 240),
    locationPins: safeMixedObject(source.locationPins),
    routeStopLocations: Array.isArray(source.routeStopLocations) ? toPlainObject(source.routeStopLocations) : [],
    rideDate: cleanString(source.rideDate, 40),
    rideTime: cleanString(source.rideTime, 40),
    outboundDateTime: toIsoString(source.outboundDateTime) || null,
    returnDate: cleanString(source.returnDate, 40),
    returnTime: cleanString(source.returnTime, 40),
    tripPlan: cleanString(source.tripPlan, 80),
    tripServiceType: cleanString(source.tripServiceType, 80),
    paymentMethod: cleanString(source.paymentMethod, 80),
    vehicleType: cleanString(source.vehicleType || source.rideType, 80),
    vehicleModel: cleanString(source.vehicleModel, 80),
    passengers: Number(source.passengers || 1) || 1,
    luggage: cleanString(source.luggage, 80),
    notes: cleanString(source.notes, 600),
    stops: Array.isArray(source.stops) ? toPlainObject(source.stops).slice(0, 8) : [],
    specialRequests: safeMixedObject(source.specialRequests || customerFeatures.specialRequests),
    safetyAccessibility: safeMixedObject(source.safetyAccessibility || customerFeatures.safetyAccessibility),
    customerSnapshot: {
      name: cleanString(customerSnapshot.name || source.customerName, 140),
      email: cleanString(customerSnapshot.email || source.customerEmail, 180),
      phone: cleanString(customerSnapshot.phone || source.customerPhone, 40)
    },
    fareQuote,
    fareBreakdown: {
      totalFare: Number(fareBreakdown.totalFare || fareBreakdown.amount || source.amount || 0) || 0,
      distanceKm: Number(fareBreakdown.distanceKm || source.distanceKm || 0) || 0,
      distanceSource: cleanString(fareBreakdown.distanceSource || source.distanceSource, 80),
      routeCategory: cleanString(fareBreakdown.routeCategory || fareQuote.routeCategory, 80)
    },
    editCount: Number(source.editCount || 0) || 0,
    lastEditedAt: toIsoString(source.lastEditedAt) || null,
    editPolicyVersion: cleanString(source.editPolicyVersion, 80),
    completedByAccountType: cleanString(source.completedByAccountType, 40) || null,
    completedByUserId: cleanString(source.completedByUserId, 140) || null,
    settlementReference: cleanString(source.settlementReference, 180) || null,
    createdAt: toIsoString(source.createdAt || source.fallbackQueuedAt) || new Date().toISOString(),
    updatedAt: toIsoString(source.updatedAt) || new Date().toISOString(),
    sourceKey: cleanString(source.sourceKey || 'backend_booking_collection', 120)
  };
}

function bookingSummary(snapshot) {
  return {
    bookingId: snapshot.bookingId,
    status: snapshot.status,
    adminReviewStatus: snapshot.adminReviewStatus,
    userId: snapshot.userId,
    driverId: snapshot.driverId,
    amount: snapshot.amount,
    distanceKm: snapshot.distanceKm,
    pickupLocation: snapshot.pickupLocation,
    dropLocation: snapshot.dropLocation,
    rideDate: snapshot.rideDate,
    rideTime: snapshot.rideTime,
    vehicleType: snapshot.vehicleType,
    customerSnapshot: snapshot.customerSnapshot,
    updatedAt: snapshot.updatedAt,
    sourceKey: snapshot.sourceKey
  };
}

function buildEvent(snapshot, options = {}) {
  return {
    eventId: `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    eventType: cleanString(options.eventType || 'booking_updated', 80),
    bookingId: snapshot.bookingId,
    status: snapshot.status,
    adminReviewStatus: snapshot.adminReviewStatus,
    actorRole: cleanString(options.actorRole, 40) || null,
    actorId: cleanString(options.actorId, 140) || null,
    source: cleanString(options.source || snapshot.sourceKey || 'backend', 120),
    changedFields: Array.isArray(options.changedFields)
      ? options.changedFields.map((field) => cleanString(field, 60)).filter(Boolean).slice(0, 40)
      : [],
    note: cleanString(options.note, 260) || null,
    metadata: safeMixedObject(options.metadata),
    emittedAt: new Date().toISOString()
  };
}

function normalizeLiveSubjectType(value) {
  const type = cleanString(value, 40).toLowerCase();
  if (type === 'driver' || type === 'admin') return type;
  return 'customer';
}

function normalizeFiniteNumber(value, min, max, precision = 7) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  if (Number.isFinite(min) && numberValue < min) return null;
  if (Number.isFinite(max) && numberValue > max) return null;
  return Number(numberValue.toFixed(precision));
}

function normalizeLiveLocationSnapshot(location) {
  const source = safeMixedObject(location);
  const lat = normalizeFiniteNumber(source.lat ?? source.latitude, -90, 90);
  const lng = normalizeFiniteNumber(source.lng ?? source.lon ?? source.longitude, -180, 180);
  if (lat === null || lng === null) return null;

  const subjectType = normalizeLiveSubjectType(source.subjectType || source.accountType || source.role);
  const userId = normalizeEntityId(source.userId || source.driverId || source.customerId || source.adminId);
  const sessionId = cleanString(source.sessionId || source.trackingSessionId, 160)
    || `${subjectType}_${userId || 'anonymous'}`;

  return {
    subjectType,
    userId: userId || 'anonymous',
    bookingId: cleanString(source.bookingId || source.rideId || source.tripId, 120).toUpperCase() || null,
    sessionId,
    status: cleanString(source.status || 'tracking', 40).toLowerCase() === 'stopped' ? 'stopped' : 'tracking',
    lat,
    lng,
    coordinates: { lat, lng },
    accuracy: normalizeFiniteNumber(source.accuracy, 0, 100000, 2),
    speed: normalizeFiniteNumber(source.speed, -1, 500, 2),
    heading: normalizeFiniteNumber(source.heading, 0, 360, 2),
    altitude: normalizeFiniteNumber(source.altitude, -1000, 10000, 2),
    source: cleanString(source.source || 'web_geolocation', 120),
    capturedAt: toIsoString(source.capturedAt || source.timestamp) || new Date().toISOString(),
    updatedAt: toIsoString(source.updatedAt) || new Date().toISOString(),
    metadata: safeMixedObject(source.metadata)
  };
}

function liveLocationSummary(snapshot) {
  return {
    subjectType: snapshot.subjectType,
    userId: snapshot.userId,
    bookingId: snapshot.bookingId,
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    lat: snapshot.lat,
    lng: snapshot.lng,
    accuracy: snapshot.accuracy,
    speed: snapshot.speed,
    heading: snapshot.heading,
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    updatedAt: snapshot.updatedAt
  };
}

function buildLiveLocationEvent(snapshot, options = {}) {
  return {
    eventId: `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    eventType: cleanString(options.eventType || `live_location_${snapshot.status}`, 80),
    subjectType: snapshot.subjectType,
    userId: snapshot.userId,
    bookingId: snapshot.bookingId,
    sessionId: snapshot.sessionId,
    status: snapshot.status,
    lat: snapshot.lat,
    lng: snapshot.lng,
    accuracy: snapshot.accuracy,
    actorRole: cleanString(options.actorRole, 40) || snapshot.subjectType,
    actorId: cleanString(options.actorId, 140) || snapshot.userId,
    source: cleanString(options.source || snapshot.source || 'backend_live_tracking', 120),
    emittedAt: new Date().toISOString()
  };
}

async function writeRealtimeValue(config, pathValue, value, method = 'PUT') {
  if (typeof fetch !== 'function') {
    return { ok: false, skipped: true, reason: 'fetch_unavailable' };
  }

  const auth = await getRequestAuth(config.timeoutMs);
  if (!auth && !config.allowUnauthenticated) {
    return { ok: false, skipped: true, reason: 'credentials_missing' };
  }

  const encodedPath = encodeRealtimePath(pathValue);
  if (!encodedPath) {
    return { ok: false, skipped: true, reason: 'path_missing' };
  }

  const url = new URL(`${config.databaseURL}/${encodedPath}.json`);
  if (auth && auth.queryAuth) {
    url.searchParams.set('auth', auth.queryAuth);
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), config.timeoutMs) : null;
  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...((auth && auth.headers) || {})
      },
      body: JSON.stringify(value),
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: `http_${response.status}`,
        status: response.status,
        path: pathValue
      };
    }
    return { ok: true, skipped: false, path: pathValue, status: response.status };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function rememberSkip(reason) {
  const key = cleanString(reason, 80) || 'unknown';
  if (loggedSkipReasons.has(key)) return false;
  loggedSkipReasons.add(key);
  if (loggedSkipReasons.size > 20) loggedSkipReasons = new Set([...loggedSkipReasons].slice(-10));
  return true;
}

async function publishBookingRealtimeUpdate(booking, options = {}) {
  const config = getRealtimeConfig();
  if (!config.enabled) return { ok: false, skipped: true, reason: 'disabled' };
  if (!config.databaseURL) return { ok: false, skipped: true, reason: 'database_url_missing' };

  const snapshot = normalizeBookingSnapshot(booking);
  if (!snapshot) return { ok: false, skipped: true, reason: 'booking_id_missing' };

  const summary = bookingSummary(snapshot);
  const event = buildEvent(snapshot, options);
  const bookingKey = toRealtimeKey(snapshot.bookingId);
  const writes = [
    { path: `${config.namespace}/bookings/byId/${bookingKey}`, value: snapshot },
    { path: `${config.namespace}/bookings/events/${bookingKey}/${event.eventId}`, value: event },
    { path: `${config.namespace}/bookingEvents/latest`, value: event },
    { path: `${config.namespace}/meta/lastBookingEvent`, value: event }
  ];

  const customerKey = toRealtimeKey(snapshot.userId);
  if (customerKey) {
    writes.push({ path: `${config.namespace}/bookings/byCustomer/${customerKey}/${bookingKey}`, value: summary });
  }

  const driverKey = toRealtimeKey(snapshot.driverId);
  if (driverKey) {
    writes.push({ path: `${config.namespace}/bookings/byDriver/${driverKey}/${bookingKey}`, value: summary });
  }

  if (snapshot.adminReviewStatus === 'pending' && snapshot.status === 'created') {
    writes.push({ path: `${config.namespace}/admin/bookingReview/${bookingKey}`, value: summary });
  } else {
    writes.push({ path: `${config.namespace}/admin/bookingReview/${bookingKey}`, value: null });
  }

  const results = [];
  for (const write of writes) {
    results.push(await writeRealtimeValue(config, write.path, write.value));
  }

  const failed = results.filter((result) => !result.ok && !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  return {
    ok: failed.length === 0 && skipped.length === 0,
    skipped: skipped.length === results.length,
    reason: skipped.length === results.length ? skipped[0]?.reason || 'skipped' : undefined,
    written: results.filter((result) => result.ok).length,
    failed: failed.length,
    results
  };
}

async function publishLiveLocationRealtimeUpdate(location, options = {}) {
  const config = getRealtimeConfig();
  if (!config.enabled) return { ok: false, skipped: true, reason: 'disabled' };
  if (!config.databaseURL) return { ok: false, skipped: true, reason: 'database_url_missing' };

  const snapshot = normalizeLiveLocationSnapshot(location);
  if (!snapshot) return { ok: false, skipped: true, reason: 'location_invalid' };

  const event = buildLiveLocationEvent(snapshot, options);
  const subjectKey = toRealtimeKey(`${snapshot.subjectType}_${snapshot.userId}`);
  const sessionKey = toRealtimeKey(snapshot.sessionId);
  const subjectBookingKey = toRealtimeKey(`${snapshot.subjectType}_${snapshot.userId}_${snapshot.sessionId}`);
  const writes = [
    { path: `${config.namespace}/liveTracking/latest/bySubject/${snapshot.subjectType}/${subjectKey}`, value: snapshot },
    { path: `${config.namespace}/liveTracking/latest/all/${subjectKey}`, value: liveLocationSummary(snapshot) },
    { path: `${config.namespace}/liveTracking/sessions/${sessionKey}/latest`, value: snapshot },
    { path: `${config.namespace}/liveTracking/events/${subjectKey}/${event.eventId}`, value: event },
    { path: `${config.namespace}/liveTracking/meta/lastLocationEvent`, value: event }
  ];

  const bookingKey = toRealtimeKey(snapshot.bookingId);
  if (bookingKey) {
    writes.push({
      path: `${config.namespace}/liveTracking/latest/byBooking/${bookingKey}/${subjectBookingKey}`,
      value: snapshot
    });
  }

  const results = [];
  for (const write of writes) {
    results.push(await writeRealtimeValue(config, write.path, write.value));
  }

  const failed = results.filter((result) => !result.ok && !result.skipped);
  const skipped = results.filter((result) => result.skipped);
  return {
    ok: failed.length === 0 && skipped.length === 0,
    skipped: skipped.length === results.length,
    reason: skipped.length === results.length ? skipped[0]?.reason || 'skipped' : undefined,
    written: results.filter((result) => result.ok).length,
    failed: failed.length,
    results
  };
}

async function mirrorBookingRealtimeUpdate(booking, options = {}) {
  try {
    const result = await publishBookingRealtimeUpdate(booking, options);
    if (result.skipped && rememberSkip(result.reason)) {
      logger.info('firebase_realtime_database_mirror_skipped', {
        reason: result.reason,
        eventType: options.eventType || 'booking_updated'
      });
    }
    if (result.failed) {
      logger.warn('firebase_realtime_database_mirror_partial_failure', {
        failed: result.failed,
        written: result.written,
        eventType: options.eventType || 'booking_updated'
      });
    }
    return result;
  } catch (error) {
    logger.warn('firebase_realtime_database_mirror_failed', {
      eventType: options.eventType || 'booking_updated',
      message: cleanString(error.message, 180)
    });
    return {
      ok: false,
      skipped: false,
      reason: cleanString(error.message, 180)
    };
  }
}

async function mirrorLiveLocationRealtimeUpdate(location, options = {}) {
  try {
    const result = await publishLiveLocationRealtimeUpdate(location, options);
    if (result.skipped && rememberSkip(`live_location_${result.reason}`)) {
      logger.info('firebase_realtime_database_live_location_skipped', {
        reason: result.reason,
        eventType: options.eventType || 'live_location_updated'
      });
    }
    if (result.failed) {
      logger.warn('firebase_realtime_database_live_location_partial_failure', {
        failed: result.failed,
        written: result.written,
        eventType: options.eventType || 'live_location_updated'
      });
    }
    return result;
  } catch (error) {
    logger.warn('firebase_realtime_database_live_location_failed', {
      eventType: options.eventType || 'live_location_updated',
      message: cleanString(error.message, 180)
    });
    return {
      ok: false,
      skipped: false,
      reason: cleanString(error.message, 180)
    };
  }
}

function resetFirebaseRealtimeDatabaseServiceForTests() {
  cachedAccessToken = '';
  cachedAccessTokenExpiresAt = 0;
  loggedSkipReasons = new Set();
}

module.exports = {
  getRealtimeConfig,
  normalizeBookingSnapshot,
  normalizeLiveLocationSnapshot,
  publishBookingRealtimeUpdate,
  mirrorBookingRealtimeUpdate,
  publishLiveLocationRealtimeUpdate,
  mirrorLiveLocationRealtimeUpdate,
  resetFirebaseRealtimeDatabaseServiceForTests
};
