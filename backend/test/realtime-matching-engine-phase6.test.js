process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-matching-phase6';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-matching-phase6';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-test';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key';
process.env.GLOBAL_LOCKDOWN_SHIELD_ENABLED = 'false';
process.env.ROUTE_GUARD_POLICY_SHIELD_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const app = require('../src/app');
const {
  PHASE6_REALTIME_MATCHING_VERSION,
  buildRealtimeMatchingPlan,
  getRealtimeMatchingEngineStatus,
  getRealtimeMatchingSnapshot,
  haversineDistanceKm,
  scoreCandidate
} = require('../src/services/realtimeMatchingEngineService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 6 matching status exposes production controls', () => {
  const status = getRealtimeMatchingEngineStatus();

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.productionReady, true);
  assert.equal(status.version, PHASE6_REALTIME_MATCHING_VERSION);
  assert.equal(status.mode, 'phase6-production-realtime-matching-engine');
  assert.equal(status.warningCount, 0);
  assert.equal(status.controls.approvedBookingOnly, 'active');
  assert.equal(status.controls.liveDriverGpsFreshness, 'active');
  assert.equal(status.controls.pickupEtaScoring, 'active');
  assert.equal(status.controls.oneDriverOneBookingBatching, 'active');
  assert.equal(status.controls.adminApplyRoute, 'active');
  assert.match(status.endpoints.publicHealth, /\/health\/realtime-matching-engine/);
  assert.match(status.endpoints.adminSnapshot, /GET \/api\/admin\/matching\/engine/);
  assert.match(status.endpoints.adminRun, /POST \/api\/admin\/matching\/run/);
});

test('phase 6 public health endpoint is live without admin auth', async () => {
  const response = await request(app)
    .get('/health/realtime-matching-engine')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.productionReady, true);
  assert.equal(response.body.version, PHASE6_REALTIME_MATCHING_VERSION);
});

test('phase 6 matching plan assigns approved bookings to fresh nearest drivers', () => {
  const now = new Date('2026-06-13T08:00:00.000Z');
  const bookings = [
    {
      _id: '665000000000000000000001',
      bookingId: 'RID-A',
      adminReviewStatus: 'approved',
      status: 'created',
      pickupCoordinates: { lat: 24.5854, lng: 73.7125 },
      pickupLocation: 'Udaipur City Palace',
      dropLocation: 'Udaipur Airport',
      createdAt: new Date('2026-06-13T07:40:00.000Z')
    },
    {
      _id: '665000000000000000000002',
      bookingId: 'RID-B',
      adminReviewStatus: 'approved',
      status: 'created',
      pickupCoordinates: { lat: 24.606, lng: 73.734 },
      pickupLocation: 'Fateh Sagar',
      dropLocation: 'Railway Station',
      createdAt: new Date('2026-06-13T07:50:00.000Z')
    },
    {
      _id: '665000000000000000000003',
      bookingId: 'RID-PENDING',
      adminReviewStatus: 'pending',
      status: 'created',
      pickupCoordinates: { lat: 24.58, lng: 73.7 },
      createdAt: now
    }
  ];
  const driverLocations = [
    {
      _id: 'loc1',
      subjectType: 'driver',
      userId: 'driver-a',
      status: 'tracking',
      lat: 24.586,
      lng: 73.713,
      accuracy: 20,
      updatedAt: new Date('2026-06-13T07:59:00.000Z')
    },
    {
      _id: 'loc2',
      subjectType: 'driver',
      userId: 'driver-b',
      status: 'tracking',
      lat: 24.607,
      lng: 73.735,
      accuracy: 20,
      updatedAt: new Date('2026-06-13T07:59:00.000Z')
    },
    {
      _id: 'stale',
      subjectType: 'driver',
      userId: 'driver-stale',
      status: 'tracking',
      lat: 24.5855,
      lng: 73.7126,
      updatedAt: new Date('2026-06-13T07:40:00.000Z')
    }
  ];

  const plan = buildRealtimeMatchingPlan({ bookings, driverLocations, now });
  const matchMap = new Map(plan.assignments.map((row) => [row.bookingId, row.driverId]));

  assert.equal(plan.version, PHASE6_REALTIME_MATCHING_VERSION);
  assert.equal(plan.counts.eligibleBookings, 2);
  assert.equal(plan.counts.liveDrivers, 2);
  assert.equal(plan.counts.matchedBookings, 2);
  assert.equal(matchMap.get('RID-A'), 'driver-a');
  assert.equal(matchMap.get('RID-B'), 'driver-b');
  assert.equal(plan.unmatchedBookings.length, 0);
  assert.ok(plan.goldenSignals.matchRate.value >= 100);
  assert.ok(plan.assignments.every((row) => row.etaMinutes >= 1 && row.confidence >= 35));
});

