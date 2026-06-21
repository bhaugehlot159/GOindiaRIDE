process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-required-for-testing-only';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-min-32-chars-required-for-testing-only';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-app-readiness-test';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key';
process.env.GLOBAL_LOCKDOWN_SHIELD_ENABLED = 'false';
process.env.ROUTE_GUARD_POLICY_SHIELD_ENABLED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const app = require('../src/app');
const { APP_READINESS_VERSION, getAppReadinessStatus } = require('../src/services/appReadinessService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

test('PWA manifests are valid JSON and expose separate public customer driver admin apps', () => {
  const publicManifest = readJson('manifest.webmanifest');
  const customerManifest = readJson('customer/manifest.webmanifest');
  const driverManifest = readJson('driver/manifest.webmanifest');
  const adminManifest = readJson('admin/manifest.webmanifest');

  assert.equal(publicManifest.id, '/?app=goindiaride-public');
  assert.equal(customerManifest.id, '/customer/?app=goindiaride-customer');
  assert.equal(driverManifest.id, '/driver/?app=goindiaride-driver');
  assert.equal(adminManifest.id, '/admin/?app=goindiaride-admin');

  for (const manifest of [publicManifest, customerManifest, driverManifest, adminManifest]) {
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.start_url.startsWith('/'));
    assert.ok(Array.isArray(manifest.icons));
    assert.ok(manifest.icons.some((icon) => String(icon.sizes).includes('192x192')));
    assert.ok(manifest.icons.some((icon) => String(icon.sizes).includes('512x512')));
    assert.ok(manifest.icons.some((icon) => String(icon.purpose || '').includes('maskable')));
  }

  assert.ok(publicManifest.shortcuts.some((shortcut) => shortcut.url.includes('/book-cab.html')));
  assert.ok(customerManifest.shortcuts.some((shortcut) => shortcut.url.includes('/pages/booking.html')));
  assert.ok(driverManifest.shortcuts.some((shortcut) => shortcut.url.includes('/driver/index.html')));
  assert.ok(adminManifest.shortcuts.some((shortcut) => shortcut.url.includes('/admin/app.html')));
});

test('service worker and app shell provide offline, push, install and Firebase messaging readiness', () => {
  const serviceWorker = read('sw.js');
  const pwaShell = read('js/pwa-app-shell.js');
  const firebaseMessagingWorker = read('firebase-messaging-sw.js');
  const offlinePage = read('offline.html');

  assert.match(serviceWorker, /goindiaride-pwa-v65-20260622-app-readiness/);
  assert.match(serviceWorker, /const OFFLINE_URL = '\.\/offline\.html'/);
  assert.match(serviceWorker, /apiOfflineResponse/);
  assert.match(serviceWorker, /isApiRequest/);
  assert.match(serviceWorker, /addEventListener\('push'/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(serviceWorker, /customer\/manifest\.webmanifest/);
  assert.match(serviceWorker, /driver\/manifest\.webmanifest/);
  assert.match(serviceWorker, /admin\/manifest\.webmanifest/);

  assert.match(pwaShell, /beforeinstallprompt/);
  assert.match(pwaShell, /navigator\.serviceWorker\.register/);
  assert.match(pwaShell, /GoIndiaRidePWA/);
  assert.match(pwaShell, /getSurface/);
  assert.match(firebaseMessagingWorker, /importScripts\('\/sw\.js\?v=20260622-app-readiness1'\)/);
  assert.match(offlinePage, /You are offline/);
});

test('main app pages link the correct manifests, splash asset, push client and PWA bootstrap', () => {
  const files = {
    home: read('index.html'),
    publicBooking: read('book-cab.html'),
    customer: read('customer/index.html'),
    driver: read('driver/index.html'),
    admin: read('admin/app.html'),
    booking: read('pages/booking.html'),
    customerDashboard: read('pages/customer-dashboard.html'),
    driverDashboard: read('pages/driver-dashboard.html'),
    login: read('pages/login.html')
  };

  assert.match(files.home, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.publicBooking, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.customer, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.driver, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.admin, /href="\.\/manifest\.webmanifest"/);
  assert.match(files.booking, /href="\.\.\/customer\/manifest\.webmanifest"/);
  assert.match(files.customerDashboard, /href="\.\.\/customer\/manifest\.webmanifest"/);
  assert.match(files.driverDashboard, /href="\.\.\/driver\/manifest\.webmanifest"/);
  assert.match(files.login, /href="\.\.\/manifest\.webmanifest"/);

  for (const [name, source] of Object.entries(files)) {
    assert.match(source, /apple-touch-startup-image/, `${name} missing startup image`);
    assert.match(source, /pwa-app-shell\.js\?v=20260622-app-readiness1/, `${name} missing PWA shell`);
  }

  assert.match(files.customer, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.driver, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.admin, /push-notifications\.js\?v=20260613-push-phase4/);
  assert.match(files.booking, /push-notifications\.js\?v=20260613-push-phase4/);
});

test('legal and app-store data safety disclosure pages are linked and indexed', () => {
  const home = read('index.html');
  const dataSafety = read('pages/legal/data-safety.html');
  const sitemap = read('sitemap.xml');

  assert.match(home, /pages\/legal\/privacy-policy\.html/);
  assert.match(home, /pages\/legal\/terms-and-conditions\.html/);
  assert.match(home, /pages\/legal\/refund-policy\.html/);
  assert.match(home, /pages\/legal\/data-safety\.html/);
  assert.match(dataSafety, /Data Safety Details/);
  assert.match(dataSafety, /Driver GPS/);
  assert.match(dataSafety, /Razorpay/);
  assert.match(dataSafety, /PayPal/);
  assert.match(sitemap, /pages\/legal\/data-safety\.html/);
});

test('app readiness health contract reports all app-conversion wiring', async () => {
  const directStatus = getAppReadinessStatus();
  assert.equal(directStatus.version, APP_READINESS_VERSION);
  assert.equal(directStatus.ok, true);
  assert.equal(directStatus.warningCount, 0);
  assert.equal(directStatus.pwa.rootManifest, true);
  assert.equal(directStatus.pwa.offlineFallback, true);
  assert.equal(directStatus.pwa.firebaseMessagingWorker, true);
  assert.equal(directStatus.surfaces.customer.pushClient, true);
  assert.equal(directStatus.surfaces.driver.pushClient, true);
  assert.equal(directStatus.payment.routes.razorpayVerify, true);
  assert.equal(directStatus.payment.routes.paypalCapture, true);
  assert.equal(directStatus.otp.recaptchaVerifier, true);
  assert.equal(directStatus.legal.dataSafety, true);

  const response = await request(app)
    .get('/health/app-readiness')
    .expect(200);

  assert.equal(response.body.version, APP_READINESS_VERSION);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.appStores.googlePlayDataSafetyPage, '/pages/legal/data-safety.html');
});
