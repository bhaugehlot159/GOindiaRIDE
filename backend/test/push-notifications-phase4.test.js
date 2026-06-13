process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-push-phase4';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-push-phase4';
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
  PHASE4_PUSH_NOTIFICATION_VERSION,
  buildPushPayload,
  getPushNotificationStatus,
  getPushPublicKeyConfig,
  sanitizePushSubscription
} = require('../src/services/pushNotificationService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 4 push status exposes production web push controls', () => {
  const status = getPushNotificationStatus();

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.productionReady, true);
  assert.equal(status.version, PHASE4_PUSH_NOTIFICATION_VERSION);
  assert.equal(status.mode, 'phase4-production-push-notifications');
  assert.equal(status.warningCount, 0);
  assert.equal(status.controls.serviceWorkerPushHandler, 'active');
  assert.equal(status.controls.serviceWorkerClickHandler, 'active');
  assert.equal(status.controls.subscriptionStorage, 'active');
  assert.equal(status.controls.endpointRedaction, 'active');
  assert.equal(status.controls.encryptedDelivery, 'active');
  assert.equal(status.delivery.provider, 'web-push');
  assert.equal(status.delivery.privateKeyExposed, false);
  assert.match(status.endpoints.publicHealth, /\/health\/push-notifications/);
  assert.match(status.endpoints.publicKey, /\/api\/notifications\/push\/public-key/);
  assert.match(status.endpoints.subscribe, /POST \/api\/notifications\/push\/subscribe/);
  assert.match(status.endpoints.adminBroadcast, /POST \/api\/notifications\/admin\/push\/broadcast/);
});

test('phase 4 public health endpoint is live without auth', async () => {
  const response = await request(app)
    .get('/health/push-notifications')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.version, PHASE4_PUSH_NOTIFICATION_VERSION);
  assert.equal(response.body.delivery.privateKeyExposed, false);
});

test('phase 4 public VAPID key endpoint does not expose private key', async () => {
  const directConfig = await getPushPublicKeyConfig();
  assert.equal(directConfig.ok, true);
  assert.equal(directConfig.version, PHASE4_PUSH_NOTIFICATION_VERSION);
  assert.ok(directConfig.publicKey.length > 40);
  assert.equal(Object.prototype.hasOwnProperty.call(directConfig, 'privateKey'), false);

  const response = await request(app)
    .get('/api/notifications/push/public-key')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.version, PHASE4_PUSH_NOTIFICATION_VERSION);
  assert.ok(response.body.publicKey.length > 40);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body, 'privateKey'), false);
});

test('phase 4 subscribe route remains authenticated in the router', () => {
  const routeSource = read('backend/src/routes/notificationRoutes.js');

  assert.match(routeSource, /router\.post\(['"]\/push\/subscribe['"],\s*authenticate/);
  assert.match(routeSource, /router\.post\(['"]\/push\/unsubscribe['"],\s*authenticate/);
  assert.match(routeSource, /router\.post\(['"]\/push\/test['"],\s*authenticate/);
  assert.match(routeSource, /router\.post\(['"]\/admin\/push\/broadcast['"],\s*authenticate,\s*requireAdmin/);
});

test('phase 4 subscription validation requires secure endpoint and encryption keys', () => {
  assert.throws(
    () => sanitizePushSubscription({ endpoint: 'http://example.com/push', keys: { p256dh: 'a', auth: 'b' } }),
    /valid HTTPS push endpoint/
  );
  assert.throws(
    () => sanitizePushSubscription({ endpoint: 'https://example.com/push', keys: { p256dh: '', auth: '' } }),
    /encryption keys/
  );

  const sanitized = sanitizePushSubscription({
    endpoint: 'https://push.example.com/send/token',
    expirationTime: null,
    keys: {
      p256dh: 'client-public-key',
      auth: 'client-auth-secret'
    }
  });

  assert.equal(sanitized.endpoint, 'https://push.example.com/send/token');
  assert.equal(sanitized.keys.p256dh, 'client-public-key');
  assert.equal(sanitized.keys.auth, 'client-auth-secret');
  assert.equal(sanitized.endpointHash.length, 64);
});

test('phase 4 push payload stays compact for browser push services', () => {
  const { payload, serialized } = buildPushPayload({
    title: 'Ride assigned',
    message: 'A'.repeat(2000),
    url: '/pages/customer-dashboard.html',
    type: 'driver_assigned',
    notificationId: 'notification-1'
  });

  assert.equal(payload.title, 'Ride assigned');
  assert.equal(payload.data.url, '/pages/customer-dashboard.html');
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= 3200);
});

test('phase 4 push wiring is present without removing previous phase controls', () => {
  const appSource = read('backend/src/app.js');
  const routeSource = read('backend/src/routes/notificationRoutes.js');
  const serviceSource = read('backend/src/services/pushNotificationService.js');
  const subscriptionModel = read('backend/src/models/PushSubscription.js');
  const runtimeConfigModel = read('backend/src/models/PushRuntimeConfig.js');
  const serviceWorker = read('sw.js');
  const pushClient = read('js/push-notifications.js');
  const customerDashboard = read('pages/customer-dashboard.html');
  const driverDashboard = read('pages/driver-dashboard.html');
  const adminApp = read('admin/app.html');
  const customerPortal = read('customer/index.html');

  assert.match(appSource, /getPushNotificationStatus/);
  assert.match(appSource, /['"]\/health\/push-notifications['"]/);
  assert.match(appSource, /['"]\/health\/fraud-detection['"]/);
  assert.match(appSource, /['"]\/health\/gdpr-compliance['"]/);
  assert.match(appSource, /['"]\/health\/security-hardening['"]/);
  assert.match(routeSource, /['"]\/push\/public-key['"]/);
  assert.match(routeSource, /['"]\/push\/subscribe['"]/);
  assert.match(routeSource, /['"]\/push\/unsubscribe['"]/);
  assert.match(routeSource, /['"]\/push\/test['"]/);
  assert.match(routeSource, /['"]\/admin\/push\/broadcast['"]/);
  assert.match(routeSource, /authenticate,\s*requireAdmin/);
  assert.match(serviceSource, /web-push/);
  assert.match(serviceSource, /generateVAPIDKeys/);
  assert.match(serviceSource, /privateKeyExposed:\s*false/);
  assert.match(subscriptionModel, /endpointHash/);
  assert.match(subscriptionModel, /select:\s*false/);
  assert.match(runtimeConfigModel, /database_auto_provision/);
  assert.match(serviceWorker, /goindiaride-pwa-v62-20260613-matching-phase6/);
  assert.match(serviceWorker, /addEventListener\(['"]push['"]/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /addEventListener\(['"]notificationclick['"]/);
  assert.match(pushClient, /PushManager/);
  assert.match(pushClient, /Notification\.requestPermission/);
  assert.match(pushClient, /\/api\/notifications\/push\/subscribe/);
  assert.match(customerDashboard, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(driverDashboard, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(adminApp, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(customerPortal, /push-notifications\.js\?v=20260613-push-phase4/);
});
