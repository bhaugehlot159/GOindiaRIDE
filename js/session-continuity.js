(function (global) {
  'use strict';

  if (!global || global.GoIndiaSessionContinuity) {
    return;
  }

  var ACCESS_KEYS = ['accessToken', 'authToken', 'token'];
  var REFRESH_KEYS = ['goindiaride_refresh_token_v1', 'goindiaride_refresh_token'];
  var SESSION_STATE_KEY = 'goindiaride_session_continuity_v1';
  var DEVICE_FINGERPRINT_KEY = 'goindiaride_device_fingerprint_v1';
  var PRIMARY_DOMAIN_REGEX = /(^|\.)goindiaride\.in$/i;
  var GITHUB_PAGES_HOST_REGEX = /\.github\.io$/i;
  var DEFAULT_PRODUCTION_API_ORIGIN = 'https://goindiaride.onrender.com';
  var REQUEST_TIMEOUT_MS = 7000;

  function normalizeText(value) {
    return String(value || '').trim();
  }

  function ensureLegacyWindowHelpers() {
    if (typeof global.sanitizeInput !== 'function') {
      global.sanitizeInput = function sanitizeInputFallback(value, maxLen) {
        var limit = Number.isFinite(maxLen) ? maxLen : 180;
        return String(value || '')
          .replace(/[\u0000-\u001f<>]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit);
      };
    }
    if (typeof global.escapeHtml !== 'function') {
      global.escapeHtml = function escapeHtmlFallback(value) {
        return String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      };
    }
    if (typeof global.escapeHtmlAttr !== 'function') {
      global.escapeHtmlAttr = global.escapeHtml;
    }
  }
  ensureLegacyWindowHelpers();

  function normalizeRole(value) {
    var normalized = normalizeText(value).toLowerCase();
    if (normalized === 'driver') return 'driver';
    if (normalized === 'admin') return 'admin';
    return 'customer';
  }

  function normalizeEmail(value) {
    return normalizeText(value).toLowerCase();
  }

  function normalizePhone(value) {
    var raw = normalizeText(value);
    if (!raw) return '';

    var normalized = raw.replace(/\s+/g, '');
    if (normalized.indexOf('00') === 0) {
      normalized = '+' + normalized.slice(2);
    }

    if (normalized.charAt(0) === '+') {
      var plusDigits = normalized.slice(1).replace(/\D/g, '');
      return plusDigits.length >= 8 && plusDigits.length <= 15 ? ('+' + plusDigits) : '';
    }

    var digitsOnly = normalized.replace(/\D/g, '');
    if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
      return '+91' + digitsOnly;
    }

    return digitsOnly.length >= 8 && digitsOnly.length <= 15 ? ('+' + digitsOnly) : '';
  }

  function fnv1aHash(input) {
    var hash = 0x811c9dc5;
    var text = String(input || '');
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = (hash >>> 0) * 0x01000193;
    }
    return (hash >>> 0).toString(16);
  }

  function createStableAccountId(role, email, phone) {
    var safeRole = normalizeRole(role) === 'driver' ? 'driver' : 'user';
    var identity = normalizeEmail(email || '') + '|' + normalizePhone(phone || '');
    return safeRole + '_' + fnv1aHash(identity || ('fallback_' + Date.now()));
  }

  function looksLikeBackendObjectId(value) {
    return /^[a-f0-9]{24}$/i.test(normalizeText(value));
  }

  function safeParse(raw, fallback) {
    try {
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function readState() {
    return safeParse(global.localStorage && global.localStorage.getItem(SESSION_STATE_KEY), {});
  }

  function writeState(nextState) {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(nextState || {}));
    } catch (_error) {
      // Ignore storage quota issues.
    }
  }

  function updateState(patch) {
    var current = readState();
    var nextState = Object.assign({}, current, patch || {}, {
      updatedAt: new Date().toISOString()
    });
    writeState(nextState);
    return nextState;
  }

  function normalizeApiBase(value) {
    return normalizeText(value).replace(/\/+$/, '');
  }

  function isTrustedPublicApiBase(value) {
    var normalized = normalizeApiBase(value);
    if (!normalized) return false;
    try {
      var parsed = new URL(normalized);
      var host = normalizeText(parsed.hostname).toLowerCase();
      return host === 'goindiaride.onrender.com' ||
        host === 'goindiaride.in' ||
        host === 'www.goindiaride.in' ||
        host.slice(-15) === '.goindiaride.in';
    } catch (_error) {
      return false;
    }
  }

  function inferApiBase() {
    var host = normalizeText(global.location && global.location.hostname).toLowerCase();
    if (PRIMARY_DOMAIN_REGEX.test(host) || GITHUB_PAGES_HOST_REGEX.test(host)) {
      return DEFAULT_PRODUCTION_API_ORIGIN;
    }
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return 'http://localhost:5000';
    }
    return normalizeApiBase(global.location && global.location.origin);
  }

  function getApiBases(explicitBase) {
    var state = readState();
    var host = normalizeText(global.location && global.location.hostname).toLowerCase();
    var isPrimaryWebsiteHost = PRIMARY_DOMAIN_REGEX.test(host);
    var isGitHubPagesHost = GITHUB_PAGES_HOST_REGEX.test(host) || host === 'github.io';
    var sameOriginBase = normalizeApiBase(global.location && global.location.origin);
    var sameOriginBackendBase = sameOriginBase ? (sameOriginBase + '/backend') : '';
    var candidates = [];
    var deferredSameOriginCandidates = [];

    function pushUnique(list, value) {
      if (!value) return;
      if (list.indexOf(value) === -1) {
        list.push(value);
      }
    }

    function pushBase(value, options) {
      var normalized = normalizeApiBase(value);
      if (!normalized) return;
      if ((isPrimaryWebsiteHost || isGitHubPagesHost) && !isTrustedPublicApiBase(normalized) && normalized === normalizeApiBase(global.localStorage && global.localStorage.getItem('goindiaride_api_base'))) {
        return;
      }
      if ((isPrimaryWebsiteHost || isGitHubPagesHost) && (normalized === sameOriginBase || normalized === sameOriginBackendBase) && !(options && options.preferNow)) {
        pushUnique(deferredSameOriginCandidates, normalized);
        return;
      }
      pushUnique(candidates, normalized);
    }

    pushBase(explicitBase);
    pushBase(state.apiBase);
    pushBase(global.__GOINDIARIDE_RUNTIME_API_ORIGIN__);
    pushBase(global.__GOINDIARIDE_API_ORIGIN__);
    pushBase(global.GOINDIARIDE_API_BASE);
    pushBase(global.localStorage && global.localStorage.getItem('goindiaride_api_base'));

    if (isPrimaryWebsiteHost || isGitHubPagesHost) {
      pushBase(DEFAULT_PRODUCTION_API_ORIGIN, { preferNow: true });
      pushBase(sameOriginBackendBase);
      pushBase(sameOriginBase);
    } else {
      pushBase(sameOriginBackendBase);
      pushBase(sameOriginBase);
      pushBase(DEFAULT_PRODUCTION_API_ORIGIN, { preferNow: true });
    }

    if (!candidates.length) {
      pushBase(inferApiBase());
    }

    deferredSameOriginCandidates.forEach(function (value) {
      pushUnique(candidates, value);
    });

    return candidates;
  }

  function getAccessToken() {
    for (var i = 0; i < ACCESS_KEYS.length; i += 1) {
      var value = normalizeText(global.localStorage && global.localStorage.getItem(ACCESS_KEYS[i]));
      if (value) return value;
    }
    var state = readState();
    return normalizeText(state.accessToken);
  }

  function getRefreshToken() {
    for (var i = 0; i < REFRESH_KEYS.length; i += 1) {
      var value = normalizeText(global.localStorage && global.localStorage.getItem(REFRESH_KEYS[i]));
      if (value) return value;
    }
    var state = readState();
    return normalizeText(state.refreshToken);
  }

  function persistApiBase(apiBase) {
    var normalized = normalizeApiBase(apiBase);
    if (!normalized || !global.localStorage) return;
    try {
      global.localStorage.setItem('goindiaride_api_base', normalized);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function saveAccessToken(token) {
    var normalized = normalizeText(token);
    if (!normalized || !global.localStorage) return;
    ACCESS_KEYS.forEach(function (key) {
      global.localStorage.setItem(key, normalized);
    });
  }

  function clearAccessToken() {
    if (!global.localStorage) return;
    ACCESS_KEYS.forEach(function (key) {
      global.localStorage.removeItem(key);
    });
  }

  function saveRefreshToken(token) {
    var normalized = normalizeText(token);
    if (!normalized || !global.localStorage) return;
    REFRESH_KEYS.forEach(function (key) {
      global.localStorage.setItem(key, normalized);
    });
  }

  function clearRefreshToken() {
    if (!global.localStorage) return;
    REFRESH_KEYS.forEach(function (key) {
      global.localStorage.removeItem(key);
    });
  }

  function readPortalSession(role) {
    var safeRole = normalizeRole(role);
    var key = safeRole === 'driver' ? 'currentDriver' : (safeRole === 'admin' ? 'currentAdmin' : 'currentUser');
    return safeParse(global.localStorage && global.localStorage.getItem(key), null);
  }

  function persistPortalSession(role, user) {
    var safeRole = normalizeRole(role);
    if (!global.localStorage || !user || typeof user !== 'object') return;
    var key = safeRole === 'driver' ? 'currentDriver' : (safeRole === 'admin' ? 'currentAdmin' : 'currentUser');
    var normalizedUser = Object.assign({}, user);
    global.localStorage.setItem(key, JSON.stringify(normalizedUser));
    global.localStorage.setItem('userRole', safeRole);
    if (safeRole === 'driver') {
      global.currentDriver = normalizedUser;
    } else if (safeRole === 'customer') {
      global.currentUser = normalizedUser;
    } else if (safeRole === 'admin') {
      global.currentAdmin = normalizedUser;
    }
  }

  function buildClientDeviceFingerprint() {
    var existing = normalizeText(global.localStorage && global.localStorage.getItem(DEVICE_FINGERPRINT_KEY));
    if (existing) return existing;

    var parts = [
      global.navigator && global.navigator.userAgent,
      global.navigator && global.navigator.language,
      global.navigator && global.navigator.platform,
      global.screen ? (String(global.screen.width || 0) + 'x' + String(global.screen.height || 0)) : '',
      global.devicePixelRatio || '',
      Intl && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : ''
    ];
    var fingerprint = 'web_' + fnv1aHash(parts.join('|'));
    try {
      if (global.localStorage) {
        global.localStorage.setItem(DEVICE_FINGERPRINT_KEY, fingerprint);
      }
    } catch (_error) {
      // Ignore storage failures.
    }
    return fingerprint;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    if (typeof global.fetch !== 'function') {
      return Promise.reject(new Error('fetch_unavailable'));
    }

    if (typeof AbortController !== 'function') {
      return global.fetch(url, options || {});
    }

    var controller = new AbortController();
    var timer = global.setTimeout(function () {
      controller.abort();
    }, Number(timeoutMs || REQUEST_TIMEOUT_MS));

    var finalOptions = Object.assign({}, options || {}, {
      signal: controller.signal
    });

    return global.fetch(url, finalOptions).finally(function () {
      global.clearTimeout(timer);
    });
  }

  async function fetchProfile(apiBase, accessToken) {
    var response = await fetchWithTimeout(apiBase + '/api/user/profile', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + accessToken
      },
      credentials: 'include'
    }, REQUEST_TIMEOUT_MS);

    if (!response.ok) {
      return null;
    }

    var payload = await response.json().catch(function () {
      return {};
    });
    return payload && payload.user ? payload.user : null;
  }

  async function refreshAtBase(apiBase, refreshToken, deviceFingerprint) {
    var paths = ['/api/auth/refresh-secure', '/api/auth/refresh-token'];
    for (var i = 0; i < paths.length; i += 1) {
      try {
        var response = await fetchWithTimeout(apiBase + paths[i], {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Refresh-Token': refreshToken,
            'X-Device-Fingerprint': deviceFingerprint
          },
          credentials: 'include',
          body: JSON.stringify({
            refreshToken: refreshToken,
            deviceFingerprint: deviceFingerprint
          })
        }, REQUEST_TIMEOUT_MS);

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        var payload = await response.json().catch(function () {
          return {};
        });

        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            data: payload
          };
        }

        return {
          ok: true,
          status: response.status,
          data: payload
        };
      } catch (error) {
        if (i === paths.length - 1) {
          return {
            ok: false,
            status: 0,
            data: { message: String(error && error.message || 'refresh_failed') }
          };
        }
      }
    }

    return { ok: false, status: 404, data: { message: 'refresh_unavailable' } };
  }

  function normalizeProfileToSession(profile, roleHint) {
    var safeRole = normalizeRole(profile && (profile.accountType || profile.role || roleHint));
    var safeEmail = normalizeEmail(profile && (profile.email || profile.userEmail || ''));
    var safePhone = normalizePhone(profile && (profile.phone || profile.mobile || profile.contact || ''));
    var profileId = normalizeText(profile && profile.id);
    var backendUserId = normalizeText(profile && (
      profile.backendUserId ||
      profile._id ||
      profile.sub ||
      profile.userId ||
      (looksLikeBackendObjectId(profileId) ? profileId : '')
    ));
    var portalSession = readPortalSession(safeRole) || {};
    var stateUser = readState().user || {};
    function matchesCurrentIdentity(candidate) {
      if (!candidate || typeof candidate !== 'object') return false;
      var candidateEmail = normalizeEmail(candidate.email || candidate.userEmail || '');
      var candidatePhone = normalizePhone(candidate.phone || candidate.mobile || candidate.contact || '');
      return Boolean(
        (safeEmail && candidateEmail && safeEmail === candidateEmail) ||
        (safePhone && candidatePhone && safePhone === candidatePhone)
      );
    }
    function stableCandidate(value) {
      var normalized = normalizeText(value);
      if (!normalized || normalized === backendUserId || looksLikeBackendObjectId(normalized)) return '';
      return normalized;
    }
    var existingId = stableCandidate(profile && (profile.localId || profile.clientId || profile.stableId || profile.id));
    var portalId = matchesCurrentIdentity(portalSession) ? stableCandidate(portalSession.id) : '';
    var stateId = matchesCurrentIdentity(stateUser) ? stableCandidate(stateUser.id) : '';
    var stableId = existingId || portalId || stateId || createStableAccountId(safeRole, safeEmail, safePhone);
    var safeName = normalizeText(profile && (profile.fullname || profile.name || (safeRole === 'driver' ? 'Driver' : 'Customer'))) || (safeRole === 'driver' ? 'Driver' : 'Customer');

    if (safeRole === 'driver') {
      return {
        id: stableId,
        backendUserId: backendUserId,
        name: safeName,
        fullname: safeName,
        email: safeEmail,
        phone: safePhone,
        isPhoneVerified: Boolean(profile && (profile.isPhoneVerified || profile.phoneVerified)),
        vehicleType: normalizeText(profile && profile.vehicleType) || 'economy',
        vehicleNumber: normalizeText(profile && profile.vehicleNumber),
        role: 'driver'
      };
    }

    if (safeRole === 'admin') {
      return {
        id: backendUserId || stableId,
        backendUserId: backendUserId || stableId,
        name: safeName,
        fullname: safeName,
        email: safeEmail,
        phone: safePhone,
        role: 'admin'
      };
    }

    return {
      id: stableId,
      backendUserId: backendUserId,
      fullname: safeName,
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      isPhoneVerified: Boolean(profile && (profile.isPhoneVerified || profile.phoneVerified)),
      role: 'customer'
    };
  }

  function uniqueValues(values) {
    var seen = {};
    var out = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var normalized = normalizeText(value);
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      out.push(normalized);
    });
    return out;
  }

  function getIdentityAliases(user, role) {
    var safeRole = normalizeRole(role || (user && user.role) || (user && user.accountType));
    var state = readState();
    var profile = user && typeof user === 'object' ? user : {};
    var safeEmail = normalizeEmail(profile.email || (state.user && state.user.email) || '');
    var safePhone = normalizePhone(profile.phone || (state.user && state.user.phone) || '');
    var backendUserId = normalizeText(profile.backendUserId || profile.userId || (state.user && state.user.backendUserId) || '');
    var primaryId = normalizeText(profile.id || (state.user && state.user.id) || createStableAccountId(safeRole, safeEmail, safePhone));
    return {
      role: safeRole,
      primaryId: primaryId,
      ids: uniqueValues([
        primaryId,
        backendUserId,
        profile.id,
        profile.userId,
        profile.backendUserId,
        state.user && state.user.id,
        state.user && state.user.backendUserId
      ]),
      emails: uniqueValues([
        safeEmail,
        profile.userEmail,
        state.user && state.user.email
      ].map(normalizeEmail)),
      phones: uniqueValues([
        safePhone,
        profile.mobile,
        profile.contact,
        state.user && state.user.phone
      ].map(normalizePhone))
    };
  }

  function storeAuthArtifacts(input) {
    var payload = input && typeof input === 'object' ? input : {};
    var role = normalizeRole(payload.accountType || payload.role || (payload.user && payload.user.role) || (payload.user && payload.user.accountType));
    var user = payload.user && typeof payload.user === 'object' ? normalizeProfileToSession(payload.user, role) : null;
    var accessToken = normalizeText(payload.accessToken);
    var refreshToken = normalizeText(payload.refreshToken);
    var apiBase = normalizeApiBase(payload.apiBase || inferApiBase());

    if (global.GoIndiaDataPreservation && typeof global.GoIndiaDataPreservation.restoreAll === 'function') {
      global.GoIndiaDataPreservation.restoreAll();
    }

    if (accessToken) saveAccessToken(accessToken);
    if (refreshToken) saveRefreshToken(refreshToken);
    if (apiBase) persistApiBase(apiBase);
    var statePatch = {
      accountType: role,
      apiBase: apiBase || readState().apiBase || '',
      accessToken: accessToken || getAccessToken() || '',
      refreshToken: refreshToken || getRefreshToken() || '',
      deviceFingerprint: buildClientDeviceFingerprint()
    };
    if (user) {
      statePatch.user = user;
      persistPortalSession(role, user);
    }
    updateState(statePatch);
    if (global.GoIndiaDataPreservation && typeof global.GoIndiaDataPreservation.snapshotAll === 'function') {
      global.GoIndiaDataPreservation.snapshotAll();
    }
  }

  function clearAuthArtifacts() {
    if (global.GoIndiaDataPreservation && typeof global.GoIndiaDataPreservation.snapshotAll === 'function') {
      global.GoIndiaDataPreservation.snapshotAll();
    }
    clearAccessToken();
    clearRefreshToken();
    if (global.localStorage) {
      global.localStorage.removeItem(SESSION_STATE_KEY);
    }
  }

  async function restorePortalSession(options) {
    var settings = options && typeof options === 'object' ? options : {};
    var preferredRole = settings.role || settings.accountType || (settings.preferStoredRole ? (global.localStorage && global.localStorage.getItem('userRole')) : '') || readState().accountType || 'customer';
    var role = normalizeRole(preferredRole);
    var localSession = readPortalSession(role);
    var accessToken = normalizeText(settings.accessToken || getAccessToken());
    var refreshToken = normalizeText(settings.refreshToken || getRefreshToken());
    var apiBases = getApiBases(settings.apiBase);
    var lastKnownUser = localSession || readState().user || null;

    if (settings.preferFastLocal && lastKnownUser) {
      var fastUser = normalizeProfileToSession(lastKnownUser, role);
      storeAuthArtifacts({
        accountType: role,
        accessToken: accessToken,
        refreshToken: refreshToken,
        apiBase: apiBases[0] || inferApiBase(),
        user: fastUser
      });

      if (!settings.backgroundRefresh && (accessToken || refreshToken)) {
        global.setTimeout(function () {
          restorePortalSession(Object.assign({}, settings, {
            preferFastLocal: false,
            backgroundRefresh: true
          })).catch(function () {});
        }, 50);
      }

      return {
        ok: true,
        role: role,
        user: fastUser,
        source: 'local_session_fast',
        refreshing: Boolean(accessToken || refreshToken)
      };
    }

    if (accessToken) {
      for (var i = 0; i < apiBases.length; i += 1) {
        try {
          var profile = await fetchProfile(apiBases[i], accessToken);
          if (profile) {
            var sessionUser = normalizeProfileToSession(profile, role);
            storeAuthArtifacts({
              accountType: role,
              accessToken: accessToken,
              refreshToken: refreshToken,
              apiBase: apiBases[i],
              user: sessionUser
            });
            return { ok: true, role: role, user: sessionUser, source: 'access_token' };
          }
        } catch (_error) {
          // Try next candidate.
        }
      }
    }

    if (refreshToken) {
      var deviceFingerprint = buildClientDeviceFingerprint();
      for (var j = 0; j < apiBases.length; j += 1) {
        var refreshResult = await refreshAtBase(apiBases[j], refreshToken, deviceFingerprint);
        if (!refreshResult.ok || !refreshResult.data || !refreshResult.data.accessToken) {
          continue;
        }

        accessToken = normalizeText(refreshResult.data.accessToken);
        refreshToken = normalizeText(refreshResult.data.refreshToken || refreshToken);

        try {
          var refreshedProfile = await fetchProfile(apiBases[j], accessToken);
          if (refreshedProfile) {
            var refreshedUser = normalizeProfileToSession(refreshedProfile, role);
            storeAuthArtifacts({
              accountType: role,
              accessToken: accessToken,
              refreshToken: refreshToken,
              apiBase: apiBases[j],
              user: refreshedUser
            });
            return { ok: true, role: role, user: refreshedUser, source: 'refresh_token' };
          }
        } catch (_error2) {
          // Ignore and keep trying.
        }
      }
    }

    if (lastKnownUser) {
      var fallbackUser = normalizeProfileToSession(lastKnownUser, role);
      clearAccessToken();
      storeAuthArtifacts({
        accountType: role,
        accessToken: '',
        refreshToken: refreshToken,
        apiBase: apiBases[0] || inferApiBase(),
        user: fallbackUser
      });
      return { ok: true, role: role, user: fallbackUser, source: 'local_session' };
    }

    return { ok: false, role: role, user: null, source: 'missing_session' };
  }

  global.GoIndiaSessionContinuity = {
    ACCESS_KEYS: ACCESS_KEYS.slice(),
    REFRESH_KEYS: REFRESH_KEYS.slice(),
    SESSION_STATE_KEY: SESSION_STATE_KEY,
    DEVICE_FINGERPRINT_KEY: DEVICE_FINGERPRINT_KEY,
    createStableAccountId: createStableAccountId,
    normalizeEmail: normalizeEmail,
    normalizePhone: normalizePhone,
    normalizeRole: normalizeRole,
    readState: readState,
    getAccessToken: getAccessToken,
    getRefreshToken: getRefreshToken,
    getApiBases: getApiBases,
    getIdentityAliases: getIdentityAliases,
    storeAuthArtifacts: storeAuthArtifacts,
    clearAuthArtifacts: clearAuthArtifacts,
    restorePortalSession: restorePortalSession,
    buildClientDeviceFingerprint: buildClientDeviceFingerprint
  };
})(typeof window !== 'undefined' ? window : globalThis);
