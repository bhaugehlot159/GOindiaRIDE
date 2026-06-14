const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('admin app exposes a complete admin control panel dashboard shell', () => {
  const app = read('admin/app.html');
  const css = read('admin/css/admin-app.css');
  const layoutCss = read('admin/css/admin-production-layout.css');
  const js = read('admin/js/admin-app.js');

  assert.match(app, /<body class="admin-app-shell" data-admin-control-panel="app">/);
  assert.match(app, /<html lang="en" class="admin-app-document">/);
  assert.match(app, /admin-production-layout\.css\?v=20260614-adminlayout2/);
  assert.match(app, /<aside class="app-sidebar"[^>]+aria-label="Admin control panel sidebar"[^>]+data-admin-control-region="sidebar"/);
  assert.match(app, /<main class="app-main" id="adminControlPanelDashboard"[^>]+data-admin-control-dashboard="app"[^>]+data-admin-control-region="main"/);
  assert.match(app, /id="adminControlPanelStructure"[^>]+data-admin-control-structure="dashboard"/);
  assert.match(app, /id="adminControlPanelTitle">Admin Control Panel Dashboard<\/h2>/);

  ['overview', 'bookings', 'portals', 'drivers', 'finance', 'safety', 'settings'].forEach((view) => {
    assert.match(app, new RegExp(`data-control-panel-view="${view}"`), `${view} shortcut should exist`);
  });

  assert.match(css, /\.control-panel-dashboard/);
  assert.match(css, /\.control-panel-modules/);
  assert.match(css, /\.control-module\.active/);
  assert.match(layoutCss, /body\.admin-app-shell \.control-panel-modules[\s\S]*repeat\(auto-fit, minmax\(118px, 1fr\)\)/);
  assert.match(layoutCss, /body\.admin-app-shell \.app-main[\s\S]*overflow-x: hidden !important/);
  assert.match(layoutCss, /body\.admin-app-shell \.booking-card[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto !important/);
  assert.match(layoutCss, /body\.admin-app-shell \.ops-signal-grid[\s\S]*repeat\(auto-fit, minmax\(min\(170px, 100%\), 1fr\)\)/);
  assert.match(layoutCss, /body\.admin-app-shell \.feature-control-row[\s\S]*flex-wrap: wrap !important/);
  assert.match(js, /\$all\("\[data-control-panel-view\]"\)/);
  assert.match(js, /switchView\(button\.dataset\.controlPanelView \|\| "overview"\)/);
  assert.match(js, /setText\("#controlBookingsCount", pending\)/);
  assert.match(js, /setText\("#controlFinanceCount", formatMoney\(farePipeline\)\)/);
});

test('legacy admin entries keep semantic admin control dashboard regions', () => {
  const legacyPortal = read('admin/index.html');
  const legacyDashboard = read('pages/admin-dashboard.html');
  const legacyPortalCss = read('admin/css/admin-styles.css');
  const layoutCss = read('admin/css/admin-production-layout.css');
  const dashboardCss = read('admin/chunks/dashboard/styles/base.css');

  assert.match(legacyPortal, /<html lang="en" class="admin-legacy-document">/);
  assert.match(legacyPortal, /data-admin-control-panel="legacy-portal"/);
  assert.match(legacyPortal, /admin-production-layout\.css\?v=20260614-adminlayout2/);
  assert.doesNotMatch(legacyPortal, /global-ui\.js/);
  assert.doesNotMatch(legacyPortal, /professional-purple-theme\.css/);
  assert.doesNotMatch(legacyPortal, /fit-screen\.css/);
  assert.match(legacyPortal, /aria-label="Admin control panel navigation"[^>]+data-admin-control-region="sidebar"/);
  assert.match(legacyPortal, /id="adminLegacyControlDashboard"[^>]+data-admin-control-dashboard="legacy-portal"[^>]+data-admin-control-region="main"/);
  assert.match(legacyPortal, /data-admin-control-structure="dashboard"/);
  assert.match(legacyPortal, /Admin Control Panel Dashboard/);
  assert.match(legacyPortal, /href="\.\/app\.html\?view=overview"/);
  assert.match(legacyPortal, /admin-live-management-sections\.js\?v=20260614-live-management1/);
  assert.doesNotMatch(legacyPortal, /financial-reports\.js/);
  assert.doesNotMatch(legacyPortal, /safety-monitoring\.js/);
  assert.doesNotMatch(legacyPortal, /admin-live-control-center\.js/);
  [
    'affiliate-tracking',
    'health-monitor',
    'leaderboard',
    'vendor-management',
    'driver-approval',
    'compliance-center'
  ].forEach((sectionId) => {
    assert.doesNotMatch(legacyPortal, new RegExp(`data-section="${sectionId}"`));
    assert.doesNotMatch(legacyPortal, new RegExp(`id="section-${sectionId}"`));
  });

  assert.match(legacyDashboard, /data-admin-control-panel="legacy"/);
  assert.match(legacyDashboard, /<aside class="sidebar" id="adminControlSidebar"[^>]+data-admin-control-region="sidebar"/);
  assert.match(legacyDashboard, /<nav class="sidebar-menu"[^>]+data-admin-control-region="navigation"/);
  assert.match(legacyDashboard, /<main class="main-content" id="adminControlPanelDashboard"[^>]+data-admin-control-dashboard="legacy"[^>]+data-admin-control-region="main"/);
  assert.match(legacyDashboard, /data-admin-control-structure="dashboard"/);
  assert.match(legacyDashboard, /Admin Control Panel Dashboard/);
  assert.match(legacyDashboard, /href="\.\.\/admin\/app\.html\?view=overview"/);

  assert.match(legacyPortalCss, /\.admin-control-dashboard-structure/);
  assert.match(legacyPortalCss, /\.control-app-link/);
  assert.match(layoutCss, /body\[data-admin-control-panel="legacy-portal"\] \.main-content[\s\S]*width: calc\(100vw - var\(--legacy-admin-sidebar-width\)\) !important/);
  assert.match(layoutCss, /body\[data-admin-control-panel="legacy-portal"\] \.content-section:not\(\.active\)[\s\S]*display: none !important/);
  assert.match(layoutCss, /body\[data-admin-control-panel="legacy-portal"\] \.content-area[\s\S]*isolation: isolate !important/);
  assert.match(layoutCss, /body\[data-admin-control-panel="legacy-portal"\] #goi-global-nav-dock[\s\S]*display: none !important/);
  assert.match(layoutCss, /body\[data-admin-control-panel="legacy-portal"\] \.btn-booking-alarm[\s\S]*display: inline-flex !important/);
  assert.match(dashboardCss, /\.admin-control-dashboard-structure/);
  assert.match(dashboardCss, /\.control-app-link/);
});

test('legacy customer-live management sections avoid static demo fields', () => {
  const portal = read('admin/js/admin-portal.js');
  const liveManagement = read('admin/js/admin-live-management-sections.js');
  const app = read('admin/js/admin-app.js');

  assert.match(portal, /'service-alerts'[\s\S]*'support-dashboard'[\s\S]*'promo-offers'[\s\S]*'system-config'[\s\S]*'audit-logs'/);
  assert.doesNotMatch(portal, /createAffiliateTrackingContent|createHealthMonitorContent|createLeaderboardContent|createDriverApprovalContent|createComplianceCenterContent/);
  assert.match(liveManagement, /const ADMIN_SERVICE_ALERTS_KEY = "goindiaride_admin_service_alerts_v1"/);
  assert.match(liveManagement, /const ADMIN_PROMO_OFFERS_KEY = "goindiaride_admin_promotional_offers_v1"/);
  assert.match(liveManagement, /const ADMIN_SYSTEM_CONFIG_KEY = "goindiaride_admin_system_config_v1"/);
  assert.match(liveManagement, /function saveServiceAlertFromForm\(\)/);
  assert.match(liveManagement, /function savePromoOfferFromForm\(\)/);
  assert.match(liveManagement, /function saveSystemConfigFromForm\(\)/);
  assert.match(liveManagement, /notifyAllPortals\(\{[\s\S]*type: "service_alert"/);
  assert.match(liveManagement, /notifyAllPortals\(\{[\s\S]*type: "promo_offer_updated"/);
  assert.match(liveManagement, /notifyAllPortals\(\{[\s\S]*type: "admin_system_config_updated"/);
  assert.match(liveManagement, /function updateSupportTicketStatus\(/);
  assert.doesNotMatch(liveManagement, /Active Offers[\s\S]*stat-value">8/);
  assert.doesNotMatch(liveManagement, /<option>All Drivers<\/option><option>All Customers<\/option>/);
  assert.doesNotMatch(liveManagement, /placeholder="Enter message\.\.\."/);
  assert.doesNotMatch(liveManagement, /Ravi Kumar|Anil Kumar|Active Vendors|Fatigue Alerts|Active SOS/);
  assert.doesNotMatch(app, /seedDriverBtn|function seedDriver/);
});
