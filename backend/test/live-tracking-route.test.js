const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-chars-required-for-testing-only';
process.env.FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'test-firebase-api-key-do-not-use-in-production';

const express = require('express');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');

const TEST_USER_ID = '65f0b7d6f3a9a1b2c3d4e5f6';
const OTHER_USER_ID = '65f0b7d6f3a9a1b2c3d4e5aa';
const REPO_ROOT = path.join(__dirname, '..', '..');

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

function matchesFilter(row, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => String(row[key] ?? '') === String(expected ?? ''));
}

function applyUpdate(row, update = {}) {
  const now = new Date();
  const next = {
    ...row,
    ...(update.$set || {}),
    updatedAt: now,
    createdAt: row.createdAt || now
  };
  if (update.$push && update.$push.history) {
    const push = update.$push.history;
    const items = Array.isArray(push.$each) ? push.$each : [push];
    const history = [...(row.history || []), ...items];
    const slice = Number(push.$slice || 0);
    next.history = slice < 0 ? history.slice(slice) : history;
  }
  return next;
}

function createLiveLocationModelMock(seedRows = []) {
  const rows = seedRows.map((row, index) => ({
    _id: `live_${index + 1}`,
    history: [],
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
    updatedAt: new Date('2026-06-12T00:00:00.000Z'),
    ...row
  }));

  return {
    rows,
    findOneAndUpdate(filter = {}, update = {}, options = {}) {
      let index = rows.findIndex((row) => matchesFilter(row, filter));
      if (index === -1 && options.upsert) {
        rows.push({
          _id: `live_${rows.length + 1}`,
          history: [],
          createdAt: new Date()
        });
        index = rows.length - 1;
      }
      const row = index >= 0 ? applyUpdate(rows[index], update) : null;
      if (index >= 0) rows[index] = row;
      const query = Promise.resolve(row);
      query.lean = function () {
        return Promise.resolve(row);
      };
      return query;
    },
    find(filter = {}) {
      let result = rows.filter((row) => matchesFilter(row, filter));
      const chain = {
        sort(sortSpec = {}) {
          if (sortSpec.updatedAt === -1) {
            result = result.slice().sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0));
          }
          return chain;
        },
        limit(limit) {
          result = result.slice(0, Number(limit || result.length));
          return chain;
        },
        select() {
          return chain;
        },
        lean() {
          return Promise.resolve(result);
        }
      };
      return chain;
    }
  };
}

function createBookingModelMock(seedRows = []) {
  return {
    rows: seedRows.slice(),
    findOne(query = {}) {
      const row = this.rows.find((item) => String(item.bookingId || '') === String(query.bookingId || '')) || null;
      const promise = Promise.resolve(row);
      promise.lean = function () {
        return Promise.resolve(row);
      };
      return promise;
    }
  };
}

function loadLiveTrackingRouter(LiveLocationMock, reqUser = {}, BookingMock = createBookingModelMock()) {
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
  setMock('../src/models/LiveLocation', LiveLocationMock);
  setMock('../src/models/Booking', BookingMock);
  clearModule('../src/routes/liveTrackingRoutes');
  return require('../src/routes/liveTrackingRoutes');
}

function createApp(router) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/live-tracking', router);
  return app;
}

