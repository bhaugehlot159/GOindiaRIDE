const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// Load test credentials from environment - never hardcode secrets
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-required-for-testing-only';
process.env.API_SIGNATURE_SECRET = process.env.API_SIGNATURE_SECRET || 'test-api-signature-secret-min-32-chars-required-for-testing-only';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key-do-not-use-in-production';
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

test('customer local booking sync mirrors successful booking writes to Firebase Realtime Database', async (t) => {
  const previousEnv = {
    FIREBASE_REALTIME_DATABASE_URL: process.env.FIREBASE_REALTIME_DATABASE_URL,
    FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN: process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN,
    FIREBASE_REALTIME_DATABASE_NAMESPACE: process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE,
    FIREBASE_REALTIME_DATABASE_WAIT_FOR_WRITE: process.env.FIREBASE_REALTIME_DATABASE_WAIT_FOR_WRITE
  };
  const previousFetch = global.fetch;
  const firebaseWrites = [];

  process.env.FIREBASE_REALTIME_DATABASE_URL = 'https://goindiaride-test-default-rtdb.firebaseio.com';
  process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN = 'test-access-token';
  process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE = 'goindiaride_test';
  process.env.FIREBASE_REALTIME_DATABASE_WAIT_FOR_WRITE = 'true';
  global.fetch = async (url, options = {}) => {
    firebaseWrites.push({
      url: String(url),
      method: options.method,
      body: JSON.parse(String(options.body || 'null')),
      authorization: options.headers && options.headers.Authorization
    });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      }
    };
  };

  t.after(() => {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    global.fetch = previousFetch;
    try {
      require('../src/services/firebaseRealtimeDatabaseService').resetFirebaseRealtimeDatabaseServiceForTests();
    } catch (_error) {}
  });

  require('../src/services/firebaseRealtimeDatabaseService').resetFirebaseRealtimeDatabaseServiceForTests();
  const BookingMock = createBookingModelMock();
  const app = createApp(loadBookingRouter(BookingMock));

  const response = await request(app)
    .post('/api/bookings/sync-local')
    .set('Authorization', 'Bearer test-token')
    .send({ bookings: [createLocalBookingPayload()] });

  assert.equal(response.status, 200);
  assert.equal(response.body.synced, 1);
  assert.ok(firebaseWrites.length >= 5);
  assert.ok(firebaseWrites.every((write) => write.authorization === 'Bearer test-access-token'));

  const byIdWrite = firebaseWrites.find((write) => write.url.includes('/goindiaride_test/bookings/byId/RIDLOCAL123.json'));
  assert.ok(byIdWrite);
  assert.equal(byIdWrite.method, 'PUT');
  assert.equal(byIdWrite.body.bookingId, 'RIDLOCAL123');
  assert.equal(byIdWrite.body.userId, TEST_USER_ID);
  assert.equal(byIdWrite.body.pickupLocation, 'Jaipur');
  assert.equal(byIdWrite.body.adminReviewStatus, 'pending');

  assert.ok(firebaseWrites.some((write) => write.url.includes(`/goindiaride_test/bookings/byCustomer/${TEST_USER_ID}/RIDLOCAL123.json`)));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/admin/bookingReview/RIDLOCAL123.json')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/bookings/events/RIDLOCAL123/')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/rides/RIDLOCAL123/status.json')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/rides/RIDLOCAL123/summary.json')));
  assert.ok(firebaseWrites.some((write) => write.body && write.body.eventType === 'booking_local_synced'));
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

test('fallback admin review queue exposes every customer booking feature type to admin portal', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gir-feature-queue-'));
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
  const base = createLocalBookingPayload();
  const featureBookings = [
    {
      ...base,
      bookingId: 'RIDFEATUREAIR1',
      pickup: 'SH32, Bargaon, Udaipur',
      dropoff: 'Maharana Pratap Airport UDR',
      tripPlan: 'airport',
      tripServiceType: 'airport_drop',
      airportServiceMode: 'airport_drop',
      amount: 477,
      distanceKm: 24
    },
    {
      ...base,
      bookingId: 'RIDFEATURELOC1',
      pickup: 'Udaipur City Palace',
      dropoff: 'Fateh Sagar Lake',
      tripPlan: 'local',
      tripServiceType: 'local_city',
      amount: 320,
      distanceKm: 8
    },
    {
      ...base,
      bookingId: 'RIDFEATUREDAY1',
      pickup: 'Jaipur Hotel',
      dropoff: 'Jaipur Full Day Plan',
      tripPlan: 'day_plan',
      tripServiceType: 'full_day',
      amount: 2400,
      distanceKm: 80
    },
    {
      ...base,
      bookingId: 'RIDFEATUREOUT1',
      pickup: 'Udaipur, Rajasthan',
      dropoff: 'Jaipur, Rajasthan',
      tripPlan: 'outstation',
      tripServiceType: 'one_way',
      amount: 6129,
      distanceKm: 395
    }
  ];

  const queueResponse = await request(app)
    .post('/api/bookings/fallback/admin-review-queue')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web')
    .send({ source: 'customer_booking_submit', bookings: featureBookings });

  assert.equal(queueResponse.status, 200);
  assert.equal(queueResponse.body.ok, true);
  assert.equal(queueResponse.body.queued, 4);

  const publicQueueResponse = await request(app)
    .get('/api/bookings/fallback/admin-review-queue?limit=50')
    .set('Origin', 'https://goindiaride.in')
    .set('x-booking-client', 'goindiaride-web');

  assert.equal(publicQueueResponse.status, 200);
  for (const booking of featureBookings) {
    const queued = publicQueueResponse.body.items.find((item) => item.bookingId === booking.bookingId);
    assert.ok(queued, `${booking.bookingId} should be in public admin queue`);
    assert.equal(queued.adminReviewStatus, 'pending');
    assert.equal(queued.sourceKey, 'customer_booking_submit');
    assert.equal(queued.customerName, 'Test Rider');
    assert.equal(queued.pickupLocation, booking.pickup);
    assert.equal(queued.dropLocation, booking.dropoff);
  }

  const pendingResponse = await request(app)
    .get('/api/bookings/admin/pending?limit=50')
    .set('Authorization', 'Bearer admin-token');

  assert.equal(pendingResponse.status, 200);
  assert.equal(pendingResponse.body.pendingCount, 4);
  for (const booking of featureBookings) {
    const pending = pendingResponse.body.items.find((item) => item.bookingId === booking.bookingId);
    assert.ok(pending, `${booking.bookingId} should be visible in admin pending bookings`);
    assert.equal(pending.pickupLocation, booking.pickup);
    assert.equal(pending.dropLocation, booking.dropoff);
    assert.equal(pending.adminReviewStatus, 'pending');
  }
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
