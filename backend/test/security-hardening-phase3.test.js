process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-security-phase3';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-security-phase3';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-test';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const app = require('../src/app');
const {
  PHASE3_SECURITY_HARDENING_VERSION,
  getSecurityHardeningStatus
} = require('../src/services/securityHardeningService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 3 security hardening status exposes production controls', () => {
  const status = getSecurityHardeningStatus();
  const checkIds = status.checks.map((item) => item.id);

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.version, PHASE3_SECURITY_HARDENING_VERSION);
  assert.equal(status.mode, 'phase3-production-security-audit-and-hardening');
  assert.equal(status.endpoints.publicHealth, '/health/security-hardening');
  assert.equal(status.endpoints.adminStatus, '/api/security/hardening/status');
  assert.match(status.controls.methodAllowlist, /GET/);
  assert.match(status.controls.methodAllowlist, /DELETE/);
  assert.equal(status.controls.requestLimits.maxJsonBodyKb, 128);
  assert.equal(status.controls.rateLimits.loginMax, 5);
  assert.equal(status.controls.rateLimits.otpMax, 3);
  assert.equal(status.controls.dependencyAudit.command, 'npm --prefix backend audit --omit=dev');

  [
    'strict_csrf',
    'api_gateway_limits',
    'content_type_allowlist',
    'body_size_limit',
    'global_lockdown',
    'auth_abuse_shields',
    'idempotency',
    'admin_audit_chain'
  ].forEach((id) => assert.ok(checkIds.includes(id), `${id} should be audited`));
});

test('phase 3 security hardening public endpoint runs with secure headers', async () => {
  const response = await request(app)
    .get('/health/security-hardening')
    .set('x-forwarded-proto', 'https')
    .expect(200);

  assert.equal(response.body.active, true);
  assert.equal(response.body.version, PHASE3_SECURITY_HARDENING_VERSION);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['x-xss-protection'], '0');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.match(response.headers['strict-transport-security'], /max-age=31536000/);
  assert.match(response.headers['permissions-policy'], /camera=\(\)/);
  assert.match(response.headers['permissions-policy'], /geolocation=\(\)/);
});

test('phase 3 API responses keep no-store and CSP frame protections', async () => {
  const response = await request(app)
    .get('/api/auth')
    .set('x-forwarded-proto', 'https')
    .expect(200);

  assert.match(response.headers['cache-control'], /no-store/);
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(response.headers['x-request-id']);
});

test('phase 3 method allowlist blocks unsupported verbs before routes', async () => {
  const response = await request(app)
    .trace('/health/security-hardening')
    .expect(405);

  assert.equal(response.body.code, 'METHOD_NOT_ALLOWED');
  assert.match(response.headers.allow, /GET/);
  assert.match(response.headers.allow, /POST/);
});

test('phase 3 gateway blocks unsupported mutating content types on protected API paths', async () => {
  const response = await request(app)
    .post('/api/users/profile')
    .set('content-type', 'application/xml')
    .send('<profile><name>bad</name></profile>')
    .expect(415);

  assert.match(response.body.message, /Unsupported content-type/);
});

test('phase 3 detailed hardening route remains under protected security namespace', async () => {
  const response = await request(app)
    .get('/api/security/hardening/status');

  assert.ok([401, 403, 503].includes(response.status));
  assert.notEqual(response.status, 200);
  assert.ok(response.body.message);
});

test('phase 3 hardening is wired without removing prior phase health checks', () => {
  const appSource = read('backend/src/app.js');
  const securityRoutes = read('backend/src/routes/securityRoutes.js');
  const headerMiddleware = read('backend/src/middleware/apiSecurityHeadersMiddleware.js');
  const legacyCsrfMiddleware = read('backend/src/middleware/csrfProtectionMiddleware.js');
  const hardeningService = read('backend/src/services/securityHardeningService.js');

  assert.match(appSource, /getSecurityHardeningStatus/);
  assert.match(appSource, /['"]\/health\/security-hardening['"]/);
  assert.match(appSource, /['"]\/health\/fraud-detection['"]/);
  assert.match(appSource, /['"]\/health\/gdpr-compliance['"]/);
  assert.match(securityRoutes, /['"]\/hardening\/status['"]/);
  assert.match(securityRoutes, /authenticate,\s*requireAdmin/);
  assert.match(headerMiddleware, /METHOD_NOT_ALLOWED/);
  assert.match(headerMiddleware, /X-XSS-Protection/);
  assert.match(headerMiddleware, /geolocation=\(\)/);
  assert.doesNotMatch(legacyCsrfMiddleware, /require\(['"]csurf['"]\)/);
  assert.match(legacyCsrfMiddleware, /csrfShieldMiddleware/);
  assert.match(hardeningService, /goindiaride_security_hardening_phase3_v1/);
  assert.match(hardeningService, /OWASP API Security Top 10 2023/);
});
