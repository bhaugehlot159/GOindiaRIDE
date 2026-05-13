const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.API_SIGNATURE_SECRET = process.env.API_SIGNATURE_SECRET || 'test-signature-secret';
process.env.FIREBASE_KEY = process.env.FIREBASE_KEY || 'test-firebase-key';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/goindiaride_test';

const express = require('express');
const request = require('supertest');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  function matchesQuery(row, query = {}) {
    return Object.entries(query || {}).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && Array.isArray(expected.$in)) {
        return expected.$in.includes(row[key]);
      }
      return String(row[key] ?? '') === String(expected ?? '');
    });
  }

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
    find(query = {}) {
      let result = rows.filter((item) => matchesQuery(item, query));
      const chain = {
        sort() {
          result = result.slice().sort((left, right) => {
            return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
          });
          return chain;
        },
        limit(limit) {
          result = result.slice(0, Number(limit || result.length));
          return chain;
        },
        populate() {
          return chain;
        },
        lean() {
          return Promise.resolve(result);
        }
      };
      return chain;
    },
    async countDocuments(query = {}) {
      return rows.filter((item) => matchesQuery(item, query)).length;
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

function loadBookingRouter(BookingMock, reqUser = {}) {
  setMock('../src/middleware/authMiddleware', {
    authenticate(req, _res, next) {
      req.user = {
        id: TEST_USER_ID,
        email: 'rider@example.com',
        accountType: 'customer',
        role: 'customer',
        ...reqUser
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

test('fallback admin review queue bridges tokenless customer bookings into admin pending view', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gir-fallback-queue-'));
  process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE = path.join(tempDir, 'queue.json');
  t.after(() => {
    delete process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const BookingMock = createBookingModelMock();
  const app = createApp(loadBookingRouter(BookingMock, {
    id: '65f0b7d6f3a9a1b2c3d4e5a1',
    email: 'admin@example.com',
    accountType: 'admin',
    role: 'admin'
  }));
  const payload = {
    ...createLocalBookingPayload(),
    bookingId: 'RIDPUBLIC123',
    status: 'pending_admin_review'
  };

  const queueResponse = await request(app)
    .post('/api/bookings/fallback/admin-review-queue')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web')
    .send({ source: 'customer_dashboard_public_sync', bookings: [payload] });

  assert.equal(queueResponse.status, 200);
  assert.equal(queueResponse.body.ok, true);
  assert.equal(queueResponse.body.queued, 1);
  assert.equal(BookingMock.rows.length, 0);

  const publicQueueResponse = await request(app)
    .get('/api/bookings/fallback/admin-review-queue?limit=50')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web');

  assert.equal(publicQueueResponse.status, 200);
  assert.equal(publicQueueResponse.body.ok, true);
  const publicQueued = publicQueueResponse.body.items.find((item) => item.bookingId === 'RIDPUBLIC123');
  assert.ok(publicQueued);
  assert.equal(publicQueued.pickupLocation, 'Jaipur');
  assert.equal(publicQueued.adminReviewStatus, 'pending');

  const pendingResponse = await request(app)
    .get('/api/bookings/admin/pending?limit=50')
    .set('Authorization', 'Bearer admin-token');

  assert.equal(pendingResponse.status, 200);
  assert.equal(pendingResponse.body.pendingCount, 1);
  const bridged = pendingResponse.body.items.find((item) => item.bookingId === 'RIDPUBLIC123');
  assert.ok(bridged);
  assert.equal(bridged.pickupLocation, 'Jaipur');
  assert.equal(bridged.dropLocation, 'Delhi');
  assert.equal(bridged.adminReviewStatus, 'pending');
  assert.equal(bridged.sourceKey, 'customer_dashboard_public_sync');

  const reviewResponse = await request(app)
    .post('/api/bookings/RIDPUBLIC123/admin/review')
    .set('Authorization', 'Bearer admin-token')
    .send({ decision: 'approved', reason: 'Approved from admin portal test' });

  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.body.adminReviewStatus, 'approved');
  assert.equal(reviewResponse.body.status, 'approved');

  const afterReviewResponse = await request(app)
    .get('/api/bookings/admin/pending?limit=50')
    .set('Authorization', 'Bearer admin-token');

  assert.equal(afterReviewResponse.status, 200);
  assert.equal(afterReviewResponse.body.pendingCount, 0);
  assert.equal(afterReviewResponse.body.items.some((item) => item.bookingId === 'RIDPUBLIC123'), false);
});

test('public admin review queue includes live backend pending bookings without admin JWT', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gir-live-pending-queue-'));
  process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE = path.join(tempDir, 'queue.json');
  t.after(() => {
    delete process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const BookingMock = createBookingModelMock();
  BookingMock.rows.push({
    bookingId: 'RIDLIVE123456',
    status: 'created',
    adminReviewStatus: 'pending',
    pickupLocation: 'Udaipur',
    dropLocation: 'Jodhpur',
    rideDate: '2026-06-10',
    rideTime: '09:15',
    amount: 6200,
    distanceKm: 250,
    customerSnapshot: {
      name: 'Live Rider',
      email: 'live@example.com',
      phone: '+919888888888'
    },
    createdAt: new Date('2026-05-13T05:00:00.000Z'),
    updatedAt: new Date('2026-05-13T05:00:00.000Z')
  });

  const app = createApp(loadBookingRouter(BookingMock));

  const response = await request(app)
    .get('/api/bookings/fallback/admin-review-queue?limit=50')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web');

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.pendingCount, 1);
  assert.equal(response.body.storedCount, 1);
  const live = response.body.items.find((item) => item.bookingId === 'RIDLIVE123456');
  assert.ok(live);
  assert.equal(live.pickupLocation, 'Udaipur');
  assert.equal(live.dropLocation, 'Jodhpur');
  assert.equal(live.sourceKey, 'backend_booking_collection');
  assert.equal(live.adminReviewStatus, 'pending');
});

test('admin edit updates fallback booking so customer/admin stores receive latest details', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gir-admin-edit-queue-'));
  process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE = path.join(tempDir, 'queue.json');
  t.after(() => {
    delete process.env.FALLBACK_BOOKING_REVIEW_QUEUE_FILE;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const BookingMock = createBookingModelMock();
  const app = createApp(loadBookingRouter(BookingMock, {
    id: '65f0b7d6f3a9a1b2c3d4e5a1',
    email: 'admin@example.com',
    accountType: 'admin',
    role: 'admin'
  }));

  const payload = {
    ...createLocalBookingPayload(),
    bookingId: 'RIDADMINEDIT123',
    pickup: 'Jaipur',
    dropoff: 'Delhi',
    status: 'pending_admin_review'
  };

  const queueResponse = await request(app)
    .post('/api/bookings/fallback/admin-review-queue')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web')
    .send({ source: 'customer_booking_submit', bookings: [payload] });

  assert.equal(queueResponse.status, 200);
  assert.equal(queueResponse.body.queued, 1);

  const editResponse = await request(app)
    .post('/api/bookings/RIDADMINEDIT123/admin/edit')
    .set('Authorization', 'Bearer admin-token')
    .send({
      pickup: 'Jaipur Airport',
      dropoff: 'City Palace Jaipur',
      rideDate: '2026-06-02',
      rideTime: '12:45',
      vehicleType: 'SUV',
      passengers: 3,
      amount: 1250,
      distanceKm: 18,
      reason: 'Admin corrected pickup/drop for customer'
    });

  assert.equal(editResponse.status, 200);
  assert.equal(editResponse.body.booking.bookingId, 'RIDADMINEDIT123');
  assert.equal(editResponse.body.booking.pickupLocation, 'Jaipur Airport');
  assert.equal(editResponse.body.booking.dropLocation, 'City Palace Jaipur');
  assert.equal(editResponse.body.booking.amount, 1250);

  const publicQueueResponse = await request(app)
    .get('/api/bookings/fallback/admin-review-queue?limit=50')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web');

  const edited = publicQueueResponse.body.items.find((item) => item.bookingId === 'RIDADMINEDIT123');
  assert.ok(edited);
  assert.equal(edited.pickupLocation, 'Jaipur Airport');
  assert.equal(edited.dropLocation, 'City Palace Jaipur');
  assert.equal(edited.amount, 1250);
  assert.equal(edited.vehicleType, 'SUV');
});
