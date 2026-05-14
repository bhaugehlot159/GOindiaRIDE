const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function createLocalStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      const safeKey = String(key);
      return store.has(safeKey) ? store.get(safeKey) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    }
  };
}

function createNode(id = '') {
  return {
    id,
    value: '',
    checked: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      }
    },
    addEventListener() {},
    appendChild(child) {
      return child;
    },
    remove() {},
    querySelector(selector) {
      return this.__querySelector(selector);
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    __querySelector() {
      return null;
    }
  };
}

function runAdminAppWithBookingRows(rows) {
  const nodes = new Map();
  function byId(id) {
    if (!nodes.has(id)) {
      const node = createNode(id);
      node.__querySelector = querySelector;
      nodes.set(id, node);
    }
    return nodes.get(id);
  }
  function querySelector(selector) {
    if (selector && selector.startsWith('#')) return byId(selector.slice(1));
    return null;
  }

  const localStorage = createLocalStorage();
  localStorage.setItem('goindiaride_active_bookings', JSON.stringify(rows));
  const domListeners = {};
  const sandbox = {
    console,
    localStorage,
    sessionStorage: createLocalStorage(),
    location: {
      hostname: 'localhost',
      origin: 'http://localhost:8080',
      href: 'http://localhost:8080/admin/app.html'
    },
    document: {
      body: byId('body'),
      documentElement: {
        dataset: {},
        setAttribute() {},
        getAttribute() {
          return null;
        }
      },
      querySelector,
      querySelectorAll() {
        return [];
      },
      createElement(tag) {
        return createNode(tag);
      },
      addEventListener(type, handler) {
        domListeners[type] = handler;
      },
      getElementById: byId
    },
    addEventListener() {},
    dispatchEvent() {},
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
      }
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    fetch() {
      return Promise.resolve({ ok: false, json: async () => ({}) });
    },
    BroadcastChannel: class BroadcastChannel {
      postMessage() {}
      close() {}
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(readRepoFile('admin/js/admin-app.js'), sandbox, { filename: 'admin/js/admin-app.js' });
  domListeners.DOMContentLoaded();

  return {
    customerHtml: byId('bookingTableBody').innerHTML,
    customerSplit: JSON.parse(localStorage.getItem('goindiaride_admin_customer_bookings_current_v1') || '[]'),
    driverSplit: JSON.parse(localStorage.getItem('goindiaride_admin_driver_bookings_current_v1') || '[]')
  };
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
  const customerFolderHtml = readRepoFile('admin/customer-bookings/index.html');
  const driverFolderHtml = readRepoFile('admin/driver-bookings/index.html');
  const customerFolderJs = readRepoFile('admin/customer-bookings/customer-bookings.js');
  const driverFolderJs = readRepoFile('admin/driver-bookings/driver-bookings.js');

  assert.doesNotMatch(appHtml, /id="driverBookingTableBody"/);
  assert.match(appHtml, /\.\/driver-bookings\//);
  assert.match(customerFolderHtml, /id="customerFolderTableBody"/);
  assert.match(driverFolderHtml, /id="driverFolderTableBody"/);
  assert.match(customerFolderJs, /Customer full saved payload/);
  assert.match(driverFolderJs, /Driver full saved payload/);
  assert.doesNotMatch(customerFolderJs, /class="booking-full-details" open/);
  assert.doesNotMatch(driverFolderJs, /class="booking-full-details" open/);
  assert.match(appHtml, /id="customerBookingCount"/);
  assert.doesNotMatch(appHtml, /id="autoRefreshToggle" type="checkbox" checked/);
  assert.match(appHtml, /manual review without page jumping/);
  assert.match(adminCss, /\.booking-split-summary/);
  assert.match(adminCss, /\.booking-folder-link/);
  assert.match(adminCss, /repeat\(auto-fit, minmax\(240px, 1fr\)\)/);
  assert.match(adminCss, /word-break: normal/);
  assert.match(adminApp, /CUSTOMER_BOOKING_SPLIT_KEY/);
  assert.match(adminApp, /DRIVER_BOOKING_SPLIT_KEY/);
  assert.match(adminApp, /AUTO_REFRESH_DISABLED_MIGRATION_KEY/);
  assert.match(adminApp, /GoIndiaAdminBookingSplit/);
  assert.match(adminApp, /function getAdminBookingRecordScope\(/);
  assert.match(adminApp, /function isDriverOnlyOperationalRecord\(/);
  assert.match(adminApp, /function loadBookingSplit\(/);
  assert.match(adminApp, /function renderDriverBookingRequests\(/);
  assert.doesNotMatch(adminApp, /renderBookingFullDetails\(booking, \{ open: true \}\)/);
  assert.match(adminApp, /state\.driverBookings/);
  assert.match(adminApp, /persistBookingSplitViews\(customerBookings, driverBookings\)/);
  assert.match(adminApp, /ADMIN_INTERNAL_BOOKING_SCAN_SKIP_KEYS\.has\(key\)/);
});

test('admin booking classifier moves DRV placeholder rows out of customer bookings', () => {
  const result = runAdminAppWithBookingRows([
    {
      id: 'DRV1778672498873',
      bookingId: 'DRV1778672498873',
      customerName: 'New Verified Driver',
      customerPhone: '+91',
      pickup: 'Pickup pending',
      dropoff: 'Drop pending',
      vehicleType: 'Sedan',
      fare: 0,
      status: 'rejected',
      createdAt: '2026-05-13T11:41:00.000Z'
    },
    {
      id: 'RID1778669288778',
      bookingId: 'RID1778669288778',
      customerName: 'Bhavesh Meghwal',
      customerPhone: '+918239909104',
      pickup: 'Chittorgarh Fort, Udaipur',
      dropoff: 'Udaipur, Rajasthan',
      fare: 2155,
      distanceKm: 124,
      status: 'approved',
      createdAt: '2026-05-13T10:48:00.000Z'
    }
  ]);

  assert.match(result.customerHtml, /RID1778669288778/);
  assert.doesNotMatch(result.customerHtml, /DRV1778672498873/);
  assert.equal(result.customerSplit.length, 1);
  assert.equal(result.customerSplit[0].bookingId, 'RID1778669288778');
  assert.equal(result.driverSplit.length, 1);
  assert.equal(result.driverSplit[0].driverBookingId, 'DRV1778672498873');
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
  for (const relativePath of ['admin/app.html', 'admin/customer-bookings/index.html', 'admin/driver-bookings/index.html', 'pages/customer-dashboard.html', 'pages/booking.html']) {
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

test('separate admin booking folder scripts compile', () => {
  for (const relativePath of ['admin/customer-bookings/customer-bookings.js', 'admin/driver-bookings/driver-bookings.js']) {
    assert.doesNotThrow(() => {
      new vm.Script(readRepoFile(relativePath), { filename: relativePath });
    });
  }
});
