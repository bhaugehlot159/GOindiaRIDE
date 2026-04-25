const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

function setMock(modulePath, exportsValue) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsValue
  };
}

function clearModule(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
}

function createUserModelMock() {
  return {
    find() {
      return {
        select() {
          return {
            async lean() {
              return [];
            }
          };
        }
      };
    }
  };
}

function loadBookingRouter({ sendEmailMock }) {
  process.env.BOOKING_FALLBACK_ALERT_ENABLED = 'true';
  process.env.BOOKING_FALLBACK_ALERT_REQUIRE_CLIENT_HEADER = 'true';
  process.env.BOOKING_FALLBACK_ALERT_ALLOWED_ORIGINS = 'https://goindiaride.in';
  process.env.BOOKING_BROWSER_CLIENT_HEADER = 'goindiaride-web';
  process.env.DEFAULT_ADMIN_ALERT_EMAIL = 'admin@goindiaride.in';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  process.env.API_SIGNATURE_SECRET = process.env.API_SIGNATURE_SECRET || 'test-signature-secret';

  setMock('../src/utils/mailer', {
    sendEmail: sendEmailMock,
    getTransporter() {
      return {};
    }
  });

  setMock('../src/models/User', createUserModelMock());

  setMock('../src/services/portalNotificationService', {
    async createBookingAdminReviewAlert() {
      return { ok: true, created: true };
    },
    async createBookingCustomerReviewNotification() {
      return { ok: true, created: true };
    },
    async createBookingPortalNotifications() {
      return { ok: true, created: true };
    }
  });

  clearModule('../src/routes/bookingRoutes');
  return require('../src/routes/bookingRoutes');
}

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/bookings', router);
  return app;
}

function createFallbackPayload() {
  return {
    bookingId: 'RIDTEST123456',
    pickup: 'Udaipur',
    drop: 'Jaipur',
    customerName: 'Test Rider',
    customerEmail: 'rider@example.com',
    customerPhone: '9999999999',
    rideDate: '2026-04-25',
    rideTime: '10:30',
    tripPlan: 'one-way',
    paymentMethod: 'cash',
    vehicleType: 'economy',
    passengers: 1,
    amount: 320,
    distanceKm: 18
  };
}

test('fallback booking route sends admin and customer emails on success', async () => {
  const calls = [];
  const router = loadBookingRouter({
    async sendEmailMock(payload) {
      calls.push(payload);
      return { messageId: `mock-${calls.length}` };
    }
  });
  const app = createApp(router);

  const response = await request(app)
    .post('/api/bookings/fallback/admin-alert-email')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web')
    .send(createFallbackPayload());

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(calls.length, 2);
  assert.match(String(calls[0].to || ''), /admin@goindiaride\.in/i);
  assert.match(String(calls[1].to || ''), /rider@example\.com/i);
  assert.equal(response.body.customerEmail && response.body.customerEmail.sent, true);
});

test('fallback booking route still attempts customer email when admin email fails', async () => {
  const calls = [];
  let callCount = 0;
  const router = loadBookingRouter({
    async sendEmailMock(payload) {
      callCount += 1;
      calls.push(payload);
      if (callCount === 1) {
        throw new Error('admin_mail_transport_error');
      }
      return { messageId: `mock-${callCount}` };
    }
  });
  const app = createApp(router);

  const response = await request(app)
    .post('/api/bookings/fallback/admin-alert-email')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web')
    .send(createFallbackPayload());

  assert.equal(response.status, 202);
  assert.equal(response.body.ok, false);
  assert.equal(calls.length, 2);
  assert.equal(response.body.adminEmail && response.body.adminEmail.sent, false);
  assert.equal(response.body.customerEmail && response.body.customerEmail.sent, true);
});
