const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readRepoFileIfExists(relativePath) {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
}

function readRepoFilesUnder(relativeDir, extension = '.js') {
  const baseDir = path.join(root, relativeDir);
  if (!fs.existsSync(baseDir)) return [];
  const rows = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        rows.push(fs.readFileSync(fullPath, 'utf8'));
      }
    }
  }
  walk(baseDir);
  return rows;
}

function readCustomerDashboardRuntimeChunks() {
  const legacyBundle = readRepoFileIfExists('customer/chunks/dashboard/scripts/dashboard-page.js');
  if (legacyBundle) return legacyBundle;
  return readRepoFilesUnder('customer/chunks/dashboard/scripts', '.js').join('\n');
}

const ADMIN_ENTERPRISE_CHUNKS = [
  'admin/chunks/enterprise/registry.js',
  'admin/chunks/enterprise/sources-official.js',
  'admin/chunks/enterprise/modules-corporate.js',
  'admin/chunks/enterprise/modules-booking-programs.js',
  'admin/chunks/enterprise/modules-finance-reports.js',
  'admin/chunks/enterprise/modules-fleet.js',
  'admin/chunks/enterprise/modules-safety.js',
  'admin/chunks/enterprise/modules-integrations.js',
  'admin/chunks/enterprise/backend-routes.js',
  'admin/chunks/enterprise/benchmark-extensions.js'
];

