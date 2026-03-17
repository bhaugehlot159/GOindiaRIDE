(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_RUNTIME_DOCK_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_RUNTIME_DOCK_LOADED__ = true;

  function ensureStyle() {
    if (document.getElementById('ff-runtime-dock-style')) return;
    var style = document.createElement('style');
    style.id = 'ff-runtime-dock-style';
    style.textContent = '' +
      '#ff-runtime-dock{margin:16px auto 24px;max-width:1280px;padding:0 12px;box-sizing:border-box}' +
      '#ff-runtime-dock details{border:1px solid #d6e4ff;background:#f8fbff;border-radius:12px;overflow:hidden}' +
      '#ff-runtime-dock summary{cursor:pointer;list-style:none;padding:10px 12px;font:700 14px/1.35 Segoe UI,Tahoma,sans-serif;color:#143a69;background:#eef5ff;display:flex;justify-content:space-between;align-items:center}' +
      '#ff-runtime-dock summary::-webkit-details-marker{display:none}' +
      '#ff-runtime-dock .ff-runtime-dock-body{padding:12px;display:grid;gap:10px;max-height:72vh;overflow:auto}' +
      '#ff-runtime-dock #ff-runtime-extension-workspace{margin:0;display:grid;gap:10px}' +
      '#ff-runtime-dock .ff-runtime-card-body{overflow:auto}' +
      '@media (max-width:768px){#ff-runtime-dock{padding:0 8px}#ff-runtime-dock .ff-runtime-dock-body{max-height:58vh}}';
    document.head.appendChild(style);
  }

  function ensureDock() {
    ensureStyle();

    var dock = document.getElementById('ff-runtime-dock');
    if (dock) return dock;

    dock = document.createElement('section');
    dock.id = 'ff-runtime-dock';

    var details = document.createElement('details');
    details.id = 'ff-runtime-dock-details';

    var role = detectPageRole();
    details.open = role === 'admin';

    var summary = document.createElement('summary');
    summary.textContent = 'Live Runtime Workspace (Add-on Features)';

    var body = document.createElement('div');
    body.className = 'ff-runtime-dock-body';
    body.id = 'ff-runtime-dock-body';

    details.appendChild(summary);
    details.appendChild(body);
    dock.appendChild(details);

    if (document.body) {
      document.body.appendChild(dock);
    }

    return dock;
  }

  function detectPageRole() {
    var path = String((window.location && window.location.pathname) || '').toLowerCase();
    if (path.indexOf('/admin/') !== -1 || path.indexOf('admin-dashboard') !== -1) return 'admin';
    if (path.indexOf('/driver/') !== -1 || path.indexOf('driver-dashboard') !== -1) return 'driver';
    if (path.indexOf('/customer/') !== -1 || path.indexOf('customer-dashboard') !== -1) return 'customer';
    if (path.indexOf('booking') !== -1) return 'booking';
    return 'generic';
  }

  function shouldRelocateWorkspace() {
    // Default: do NOT move existing runtime workspace.
    // If explicitly needed, set window.__GOINDIARIDE_MOVE_RUNTIME_WORKSPACE__ = true
    // before this script runs.
    return window.__GOINDIARIDE_MOVE_RUNTIME_WORKSPACE__ === true;
  }

  function isDockEnabled() {
    // Keep runtime dock visible by default only on admin pages.
    // Non-admin pages can explicitly enable via window flag.
    var role = detectPageRole();
    if (role === 'admin') return true;
    return window.__GOINDIARIDE_SHOW_RUNTIME_DOCK__ === true;
  }

  function relocateWorkspace() {
    if (!shouldRelocateWorkspace()) return;
    var workspace = document.getElementById('ff-runtime-extension-workspace');
    if (!workspace) return;

    var dock = ensureDock();
    if (!dock) return;

    var body = document.getElementById('ff-runtime-dock-body');
    if (!body) return;

    if (workspace.parentNode !== body) {
      body.appendChild(workspace);
    }
  }

  function boot() {
    if (!isDockEnabled()) {
      var staleDock = document.getElementById('ff-runtime-dock');
      if (staleDock && staleDock.parentNode) staleDock.parentNode.removeChild(staleDock);
      return;
    }

    ensureDock();
    if (shouldRelocateWorkspace()) {
      relocateWorkspace();

      var observer = new MutationObserver(function () {
        relocateWorkspace();
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });

      window.setInterval(relocateWorkspace, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