test('live tracking location route persists driver GPS and mirrors to Firebase Realtime Database', async (t) => {
  const previousEnv = {
    FIREBASE_REALTIME_DATABASE_URL: process.env.FIREBASE_REALTIME_DATABASE_URL,
    FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN: process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN,
    FIREBASE_REALTIME_DATABASE_NAMESPACE: process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE
  };
  const previousFetch = global.fetch;
  const firebaseWrites = [];

  process.env.FIREBASE_REALTIME_DATABASE_URL = 'https://goindiaride-test-default-rtdb.firebaseio.com';
  process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN = 'test-access-token';
  process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE = 'goindiaride_test';
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
  const LiveLocationMock = createLiveLocationModelMock();
  const app = createApp(loadLiveTrackingRouter(LiveLocationMock, {
    accountType: 'driver',
    role: 'driver'
  }));

  const response = await request(app)
    .post('/api/live-tracking/location')
    .set('Authorization', 'Bearer test-token')
    .send({
      subjectType: 'driver',
      bookingId: 'RIDLIVE123',
      sessionId: 'driver-session-1',
      lat: 26.9124336,
      lng: 75.7872709,
      accuracy: 14.8,
      speed: 8.25,
      heading: 90,
      capturedAt: '2026-06-12T10:00:00.000Z',
      source: 'driver_portal_geolocation'
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.location.subjectType, 'driver');
  assert.equal(response.body.location.bookingId, 'RIDLIVE123');
  assert.equal(response.body.location.lat, 26.9124336);
  assert.equal(LiveLocationMock.rows.length, 1);
  assert.equal(LiveLocationMock.rows[0].userId, TEST_USER_ID);
  assert.equal(LiveLocationMock.rows[0].history.length, 1);

  assert.ok(firebaseWrites.length >= 5);
  assert.ok(firebaseWrites.every((write) => write.authorization === 'Bearer test-access-token'));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/liveTracking/latest/bySubject/driver/driver_65f0b7d6f3a9a1b2c3d4e5f6.json')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/liveTracking/latest/byBooking/RIDLIVE123/')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/drivers/65f0b7d6f3a9a1b2c3d4e5f6/location.json')));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/rides/RIDLIVE123/liveLocation/driver/65f0b7d6f3a9a1b2c3d4e5f6.json')));
  assert.ok(firebaseWrites.some((write) => write.body && write.body.eventType === 'live_location_updated'));
});

