(function initializeAuthRoutes(global) {
  'use strict';

  const STORAGE_KEY = 'goindiaride_api_base';
  const PRODUCTION_API_BASE = 'https://goindiaride.onrender.com';
  const LOCAL_API_BASE = 'http://localhost:5000';

  const UI_ROUTES = Object.freeze({
    home: '../index.html',
    login: './login.html',
    customerDashboard: './customer-dashboard.html',
    driverDashboard: './driver-dashboard.html',
    adminHome: '../admin/index.html'
  });

  const API_ENDPOINTS = Object.freeze({
    login: '/api/auth/login',
    register: '/api/auth/register',
    refreshSecure: '/api/auth/refresh-secure',
    refreshToken: '/api/auth/refresh-token',
    profile: '/api/user/profile',
    adminPasswordCheck: '/api/auth/admin/password-check',
    otpRequest: '/api/auth/request-otp',
    otpVerify: '/api/auth/otp/verify',
    forgotPasswordRequest: '/api/auth/forgot-password/request',
    forgotPasswordConfirm: '/api/auth/forgot-password/confirm'
  });

  const LOGIN_ACTIONS = Object.freeze({
    'toggle-admin': { fn: 'toggleAdminLogin' },
    'role-change': { fn: 'updateLoginMethod', event: 'change' },
    'login-method-change': { fn: 'updateSelectedLoginMethod', event: 'change' },
    'admin-2fa-method-change': { fn: 'updateAdmin2FAMethod', event: 'change' },
    'customer-send-otp': { fn: 'customerSendOTP' },
    'customer-verify-otp': { fn: 'customerVerifyOTP' },
    'customer-reset-otp': { fn: 'customerResetOTP' },
    'customer-login-email': { fn: 'customerLoginEmail' },
    'driver-send-otp': { fn: 'driverSendOTP' },
    'driver-verify-otp': { fn: 'driverVerifyOTP' },
    'driver-reset-otp': { fn: 'driverResetOTP' },
    'driver-login-email': { fn: 'driverLoginEmail' },
    'forgot-send-otp': { fn: 'sendForgotPasswordOtp' },
    'forgot-reset-password': { fn: 'handleForgotPasswordReset' },
    'forgot-close': { fn: 'closeForgotPassword' },
    'admin-step1-login': { fn: 'adminStep1Login' },
    'admin-send-2fa': { fn: 'sendAdmin2FAOTP' },
    'admin-verify-2fa': { fn: 'verifyAdmin2FA' },
    'admin-reset-2fa': { fn: 'adminResetTo2FAMethod' }
  });

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/$/, '');
  }

  function readLocation() {
    return global.location || {};
  }

  function isLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  }

  function isPrimaryWebsiteHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'goindiaride.in' || host === 'www.goindiaride.in' || host.endsWith('.goindiaride.in');
  }

  function isGitHubPagesHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'github.io' || host.endsWith('.github.io');
  }

  function isTrustedPublicApiBase(value) {
    const normalized = normalizeBase(value);
    if (!normalized) return false;
    try {
      const parsed = new URL(normalized);
      const host = String(parsed.hostname || '').toLowerCase();
      return host === 'goindiaride.onrender.com' ||
        host === 'goindiaride.in' ||
        host === 'www.goindiaride.in' ||
        host.endsWith('.goindiaride.in');
    } catch (_error) {
      return false;
    }
  }

  function readStoredApiBase() {
    try {
      return normalizeBase(global.localStorage && global.localStorage.getItem(STORAGE_KEY));
    } catch (_error) {
      return '';
    }
  }

  function setConfiguredApiBase(value) {
    const normalized = normalizeBase(value);
    if (!normalized) return '';
    const location = readLocation();
    const host = String(location.hostname || '').toLowerCase();
    const sameOriginBase = normalizeBase(location.origin || '');
    const sameOriginBackendBase = sameOriginBase ? `${sameOriginBase}/backend` : '';

    if ((isPrimaryWebsiteHost(host) || isGitHubPagesHost(host)) &&
      (normalized === sameOriginBase || normalized === sameOriginBackendBase)) {
      return '';
    }
    if ((isPrimaryWebsiteHost(host) || isGitHubPagesHost(host)) && !isTrustedPublicApiBase(normalized)) {
      return '';
    }

    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, normalized);
    } catch (_error) {
    }
    return normalized;
  }

  function resolveApiBase() {
    const location = readLocation();
    const host = String(location.hostname || '').toLowerCase();
    const sameOriginBase = normalizeBase(location.origin || '');
    const sameOriginBackendBase = sameOriginBase ? `${sameOriginBase}/backend` : '';

    const candidates = [
      global.__GOINDIARIDE_RUNTIME_API_ORIGIN__,
      global.__GOINDIARIDE_API_ORIGIN__,
      global.GOINDIARIDE_API_BASE,
      readStoredApiBase()
    ];

    for (const candidate of candidates) {
      const normalized = normalizeBase(candidate);
      if (!normalized) continue;
      if ((isPrimaryWebsiteHost(host) || isGitHubPagesHost(host)) &&
        (normalized === sameOriginBase || normalized === sameOriginBackendBase)) {
        continue;
      }
      if ((isPrimaryWebsiteHost(host) || isGitHubPagesHost(host)) && !isTrustedPublicApiBase(normalized)) {
        continue;
      }
      if (isLocalHost(host)) {
        try {
          const parsed = new URL(normalized);
          const apiHost = String(parsed.hostname || '').toLowerCase();
          const apiPort = String(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
          const localApi = isLocalHost(apiHost);
          if (localApi && apiPort !== '5000') continue;
        } catch (_error) {
          continue;
        }
      }
      return normalized;
    }

    if (isLocalHost(host)) return LOCAL_API_BASE;
    if (isPrimaryWebsiteHost(host) || isGitHubPagesHost(host)) return PRODUCTION_API_BASE;
    return sameOriginBase;
  }

  function applyRuntimeConfig() {
    const apiBase = resolveApiBase();
    if (apiBase) {
      global.GOINDIARIDE_API_BASE = apiBase;
      setConfiguredApiBase(apiBase);
    }
    return apiBase;
  }

  function endpoint(nameOrPath, fallback = '') {
    const key = String(nameOrPath || '').trim();
    if (!key) return String(fallback || '');
    if (key.charAt(0) === '/') return key;
    return API_ENDPOINTS[key] || String(fallback || '');
  }

  function endpointUrl(nameOrPath, fallback = '') {
    const path = endpoint(nameOrPath, fallback);
    const apiBase = resolveApiBase();
    return apiBase && path ? `${apiBase}${path}` : '';
  }

  function route(name, fallback = '') {
    const key = String(name || '').trim();
    if (!key) return String(fallback || '');
    return UI_ROUTES[key] || String(fallback || '');
  }

  function dashboardForRole(role) {
    return String(role || '').toLowerCase() === 'driver'
      ? UI_ROUTES.driverDashboard
      : UI_ROUTES.customerDashboard;
  }

  function resolveRouteTarget(target) {
    const key = String(target || '').trim();
    if (!key) return '';
    return UI_ROUTES[key] || key;
  }

  function navigate(name, fallback = '') {
    const target = route(name, fallback);
    if (!target) return;
    global.location.href = target;
  }

  function goBackOrHome() {
    if (global.history && global.history.length > 1) {
      global.history.back();
      return;
    }
    navigate('home');
  }

  function resolveAdminNextPath() {
    const fallback = UI_ROUTES.adminHome;
    try {
      const query = new URLSearchParams(String(readLocation().search || ''));
      const next = String(query.get('next') || '').trim();
      if (!next) return fallback;
      if (next.startsWith('/admin/')) return `..${next}`;
      if (next.startsWith('../admin/')) return next;
      if (next.startsWith('./admin/')) return next;
      return fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function shouldOpenAdminLoginFromQuery() {
    try {
      const query = new URLSearchParams(String(readLocation().search || ''));
      const adminParam = String(query.get('admin') || '').trim().toLowerCase();
      const next = String(query.get('next') || '').trim().toLowerCase();
      return adminParam === '1' ||
        adminParam === 'true' ||
        next.startsWith('/admin/') ||
        next.startsWith('../admin/') ||
        next.startsWith('./admin/');
    } catch (_error) {
      return false;
    }
  }

  function invokeNamedFunction(name, args) {
    const fn = global[name];
    if (typeof fn !== 'function') {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn(`Auth action "${name}" is not ready`);
      }
      return;
    }
    fn.apply(global, args || []);
  }

  function handleLoginAction(element, event) {
    const action = String(element.getAttribute('data-auth-action') || '').trim();
    if (!action) return;

    if (action === 'back') {
      event.preventDefault();
      goBackOrHome();
      return;
    }

    if (action === 'home') {
      event.preventDefault();
      navigate('home');
      return;
    }

    if (action === 'toggle-password') {
      event.preventDefault();
      invokeNamedFunction('togglePasswordVisibility', [element.getAttribute('data-auth-target') || '']);
      return;
    }

    if (action === 'forgot-open') {
      event.preventDefault();
      invokeNamedFunction('openForgotPassword', [element.getAttribute('data-auth-role') || 'customer']);
      return;
    }

    const mapped = LOGIN_ACTIONS[action];
    if (!mapped) return;
    if ((event.type || '').toLowerCase() === 'click') event.preventDefault();
    invokeNamedFunction(mapped.fn, []);
  }

  function bindLoginPage(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : global.document;
    if (!scope || typeof scope.querySelectorAll !== 'function') return;

    scope.querySelectorAll('[data-auth-action]').forEach((element) => {
      if (element.__goindiaAuthRouteBound) return;
      const action = String(element.getAttribute('data-auth-action') || '').trim();
      const mapped = LOGIN_ACTIONS[action] || {};
      const isChoiceControl = Boolean(element.matches && element.matches('input[type="radio"], select'));
      const defaultEvent = isChoiceControl ? 'change' : 'click';
      const eventName = String(element.getAttribute('data-auth-event') || (isChoiceControl ? mapped.event : '') || defaultEvent);
      element.addEventListener(eventName, (event) => handleLoginAction(element, event));
      element.__goindiaAuthRouteBound = true;
    });
  }

  const api = Object.freeze({
    version: '20260612-auth-routes1',
    apiBases: Object.freeze({ production: PRODUCTION_API_BASE, local: LOCAL_API_BASE }),
    endpoints: API_ENDPOINTS,
    routes: UI_ROUTES,
    applyRuntimeConfig,
    bindLoginPage,
    dashboardForRole,
    endpoint,
    endpointUrl,
    goBackOrHome,
    navigate,
    resolveAdminNextPath,
    resolveApiBase,
    resolveRouteTarget,
    route,
    setConfiguredApiBase,
    shouldOpenAdminLoginFromQuery
  });

  global.GoIndiaRideAuthRoutes = api;
  global.getAuthEndpoint = endpoint;
  global.getAuthEndpointUrl = endpointUrl;
  global.getAuthUiRoute = route;
  global.getAuthDashboardRoute = dashboardForRole;

  applyRuntimeConfig();

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => bindLoginPage(global.document));
    } else {
      bindLoginPage(global.document);
    }
  }
})(window);
