const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

function loadApp() {
  process.env.NODE_ENV = 'test';
  // Load test credentials from environment or use safe test defaults
  // NEVER use production credentials in tests
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-required-for-testing-only';
  process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key-do-not-use-in-production';
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride-test';
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test-whatsapp-token-do-not-use-in-production';

  delete require.cache[require.resolve('../src/app')];
  return require('../src/app');
}

test('Meta WhatsApp webhook verification returns the challenge for the configured token', async () => {
  const app = loadApp();
  
  // Use the token from environment (set by loadApp)
  const testToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test-whatsapp-token-do-not-use-in-production';

  const response = await request(app)
    .get('/webhook')
    .query({
      'hub.mode': 'subscribe',
      'hub.verify_token': testToken,
      'hub.challenge': 'meta-challenge-123'
    });

  assert.equal(response.status, 200);
  assert.equal(response.text, 'meta-challenge-123');
  assert.match(response.headers['content-type'], /^text\/plain/);
});

test('root API route returns service status instead of route not found', async () => {
  const app = loadApp();

  const response = await request(app).get('/');

  assert.equal(response.status, 200);
  assert.equal(response.body.service, 'GO India RIDE API');
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.auth, '/api/auth');
});

test('auth base route returns available auth endpoints', async () => {
  const app = loadApp();

  const response = await request(app).get('/api/auth');

  assert.equal(response.status, 200);
  assert.equal(response.body.service, 'GO India RIDE Auth API');
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.endpoints.login, 'POST /api/auth/login');
  assert.equal(response.body.endpoints.register, 'POST /api/auth/register');
});

test('Meta WhatsApp webhook verification rejects a wrong token', async () => {
  const app = loadApp();

  const response = await request(app)
    .get('/webhook')
    .query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'meta-challenge-123'
    });

  assert.equal(response.status, 403);
});

test('Meta WhatsApp webhook receive endpoint acknowledges POST events', async () => {
  const app = loadApp();

  const response = await request(app)
    .post('/webhook')
    .send({
      object: 'whatsapp_business_account',
      entry: [{ id: 'test-entry', changes: [] }]
    });

  assert.equal(response.status, 200);
});

test('API webhook alias supports the same verification flow', async () => {
  const app = loadApp();
  
  // Use the token from environment (set by loadApp)
  const testToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'test-whatsapp-token-do-not-use-in-production';

  const response = await request(app)
    .get('/api/webhook')
    .query({
      'hub.mode': 'subscribe',
      'hub.verify_token': testToken,
      'hub.challenge': 'api-alias-challenge'
    });

  assert.equal(response.status, 200);
  assert.equal(response.text, 'api-alias-challenge');
});
