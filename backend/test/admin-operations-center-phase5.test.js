process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-admin-ops-phase5';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-admin-ops-phase5';
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
  PHASE5_ADMIN_OPERATIONS_CENTER_VERSION,
  getAdminOperationsCenterSnapshot,
  getAdminOperationsCenterStatus
} = require('../src/services/adminOperationsCenterService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 5 admin operations status exposes production controls', () => {
  const status = getAdminOperationsCenterStatus();

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.productionReady, true);
  assert.equal(status.version, PHASE5_ADMIN_OPERATIONS_CENTER_VERSION);
  assert.equal(status.mode, 'phase5-production-admin-operations-control-center');
  assert.equal(status.warningCount, 0);
  assert.match(status.endpoints.publicHealth, /\/health\/admin-operations-center/);
  assert.match(status.endpoints.adminSnapshot, /GET \/api\/admin\/operations\/center/);
  assert.equal(status.controls.operationsDashboard, 'active');
  assert.equal(status.controls.dispatchQueue, 'active');
  assert.equal(status.controls.incidentQueue, 'active');
  assert.equal(status.controls.liveDriverLocationSla, 'active');
  assert.ok(status.standards.some((item) => /four golden signals/i.test(item)));
  assert.ok(status.standards.some((item) => /incident/i.test(item)));
});

test('phase 5 public health endpoint is live without admin auth', async () => {
  const response = await request(app)
    .get('/health/admin-operations-center')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.productionReady, true);
  assert.equal(response.body.version, PHASE5_ADMIN_OPERATIONS_CENTER_VERSION);
  assert.equal(response.body.controls.adminOnlySnapshot, 'active');
});

test('phase 5 snapshot works without database and keeps previous phase health connected', async () => {
  const snapshot = await getAdminOperationsCenterSnapshot({
    actor: { id: 'admin-test', role: 'admin', accountType: 'admin' }
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.active, true);
  assert.equal(snapshot.databaseConnected, false);
  assert.equal(snapshot.version, PHASE5_ADMIN_OPERATIONS_CENTER_VERSION);
  assert.equal(snapshot.actor.id, 'admin-test');
  assert.equal(snapshot.counts.pendingBookings, 0);
  assert.equal(snapshot.counts.dispatchPressure, 0);
  assert.equal(snapshot.goldenSignals.latency.label, 'Queue age');
  assert.equal(snapshot.goldenSignals.traffic.label, 'Bookings 24h');
  assert.equal(snapshot.goldenSignals.errors.label, 'Open incidents');
  assert.equal(snapshot.goldenSignals.saturation.label, 'Dispatch pressure');
  assert.equal(snapshot.phaseHealth.fraud.active, true);
  assert.equal(snapshot.phaseHealth.gdpr.active, true);
  assert.equal(snapshot.phaseHealth.security.active, true);
  assert.equal(snapshot.phaseHealth.push.active, true);
  assert.ok(snapshot.runbook.some((row) => row.id === 'verify_phase_health' && row.active === true));
});

test('phase 5 backend route remains admin-gated and does not replace older routes', () => {
  const appSource = read('backend/src/app.js');
  const adminRoutes = read('backend/src/routes/adminRoutes.js');
  const service = read('backend/src/services/adminOperationsCenterService.js');

  assert.match(appSource, /getAdminOperationsCenterStatus/);
  assert.match(appSource, /['"]\/health\/admin-operations-center['"]/);
  assert.match(appSource, /app\.use\(['"]\/api\/admin['"], adminRoutes\)/);
  assert.match(appSource, /['"]\/health\/fraud-detection['"]/);
  assert.match(appSource, /['"]\/health\/gdpr-compliance['"]/);
  assert.match(appSource, /['"]\/health\/security-hardening['"]/);
  assert.match(appSource, /['"]\/health\/push-notifications['"]/);
  assert.match(adminRoutes, /router\.use\(authenticate,\s*authorizeRole\(['"]admin['"]\)\)/);
  assert.match(adminRoutes, /router\.get\(['"]\/operations\/center['"]/);
  assert.match(adminRoutes, /getAdminOperationsCenterSnapshot/);
  assert.match(adminRoutes, /view_operations_center/);
  assert.match(service, /Google SRE four golden signals/);
  assert.match(service, /SecurityIncident\.find/);
  assert.match(service, /LiveLocation\.countDocuments/);
  assert.match(service, /PushSubscription\.countDocuments/);
});

test('phase 5 admin UI is wired as a modular operations center', () => {
  const adminApp = read('admin/app.html');
  const client = read('admin/js/admin-operations-center.js');
  const css = read('admin/css/admin-app.css');
  const serviceWorker = read('sw.js');

  assert.match(adminApp, /admin-app\.js\?v=20260610-sms-reference1/);
  assert.match(adminApp, /admin-live-control-center\.js\?v=20260613-fraud-phase1/);
  assert.match(adminApp, /admin-operations-center\.js\?v=20260613-admin-ops-phase5/);
  assert.match(client, /goindiaride_admin_operations_center_phase5_v1/);
  assert.match(client, /data-admin-operations-center/);
  assert.match(client, /Admin Operations Command Center/);
  assert.match(client, /\/health\/admin-operations-center/);
  assert.match(client, /\/api\/admin\/operations\/center/);
  assert.match(client, /\/health\/fraud-detection/);
  assert.match(client, /\/health\/gdpr-compliance/);
  assert.match(client, /\/health\/security-hardening/);
  assert.match(client, /\/health\/push-notifications/);
  assert.match(client, /GoIndiaRideAdminOperationsCenter/);
  assert.match(css, /\.operations-center-panel/);
  assert.match(css, /\.ops-command-grid/);
  assert.match(css, /\.ops-signal-card/);
  assert.match(css, /\.ops-lane/);
  assert.match(css, /\.ops-health-pill/);
  assert.match(serviceWorker, /goindiaride-pwa-v61-20260613-admin-ops-phase5/);
  assert.match(serviceWorker, /admin\/js\/admin-operations-center\.js/);
  assert.match(serviceWorker, /addEventListener\(['"]push['"]/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /addEventListener\(['"]notificationclick['"]/);
});
