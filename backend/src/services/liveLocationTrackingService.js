const mongoose = require('mongoose');

const LiveLocation = require('../models/LiveLocation');

const PHASE7_LIVE_LOCATION_TRACKING_VERSION = 'goindiaride_live_location_tracking_phase7_v1';
const LIVE_LOCATION_TRACKING_POLICY_VERSION = '2026-06-13-live-location-phase7';
const FRESH_LOCATION_WINDOW_MS = 2 * 60 * 1000;
const WARM_LOCATION_WINDOW_MS = 8 * 60 * 1000;
const OFFLINE_LOCATION_WINDOW_MS = 15 * 60 * 1000;
const PRECISE_ACCURACY_METERS = 35;
const USABLE_ACCURACY_METERS = 100;
const WEAK_ACCURACY_METERS = 150;
const OVERSPEED_KMH = 130;
const ELEVATED_SPEED_KMH = 100;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_OPERATIONS_ROWS = 180;

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

function roundNumber(value, decimals = 5) {
  const numberValue = toFiniteNumber(value);
  if (numberValue === null) return null;
  return Number(numberValue.toFixed(decimals));
}

function getLastSignalAt(location = {}) {
  return location.updatedAt || location.lastReportedAt || location.capturedAt || null;
}

function classifyFreshness(location = {}, now = new Date()) {
  if (safeText(location.status, 40).toLowerCase() === 'stopped') {
    return 'stopped';
  }
  const date = toDate(getLastSignalAt(location));
  if (!date) return 'unknown';
  const ageMs = Math.max(0, now.getTime() - date.getTime());
  if (ageMs <= FRESH_LOCATION_WINDOW_MS) return 'fresh';
  if (ageMs <= WARM_LOCATION_WINDOW_MS) return 'warm';
  if (ageMs <= OFFLINE_LOCATION_WINDOW_MS) return 'stale';
  return 'offline';
}

function classifyAccuracy(accuracy) {
  const meters = toFiniteNumber(accuracy);
  if (meters === null) return 'unknown';
  if (meters <= PRECISE_ACCURACY_METERS) return 'precise';
  if (meters <= USABLE_ACCURACY_METERS) return 'usable';
  if (meters <= WEAK_ACCURACY_METERS) return 'degraded';
  return 'weak';
}

function getSpeedKmh(speed) {
  const metersPerSecond = toFiniteNumber(speed);
  if (metersPerSecond === null || metersPerSecond < 0) return null;
  return Number((metersPerSecond * 3.6).toFixed(1));
}

function classifySpeed(speed) {
  const kmh = getSpeedKmh(speed);
  if (kmh === null) return 'unknown';
  if (kmh >= OVERSPEED_KMH) return 'overspeed';
  if (kmh >= ELEVATED_SPEED_KMH) return 'elevated';
  return 'normal';
}

function getAttentionReasons({ freshnessStatus, accuracyStatus, speedStatus, status }) {
  const reasons = [];
  if (status !== 'stopped' && freshnessStatus === 'stale') reasons.push('gps_stale');
  if (status !== 'stopped' && freshnessStatus === 'offline') reasons.push('gps_offline');
  if (status !== 'stopped' && freshnessStatus === 'unknown') reasons.push('gps_time_missing');
  if (accuracyStatus === 'weak') reasons.push('weak_accuracy');
  if (speedStatus === 'overspeed') reasons.push('overspeed');
  return reasons;
}

function getAttentionSeverity(reasons = []) {
  if (reasons.includes('gps_offline') || reasons.includes('overspeed')) return 'critical';
  if (reasons.includes('gps_stale') || reasons.includes('weak_accuracy') || reasons.includes('gps_time_missing')) return 'warning';
  return 'normal';
}

function buildLocationSafetyEnvelope(location = {}, now = new Date()) {
  const status = safeText(location.status || 'tracking', 40).toLowerCase() || 'tracking';
  const lastSignalAt = getLastSignalAt(location);
  const freshnessStatus = classifyFreshness({ ...location, status }, now);
  const accuracyStatus = classifyAccuracy(location.accuracy);
  const speedStatus = classifySpeed(location.speed);
  const reasons = getAttentionReasons({ freshnessStatus, accuracyStatus, speedStatus, status });
  const speedKmh = getSpeedKmh(location.speed);

  return {
    phase: 'phase7_live_location_tracking',
    policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
    status,
    active: status === 'tracking' && (freshnessStatus === 'fresh' || freshnessStatus === 'warm'),
    needsAttention: reasons.length > 0,
    severity: getAttentionSeverity(reasons),
    reasons,
    freshnessStatus,
    freshnessMinutes: minutesSince(lastSignalAt, now),
    accuracyStatus,
    accuracyMeters: toFiniteNumber(location.accuracy),
    speedStatus,
    speedKmh,
    lastSignalAt: toDate(lastSignalAt)?.toISOString() || null,
    heartbeatTtlSeconds: OFFLINE_LOCATION_WINDOW_MS / 1000
  };
}

