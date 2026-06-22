(function initGoIndiaRidePwaAppShell(global) {
  'use strict';

  var VERSION = '20260622-app-readiness3';
  var STATUS_KEY = 'goindiaride_pwa_app_shell_status_v1';
  var INSTALL_PROMPT_KEY = 'goindiaride_pwa_install_prompt_seen_v1';
  var INSTALL_UI_ID = 'goiPwaInstallDock';
  var INSTALL_STYLE_ID = 'goiPwaInstallStyles';
  var installControlsBound = false;

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

  function isStandaloneMode() {
    var standalone = Boolean(
      (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches)
        || global.navigator.standalone
    );
    return standalone;
  }

  function setDisplayModeFlag() {
    var standalone = isStandaloneMode();
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

  function getSurfaceInstallLabel(surface) {
    if (surface === 'admin') return 'Install admin app';
    if (surface === 'driver') return 'Install driver app';
    if (surface === 'customer') return 'Install customer app';
    if (surface === 'booking') return 'Install booking app';
    return 'Install app';
  }

  function isIosLike() {
    var nav = global.navigator || {};
    var userAgent = String(nav.userAgent || '');
    return /iphone|ipad|ipod/i.test(userAgent)
      || (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1);
  }

  function ensureInstallStyles() {
    if (document.getElementById(INSTALL_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = INSTALL_STYLE_ID;
    style.textContent = [
      '#goiPwaInstallDock{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;}',
      '#goiPwaInstallDock[hidden]{display:none!important;}',
      '#goiPwaInstallDock [data-goi-pwa-install]{pointer-events:auto;border:0;border-radius:999px;background:#0f766e;color:#fff;padding:12px 16px;font-weight:800;font-size:14px;line-height:1;box-shadow:0 14px 34px rgba(15,118,110,.28);cursor:pointer;}',
      '#goiPwaInstallDock [data-goi-pwa-install]:focus-visible{outline:3px solid rgba(20,184,166,.35);outline-offset:3px;}',
      '#goiPwaInstallDock .goi-pwa-install-note{max-width:260px;border:1px solid rgba(15,118,110,.18);border-radius:8px;background:#fff;color:#334155;padding:8px 10px;font-size:12px;line-height:1.4;box-shadow:0 12px 28px rgba(15,23,42,.12);pointer-events:auto;}',
      '#goiPwaInstallDock .goi-pwa-install-note[hidden]{display:none!important;}',
      '@media (max-width:640px){#goiPwaInstallDock{left:16px;right:16px;align-items:stretch;}#goiPwaInstallDock [data-goi-pwa-install]{width:100%;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureInstallUi() {
    var existingButtons = document.querySelectorAll('[data-goi-pwa-install], #installAppBtn');
    if (existingButtons.length) return;
    ensureInstallStyles();
    var dock = document.createElement('div');
    dock.id = INSTALL_UI_ID;
    dock.hidden = true;

    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-goi-pwa-install', '');
    button.textContent = getSurfaceInstallLabel(getSurface());

    var note = document.createElement('div');
    note.className = 'goi-pwa-install-note';
    note.setAttribute('data-goi-pwa-install-note', '');
    note.hidden = true;

    dock.appendChild(button);
    dock.appendChild(note);
    document.body.appendChild(dock);
  }

  function getInstallButtons() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-goi-pwa-install], #installAppBtn'));
  }

  function getManualInstallMessage() {
    if (isIosLike()) {
      return 'Use Share, then Add to Home Screen.';
    }
    return 'Use the browser menu to install this app.';
  }

  function setInstallUiState(state, message) {
    var hidden = state === 'hidden' || isStandaloneMode();
    var label = getSurfaceInstallLabel(getSurface());
    var buttons = getInstallButtons();

    buttons.forEach(function (button) {
      button.hidden = hidden;
      button.disabled = false;
      button.setAttribute('data-goi-pwa-install-state', hidden ? 'hidden' : state);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', state === 'manual' ? getManualInstallMessage() : label);
      var labelNode = button.querySelector('[data-goi-pwa-install-label]') || button.querySelector('span');
      if (labelNode) {
        labelNode.textContent = label;
      } else if (button.textContent !== label) {
        button.textContent = label;
      }
    });

    var dock = document.getElementById(INSTALL_UI_ID);
    if (dock) dock.hidden = hidden;
    Array.prototype.slice.call(document.querySelectorAll('[data-goi-pwa-install-note]')).forEach(function (note) {
      var shouldShowNote = !hidden && state === 'manual';
      note.hidden = !shouldShowNote;
      if (shouldShowNote) note.textContent = message || getManualInstallMessage();
    });
  }

  function refreshInstallUi() {
    ensureInstallUi();
    if (isStandaloneMode()) {
      setInstallUiState('hidden');
      return;
    }
    if (global.GoIndiaRidePWA && global.GoIndiaRidePWA.deferredPrompt) {
      setInstallUiState('available');
      return;
    }
    if (isIosLike()) {
      setInstallUiState('manual', getManualInstallMessage());
      return;
    }
    setInstallUiState('hidden');
  }

  function showManualInstallHelp() {
    var message = getManualInstallMessage();
    setInstallUiState('manual', message);
    var notes = document.querySelectorAll('[data-goi-pwa-install-note]');
    if (!notes.length && typeof global.alert === 'function') {
      global.alert(message);
    }
    saveStatus({ installPrompt: 'manual_instructions', surface: getSurface() });
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
      setInstallUiState('available');
    });

    global.addEventListener('appinstalled', function () {
      global.GoIndiaRidePWA.deferredPrompt = null;
      saveStatus({ installed: true, installPrompt: 'accepted', surface: getSurface() });
      setInstallUiState('hidden');
    });
  }

  async function promptInstall() {
    var promptEvent = global.GoIndiaRidePWA && global.GoIndiaRidePWA.deferredPrompt;
    if (!promptEvent) {
      saveStatus({ installPrompt: 'not_available', surface: getSurface() });
      if (!isStandaloneMode()) {
        showManualInstallHelp();
      }
      return { ok: false, reason: 'install_prompt_not_available' };
    }

    if (typeof promptEvent.prompt === 'function') {
      promptEvent.prompt();
    }
    var choicePromise = promptEvent.userChoice && typeof promptEvent.userChoice.then === 'function'
      ? promptEvent.userChoice
      : Promise.resolve({ outcome: 'dismissed' });
    var choice = await choicePromise.catch(function () {
      return { outcome: 'dismissed' };
    });
    global.GoIndiaRidePWA.deferredPrompt = null;
    saveStatus({
      installPrompt: cleanText(choice && choice.outcome, 40) || 'closed',
      surface: getSurface()
    });
    setInstallUiState('hidden');
    return { ok: choice && choice.outcome === 'accepted', outcome: choice && choice.outcome };
  }

  function bindInstallControls() {
    if (installControlsBound) {
      refreshInstallUi();
      return;
    }
    installControlsBound = true;
    refreshInstallUi();
    document.addEventListener('click', function (event) {
      var target = event.target && event.target.closest
        ? event.target.closest('[data-goi-pwa-install], #installAppBtn')
        : null;
      if (!target) return;
      event.preventDefault();
      promptInstall().catch(function (error) {
        saveStatus({
          installPrompt: 'prompt_failed',
          error: cleanText(error && error.message, 120),
          surface: getSurface()
        });
      });
    });
  }

  async function init() {
    var standalone = setDisplayModeFlag();
    bindInstallControls();
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
    getSurface: getSurface,
    bindInstallControls: bindInstallControls,
    refreshInstallUi: refreshInstallUi,
    ensureInstallUi: ensureInstallUi
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
