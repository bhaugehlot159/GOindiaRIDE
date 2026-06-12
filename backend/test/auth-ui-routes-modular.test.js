const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('login auth page binds UI through the modular auth route script', () => {
  const login = read('pages/login.html');
  const routes = read('shared/chunks/auth/login/scripts/auth-routes.js');

  assert.match(login, /auth-routes\.js\?v=20260612-auth-routes1/);
  assert.doesNotMatch(login, /\son(?:click|change)=/i);
  assert.doesNotMatch(login, /GOINDIARIDE_API_BASE\s*=\s*['"]https:\/\/goindiaride\.onrender\.com['"]/);

  [
    'toggle-admin',
    'back',
    'home',
    'role-change',
    'login-method-change',
    'customer-send-otp',
    'customer-verify-otp',
    'customer-reset-otp',
    'customer-login-email',
    'driver-send-otp',
    'driver-verify-otp',
    'driver-reset-otp',
    'driver-login-email',
    'forgot-open',
    'forgot-send-otp',
    'forgot-reset-password',
    'forgot-close',
    'admin-step1-login',
    'admin-2fa-method-change',
    'admin-send-2fa',
    'admin-verify-2fa',
    'admin-reset-2fa'
  ].forEach((action) => {
    assert.match(login, new RegExp(`data-auth-action="${action}"`), `${action} should be declarative in login HTML`);
    assert.match(routes, new RegExp(`['"]${action}['"]`), `${action} should be handled by auth-routes.js`);
  });

  assert.match(routes, /global\.GoIndiaRideAuthRoutes\s*=\s*api/);
  assert.match(routes, /const UI_ROUTES = Object\.freeze/);
  assert.match(routes, /const API_ENDPOINTS = Object\.freeze/);
  assert.match(routes, /const isChoiceControl = Boolean/);
  assert.match(routes, /const defaultEvent = isChoiceControl \? 'change' : 'click'/);
  assert.match(routes, /production: PRODUCTION_API_BASE/);
  assert.match(routes, /customerDashboard: '\.\/customer-dashboard\.html'/);
  assert.match(routes, /driverDashboard: '\.\/driver-dashboard\.html'/);
});

test('auth chunks resolve endpoints and redirects from the shared auth route module', () => {
  const backendAuth = read('shared/chunks/auth/login/scripts/backend-auth.js');
  const adminSecurity = read('shared/chunks/auth/login/scripts/admin-security-firebase.js');
  const recovery = read('shared/chunks/auth/login/scripts/recovery-ui-init.js');
  const admin2fa = read('shared/chunks/auth/login/scripts/admin-2fa.js');
  const customer = read('shared/chunks/auth/login/scripts/customer-login.js');
  const driver = read('shared/chunks/auth/login/scripts/driver-login.js');

  assert.match(backendAuth, /resolveAuthEndpoint\('login'\)/);
  assert.match(backendAuth, /resolveAuthEndpoint\('register'\)/);
  assert.match(backendAuth, /resolveAuthEndpoint\('profile'\)/);
  assert.match(adminSecurity, /resolveAuthEndpoint\('adminPasswordCheck'\)/);
  assert.match(recovery, /resolveAuthEndpoint\('forgotPasswordRequest'\)/);
  assert.match(recovery, /resolveAuthEndpoint\('forgotPasswordConfirm'\)/);
  assert.match(admin2fa, /resolveAuthEndpoint\('otpRequest'\)/);
  assert.match(admin2fa, /resolveAuthEndpoint\('otpVerify'\)/);

  [backendAuth, adminSecurity, recovery, admin2fa].forEach((source) => {
    assert.doesNotMatch(source, /callBackendAuth\('\/api\/auth/);
  });
  assert.doesNotMatch(backendAuth, /\/api\/user\/profile/);

  assert.match(customer, /getAuthDashboardRoute\('customer'\)/);
  assert.match(customer, /getAuthDashboardRoute\('driver'\)/);
  assert.match(driver, /getAuthDashboardRoute\('driver'\)/);
  assert.match(driver, /getAuthDashboardRoute\('customer'\)/);
  assert.doesNotMatch(customer, /redirectAfterLogin\('\.\/(?:customer|driver)-dashboard\.html'\)/);
  assert.doesNotMatch(driver, /redirectAfterLogin\('\.\/(?:customer|driver)-dashboard\.html'\)/);
});