test('phase 6 candidate scoring rejects stale GPS and estimates pickup distance', () => {
  const now = new Date('2026-06-13T08:00:00.000Z');
  const booking = {
    bookingId: 'RID-SCORE',
    mongoId: '665000000000000000000004',
    pickup: { lat: 24.5854, lng: 73.7125 },
    pickupLabel: 'Pickup',
    adminReviewStatus: 'approved',
    status: 'created',
    raw: { pickupCoordinates: { lat: 24.5854, lng: 73.7125 } }
  };
  const freshDriver = {
    driverId: 'driver-fresh',
    point: { lat: 24.586, lng: 73.713 },
    status: 'tracking',
    freshnessMinutes: 1,
    accuracy: 25,
    raw: { lat: 24.586, lng: 73.713, updatedAt: now }
  };
  const staleDriver = {
    ...freshDriver,
    driverId: 'driver-stale',
    freshnessMinutes: 30
  };

  const fresh = scoreCandidate(booking, freshDriver, { now });
  const stale = scoreCandidate(booking, staleDriver, { now });

  assert.equal(fresh.eligible, true);
  assert.ok(fresh.distanceKm <= 1);
  assert.ok(fresh.etaMinutes >= 1);
  assert.equal(stale.eligible, false);
  assert.equal(stale.reason, 'driver_location_stale');
  assert.ok(haversineDistanceKm({ lat: 24.5854, lng: 73.7125 }, { lat: 24.586, lng: 73.713 }) < 1);
});

test('phase 6 snapshot works without database access', async () => {
  const snapshot = await getRealtimeMatchingSnapshot({
    actor: { id: 'admin-test', role: 'admin', accountType: 'admin' }
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.databaseConnected, false);
  assert.equal(snapshot.version, PHASE6_REALTIME_MATCHING_VERSION);
  assert.equal(snapshot.actor.id, 'admin-test');
  assert.equal(snapshot.plan.counts.eligibleBookings, 0);
  assert.equal(snapshot.plan.counts.matchedBookings, 0);
});

test('phase 6 backend route and UI wiring preserves previous phases', () => {
  const appSource = read('backend/src/app.js');
  const adminRoutes = read('backend/src/routes/adminRoutes.js');
  const service = read('backend/src/services/realtimeMatchingEngineService.js');
  const adminApp = read('admin/app.html');
  const client = read('admin/js/realtime-matching-engine.js');
  const css = read('admin/css/admin-app.css');
  const serviceWorker = read('sw.js');

  assert.match(appSource, /getRealtimeMatchingEngineStatus/);
  assert.match(appSource, /['"]\/health\/realtime-matching-engine['"]/);
  assert.match(appSource, /['"]\/health\/admin-operations-center['"]/);
  assert.match(appSource, /['"]\/health\/push-notifications['"]/);
  assert.match(appSource, /['"]\/health\/security-hardening['"]/);
  assert.match(appSource, /['"]\/health\/gdpr-compliance['"]/);
  assert.match(appSource, /['"]\/health\/fraud-detection['"]/);
  assert.match(adminRoutes, /router\.use\(authenticate,\s*authorizeRole\(['"]admin['"]\)\)/);
  assert.match(adminRoutes, /router\.get\(['"]\/matching\/engine['"]/);
  assert.match(adminRoutes, /router\.post\(['"]\/matching\/run['"]/);
  assert.match(adminRoutes, /runRealtimeMatchingBatch/);
  assert.match(service, /Booking\.find/);
  assert.match(service, /LiveLocation\.find/);
  assert.match(service, /Notification\.insertMany/);
  assert.match(service, /mirrorBookingRealtimeUpdate/);
  assert.match(adminApp, /admin-operations-center\.js\?v=20260613-admin-ops-phase5/);
  assert.match(adminApp, /realtime-matching-engine\.js\?v=20260613-matching-phase6/);
  assert.match(client, /goindiaride_realtime_matching_phase6_v1/);
  assert.match(client, /data-realtime-matching-engine/);
  assert.match(client, /\/health\/realtime-matching-engine/);
  assert.match(client, /\/api\/admin\/matching\/engine/);
  assert.match(client, /\/api\/admin\/matching\/run/);
  assert.match(client, /\/api\/security\/csrf-token/);
  assert.match(client, /GoIndiaRideRealtimeMatchingEngine/);
  assert.match(css, /\.realtime-matching-panel/);
  assert.match(css, /\.matching-grid/);
  assert.match(css, /\.matching-signal/);
  assert.match(css, /\.matching-row/);
  assert.match(serviceWorker, /goindiaride-pwa-v63-20260613-location-phase7/);
  assert.match(serviceWorker, /admin\/js\/realtime-matching-engine\.js/);
  assert.match(serviceWorker, /admin\/js\/admin-operations-center\.js/);
  assert.match(serviceWorker, /addEventListener\(['"]push['"]/);
  assert.match(serviceWorker, /showNotification/);
});
