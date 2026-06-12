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
  const js = read('admin/js/admin-app.js');

  assert.match(app, /<body class="admin-app-shell" data-admin-control-panel="app">/);
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
  assert.match(js, /\$all\("\[data-control-panel-view\]"\)/);
  assert.match(js, /switchView\(button\.dataset\.controlPanelView \|\| "overview"\)/);
  assert.match(js, /setText\("#controlBookingsCount", pending\)/);
  assert.match(js, /setText\("#controlFinanceCount", formatMoney\(farePipeline\)\)/);
});

test('legacy admin entries keep semantic admin control dashboard regions', () => {
  const legacyPortal = read('admin/index.html');
  const legacyDashboard = read('pages/admin-dashboard.html');
  const legacyPortalCss = read('admin/css/admin-styles.css');
  const dashboardCss = read('admin/chunks/dashboard/styles/base.css');

  assert.match(legacyPortal, /data-admin-control-panel="legacy-portal"/);
  assert.match(legacyPortal, /aria-label="Admin control panel navigation"[^>]+data-admin-control-region="sidebar"/);
  assert.match(legacyPortal, /id="adminLegacyControlDashboard"[^>]+data-admin-control-dashboard="legacy-portal"[^>]+data-admin-control-region="main"/);
  assert.match(legacyPortal, /data-admin-control-structure="dashboard"/);
  assert.match(legacyPortal, /Admin Control Panel Dashboard/);
  assert.match(legacyPortal, /href="\.\/app\.html\?view=overview"/);

  assert.match(legacyDashboard, /data-admin-control-panel="legacy"/);
  assert.match(legacyDashboard, /<aside class="sidebar" id="adminControlSidebar"[^>]+data-admin-control-region="sidebar"/);
  assert.match(legacyDashboard, /<nav class="sidebar-menu"[^>]+data-admin-control-region="navigation"/);
  assert.match(legacyDashboard, /<main class="main-content" id="adminControlPanelDashboard"[^>]+data-admin-control-dashboard="legacy"[^>]+data-admin-control-region="main"/);
  assert.match(legacyDashboard, /data-admin-control-structure="dashboard"/);
  assert.match(legacyDashboard, /Admin Control Panel Dashboard/);
  assert.match(legacyDashboard, /href="\.\.\/admin\/app\.html\?view=overview"/);

  assert.match(legacyPortalCss, /\.admin-control-dashboard-structure/);
  assert.match(legacyPortalCss, /\.control-app-link/);
  assert.match(dashboardCss, /\.admin-control-dashboard-structure/);
  assert.match(dashboardCss, /\.control-app-link/);
});