function serializeActor(actor) {
  return actor ? {
    id: safeText(actor.id, 80),
    role: safeText(actor.role, 40),
    accountType: safeText(actor.accountType, 40)
  } : null;
}

function serializeLocationForOperations(row = {}, now = new Date()) {
  const safety = buildLocationSafetyEnvelope(row, now);
  const lat = roundNumber(row.lat, 5);
  const lng = roundNumber(row.lng, 5);
  return {
    id: safeText(row._id || row.id, 120),
    subjectType: safeText(row.subjectType, 40),
    userId: safeText(row.userId, 140),
    bookingId: safeText(row.bookingId, 120),
    sessionId: safeText(row.sessionId, 160),
    lat,
    lng,
    accuracy: toFiniteNumber(row.accuracy),
    speedKmh: safety.speedKmh,
    heading: toFiniteNumber(row.heading),
    status: safeText(row.status, 40),
    source: safeText(row.source, 120),
    capturedAt: toDate(row.capturedAt)?.toISOString() || null,
    updatedAt: toDate(row.updatedAt || row.lastReportedAt)?.toISOString() || null,
    mapsUrl: lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : '',
    safety
  };
}

function buildCounts(items = []) {
  const counts = {
    totalRows: items.length,
    activeGps: 0,
    staleGps: 0,
    offlineGps: 0,
    stopped: 0,
    weakAccuracy: 0,
    overspeed: 0,
    activeDrivers: 0,
    activeCustomers: 0,
    bySubjectType: {
      driver: 0,
      customer: 0,
      admin: 0
    }
  };

  items.forEach((item) => {
    const subjectType = safeText(item.subjectType, 40).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(counts.bySubjectType, subjectType)) {
      counts.bySubjectType[subjectType] += 1;
    }

    if (item.safety.status === 'stopped') counts.stopped += 1;
    if (item.safety.active) counts.activeGps += 1;
    if (item.safety.freshnessStatus === 'stale') counts.staleGps += 1;
    if (item.safety.freshnessStatus === 'offline') counts.offlineGps += 1;
    if (item.safety.accuracyStatus === 'weak') counts.weakAccuracy += 1;
    if (item.safety.speedStatus === 'overspeed') counts.overspeed += 1;
    if (item.safety.active && subjectType === 'driver') counts.activeDrivers += 1;
    if (item.safety.active && subjectType === 'customer') counts.activeCustomers += 1;
  });

  return counts;
}

function buildAlerts(items = []) {
  return items
    .filter((item) => item.safety && item.safety.needsAttention)
    .map((item) => ({
      id: item.id,
      severity: item.safety.severity,
      subjectType: item.subjectType,
      userId: item.userId,
      bookingId: item.bookingId,
      reasons: item.safety.reasons,
      freshnessMinutes: item.safety.freshnessMinutes,
      accuracyMeters: item.safety.accuracyMeters,
      speedKmh: item.safety.speedKmh,
      updatedAt: item.updatedAt
    }))
    .slice(0, 30);
}

function buildGoldenSignals(counts = {}) {
  return {
    availability: {
      label: 'Active GPS',
      value: Number(counts.activeGps || 0),
      unit: 'sessions',
      status: Number(counts.activeGps || 0) > 0 ? 'good' : 'warning'
    },
    freshness: {
      label: 'Stale GPS',
      value: Number(counts.staleGps || 0) + Number(counts.offlineGps || 0),
      unit: 'sessions',
      status: Number(counts.offlineGps || 0) > 0 ? 'critical' : (Number(counts.staleGps || 0) > 0 ? 'warning' : 'good')
    },
    quality: {
      label: 'Weak accuracy',
      value: Number(counts.weakAccuracy || 0),
      unit: 'sessions',
      status: Number(counts.weakAccuracy || 0) > 0 ? 'warning' : 'good'
    },
    safety: {
      label: 'Overspeed',
      value: Number(counts.overspeed || 0),
      unit: 'sessions',
      status: Number(counts.overspeed || 0) > 0 ? 'critical' : 'good'
    }
  };
}

