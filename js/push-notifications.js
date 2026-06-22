(function attachGoIndiaRidePushNotifications(global) {
  'use strict';

  var VERSION = 'goindiaride_push_notifications_phase4_v1';
  var STATUS_KEY = 'goindiaride_push_notifications_status_v1';
  var PUBLIC_KEY_CACHE_KEY = 'goindiaride_push_public_key_v1';
  var CONTROL_ID = 'goiPushNotificationControl';
  var API_BASE_OVERRIDE_KEY = 'goindiaride_api_base';

  function normalizeText(value, maxLength) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength || 240);
  }

  function readJson(value, fallback) {
    try {
      return JSON.parse(value || '');
    } catch (_error) {
      return fallback;
    }
  }

  function saveStatus(nextStatus) {
    try {
      global.localStorage.setItem(STATUS_KEY, JSON.stringify({
        version: VERSION,
        updatedAt: new Date().toISOString(),
        ...(nextStatus || {})
      }));
    } catch (_error) {
      // Storage can be blocked in private browsing.
    }
  }

  function getStoredStatus() {
    try {
      return readJson(global.localStorage.getItem(STATUS_KEY), {}) || {};
    } catch (_error) {
      return {};
    }
  }

  function getApiBase() {
    var candidates = [
      global.GOINDIARIDE_API_BASE,
      global.localStorage && global.localStorage.getItem(API_BASE_OVERRIDE_KEY),
      global.GOINDIA_API_BASE
    ];

    var host = String(global.location && global.location.hostname || '').toLowerCase();
    if (host === 'goindiaride.in' || host === 'www.goindiaride.in') {
      candidates.push('https://goindiaride.onrender.com');
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      candidates.push('http://localhost:5000');
    }
    candidates.push(global.location && global.location.origin);

    for (var index = 0; index < candidates.length; index += 1) {
      var raw = normalizeText(candidates[index], 300);
      if (!raw || raw === 'null' || raw === 'undefined') continue;
      return raw.replace(/\/+$/, '');
    }

    return '';
  }

  function getAccessToken() {
    try {
      return normalizeText(
        global.localStorage.getItem('accessToken')
          || global.localStorage.getItem('authToken')
          || global.localStorage.getItem('token')
          || '',
        5000
      );
    } catch (_error) {
      return '';
    }
  }

  function isSupported() {
    return Boolean(
      global.isSecureContext
        && 'serviceWorker' in navigator
        && 'PushManager' in global
        && 'Notification' in global
    );
  }

  function getReadinessStatus() {
    var supported = isSupported();
    var permission = 'unsupported';
    try {
      permission = supported ? Notification.permission : 'unsupported';
    } catch (_error) {
      permission = 'unavailable';
    }
    return {
      ok: supported,
      supported: supported,
      secureContext: Boolean(global.isSecureContext),
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in global,
      notificationApi: 'Notification' in global,
      permission: permission,
      apiBase: getApiBase(),
      hasAccessToken: Boolean(getAccessToken()),
      publicKeyEndpoint: '/api/notifications/push/public-key',
      subscribeEndpoint: '/api/notifications/push/subscribe',
      testEndpoint: '/api/notifications/push/test'
    };
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = global.atob(base64);
    var outputArray = new Uint8Array(rawData.length);

    for (var i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  async function fetchJson(path, options) {
    var response = await fetch(getApiBase() + path, {
      credentials: 'include',
      cache: 'no-store',
      ...(options || {})
    });

    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var error = new Error(body.message || 'Push notification request failed');
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return body;
  }

  async function getPublicKey() {
    var cached = '';
    try {
      var cachedConfig = readJson(global.localStorage.getItem(PUBLIC_KEY_CACHE_KEY), null);
      if (cachedConfig && cachedConfig.version === VERSION && cachedConfig.publicKey) {
        cached = cachedConfig.publicKey;
      }
    } catch (_error) {
      cached = '';
    }

    if (cached) {
      return cached;
    }

    var config = await fetchJson('/api/notifications/push/public-key');
    var publicKey = normalizeText(config.publicKey || config.applicationServerKey, 500);
    if (!publicKey) {
      throw new Error('Push public key is not configured');
    }

    try {
      global.localStorage.setItem(PUBLIC_KEY_CACHE_KEY, JSON.stringify({
        version: VERSION,
        publicKey: publicKey,
        source: config.source || 'server',
        cachedAt: new Date().toISOString()
      }));
    } catch (_error) {
      // Storage cache is optional.
    }

    return publicKey;
  }

  async function getRegistration() {
    if (!isSupported()) {
      throw new Error('Push notifications are not supported in this browser context');
    }

    var registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js?v=20260613-push-phase4', { scope: '/' });
    } else if (registration.update) {
      registration.update().catch(function () {});
    }

    return navigator.serviceWorker.ready.then(function (readyRegistration) {
      return readyRegistration || registration;
    });
  }

  function authHeaders() {
    var token = getAccessToken();
    if (!token) {
      throw new Error('Login session is required for push notifications');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
  }

  async function syncSubscription(subscription, consentSource) {
    var body = {
      subscription: subscription.toJSON ? subscription.toJSON() : subscription,
      consentSource: consentSource || 'browser_permission'
    };

    var result = await fetchJson('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    saveStatus({
      permission: Notification.permission,
      endpointHash: result.subscription && result.subscription.endpointHash,
      synced: true
    });

    return result;
  }

  async function subscribe() {
    if (!isSupported()) {
      throw new Error('Push notifications are not supported here');
    }

    var permission = Notification.permission;
    if (permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      saveStatus({ permission: permission, synced: false });
      return { ok: false, permission: permission };
    }

    var registration = await getRegistration();
    var existing = await registration.pushManager.getSubscription();
    var subscription = existing;
    if (!subscription) {
      var publicKey = await getPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    var result = await syncSubscription(subscription, 'browser_permission');
    refreshControlState();
    return result;
  }

  async function unsubscribe() {
    var registration = await getRegistration();
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      saveStatus({ permission: Notification.permission, synced: false });
      refreshControlState();
      return { ok: true, disabled: false };
    }

    var endpoint = subscription.endpoint;
    var backendResult = await fetchJson('/api/notifications/push/unsubscribe', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint: endpoint })
    }).catch(function (error) {
      return { ok: false, error: error.message };
    });

    await subscription.unsubscribe();
    saveStatus({ permission: Notification.permission, synced: false, disabled: true });
    refreshControlState();
    return backendResult;
  }

  async function sendTest(payload) {
    return fetchJson('/api/notifications/push/test', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload || {
        title: 'GOindiaRIDE test alert',
        message: 'Push notifications are connected.',
        url: '/pages/customer-dashboard.html'
      })
    });
  }

  async function syncExistingSubscription() {
    if (!isSupported() || Notification.permission !== 'granted' || !getAccessToken()) {
      return { ok: false, skipped: true };
    }

    var registration = await getRegistration();
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { ok: false, skipped: true };
    }

    return syncSubscription(subscription, 'existing_browser_permission');
  }

  function notify(message, type) {
    if (typeof global.showToast === 'function') {
      global.showToast(message, type || 'info');
    }
  }

  function injectStyles() {
    if (document.getElementById('goiPushNotificationStyles')) return;
    var style = document.createElement('style');
    style.id = 'goiPushNotificationStyles';
    style.textContent = [
      '.goi-push-control{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;}',
      '.goi-push-control button{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:8px;background:#111827;color:#fff;padding:10px 12px;font:600 13px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;}',
      '.goi-push-control button[disabled]{cursor:not-allowed;opacity:.62;}',
      '.goi-push-control small{color:#4b5563;font:500 12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.goi-push-control.is-active button{background:#065f46;}'
    ].join('');
    document.head.appendChild(style);
  }

  function findControlHost() {
    return document.getElementById('notificationSettings')
      || document.querySelector('#view-settings .settings-grid')
      || document.querySelector('.settings-grid')
      || document.querySelector('#profileTab .profile-section')
      || document.querySelector('.notification-panel')
      || null;
  }

  async function refreshControlState() {
    var control = document.getElementById(CONTROL_ID);
    if (!control) return;

    var button = control.querySelector('button');
    var label = control.querySelector('[data-goi-push-label]');
    var status = control.querySelector('small');
    var stored = getStoredStatus();
    var supported = isSupported();
    var permission = supported ? Notification.permission : 'unsupported';
    var active = Boolean(stored.synced && permission === 'granted');

    if (supported && permission === 'granted') {
      try {
        var registration = await getRegistration();
        active = Boolean(await registration.pushManager.getSubscription());
      } catch (_error) {
        active = Boolean(stored.synced);
      }
    }

    control.classList.toggle('is-active', active);
    button.disabled = !supported || permission === 'denied' || !getAccessToken();
    label.textContent = active ? 'Disable ride alerts' : 'Enable ride alerts';
    status.textContent = !supported
      ? 'Push unavailable'
      : (!getAccessToken()
        ? 'Login required'
        : (permission === 'denied'
          ? 'Alerts blocked'
          : (active ? 'Ride alerts on' : 'Ride alerts off')));
  }

  function mountControl() {
    if (document.getElementById(CONTROL_ID) || !getAccessToken()) return;
    var host = findControlHost();
    if (!host) return;

    injectStyles();
    var control = document.createElement('div');
    control.id = CONTROL_ID;
    control.className = 'goi-push-control';
    control.setAttribute('data-goi-push-version', VERSION);
    control.innerHTML = '<button type="button"><i class="fas fa-bell" aria-hidden="true"></i><span data-goi-push-label>Enable ride alerts</span></button><small>Ride alerts off</small>';

    var button = control.querySelector('button');
    button.addEventListener('click', function () {
      button.disabled = true;
      Promise.resolve()
        .then(async function () {
          var registration = await getRegistration();
          var existing = await registration.pushManager.getSubscription();
          if (existing && Notification.permission === 'granted') {
            await unsubscribe();
            notify('Ride alerts disabled.', 'info');
            return;
          }

          var result = await subscribe();
          if (result && result.ok !== false) {
            notify('Ride alerts enabled.', 'success');
          }
        })
        .catch(function (error) {
          notify(error.message || 'Unable to update ride alerts.', 'warning');
        })
        .finally(function () {
          refreshControlState();
        });
    });

    host.appendChild(control);
    refreshControlState();
  }

  async function init(options) {
    var settings = options || {};
    if (!isSupported()) {
      saveStatus({ supported: false });
      mountControl();
      return { ok: false, supported: false };
    }

    getRegistration().catch(function () {});
    if (settings.mount !== false) {
      mountControl();
    }
    if (settings.autoSync !== false) {
      syncExistingSubscription().catch(function () {});
    }

    return { ok: true, supported: true, version: VERSION };
  }

  global.GoIndiaRidePushNotifications = {
    VERSION: VERSION,
    init: init,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    sendTest: sendTest,
    syncExistingSubscription: syncExistingSubscription,
    getPublicKey: getPublicKey,
    isSupported: isSupported,
    getReadinessStatus: getReadinessStatus
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init({ autoSync: true, mount: true }).catch(function () {});
    });
  } else {
    init({ autoSync: true, mount: true }).catch(function () {});
  }
})(window);
