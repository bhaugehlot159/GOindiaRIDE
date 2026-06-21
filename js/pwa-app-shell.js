(function initGoIndiaRidePwaAppShell(global) {
  'use strict';

  var VERSION = '20260622-app-readiness1';
  var STATUS_KEY = 'goindiaride_pwa_app_shell_status_v1';
  var INSTALL_PROMPT_KEY = 'goindiaride_pwa_install_prompt_seen_v1';

  function cleanText(value, maxLength) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength || 240);
  }

  function rootUrl(path) {
    try {
      return new URL(path || '/', global.location.origin).toString();
    } catch (_error) {
      return path || '/';
    }
  }

  function saveStatus(nextStatus) {
    try {
      global.localStorage.setItem(STATUS_KEY, JSON.stringify({
        version: VERSION,
        updatedAt: new Date().toISOString(),
        path: global.location && global.location.pathname,
        ...(nextStatus || {})
      }));
    } catch (_error) {
      // Storage is optional for the app shell.
    }
  }

  function setDisplayModeFlag() {
    var standalone = Boolean(
      (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches)
        || global.navigator.standalone
    );
    document.documentElement.setAttribute('data-goi-pwa-display', standalone ? 'standalone' : 'browser');
    return standalone;
  }

  function getSurface() {
    var path = String(global.location && global.location.pathname || '').toLowerCase();
    if (path.indexOf('/admin/') === 0) return 'admin';
    if (path.indexOf('/driver/') === 0 || path.indexOf('/pages/driver-dashboard') === 0) return 'driver';
    if (path.indexOf('/customer/') === 0 || path.indexOf('/pages/customer-dashboard') === 0 || path.indexOf('/pages/booking') === 0) return 'customer';
    if (path.indexOf('/book-cab') >= 0) return 'booking';
    return 'public';
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !global.isSecureContext) {
      saveStatus({ serviceWorker: 'unsupported_or_insecure', surface: getSurface() });
      return null;
    }

    var registration = await navigator.serviceWorker.register(rootUrl('/sw.js?v=' + VERSION), { scope: '/' });
    if (registration && typeof registration.update === 'function') {
      registration.update().catch(function () {});
    }
    saveStatus({
      serviceWorker: 'registered',
      scope: registration && registration.scope,
      surface: getSurface()
    });
    return registration;
  }

  function setupInstallPrompt() {
    global.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      global.GoIndiaRidePWA.deferredPrompt = event;
      try {
        global.localStorage.setItem(INSTALL_PROMPT_KEY, new Date().toISOString());
      } catch (_error) {}
      saveStatus({ installPrompt: 'available', surface: getSurface() });
    });

    global.addEventListener('appinstalled', function () {
      global.GoIndiaRidePWA.deferredPrompt = null;
      saveStatus({ installed: true, installPrompt: 'accepted', surface: getSurface() });
    });
  }

  async function promptInstall() {
    var promptEvent = global.GoIndiaRidePWA && global.GoIndiaRidePWA.deferredPrompt;
    if (!promptEvent) {
      saveStatus({ installPrompt: 'not_available', surface: getSurface() });
      return { ok: false, reason: 'install_prompt_not_available' };
    }

    promptEvent.prompt();
    var choice = await promptEvent.userChoice.catch(function () {
      return { outcome: 'dismissed' };
    });
    global.GoIndiaRidePWA.deferredPrompt = null;
    saveStatus({
      installPrompt: cleanText(choice && choice.outcome, 40) || 'closed',
      surface: getSurface()
    });
    return { ok: choice && choice.outcome === 'accepted', outcome: choice && choice.outcome };
  }

  async function init() {
    var standalone = setDisplayModeFlag();
    saveStatus({
      displayMode: standalone ? 'standalone' : 'browser',
      online: navigator.onLine !== false,
      surface: getSurface()
    });

    try {
      await registerServiceWorker();
    } catch (error) {
      saveStatus({
        serviceWorker: 'registration_failed',
        error: cleanText(error && error.message, 160),
        surface: getSurface()
      });
    }
  }

  global.GoIndiaRidePWA = {
    VERSION: VERSION,
    deferredPrompt: null,
    init: init,
    promptInstall: promptInstall,
    registerServiceWorker: registerServiceWorker,
    getSurface: getSurface
  };

  setupInstallPrompt();
  global.addEventListener('online', function () {
    saveStatus({ online: true, surface: getSurface() });
  });
  global.addEventListener('offline', function () {
    saveStatus({ online: false, surface: getSurface() });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