test('notification mirror writes Firebase Realtime Database notifications path', async (t) => {
  const previousEnv = {
    FIREBASE_REALTIME_DATABASE_URL: process.env.FIREBASE_REALTIME_DATABASE_URL,
    FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN: process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN,
    FIREBASE_REALTIME_DATABASE_NAMESPACE: process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE
  };
  const previousFetch = global.fetch;
  const firebaseWrites = [];

  process.env.FIREBASE_REALTIME_DATABASE_URL = 'https://goindiaride-test-default-rtdb.firebaseio.com';
  process.env.FIREBASE_REALTIME_DATABASE_ACCESS_TOKEN = 'test-access-token';
  process.env.FIREBASE_REALTIME_DATABASE_NAMESPACE = 'goindiaride_test';
  global.fetch = async (url, options = {}) => {
    firebaseWrites.push({
      url: String(url),
      method: options.method,
      body: JSON.parse(String(options.body || 'null'))
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

  const {
    publishNotificationRealtimeUpdate,
    resetFirebaseRealtimeDatabaseServiceForTests
  } = require('../src/services/firebaseRealtimeDatabaseService');
  resetFirebaseRealtimeDatabaseServiceForTests();
  const result = await publishNotificationRealtimeUpdate({
    _id: 'notif_1',
    userId: TEST_USER_ID,
    audience: 'customer',
    bookingId: 'RIDLIVE123',
    type: 'driver_assigned',
    title: 'Driver assigned',
    message: 'Your driver is on the way.',
    metadata: { source: 'test' },
    createdAt: '2026-06-12T10:00:00.000Z'
  }, { eventType: 'driver_assigned_notification' });

  assert.equal(result.ok, true);
  assert.ok(firebaseWrites.some((write) => write.url.includes(`/goindiaride_test/notifications/${TEST_USER_ID}/notif_1.json`)));
  assert.ok(firebaseWrites.some((write) => write.url.includes('/goindiaride_test/rides/RIDLIVE123/notifications/notif_1.json')));
  assert.ok(firebaseWrites.some((write) => write.body && write.body.eventType === 'driver_assigned_notification'));
});

test('live tracking read endpoint returns own rows for customers and all rows for admin', async () => {
  const seedRows = [
    {
      _id: 'own',
      subjectType: 'customer',
      userId: TEST_USER_ID,
      bookingId: 'RIDOWN',
      sessionId: 'customer-session',
      lat: 26.91,
      lng: 75.78,
      status: 'tracking',
      updatedAt: new Date('2026-06-12T10:10:00.000Z')
    },
    {
      _id: 'other',
      subjectType: 'driver',
      userId: OTHER_USER_ID,
      bookingId: 'RIDOTHER',
      sessionId: 'driver-session',
      lat: 27.02,
      lng: 75.90,
      status: 'tracking',
      updatedAt: new Date('2026-06-12T10:11:00.000Z')
    }
  ];

  const customerModel = createLiveLocationModelMock(seedRows);
  const customerApp = createApp(loadLiveTrackingRouter(customerModel));
  const customerResponse = await request(customerApp)
    .get('/api/live-tracking/locations?limit=20')
    .set('Authorization', 'Bearer test-token');

  assert.equal(customerResponse.status, 200);
  assert.equal(customerResponse.body.count, 1);
  assert.equal(customerResponse.body.items[0].bookingId, 'RIDOWN');
  assert.equal(customerResponse.body.accessScope, 'self');

  const adminModel = createLiveLocationModelMock(seedRows);
  const adminApp = createApp(loadLiveTrackingRouter(adminModel, {
    accountType: 'admin',
    role: 'admin'
  }));
  const adminResponse = await request(adminApp)
    .get('/api/live-tracking/locations?limit=20')
    .set('Authorization', 'Bearer admin-token');

  assert.equal(adminResponse.status, 200);
  assert.equal(adminResponse.body.count, 2);
  assert.deepEqual(adminResponse.body.items.map((item) => item.bookingId).sort(), ['RIDOTHER', 'RIDOWN']);
});

test('customer can read assigned driver GPS for their booking only', async () => {
  const seedRows = [
    {
      _id: 'driver-live',
      subjectType: 'driver',
      userId: OTHER_USER_ID,
      bookingId: 'RIDASSIGNED',
      sessionId: 'driver-session',
      lat: 26.92,
      lng: 75.81,
      status: 'tracking',
      updatedAt: new Date('2026-06-12T10:11:00.000Z')
    }
  ];
  const bookingMock = createBookingModelMock([
    {
      bookingId: 'RIDASSIGNED',
      userId: TEST_USER_ID,
      driverId: OTHER_USER_ID
    }
  ]);
  const app = createApp(loadLiveTrackingRouter(createLiveLocationModelMock(seedRows), {}, bookingMock));

  const response = await request(app)
    .get('/api/live-tracking/locations?bookingId=RIDASSIGNED&subjectType=driver&status=tracking&limit=5')
    .set('Authorization', 'Bearer test-token');

  assert.equal(response.status, 200);
  assert.equal(response.body.accessScope, 'customer_assigned_driver_location');
  assert.equal(response.body.count, 1);
  assert.equal(response.body.items[0].userId, OTHER_USER_ID);
  assert.equal(response.body.items[0].bookingId, 'RIDASSIGNED');
});

test('live GPS integration is visible in customer, driver, and admin portal files', () => {
  const driverJs = fs.readFileSync(path.join(REPO_ROOT, 'driver/js/driver-portal.js'), 'utf8');
  const customerJs = fs.readFileSync(path.join(REPO_ROOT, 'js/customer-dashboard-live-bridge.js'), 'utf8');
  const customerOps = fs.readFileSync(path.join(REPO_ROOT, 'customer/chunks/dashboard/scripts/customer-live-ops.js'), 'utf8');
  const adminJs = fs.readFileSync(path.join(REPO_ROOT, 'admin/js/safety-monitoring.js'), 'utf8');

  assert.match(driverJs, /navigator\.geolocation\.watchPosition/);
  assert.match(driverJs, /\/api\/live-tracking\/location/);
  assert.match(driverJs, /goindiaride_driver_live_locations_v1/);

  assert.match(customerJs, /navigator\.geolocation\.watchPosition/);
  assert.match(customerJs, /\/api\/live-tracking['"]\s*\+\s*route/);
  assert.match(customerJs, /\/location/);
  assert.match(customerJs, /goindiaride_customer_live_locations_v1/);
  assert.match(customerJs, /requestLiveTracking/);
  assert.match(customerOps, /Driver live GPS/);
  assert.match(customerOps, /subjectType=driver/);
  assert.match(customerOps, /live-driver-map/);

  assert.doesNotMatch(adminJs, /Live Tracking Integration/);
  assert.match(adminJs, /liveTrackingRowsBody/);
  assert.match(adminJs, /\/api\/live-tracking\/locations/);
});
