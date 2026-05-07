const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.API_SIGNATURE_SECRET = process.env.API_SIGNATURE_SECRET || 'test-signature-secret';
process.env.FIREBASE_KEY = process.env.FIREBASE_KEY || 'test-firebase-key';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride_test';

const express = require('express');
const request = require('supertest');

const TEST_USER_ID = '65f0b7d6f3a9a1b2c3d4e5f6';

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

function asAwaitableUser(user) {
  const query = Promise.resolve(user);
  query.select = function () {
    return {
      lean() {
        return Promise.resolve(user);
      }
    };
  };
  return query;
}

function createUserModelMock() {
  const user = {
    _id: TEST_USER_ID,
    id: TEST_USER_ID,
    name: 'Test Rider',
    fullname: 'Test Rider',
    email: 'rider@example.com',
    phone: '+919999999999',
    riskScore: 0
  };
  return {
    findById() {
      return asAwaitableUser(user);
    },
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

function createBookingModelMock() {
  const rows = [];
  return {
    rows,
    findOne(query = {}) {
      const row = rows.find((item) => item.bookingId === query.bookingId) || null;
      const promise = Promise.resolve(row);
      promise.lean = function () {
        return Promise.resolve(row);
      };
      return promise;
    },
    async create(doc) {
      const row = {
        ...doc,
        _id: `booking_${rows.length + 1}`,
        createdAt: doc.createdAt || new Date(),
        updatedAt: doc.updatedAt || new Date()
      };
      rows.push(row);
      return row;
    }
  };
}

function loadBookingRouter(BookingMock) {
  setMock('../src/middleware/authMiddleware', {
    authenticate(req, _res, next) {
      req.user = {
        id: TEST_USER_ID,
        email: 'rider@example.com',
        accountType: 'customer',
        role: 'customer'
      };
      next();
    }
  });

  setMock('../src/models/Booking', BookingMock);
  setMock('../src/models/User', createUserModelMock());
  setMock('../src/utils/mailer', {
    async sendEmail() {
      return { skipped: true };
    },
    getTransporter() {
      return {};
    }
  });
  setMock('../src/services/portalNotificationService', {
    async createBookingAdminReviewAlert() {
      return { ok: true };
    },
    async createBookingCustomerReviewNotification() {
      return { ok: true };
    },
    async createBookingPortalNotifications() {
      return { ok: true };
    }
  });

  clearModule('../src/routes/bookingRoutes');
  return require('../src/routes/bookingRoutes');
}

function createApp(router) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/bookings', router);
  return app;
}

function createLocalBookingPayload() {
  return {
    bookingId: 'RIDLOCAL123',
    customerId: 'old-browser-id',
    customerName: 'Test Rider',
    customerEmail: 'rider@example.com',
    customerPhone: '9999999999',
    pickup: 'Jaipur',
    dropoff: 'Delhi',
    rideDate: '2026-06-01',
    rideTime: '10:30',
    tripPlan: 'outstation',
    vehicleType: 'Sedan',
    passengers: 2,
    paymentMethod: 'wallet',
    amount: 4500,
    distanceKm: 280,
    fareBreakdown: {
      totalFare: 4500,
      distanceKm: 280,
      distanceSource: 'local_fallback'
    },
    adminReviewStatus: 'pending',
    status: 'pending_admin_review'
  };
}

test('customer local booking sync persists browser booking into backend store', async () => {
  const BookingMock = createBookingModelMock();
  const app = createApp(loadBookingRouter(BookingMock));

  const response = await request(app)
    .post('/api/bookings/sync-local')
    .set('Authorization', 'Bearer test-token')
    .send({ bookings: [createLocalBookingPayload()] });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.synced, 1);
  assert.equal(response.body.existing, 0);
  assert.equal(BookingMock.rows.length, 1);
  assert.equal(BookingMock.rows[0].bookingId, 'RIDLOCAL123');
  assert.equal(BookingMock.rows[0].userId, TEST_USER_ID);
  assert.equal(BookingMock.rows[0].pickupLocation, 'Jaipur');
  assert.equal(BookingMock.rows[0].dropLocation, 'Delhi');
  assert.equal(BookingMock.rows[0].amount, 4500);
  assert.equal(BookingMock.rows[0].status, 'created');
  assert.equal(BookingMock.rows[0].adminReviewStatus, 'pending');
  assert.ok(BookingMock.rows[0].cardHash);
});

test('customer local booking sync is idempotent and does not overwrite existing bookings', async () => {
  const BookingMock = createBookingModelMock();
  const app = createApp(loadBookingRouter(BookingMock));

  await request(app)
    .post('/api/bookings/sync-local')
    .set('Authorization', 'Bearer test-token')
    .send({ bookings: [createLocalBookingPayload()] });

  const secondResponse = await request(app)
    .post('/api/bookings/sync-local')
    .set('Authorization', 'Bearer test-token')
    .send({ bookings: [{ ...createLocalBookingPayload(), amount: 9999 }] });

  assert.equal(secondResponse.status, 200);
  assert.equal(secondResponse.body.synced, 0);
  assert.equal(secondResponse.body.existing, 1);
  assert.equal(BookingMock.rows.length, 1);
  assert.equal(BookingMock.rows[0].amount, 4500);
});
