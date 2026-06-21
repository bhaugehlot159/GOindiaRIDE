process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-live-location-phase7';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-live-location-phase7';
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
  PHASE7_LIVE_LOCATION_TRACKING_VERSION,
  buildLocationSafetyEnvelope,
  classifyAccuracy,
  classifyFreshness,
  classifySpeed,
  getLiveLocationOperationsSnapshot,
  getLiveLocationTrackingStatus
} = require('../src/services/liveLocationTrackingService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 7 live location status exposes production controls', () => {
  const status = getLiveLocationTrackingStatus();

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.productionReady, true);
  assert.equal(status.version, PHASE7_LIVE_LOCATION_TRACKING_VERSION);
  assert.equal(status.mode, 'phase7-production-live-location-tracking');
  assert.equal(status.warningCount, 0);
  assert.equal(status.controls.authenticatedLocationWrites, 'active');
  assert.equal(status.controls.gpsWatchPosition, 'active');
  assert.equal(status.controls.gpsFreshnessSla, 'active');
  assert.equal(status.controls.accuracyQualityGate, 'active');
  assert.equal(status.controls.speedAnomalyDetection, 'active');
  assert.equal(status.controls.adminOperationsSnapshot, 'active');
  assert.equal(status.controls.realtimeDatabaseMirror, 'active');
  assert.equal(status.controls.privacyMinimizedAdminFeed, 'active');
  assert.match(status.endpoints.publicHealth, /\/health\/live-location-tracking/);
  assert.match(status.endpoints.adminSnapshot, /GET \/api\/admin\/live-location\/operations/);
  assert.match(status.endpoints.liveTrackingOperations, /GET \/api\/live-tracking\/operations/);
});

test('phase 7 public health endpoint is live without admin auth', async () => {
  const response = await request(app)
    .get('/health/live-location-tracking')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.productionReady, true);
  assert.equal(response.body.version, PHASE7_LIVE_LOCATION_TRACKING_VERSION);
});

test('phase 7 safety envelope classifies freshness, accuracy, and speed anomalies', () => {
  const now = new Date('2026-06-13T10:00:00.000Z');
  const fresh = buildLocationSafetyEnvelope({
    status: 'tracking',
    lat: 26.9124,
    lng: 75.7873,
    accuracy: 18,
    speed: 8,
    updatedAt: new Date('2026-06-13T09:59:00.000Z')
  }, now);
  const staleWeak = buildLocationSafetyEnvelope({
    status: 'tracking',
    accuracy: 180,
    speed: 2,
    updatedAt: new Date('2026-06-13T09:50:00.000Z')
  }, now);
  const overspeed = buildLocationSafetyEnvelope({
    status: 'tracking',
    accuracy: 35,
    speed: 40,
    updatedAt: new Date('2026-06-13T09:59:30.000Z')
  }, now);

  assert.equal(classifyFreshness({ status: 'tracking', updatedAt: new Date('2026-06-13T09:59:00.000Z') }, now), 'fresh');
  assert.equal(classifyAccuracy(18), 'precise');
  assert.equal(classifySpeed(40), 'overspeed');
  assert.equal(fresh.active, true);
  assert.equal(fresh.needsAttention, false);
  assert.equal(fresh.speedKmh, 28.8);
  assert.equal(staleWeak.freshnessStatus, 'stale');
  assert.equal(staleWeak.accuracyStatus, 'weak');
  assert.deepEqual(staleWeak.reasons.sort(), ['gps_stale', 'weak_accuracy']);
  assert.equal(overspeed.speedStatus, 'overspeed');
  assert.equal(overspeed.severity, 'critical');
});

test('phase 7 operations snapshot works without database access', async () => {
  const snapshot = await getLiveLocationOperationsSnapshot({
    actor: { id: 'admin-test', role: 'admin', accountType: 'admin' }
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.databaseConnected, false);
  assert.equal(snapshot.version, PHASE7_LIVE_LOCATION_TRACKING_VERSION);
  assert.equal(snapshot.actor.id, 'admin-test');
  assert.equal(snapshot.counts.totalRows, 0);
  assert.equal(snapshot.goldenSignals.availability.label, 'Active GPS');
  assert.equal(snapshot.alerts.length, 0);
  assert.equal(snapshot.items.length, 0);
  assert.equal(snapshot.privacy.locationHistoryReturned, false);
});

test('phase 7 backend route and UI wiring preserves previous phases', () => {
  const appSource = read('backend/src/app.js');
  const adminRoutes = read('backend/src/routes/adminRoutes.js');
  const liveRoutes = read('backend/src/routes/liveTrackingRoutes.js');
  const service = read('backend/src/services/liveLocationTrackingService.js');
  const driverClient = read('driver/js/driver-portal.js');
  const customerClient = read('js/customer-dashboard-live-bridge.js');
  const adminApp = read('admin/app.html');
  const adminClient = read('admin/js/live-location-operations.js');
  const css = read('admin/css/admin-app.css');
  const serviceWorker = read('sw.js');

  assert.match(appSource, /getLiveLocationTrackingStatus/);
  assert.match(appSource, /['"]\/health\/live-location-tracking['"]/);
  assert.match(appSource, /['"]\/health\/realtime-matching-engine['"]/);
  assert.match(appSource, /['"]\/health\/admin-operations-center['"]/);
  assert.match(adminRoutes, /router\.get\(['"]\/live-location\/operations['"]/);
  assert.match(adminRoutes, /getLiveLocationOperationsSnapshot/);
  assert.match(adminRoutes, /view_live_location_operations/);
  assert.match(liveRoutes, /buildLocationSafetyEnvelope/);
  assert.match(liveRoutes, /PHASE7_LIVE_LOCATION_TRACKING_VERSION/);
  assert.match(liveRoutes, /router\.get\(['"]\/operations['"]/);
  assert.match(liveRoutes, /safety:\s*buildLocationSafetyEnvelope/);
  assert.match(service, /LiveLocation\.find/);
  assert.match(service, /select\(['"]-history['"]\)/);
  assert.match(service, /privacyMinimizedAdminFeed/);
  assert.match(driverClient, /DRIVER_LIVE_LOCATION_PHASE7_VERSION/);
  assert.match(driverClient, /navigator\.geolocation\.watchPosition/);
  assert.match(driverClient, /geolocationOptions/);
  assert.match(customerClient, /CUSTOMER_LIVE_LOCATION_PHASE7_VERSION/);
  assert.match(customerClient, /CUSTOMER_LIVE_LOCATION_OPTIONS/);
  assert.match(adminApp, /live-location-operations\.js\?v=20260613-location-phase7/);
  assert.match(adminClient, /goindiaride_live_location_tracking_phase7_v1/);
  assert.match(adminClient, /data-live-location-operations/);
  assert.match(adminClient, /\/health\/live-location-tracking/);
  assert.match(adminClient, /\/api\/admin\/live-location\/operations/);
  assert.match(adminClient, /GoIndiaRideLiveLocationOperations/);
  assert.match(css, /\.live-location-ops-panel/);
  assert.match(css, /\.location-ops-grid/);
  assert.match(css, /\.location-row/);
  assert.match(serviceWorker, /goindiaride-pwa-v65-20260622-app-readiness/);
  assert.match(serviceWorker, /OFFLINE_URL/);
  assert.match(serviceWorker, /admin\/js\/live-location-operations\.js/);
  assert.match(serviceWorker, /admin\/js\/realtime-matching-engine\.js/);
  assert.match(serviceWorker, /addEventListener\(['"]push['"]/);
  assert.match(serviceWorker, /showNotification/);
});
