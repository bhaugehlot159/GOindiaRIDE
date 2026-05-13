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