function readAdminEnterpriseChunkSource() {
  return ADMIN_ENTERPRISE_CHUNKS.map(readRepoFile).join('\n');
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
  localStorage.setItem('accessToken', 'live-admin-token');
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

  ADMIN_ENTERPRISE_CHUNKS.forEach((chunkPath) => {
    vm.runInNewContext(readRepoFile(chunkPath), sandbox, { filename: chunkPath });
  });
  vm.runInNewContext(readRepoFile('admin/js/admin-app.js'), sandbox, { filename: 'admin/js/admin-app.js' });
  domListeners.DOMContentLoaded();

  return {
    localStorage,
    domListeners,
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

test('admin app exposes competitor benchmark and live readiness controls', () => {
  const appHtml = readRepoFile('admin/app.html');
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const adminCss = readRepoFile('admin/css/admin-app.css');

  assert.match(appHtml, /data-view="benchmark"/);
  assert.match(appHtml, /id="benchmarkMatrixList"/);
  assert.match(appHtml, /id="benchmarkConnectionList"/);
  assert.match(appHtml, /data-benchmark-action="apply"/);
  assert.match(adminApp, /BENCHMARK_REVIEW_KEY/);
  assert.match(adminApp, /BENCHMARK_SOURCE_NOTES/);
  assert.match(adminApp, /function applyBenchmarkBaseline\(/);
  assert.match(adminApp, /function renderBenchmark\(/);
  assert.match(adminApp, /privateCompetitorAdminAccess:\s*false/);
  assert.match(adminApp, /connectAllPortalFeatures\(\{ audit: true \}\)/);
  assert.match(adminCss, /\.benchmark-grid/);
  assert.match(adminCss, /\.benchmark-check-row/);
});

test('admin app exposes enterprise and fleet parity controls', () => {
  const appHtml = readRepoFile('admin/app.html');
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const adminCss = readRepoFile('admin/css/admin-app.css');
  const enterpriseChunks = readAdminEnterpriseChunkSource();

  assert.match(appHtml, /data-view="enterprise"/);
  assert.match(appHtml, /id="enterpriseModuleList"/);
  assert.match(appHtml, /id="enterpriseReadinessList"/);
  assert.match(appHtml, /data-enterprise-action="connect-all"/);
  assert.match(appHtml, /data-enterprise-action="run-live-test"/);
  ADMIN_ENTERPRISE_CHUNKS.forEach((chunkPath) => {
    const htmlPath = `./${chunkPath.replace(/^admin\//, '')}`;
    assert.match(appHtml, new RegExp(htmlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(adminApp, /ENTERPRISE_CONTROL_KEY/);
  assert.match(adminApp, /ENTERPRISE_MODULES/);
  assert.match(adminApp, /ENTERPRISE_BACKEND_ENDPOINTS/);
  assert.match(adminApp, /getAdminEnterpriseRegistry/);
  assert.match(adminApp, /mergeEnterpriseRowsById/);
  assert.match(adminApp, /function connectEnterpriseModules\(/);
  assert.match(adminApp, /function runEnterpriseLiveTest\(/);
  assert.match(adminApp, /function renderEnterprise\(/);
  assert.match(enterpriseChunks, /corporate_wallet_billing/);
  assert.match(enterpriseChunks, /guest_rides_central_booking/);
  assert.match(enterpriseChunks, /employee_bulk_api_lifecycle/);
  assert.match(enterpriseChunks, /monthly_billing_statements/);
  assert.match(enterpriseChunks, /fraud_abuse_detection/);
  assert.match(enterpriseChunks, /webhooks_partner_logs/);
  assert.match(adminCss, /\.enterprise-grid/);
  assert.match(adminCss, /\.enterprise-module-row/);
});

test('enterprise parity catalog is split into small chunks', () => {
  const enterpriseChunks = readAdminEnterpriseChunkSource();
  const moduleIds = Array.from(enterpriseChunks.matchAll(/id:\s*"([^"]+)"/g)).map((match) => match[1]);
  const uniqueModuleIds = new Set(moduleIds.filter((id) => !id.startsWith('guest_central') && !id.startsWith('bulk_employee')));

  assert.ok(ADMIN_ENTERPRISE_CHUNKS.length >= 8, 'enterprise catalog should be split into several chunks');
  ADMIN_ENTERPRISE_CHUNKS.forEach((chunkPath) => {
    const stat = fs.statSync(path.join(root, chunkPath));
    assert.ok(stat.size < 12000, `${chunkPath} should stay small enough for split loading`);
  });
  assert.ok(uniqueModuleIds.size >= 40, 'enterprise catalog should cover full corporate/fleet/admin parity modules');
  assert.match(enterpriseChunks, /registerModules/);
  assert.match(enterpriseChunks, /registerBackend/);
  assert.match(enterpriseChunks, /registerBenchmark/);
});

test('admin enterprise connect-all stores live controlled modules', () => {
  const result = runAdminAppWithBookingRows([
    {
      bookingId: 'BKT-ENT-1',
      pickup: 'Jaipur Airport',
      dropoff: 'MI Road',
      customerName: 'Corporate Rider',
      customerPhone: '+919999999999',
      paymentMethod: 'corporate_wallet',
      totalFare: 1250,
      status: 'pending_admin_review',
      locationPins: {
        pickup: { coordinates: { lat: 26.8242, lng: 75.8122 } }
      }
    }
  ]);

  result.domListeners.click({
    target: {
      closest(selector) {
        if (selector === '[data-enterprise-action]') {
          return {
            getAttribute(name) {
              return name === 'data-enterprise-action' ? 'connect-all' : '';
            }
          };
        }
        return null;
      }
    }
  });

  const enterprise = JSON.parse(result.localStorage.getItem('goindiaride_admin_enterprise_fleet_controls_v1') || '{}');
  const modules = enterprise.modules || {};
  assert.ok(Object.keys(modules).length >= 40);
  assert.equal(modules.corporate_wallet_billing.status, 'live');
  assert.equal(modules.guest_rides_central_booking.status, 'live');
  assert.equal(modules.employee_bulk_api_lifecycle.runtimeMode, 'live_controlled');
  assert.equal(modules.monthly_billing_statements.backendSyncStatus, 'protected_backend_ready');
  assert.equal(modules.fraud_abuse_detection.status, 'live');
  assert.equal(modules.live_map_dispatch.runtimeMode, 'live_controlled');
  Object.values(modules)
    .filter((module) => module.backendSyncStatus === 'protected_backend_ready')
    .forEach((module) => assert.ok(Array.isArray(module.backendEndpoints) && module.backendEndpoints.length > 0));
  assert.equal(enterprise.lastLiveTest.summary.gap, 0);
  assert.equal(enterprise.lastLiveTest.rows.every((row) => row.status === 'live'), true);
  assert.ok(Array.isArray(enterprise.moduleCatalog));
  assert.ok(enterprise.moduleCatalog.length >= 40);
  assert.equal(enterprise.wallet.corporateWalletEnabled, true);
  assert.equal(enterprise.fleet.liveMapEnabled, true);
  assert.equal(Array.isArray(enterprise.reports), true);
  assert.doesNotMatch(JSON.stringify(enterprise), /demo/i);
});

test('enterprise live modules map to existing protected backend routes', () => {
  const bookingRoutes = readRepoFile('backend/src/routes/bookingRoutes.js');
  const walletRoutes = readRepoFile('backend/src/routes/walletRoutes.js');
  const securityRoutes = readRepoFile('backend/src/routes/securityRoutes.js');
  const notificationRoutes = readRepoFile('backend/src/routes/notificationRoutes.js');
  const futureBusinessRoutes = readRepoFile('backend/src/routes/futureBusinessRoutes.js');

  assert.match(bookingRoutes, /['"]\/fallback\/admin-review-queue['"]/);
  assert.match(bookingRoutes, /['"]\/:id\/admin\/review['"]/);
  assert.match(bookingRoutes, /['"]\/:id\/admin\/edit['"]/);
  assert.match(bookingRoutes, /['"]\/admin\/pending['"]/);
  assert.match(walletRoutes, /['"]\/admin\/overview['"]/);
  assert.match(walletRoutes, /['"]\/admin\/topups['"]/);
  assert.match(walletRoutes, /['"]\/admin\/withdrawals['"]/);
  assert.match(walletRoutes, /['"]\/admin\/payment-modes['"]/);
  assert.match(walletRoutes, /['"]\/admin\/commissions\/summary['"]/);
  assert.match(walletRoutes, /['"]\/admin\/driver-commissions\/summary['"]/);
  assert.match(walletRoutes, /['"]\/admin\/withdrawals\/:requestId\/review['"]/);
  assert.match(securityRoutes, /['"]\/incidents['"]/);
  assert.match(securityRoutes, /['"]\/pulse['"]/);
  assert.match(securityRoutes, /['"]\/sos['"]/);
  assert.match(notificationRoutes, /router\.get\(['"]\/['"]/);
  assert.match(futureBusinessRoutes, /['"]\/support\/ticket['"]/);
  assert.match(futureBusinessRoutes, /['"]\/partner\/webhook\/logs['"]/);
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
  const customerLiveHelpers = readRepoFile('customer/chunks/dashboard/scripts/customer-live-helpers.js');

  assert.match(adminApp, /new BroadcastChannel\("goindiaride-admin-booking-sync"\)/);
  assert.match(customerDashboard, /customer\/chunks\/dashboard\/scripts\/customer-live-helpers\.js/);
  assert.match(customerLiveHelpers, /new BroadcastChannel\('goindiaride-admin-booking-sync'\)/);
  assert.match(customerLiveHelpers, /handleAdminBookingSyncSignal/);
  assert.match(customerLiveHelpers, /booking_created_by_admin/);

  const storageListenerIndex = customerLiveHelpers.indexOf("window.addEventListener('storage'");
  const portalConnectorReturnIndex = customerLiveHelpers.indexOf("if (!window.PortalConnector) return;");
  assert.ok(storageListenerIndex > -1, 'customer dashboard should listen for storage sync events');
  assert.ok(portalConnectorReturnIndex > -1, 'customer dashboard should still guard PortalConnector usage');
  assert.ok(
    storageListenerIndex < portalConnectorReturnIndex,
    'admin booking sync listener must be registered before PortalConnector guard'
  );
});

test('customer runtime bridge preserves fresher admin-edited rows until backend catches up', () => {
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const customerDashboard = readRepoFile('pages/customer-dashboard.html');
  const customerDashboardPage = readRepoFile('customer/chunks/dashboard/scripts/page/core/auth-state-storage.js');
  const runtimeBridge = readRepoFile('js/customer-dashboard-live-bridge.js');

  assert.match(adminApp, /backendSyncStatus:\s*"retry"/);
  assert.match(adminApp, /backendSyncQueuedAt:\s*updatedAt/);
  assert.match(adminApp, /outboundDateTime:\s*buildOutboundDateTime\(data\.rideDate,\s*data\.rideTime\)/);
  assert.match(adminApp, /function syncAdminBookingUpdateToFallbackQueue\(/);
  assert.match(adminApp, /mode:\s*cleanText\(mode \|\| "admin_edit"/);
  assert.match(adminApp, /syncAdminBookingUpdateToFallbackQueue\(updatedBooking,\s*"admin_edit"/);
  assert.match(customerDashboardPage, /goindiaride_admin_customer_bookings_current_v1/);
  assert.match(customerDashboard, /customer-dashboard-live-bridge\.js\?v=20260613-driver-gps1/);

  assert.match(runtimeBridge, /LOCAL_BOOKING_KEYS/);
  assert.match(runtimeBridge, /goindiaride_admin_customer_bookings_current_v1/);
  assert.match(runtimeBridge, /goindiaride_live_customer_booking_queue_v1/);
  assert.match(runtimeBridge, /'goindiaride_active_bookings'/);
  assert.match(runtimeBridge, /RUNTIME_BOOKING_WRITE_LIMIT/);
  assert.match(runtimeBridge, /adminQueueSyncStatus/);
  assert.match(runtimeBridge, /function mergeBookingRowSnapshots\(/);
  assert.match(runtimeBridge, /function fetchFallbackAdminQueueBookings\(/);
  assert.match(runtimeBridge, /fallback\/admin-review-queue\?limit=220&status=/);
  assert.match(runtimeBridge, /existingRefs/);
  assert.match(runtimeBridge, /bookingBelongsToUser\(item,\s*user\)/);
  assert.match(runtimeBridge, /existingRefs\[ref\]/);
  assert.match(runtimeBridge, /function localRowLooksFresher\(/);
  assert.match(runtimeBridge, /localRowLooksFresher\(existing,\s*mapped\)/);
  assert.match(runtimeBridge, /editSyncStatus:\s*'synced'/);
  assert.match(runtimeBridge, /editSyncConflict:\s*false/);
  assert.match(adminApp, /goindiaride_live_customer_booking_queue_v1/);
  assert.match(adminApp, /const statuses = \["pending", "approved", "rejected"\]/);
  assert.match(adminApp, /status=\$\{encodeURIComponent\(status\)\}/);
});

test('admin portal active paths use customer live data instead of admin demo stores', () => {
  const adminApp = readRepoFile('admin/js/admin-app.js');
  const adminPortal = readRepoFile('admin/js/admin-portal.js');
  const adminBridge = readRepoFile('js/admin-control-bridge.js');
  const safetyMonitoring = readRepoFile('admin/js/safety-monitoring.js');

  [adminApp, adminPortal, adminBridge, safetyMonitoring].forEach((source) => {
    assert.equal(/adminDemo(Users|Drivers|Bookings)|getDemoData|initializeDemoData|demo_driver/.test(source), false);
  });

  assert.match(adminPortal, /function initializeLiveAdminData\(/);
  assert.match(adminPortal, /function getLiveAdminData\(/);
  assert.match(adminPortal, /goindiaride_live_customer_booking_queue_v1/);
  assert.match(adminPortal, /ADMIN_CUSTOMER_LIVE_SECTION_IDS/);
  assert.match(safetyMonitoring, /function getCustomerSupportTickets\(/);
});

test('admin customer-live mode avoids heavy non-customer generated bundles', () => {
  const adminIndex = readRepoFile('admin/index.html');
  const featureControl = readRepoFile('admin/js/admin-feature-control-center.js');

  assert.equal(/data-goi-defer-src="\.\.\/js\/future-feature-runtime/.test(adminIndex), false);
  assert.equal(/features-admin\.js|features-security\.js|future-feature-universal-live-runner/.test(adminIndex), false);
  assert.match(adminIndex, /Customer live operations and connected admin controls/);

  assert.match(featureControl, /feature-index\/customer\.json/);
  assert.equal(/feature-index\/(driver|admin|security|additional)\.json/.test(featureControl), false);
  assert.match(featureControl, /targetPortals:\s*\["customer",\s*"admin"\]/);
  assert.match(featureControl, /Customer Live Feature Control/);
});

test('production pages target reachable live backend origin', () => {
  [
    'admin/index.html',
    'customer/index.html',
    'driver/index.html',
    'admin/chunks/dashboard/scripts/future-runtime-config.js',
    'driver/chunks/dashboard/scripts/future-runtime-config.js',
    'customer/chunks/portal/scripts/booking-system/backend-sync.js',
    'backend/tools/production-live-diagnose.js'
  ].forEach((file) => {
    const source = readRepoFile(file);
    assert.match(source, /https:\/\/goindiaride\.onrender\.com/, `${file} should target the reachable live backend`);
    assert.doesNotMatch(source, /https:\/\/api\.goindiaride\.in|us-central1-gehlot-86e38\.cloudfunctions\.net/, `${file} should not hard-code the unreachable production API origin`);
  });
});

test('customer and driver active runtime files do not seed demo behavior', () => {
  const activeRuntimeFiles = [
    'customer/chunks/dashboard/scripts/page/chat/messages-chat.js',
    'customer/chunks/dashboard/scripts/page/core/auth-state-storage.js',
    'customer/chunks/portal/scripts/booking-system/live-trip-chat.js',
    'customer/js/wallet-system.js',
    'driver/js/driver-portal.js',
    'driver/js/wallet-system.js',
    'driver/chunks/dashboard/scripts/dashboard-page.js',
    'driver/chunks/portal/scripts/safety/sos-health.js',
    'driver/chunks/portal/scripts/safety/tax-profile-styles.js',
    'driver/chunks/portal/scripts/safety/uniform-telematics.js',
    'js/customer-dashboard-live-bridge.js',
    'js/future-feature-runtime-extensions.js',
    'backend/src/routes/futureBusinessRoutes.js',
    'backend/src/routes/walletRoutes.js'
  ];
  const forbidden = /\bdemo\b|demoMode|demoReady|DEMO_|startDemo|for demo|demo purposes|simulate driver response|seeded chat|Demo Driver|For demo runtime/i;

  activeRuntimeFiles.forEach((file) => {
    assert.equal(forbidden.test(readRepoFile(file)), false, `${file} should not seed or expose demo behavior`);
  });

  assert.doesNotMatch(readRepoFile('backend/src/routes/futureBusinessRoutes.js'), /Demo OTP|data\.code|,\s*code\s*[\r\n}]/);
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
