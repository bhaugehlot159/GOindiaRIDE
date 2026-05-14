const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('admin portal exposes customer booking creation controls', () => {
  const appHtml = readRepoFile('admin/app.html');
  const adminApp = readRepoFile('admin/js/admin-app.js');

  assert.match(appHtml, /id="addBookingForCustomerBtn"/);
  assert.match(adminApp, /function openAdminCreateBookingModal\(/);
  assert.match(adminApp, /function handleAdminCreateBookingSubmit\(/);
  assert.match(adminApp, /admin_portal_customer_booking/);
  assert.match(adminApp, /booking_created_by_admin/);
  assert.match(adminApp, /\/api\/bookings\/fallback\/admin-review-queue/);
});

test('admin booking table has a dedicated all-detail search control', () => {
  const appHtml = readRepoFile('admin/app.html');
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const adminCss = readRepoFile('admin/css/admin-app.css');

  assert.match(appHtml, /id="bookingSearchInput"/);
  assert.match(appHtml, /Search any booking detail/);
  assert.match(adminCss, /\.booking-search-field/);
  assert.match(adminApp, /bookingQuery/);
  assert.match(adminApp, /function collectBookingSearchTokens\(/);
  assert.match(adminApp, /function bookingMatchesSearch\(/);
  assert.match(adminApp, /#bookingSearchInput/);
  assert.match(adminApp, /renderBookingTable\(\)/);
});

test('admin customer booking creator only targets real customer records', () => {
  const adminApp = readRepoFile('admin/js/admin-app.js');

  assert.match(adminApp, /function adminRowLooksDriver\(/);
  assert.match(adminApp, /function adminRowLooksCustomer\(/);
  assert.match(adminApp, /function adminIdentityName\(/);
  assert.match(adminApp, /function firstUsableAdminPhone\(/);
  assert.match(adminApp, /identityName\.includes\("driver"\) && !hasCustomerContact/);
  assert.match(adminApp, /Enter a full customer phone number/);
  assert.match(adminApp, /getCustomerEntityKey/);
  assert.match(adminApp, /if \(!phone && !email\) return;/);
  assert.doesNotMatch(adminApp, /const selectedCustomer = getCustomerRows\(\)\[0\]/);
});

test('admin booking view separates customer bookings from driver-side rows', () => {
  const appHtml = readRepoFile('admin/app.html');
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const adminCss = readRepoFile('admin/css/admin-app.css');

  assert.match(appHtml, /id="driverBookingTableBody"/);
  assert.match(appHtml, /id="customerBookingCount"/);
  assert.match(appHtml, /id="driverBookingCount"/);
  assert.match(adminCss, /\.booking-split-summary/);
  assert.match(adminApp, /CUSTOMER_BOOKING_SPLIT_KEY/);
  assert.match(adminApp, /DRIVER_BOOKING_SPLIT_KEY/);
  assert.match(adminApp, /function getAdminBookingRecordScope\(/);
  assert.match(adminApp, /function isDriverOnlyOperationalRecord\(/);
  assert.match(adminApp, /function loadBookingSplit\(/);
  assert.match(adminApp, /function renderDriverBookingRequests\(/);
  assert.match(adminApp, /state\.driverBookings/);
  assert.match(adminApp, /persistBookingSplitViews\(customerBookings, driverBookings\)/);
  assert.match(adminApp, /ADMIN_INTERNAL_BOOKING_SCAN_SKIP_KEYS\.has\(key\)/);
});

test('admin customer and driver split stores are protected by data preservation', () => {
  const preservationGuard = readRepoFile('js/data-preservation-guard.js');

  assert.match(preservationGuard, /goindiaride_admin_customer_bookings_current_v1/);
  assert.match(preservationGuard, /goindiaride_admin_driver_bookings_current_v1/);
  assert.match(preservationGuard, /goindiaride_admin_booking_split_views_current_v1/);
});

test('admin edit/create sync reaches customer portal without depending on PortalConnector', () => {
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const customerDashboard = readRepoFile('pages/customer-dashboard.html');

  assert.match(adminApp, /new BroadcastChannel\("goindiaride-admin-booking-sync"\)/);
  assert.match(customerDashboard, /new BroadcastChannel\('goindiaride-admin-booking-sync'\)/);
  assert.match(customerDashboard, /handleAdminBookingSyncSignal/);
  assert.match(customerDashboard, /booking_created_by_admin/);

  const storageListenerIndex = customerDashboard.indexOf("window.addEventListener('storage'");
  const portalConnectorReturnIndex = customerDashboard.indexOf("if (!window.PortalConnector) return;");
  assert.ok(storageListenerIndex > -1, 'customer dashboard should listen for storage sync events');
  assert.ok(portalConnectorReturnIndex > -1, 'customer dashboard should still guard PortalConnector usage');
  assert.ok(
    storageListenerIndex < portalConnectorReturnIndex,
    'admin booking sync listener must be registered before PortalConnector guard'
  );
});

test('changed inline scripts still compile', () => {
  const inlineScriptRegex = new RegExp('<script\\b(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>', 'gi');
  for (const relativePath of ['admin/app.html', 'pages/customer-dashboard.html', 'pages/booking.html']) {
    const html = readRepoFile(relativePath);
    let index = 0;
    for (const match of html.matchAll(inlineScriptRegex)) {
      index += 1;
      assert.doesNotThrow(() => {
        new vm.Script(match[1], { filename: `${relativePath}:inline-script-${index}` });
      });
    }
  }
});
