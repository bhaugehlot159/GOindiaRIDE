(function attachGoIndiaRideAppRuntimeVerifier(global) {
  'use strict';

  var VERSION = 'goindiaride_app_runtime_verifier_v1';
  var RESULT_KEY = 'goindiaride_app_runtime_verifier_result_v1';

  function cleanText(value, maxLength) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength || 240);
  }

  function getAccessToken() {
    try {
      return cleanText(
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

  function getApiBase() {
    var candidates = [
      global.GOINDIARIDE_API_BASE,
      global.localStorage && global.localStorage.getItem('goindiaride_api_base')
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
      var value = cleanText(candidates[index], 300).replace(/\/+$/, '');
      if (value && value !== 'null' && value !== 'undefined') return value;
    }
    return '';
  }

  async function fetchText(url) {
    var response = await fetch(url, { cache: 'no-store', credentials: 'include' });
    var text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text: text
    };
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, {
      cache: 'no-store',
      credentials: 'include',
      ...(options || {})
    });
    var body = await response.json().catch(function () { return {}; });
    return {
      ok: response.ok,
      status: response.status,
      body: body
    };
  }

  function authHeaders() {
    var token = getAccessToken();
    if (!token) return null;
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
  }

  function saveResult(result) {
    try {
      global.localStorage.setItem(RESULT_KEY, JSON.stringify(result));
    } catch (_error) {
      // Diagnostic storage is optional.
    }
  }

  async function checkPwaFiles() {
    var manifestJson = await fetchJson('/manifest.json');
    var manifestWeb = await fetchJson('/manifest.webmanifest');
    var serviceWorker = await fetchText('/sw.js?v=20260622-app-readiness3');
    var serviceWorkerAlias = await fetchText('/service-worker.js');
    var registration = { ok: false, status: 'unsupported_or_insecure' };

    if (global.isSecureContext && 'serviceWorker' in navigator) {
      try {
        var registered = await navigator.serviceWorker.register('/sw.js?v=20260622-app-readiness3', { scope: '/' });
        registration = {
          ok: Boolean(registered && registered.scope),
          status: 'registered',
          scope: registered && registered.scope
        };
      } catch (error) {
        registration = {
          ok: false,
          status: 'registration_failed',
          error: cleanText(error && error.message, 180)
        };
      }
    }

    var manifestBody = manifestJson.body || {};
    return {
      ok: Boolean(
        manifestJson.ok
          && manifestWeb.ok
          && serviceWorker.ok
          && serviceWorkerAlias.ok
          && manifestBody.start_url
          && Array.isArray(manifestBody.icons)
          && serviceWorker.text.indexOf('goindiaride-pwa-v67-20260622-app-readiness3') >= 0
          && serviceWorkerAlias.text.indexOf('/sw.js?v=20260622-app-readiness3') >= 0
      ),
      manifestJson: {
        status: manifestJson.status,
        id: manifestBody.id || '',
        startUrl: manifestBody.start_url || '',
        iconCount: Array.isArray(manifestBody.icons) ? manifestBody.icons.length : 0
      },
      manifestWebmanifest: { status: manifestWeb.status },
      serviceWorker: {
        status: serviceWorker.status,
        cacheVersion: serviceWorker.text.indexOf('goindiaride-pwa-v67-20260622-app-readiness3') >= 0
      },
      serviceWorkerAlias: { status: serviceWorkerAlias.status },
      registration: registration
    };
  }

  async function checkOtpWebView() {
    var apiBase = getApiBase();
    var configResponse = apiBase
      ? await fetchJson(apiBase + '/api/auth/firebase/client-config').catch(function (error) {
        return { ok: false, status: 0, body: { message: cleanText(error && error.message, 120) } };
      })
      : { ok: false, status: 0, body: { message: 'api_base_missing' } };

    var dynamicConfig = null;
    if (typeof global.resolveGoIndiaFirebaseConfig === 'function') {
      dynamicConfig = await global.resolveGoIndiaFirebaseConfig({ preferDynamic: true }).catch(function () { return null; });
    }

    var phoneStatus = global.GoIndiaPhoneVerification
      && typeof global.GoIndiaPhoneVerification.getReadinessStatus === 'function'
      ? global.GoIndiaPhoneVerification.getReadinessStatus()
      : { ok: false, firebaseAuthLoaded: false };

    return {
      ok: Boolean(
        phoneStatus.ok
          && phoneStatus.dynamicConfigResolver
          && configResponse.status < 500
      ),
      webViewRuntime: Boolean(phoneStatus.webViewRuntime),
      firebaseClientConfigEndpoint: {
        status: configResponse.status,
        reachable: configResponse.status > 0 && configResponse.status < 500
      },
      dynamicConfigLoaded: Boolean(dynamicConfig && dynamicConfig.projectId && dynamicConfig.appId),
      phoneVerification: phoneStatus,
      note: 'Send OTP still requires a real phone number, allowed Firebase domain, and WebView with reCAPTCHA support.'
    };
  }

  async function checkPushTokenFlow(options) {
    var settings = options || {};
    var apiBase = getApiBase();
    var pushStatus = global.GoIndiaRidePushNotifications
      && typeof global.GoIndiaRidePushNotifications.getReadinessStatus === 'function'
      ? global.GoIndiaRidePushNotifications.getReadinessStatus()
      : { ok: false, supported: false };
    var publicKey = apiBase
      ? await fetchJson(apiBase + '/api/notifications/push/public-key').catch(function (error) {
        return { ok: false, status: 0, body: { message: cleanText(error && error.message, 120) } };
      })
      : { ok: false, status: 0, body: { message: 'api_base_missing' } };

    var permission = pushStatus.permission || 'unsupported';
    if (settings.requestPermission && pushStatus.supported && Notification.permission !== 'granted') {
      permission = await Notification.requestPermission();
    }

    var subscriptionResult = { ok: false, status: 'not_requested' };
    if (settings.syncSubscription && permission === 'granted') {
      if (!getAccessToken()) {
        subscriptionResult = { ok: false, status: 'login_required' };
      } else if (global.GoIndiaRidePushNotifications && typeof global.GoIndiaRidePushNotifications.subscribe === 'function') {
        subscriptionResult = await global.GoIndiaRidePushNotifications.subscribe().catch(function (error) {
          return { ok: false, status: 'subscribe_failed', error: cleanText(error && error.message, 180) };
        });
      }
    }

    return {
      ok: Boolean(pushStatus.supported && publicKey.ok && publicKey.body && publicKey.body.publicKey),
      browser: pushStatus,
      publicKeyEndpoint: {
        status: publicKey.status,
        reachable: publicKey.ok,
        source: publicKey.body && publicKey.body.source
      },
      permission: permission,
      subscription: subscriptionResult
    };
  }

  function getBrowserPosition(timeoutMs) {
    return new Promise(function (resolve) {
      if (!('geolocation' in navigator)) {
        resolve({ ok: false, status: 'geolocation_unsupported' });
        return;
      }
      navigator.geolocation.getCurrentPosition(function (position) {
        resolve({
          ok: true,
          status: 'gps_position_received',
          coords: {
            lat: Number(position.coords.latitude.toFixed(7)),
            lng: Number(position.coords.longitude.toFixed(7)),
            accuracy: Math.round(position.coords.accuracy || 0),
            speed: position.coords.speed,
            heading: position.coords.heading,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString()
          }
        });
      }, function (error) {
        resolve({
          ok: false,
          status: 'gps_permission_or_signal_failed',
          error: cleanText(error && error.message, 180)
        });
      }, {
        enableHighAccuracy: true,
        timeout: timeoutMs || 15000,
        maximumAge: 0
      });
    });
  }

  async function checkLiveGpsTracking(options) {
    var settings = options || {};
    var apiBase = getApiBase();
    var health = apiBase
      ? await fetchJson(apiBase + '/health/live-location-tracking').catch(function (error) {
        return { ok: false, status: 0, body: { message: cleanText(error && error.message, 120) } };
      })
      : { ok: false, status: 0, body: { message: 'api_base_missing' } };
    var position = await getBrowserPosition(settings.gpsTimeoutMs || 15000);
    var writeResult = { ok: false, status: 'not_requested' };
    var headers = authHeaders();

    if (settings.writeLiveProbe && position.ok) {
      if (!headers) {
        writeResult = { ok: false, status: 'login_required' };
      } else {
        writeResult = await fetchJson(apiBase + '/api/live-tracking/location', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            subjectType: 'customer',
            lat: position.coords.lat,
            lng: position.coords.lng,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            heading: position.coords.heading,
            source: 'app_runtime_verifier_browser_gps',
            metadata: {
              verifierVersion: VERSION,
              runtime: 'browser_or_webview'
            }
          })
        }).catch(function (error) {
          return { ok: false, status: 0, body: { message: cleanText(error && error.message, 120) } };
        });
      }
    }

    return {
      ok: Boolean(health.ok && health.body && health.body.active && position.ok),
      health: {
        status: health.status,
        active: Boolean(health.body && health.body.active),
        mode: health.body && health.body.mode
      },
      browserGps: position,
      backendWrite: writeResult
    };
  }

  async function runAll(options) {
    var settings = options || {};
    var result = {
      version: VERSION,
      checkedAt: new Date().toISOString(),
      apiBase: getApiBase(),
      pwa: await checkPwaFiles(),
      otpWebView: await checkOtpWebView(),
      push: await checkPushTokenFlow(settings.push || {}),
      liveGps: await checkLiveGpsTracking(settings.liveGps || {})
    };
    result.ok = Boolean(result.pwa.ok && result.otpWebView.ok && result.push.ok && result.liveGps.ok);
    saveResult(result);
    return result;
  }

  function renderResult(result) {
    var output = document.querySelector('[data-app-runtime-output]');
    var status = document.querySelector('[data-app-runtime-status]');
    if (status) {
      status.textContent = result.ok ? 'All runtime checks passed' : 'Runtime checks need attention';
      status.setAttribute('data-state', result.ok ? 'passed' : 'attention');
    }
    if (output) {
      output.textContent = JSON.stringify(result, null, 2);
    }
  }

  function boot() {
    var button = document.querySelector('[data-app-runtime-run]');
    if (!button) return;
    button.addEventListener('click', function () {
      button.disabled = true;
      button.textContent = 'Checking...';
      runAll({
        push: { requestPermission: true, syncSubscription: true },
        liveGps: { writeLiveProbe: true, gpsTimeoutMs: 18000 }
      }).then(renderResult).catch(function (error) {
        renderResult({
          ok: false,
          version: VERSION,
          checkedAt: new Date().toISOString(),
          error: cleanText(error && error.message, 240)
        });
      }).finally(function () {
        button.disabled = false;
        button.textContent = 'Run device checks';
      });
    });
  }

  global.GoIndiaRideAppRuntimeVerifier = {
    VERSION: VERSION,
    checkPwaFiles: checkPwaFiles,
    checkOtpWebView: checkOtpWebView,
    checkPushTokenFlow: checkPushTokenFlow,
    checkLiveGpsTracking: checkLiveGpsTracking,
    runAll: runAll
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