function getLiveLocationTrackingStatus() {
  return {
    ok: true,
    active: true,
    productionReady: true,
    version: PHASE7_LIVE_LOCATION_TRACKING_VERSION,
    policyVersion: LIVE_LOCATION_TRACKING_POLICY_VERSION,
    mode: 'phase7-production-live-location-tracking',
    standards: [
      'W3C Geolocation watchPosition/getCurrentPosition with explicit timeout and cache age',
      'Firebase Realtime Database fan-out mirror for live presence and latest location',
      'Role-gated admin operations feed without location history by default',
      'GPS freshness, accuracy and overspeed safety envelope'
    ],
    controls: {
      authenticatedLocationWrites: 'active',
      gpsWatchPosition: 'active',
      gpsFreshnessSla: 'active',
      accuracyQualityGate: 'active',
      speedAnomalyDetection: 'active',
      adminOperationsSnapshot: 'active',
      historyRetentionLimit: 'active',
      realtimeDatabaseMirror: 'active',
      privacyMinimizedAdminFeed: 'active'
    },
    thresholds: {
      freshMinutes: FRESH_LOCATION_WINDOW_MS / 60000,
      warmMinutes: WARM_LOCATION_WINDOW_MS / 60000,
      offlineMinutes: OFFLINE_LOCATION_WINDOW_MS / 60000,
      preciseAccuracyMeters: PRECISE_ACCURACY_METERS,
      usableAccuracyMeters: USABLE_ACCURACY_METERS,
      weakAccuracyMeters: WEAK_ACCURACY_METERS,
      elevatedSpeedKmh: ELEVATED_SPEED_KMH,
      overspeedKmh: OVERSPEED_KMH,
      retainedHistoryPoints: 120
    },
    endpoints: {
      publicHealth: '/health/live-location-tracking',
      adminSnapshot: 'GET /api/admin/live-location/operations',
      liveTrackingOperations: 'GET /api/live-tracking/operations',
      writeLocation: 'POST /api/live-tracking/location',
      stopLocation: 'POST /api/live-tracking/location/stop'
    },
    warningCount: 0
  };
}

async function getLiveLocationOperationsSnapshot({ actor = null, limit = MAX_OPERATIONS_ROWS } = {}) {
  const status = getLiveLocationTrackingStatus();
  const now = new Date();
  const cleanLimit = Math.min(Math.max(Number(limit || MAX_OPERATIONS_ROWS), 1), MAX_OPERATIONS_ROWS);

  if (!isMongoReady()) {
    const counts = buildCounts([]);
    return {
      ...status,
      databaseConnected: false,
      generatedAt: now.toISOString(),
      actor: serializeActor(actor),
      counts,
      goldenSignals: buildGoldenSignals(counts),
      alerts: [],
      items: [],
      privacy: {
        locationHistoryReturned: false,
        coordinatePrecision: 'rounded_to_5_decimals_for_operations_feed'
      }
    };
  }

  const rows = await LiveLocation.find({
    updatedAt: { $gte: new Date(now.getTime() - RECENT_WINDOW_MS) }
  })
    .sort({ updatedAt: -1 })
    .limit(cleanLimit)
    .select('-history')
    .lean();

  const items = rows.map((row) => serializeLocationForOperations(row, now));
  const counts = buildCounts(items);
  return {
    ...status,
    databaseConnected: true,
    generatedAt: now.toISOString(),
    actor: serializeActor(actor),
    counts,
    goldenSignals: buildGoldenSignals(counts),
    alerts: buildAlerts(items),
    items,
    privacy: {
      locationHistoryReturned: false,
      coordinatePrecision: 'rounded_to_5_decimals_for_operations_feed'
    }
  };
}

module.exports = {
  ELEVATED_SPEED_KMH,
  FRESH_LOCATION_WINDOW_MS,
  LIVE_LOCATION_TRACKING_POLICY_VERSION,
  OFFLINE_LOCATION_WINDOW_MS,
  OVERSPEED_KMH,
  PHASE7_LIVE_LOCATION_TRACKING_VERSION,
  USABLE_ACCURACY_METERS,
  WARM_LOCATION_WINDOW_MS,
  WEAK_ACCURACY_METERS,
  buildLocationSafetyEnvelope,
  classifyAccuracy,
  classifyFreshness,
  classifySpeed,
  getLiveLocationOperationsSnapshot,
  getLiveLocationTrackingStatus,
  getSpeedKmh,
  minutesSince
};
