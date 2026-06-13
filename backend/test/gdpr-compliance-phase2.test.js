process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-gdpr-phase2';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-for-gdpr-phase2';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-test';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const app = require('../src/app');
const {
  GDPR_PHASE2_VERSION,
  getGdprComplianceStatus,
  normalizeConsentPreferences,
  redactDeep
} = require('../src/services/gdprComplianceService');

const root = path.join(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('phase 2 GDPR status exposes live rights, controls and processing records', () => {
  const status = getGdprComplianceStatus();
  const rights = status.rights.map((item) => item.id);

  assert.equal(status.ok, true);
  assert.equal(status.active, true);
  assert.equal(status.version, GDPR_PHASE2_VERSION);
  assert.equal(status.responseTargetDays, 30);
  assert.ok(status.processingActivities.length >= 5);
  assert.match(status.controls.authenticatedExport, /\/api\/gdpr\/export/);
  assert.match(status.controls.portabilityExport, /\/api\/gdpr\/portability/);
  assert.match(status.controls.requestIntake, /\/api\/gdpr\/requests/);
  assert.match(status.controls.consentPreferences, /\/api\/gdpr\/consent/);
  assert.match(status.controls.publicStatusEndpoint, /\/health\/gdpr-compliance/);

  ['access', 'erasure', 'restriction', 'portability', 'objection', 'consent_withdrawal']
    .forEach((id) => assert.ok(rights.includes(id), `${id} right should be active`));
});

test('phase 2 GDPR export redaction keeps data copies free of secrets', () => {
  const redacted = redactDeep({
    name: 'Privacy User',
    passwordHash: 'hash',
    refreshTokens: [{ tokenHash: 'stored-token-hash' }],
    nested: {
      otp: '123456',
      code: 'reset-code',
      safeValue: 'visible'
    }
  });

  assert.equal(redacted.name, 'Privacy User');
  assert.equal(redacted.passwordHash, '[redacted]');
  assert.equal(redacted.refreshTokens, '[redacted]');
  assert.equal(redacted.nested.otp, '[redacted]');
  assert.equal(redacted.nested.code, '[redacted]');
  assert.equal(redacted.nested.safeValue, 'visible');
});

test('phase 2 GDPR consent defaults are privacy preserving', () => {
  const defaults = normalizeConsentPreferences();
  const explicit = normalizeConsentPreferences({
    marketing: true,
    analytics: true,
    location: true,
    cookies: true,
    support: false,
    source: '<profile page>'
  });

  assert.equal(defaults.marketing, false);
  assert.equal(defaults.analytics, false);
  assert.equal(defaults.location, false);
  assert.equal(defaults.cookies, false);
  assert.equal(defaults.support, true);
  assert.equal(explicit.marketing, true);
  assert.equal(explicit.analytics, true);
  assert.equal(explicit.location, true);
  assert.equal(explicit.cookies, true);
  assert.equal(explicit.support, false);
  assert.equal(explicit.source, 'profile page');
});

test('phase 2 GDPR routes, models and legal notice are wired without replacing old flows', () => {
  const appSource = read('backend/src/app.js');
  const envSource = read('backend/src/config/env.js');
  const userModel = read('backend/src/models/User.js');
  const gdprRoutes = read('backend/src/routes/gdprRoutes.js');
  const gdprRequestModel = read('backend/src/models/GdprRequest.js');
  const consentModel = read('backend/src/models/GdprConsentEvent.js');
  const legalNotice = read('pages/legal/gdpr-notice.html');

  assert.match(appSource, /require\('\.\/routes\/gdprRoutes'\)/);
  assert.match(appSource, /require\('\.\/services\/gdprComplianceService'\)/);
  assert.match(appSource, /['"]\/health\/gdpr-compliance['"]/);
  assert.match(appSource, /app\.use\(['"]\/api\/gdpr['"], strictCsrfShield\)/);
  assert.match(appSource, /app\.use\(['"]\/api\/gdpr['"], gdprRoutes\)/);
  assert.match(appSource, /['"]\/health\/fraud-detection['"]/);
  assert.match(envSource, /\/api\/gdpr\/compliance\/status/);
  assert.match(userModel, /privacyPreferences/);
  assert.match(userModel, /privacyFlags/);
  assert.match(gdprRoutes, /['"]\/export['"]/);
  assert.match(gdprRoutes, /['"]\/portability['"]/);
  assert.match(gdprRoutes, /['"]\/requests['"]/);
  assert.match(gdprRoutes, /['"]\/consent['"]/);
  assert.match(gdprRoutes, /['"]\/admin\/requests['"]/);
  assert.match(gdprRequestModel, /requestType/);
  assert.match(gdprRequestModel, /dueAt/);
  assert.match(consentModel, /consentType/);
  assert.match(consentModel, /policyVersion/);
  assert.match(legalNotice, /Last updated: 13 June 2026/);
  assert.match(legalNotice, /\/api\/gdpr\/export/);
  assert.match(legalNotice, /\/api\/gdpr\/portability/);
  assert.match(legalNotice, /\/api\/gdpr\/requests/);
  assert.match(legalNotice, /\/api\/gdpr\/consent/);
  assert.match(legalNotice, /\/health\/gdpr-compliance/);
});

test('phase 2 GDPR public health endpoint runs without database access', async () => {
  const response = await request(app)
    .get('/health/gdpr-compliance')
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.version, GDPR_PHASE2_VERSION);
  assert.match(response.body.controls.authenticatedExport, /\/api\/gdpr\/export/);
});
