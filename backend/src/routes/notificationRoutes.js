const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

const router = express.Router();

function getAudienceScope(user) {
  if (user.role === 'admin' || user.accountType === 'admin') {
    return 'admin';
  }

  if (user.accountType === 'driver') {
    return 'driver';
  }

  return 'customer';
}

function buildInboxFilter(user) {
  const scope = getAudienceScope(user);

  if (scope === 'admin') {
    return {
      $or: [
        { userId: user.id },
        { userId: null, audience: 'admin' }
      ]
    };
  }

  if (scope === 'driver') {
    return {
      $or: [
        { userId: user.id },
        { userId: null, audience: 'driver' }
      ]
    };
  }

  return {
    $or: [
      { userId: user.id },
      { userId: null, audience: 'customer' }
    ]
  };
}

router.get('/', authenticate, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
  const filter = buildInboxFilter(req.user);

  if (unreadOnly) {
    filter.isRead = false;
  }

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Notification.countDocuments({ ...buildInboxFilter(req.user), isRead: false })
  ]);

  return res.status(200).json({
    scope: getAudienceScope(req.user),
    unreadCount,
    count: items.length,
    items
  });
});

router.post('/:id/read', authenticate, async (req, res) => {
  const filter = {
    _id: req.params.id,
    ...buildInboxFilter(req.user)
  };

  const notification = await Notification.findOneAndUpdate(
    filter,
    { isRead: true, readAt: new Date() },
    { new: true }
  ).lean();

  if (!notification) {
    return res.status(404).json({ message: 'Notification not found' });
  }

  return res.status(200).json({
    id: notification._id,
    isRead: notification.isRead,
    readAt: notification.readAt
  });
});

router.post('/read-all', authenticate, async (req, res) => {
  const filter = {
    ...buildInboxFilter(req.user),
    isRead: false
  };

  const result = await Notification.updateMany(filter, {
    isRead: true,
    readAt: new Date()
  });

  return res.status(200).json({ updated: result.modifiedCount || 0 });
});

// === FUTURE_ROUTES_BUSINESS_NOTIFICATIONROUTES_START ===
{
// Source: backend/src/routes/futureBusinessRoutes.js

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');


  const DATA_DIR = path.join(__dirname, '../../../data/runtime');
  const DATA_FILE = path.join(DATA_DIR, 'future-business-store.json');
  const RAJASTHAN_DETAILS_FILE = path.join(__dirname, '../../../data/format-2-json/states/rajasthan-50-complete.json');

  const MAX_NOTIFICATIONS = 20000;
  const MAX_WALLET_HISTORY = 3000;
  const MAX_RIDES_PER_USER = 5000;
  const MAX_COMMISSIONS = 10000;
  const MAX_TOURISM_PLACES = 10000;
  const MAX_LISTINGS = 20000;
  const MAX_PACKAGES = 8000;
  const MAX_PACKAGE_BOOKINGS = 30000;
  const MAX_REFERRALS = 40000;
  const MAX_REVIEWS = 30000;
  const MAX_TERMS_CONSENTS = 30000;
  const MAX_SUPPORT_TICKETS = 30000;
  const MAX_WEBHOOK_EVENTS = 20000;
  const MAX_OTP_EVENTS = 50000;
  const MAX_AUTH_LOGS = 50000;
  const MAX_BOOKING_ACTIONS = 50000;
  const MAX_DISPUTES = 20000;
  const MAX_FRAUD_ALERTS = 20000;
  const MAX_AI_CHATS = 60000;
  const MAX_SAVED_LOCATIONS = 30000;
  const MAX_FEATURE_STATES = 15000;
  const MAX_FEATURE_ACTIONS = 120000;

  let persistTimer = null;
  let rajasthanDetailsCache = null;

  const seedTourismPlaces = [
    { district: 'Jaipur', name: 'Amer Fort', category: 'Fort', history: '16th century hill fort.', entryFee: '100', openTime: '08:00', closeTime: '17:30', parking: true },
    { district: 'Jaipur', name: 'Hawa Mahal', category: 'Palace', history: 'Pink sandstone palace facade.', entryFee: '50', openTime: '09:00', closeTime: '17:00', parking: true },
    { district: 'Jodhpur', name: 'Mehrangarh Fort', category: 'Fort', history: 'Rao Jodha era fort.', entryFee: '200', openTime: '09:00', closeTime: '17:30', parking: true },
    { district: 'Udaipur', name: 'City Palace', category: 'Palace', history: 'Mewar dynasty royal complex.', entryFee: '300', openTime: '09:30', closeTime: '17:30', parking: true },
    { district: 'Ajmer', name: 'Ajmer Sharif Dargah', category: 'Heritage', history: 'Sufi shrine and spiritual site.', entryFee: '0', openTime: '05:00', closeTime: '22:00', parking: true },
    { district: 'Pushkar', name: 'Brahma Temple', category: 'Temple', history: 'Rare temple dedicated to Lord Brahma.', entryFee: '0', openTime: '06:00', closeTime: '20:00', parking: true }
  ];

  const RAJASTHAN_DISTRICTS = [
    'Ajmer',
    'Alwar',
    'Anupgarh',
    'Balotra',
    'Banswara',
    'Baran',
    'Barmer',
    'Beawar',
    'Bharatpur',
    'Bhilwara',
    'Bikaner',
    'Bundi',
    'Chittorgarh',
    'Churu',
    'Dausa',
    'Deeg',
    'Didwana-Kuchaman',
    'Dholpur',
    'Dungarpur',
    'Gangapur City',
    'Hanumangarh',
    'Jaipur',
    'Jaipur Rural',
    'Jaisalmer',
    'Jalore',
    'Jhalawar',
    'Jhunjhunu',
    'Jodhpur',
    'Jodhpur Rural',
    'Karauli',
    'Kekri',
    'Khairthal-Tijara',
    'Kota',
    'Kotputli-Behror',
    'Nagaur',
    'Neem Ka Thana',
    'Pali',
    'Phalodi',
    'Pratapgarh',
    'Rajsamand',
    'Salumbar',
    'Sanchore',
    'Sawai Madhopur',
    'Shahpura',
    'Sikar',
    'Sirohi',
    'Sri Ganganagar',
    'Tonk',
    'Udaipur',
    'Dudu'
  ];

  const currencyRates = {
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0094,
    AED: 0.044
  };

  const vehicleBaseRates = {
    economy: 10,
    sedan: 15,
    suv: 20,
    premium: 25,
    xl: 28
  };

  function ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  function normalizeString(value, maxLength) {
    const str = String(value || '').trim();
    if (!str) return '';
    if (!Number.isFinite(maxLength) || maxLength <= 0) return str;
    return str.slice(0, maxLength);
  }

  function normalizeAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Number(n.toFixed(2));
  }

  function safeObject(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input;
  }

  function clone(input) {
    return JSON.parse(JSON.stringify(input));
  }

  function defaultStore() {
    return {
      wallets: {},
      notifications: [],
      travelCards: {},
      commissions: [],
      listings: [],
      packages: [],
      packageBookings: [],
      referrals: [],
      reviews: [],
      otpEvents: [],
      authLogs: [],
      bookingActions: [],
      disputes: [],
      fraudAlerts: [],
      aiChats: [],
      savedLocations: [],
      featureStates: {},
      featureActions: [],
      termsConsents: [],
      supportTickets: [],
      webhookEvents: [],
      tourismPlaces: seedTourismPlaces.map((item) => ({
        id: crypto.randomUUID(),
        district: item.district,
        name: item.name,
        category: item.category,
        history: item.history,
        entryFee: item.entryFee,
        openTime: item.openTime,
        closeTime: item.closeTime,
        parking: item.parking,
        createdAt: new Date().toISOString()
      })),
      rideHistory: {},
      preferences: {},
      counters: {
        packagesBooked: 0,
        referralsTracked: 0,
        supportTickets: 0,
        webhookEvents: 0
      }
    };
  }

  function loadStore() {
    try {
      if (!fs.existsSync(DATA_FILE)) return defaultStore();
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const store = defaultStore();
      return {
        ...store,
        ...safeObject(parsed),
        wallets: safeObject(parsed.wallets),
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications.slice(-MAX_NOTIFICATIONS) : [],
        travelCards: safeObject(parsed.travelCards),
        commissions: Array.isArray(parsed.commissions) ? parsed.commissions.slice(-MAX_COMMISSIONS) : [],
        listings: Array.isArray(parsed.listings) ? parsed.listings.slice(-MAX_LISTINGS) : [],
        packages: Array.isArray(parsed.packages) ? parsed.packages.slice(-MAX_PACKAGES) : [],
        packageBookings: Array.isArray(parsed.packageBookings) ? parsed.packageBookings.slice(-MAX_PACKAGE_BOOKINGS) : [],
        referrals: Array.isArray(parsed.referrals) ? parsed.referrals.slice(-MAX_REFERRALS) : [],
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews.slice(-MAX_REVIEWS) : [],
        otpEvents: Array.isArray(parsed.otpEvents) ? parsed.otpEvents.slice(-MAX_OTP_EVENTS) : [],
        authLogs: Array.isArray(parsed.authLogs) ? parsed.authLogs.slice(-MAX_AUTH_LOGS) : [],
        bookingActions: Array.isArray(parsed.bookingActions) ? parsed.bookingActions.slice(-MAX_BOOKING_ACTIONS) : [],
        disputes: Array.isArray(parsed.disputes) ? parsed.disputes.slice(-MAX_DISPUTES) : [],
        fraudAlerts: Array.isArray(parsed.fraudAlerts) ? parsed.fraudAlerts.slice(-MAX_FRAUD_ALERTS) : [],
        aiChats: Array.isArray(parsed.aiChats) ? parsed.aiChats.slice(-MAX_AI_CHATS) : [],
        savedLocations: Array.isArray(parsed.savedLocations) ? parsed.savedLocations.slice(-MAX_SAVED_LOCATIONS) : [],
        featureStates: safeObject(parsed.featureStates),
        featureActions: Array.isArray(parsed.featureActions) ? parsed.featureActions.slice(-MAX_FEATURE_ACTIONS) : [],
        termsConsents: Array.isArray(parsed.termsConsents) ? parsed.termsConsents.slice(-MAX_TERMS_CONSENTS) : [],
        supportTickets: Array.isArray(parsed.supportTickets) ? parsed.supportTickets.slice(-MAX_SUPPORT_TICKETS) : [],
        webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents.slice(-MAX_WEBHOOK_EVENTS) : [],
        tourismPlaces: Array.isArray(parsed.tourismPlaces) && parsed.tourismPlaces.length
          ? parsed.tourismPlaces.slice(-MAX_TOURISM_PLACES)
          : store.tourismPlaces,
        rideHistory: safeObject(parsed.rideHistory),
        preferences: safeObject(parsed.preferences),
        counters: {
          ...safeObject(store.counters),
          ...safeObject(parsed.counters)
        }
      };
    } catch (_error) {
      return defaultStore();
    }
  }

  function loadRajasthanDetails() {
    if (rajasthanDetailsCache && typeof rajasthanDetailsCache === 'object') {
      return rajasthanDetailsCache;
    }
    try {
      const raw = fs.readFileSync(RAJASTHAN_DETAILS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const districts = safeObject(parsed && parsed.districts);
      const index = {};
      Object.keys(districts).forEach((name) => {
        index[normalizeString(name, 120).toLowerCase()] = districts[name];
      });
      rajasthanDetailsCache = {
        ok: true,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: safeObject(parsed && parsed.metadata),
        districts,
        index
      };
      return rajasthanDetailsCache;
    } catch (_error) {
      rajasthanDetailsCache = {
        ok: false,
        sourceFile: RAJASTHAN_DETAILS_FILE,
        metadata: {},
        districts: {},
        index: {}
      };
      return rajasthanDetailsCache;
    }
  }

  function resolveDistrictDetailByName(name) {
    const dataset = loadRajasthanDetails();
    const key = normalizeString(name, 120).toLowerCase();
    if (!key) return null;
    if (dataset.index[key]) return dataset.index[key];

    const simplified = key.replace(/[^a-z0-9]/g, '');
    const keys = Object.keys(dataset.index);
    for (let i = 0; i < keys.length; i += 1) {
      const source = keys[i];
      const sourceSimple = source.replace(/[^a-z0-9]/g, '');
      if (sourceSimple === simplified) return dataset.index[source];
    }
    return null;
  }

  function getStore() {
    if (!global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__) {
      global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__ = loadStore();
    }
    return global.__GOINDIARIDE_FUTURE_BUSINESS_STORE__;
  }

  function writeStore() {
    try {
      ensureDir();
      const data = getStore();
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (_error) {
      // Non-blocking persistence.
    }
  }

  function queuePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeStore();
    }, 400);
  }

  function walletForUser(store, userKey) {
    if (!store.wallets[userKey]) {
      store.wallets[userKey] = {
        userKey,
        balance: 0,
        history: []
      };
    }
    return store.wallets[userKey];
  }

  function addWalletEntry(wallet, type, amount, meta) {
    const entry = {
      id: crypto.randomUUID(),
      type,
      amount: normalizeAmount(amount),
      meta: safeObject(meta),
      createdAt: new Date().toISOString()
    };
    wallet.history.push(entry);
    if (wallet.history.length > MAX_WALLET_HISTORY) {
      wallet.history = wallet.history.slice(-MAX_WALLET_HISTORY);
    }
    return entry;
  }

  function addRideHistory(store, payload) {
    const userKey = normalizeString(payload.userKey, 80);
    if (!userKey) return null;

    if (!store.rideHistory[userKey]) store.rideHistory[userKey] = [];
    const record = {
      id: crypto.randomUUID(),
      bookingId: normalizeString(payload.bookingId, 100) || `BK-${Date.now()}`,
      from: normalizeString(payload.from, 180),
      to: normalizeString(payload.to, 180),
      distanceKm: normalizeAmount(payload.distanceKm),
      fare: normalizeAmount(payload.fare),
      status: normalizeString(payload.status, 30) || 'completed',
      driverName: normalizeString(payload.driverName, 120),
      rating: normalizeAmount(payload.rating),
      feedback: normalizeString(payload.feedback, 500),
      createdAt: new Date().toISOString()
    };

    store.rideHistory[userKey].push(record);
    if (store.rideHistory[userKey].length > MAX_RIDES_PER_USER) {
      store.rideHistory[userKey] = store.rideHistory[userKey].slice(-MAX_RIDES_PER_USER);
    }
    return record;
  }

  function normalizeVehicleType(value) {
    const key = normalizeString(value, 30).toLowerCase();
    if (vehicleBaseRates[key]) return key;
    if (key.includes('hatch') || key.includes('economy')) return 'economy';
    if (key.includes('prem')) return 'premium';
    if (key.includes('xl')) return 'xl';
    if (key.includes('suv')) return 'suv';
    return 'sedan';
  }

  function normalizeCurrency(value) {
    const key = normalizeString(value, 10).toUpperCase();
    return currencyRates[key] ? key : 'INR';
  }

  function estimateFare(payload) {
    const distanceKm = Math.max(0, normalizeAmount(payload.distanceKm || payload.distance || 0));
    const durationMin = Math.max(0, normalizeAmount(payload.durationMin || payload.duration || 0));
    const vehicleType = normalizeVehicleType(payload.vehicleType || payload.rideType);
    const basePerKm = vehicleBaseRates[vehicleType] || vehicleBaseRates.sedan;
    const seasonMultiplier = Math.max(0.5, Math.min(3, normalizeAmount(payload.seasonMultiplier || 1) || 1));
    const trafficMultiplier = Math.max(0.5, Math.min(2, normalizeAmount(payload.trafficMultiplier || 1) || 1));
    const waitingCharge = Math.max(0, normalizeAmount(payload.waitingCharge || 0));
    const tollCharge = Math.max(0, normalizeAmount(payload.tollCharge || 0));
    const parkingCharge = Math.max(0, normalizeAmount(payload.parkingCharge || 0));
    const offerPercent = Math.max(0, Math.min(80, normalizeAmount(payload.offerPercent || payload.discountPercent || 0)));

    const distanceFare = normalizeAmount(distanceKm * basePerKm);
    const timeFare = normalizeAmount(durationMin * 0.5);
    const grossInr = normalizeAmount((distanceFare + timeFare + waitingCharge + tollCharge + parkingCharge) * seasonMultiplier * trafficMultiplier);
    const discount = normalizeAmount((grossInr * offerPercent) / 100);
    const netInr = Math.max(0, normalizeAmount(grossInr - discount));
    const currency = normalizeCurrency(payload.currency);
    const converted = normalizeAmount(netInr * (currencyRates[currency] || 1));

    return {
      vehicleType,
      currency,
      basePerKm,
      distanceKm,
      durationMin,
      distanceFare,
      timeFare,
      waitingCharge,
      tollCharge,
      parkingCharge,
      seasonMultiplier,
      trafficMultiplier,
      offerPercent,
      grossInr,
      discountInr: discount,
      finalInr: netInr,
      convertedFare: converted,
      calculatedAt: new Date().toISOString()
    };
  }

  function pushWithCap(list, item, maxLimit) {
    list.push(item);
    if (list.length > maxLimit) {
      list.splice(0, list.length - maxLimit);
    }
  }

  function generateOtpCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function normalizeBookingStatus(value) {
    const key = normalizeString(value, 40).toLowerCase();
    if (key.includes('accept')) return 'accepted';
    if (key.includes('pick')) return 'picked_up';
    if (key.includes('start')) return 'started';
    if (key.includes('complete')) return 'completed';
    if (key.includes('cancel')) return 'cancelled';
    if (key.includes('resched')) return 'rescheduled';
    if (key.includes('reject')) return 'rejected';
    return key || 'updated';
  }

  function addAuthLog(store, payload) {
    const item = {
      id: crypto.randomUUID(),
      userKey: normalizeString(payload.userKey, 80) || 'guest-user',
      action: normalizeString(payload.action, 80) || 'auth-event',
      channel: normalizeString(payload.channel, 40) || 'app',
      success: payload.success !== undefined ? Boolean(payload.success) : true,
      message: normalizeString(payload.message, 320),
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.authLogs, item, MAX_AUTH_LOGS);
    return item;
  }

  function buildFeatureStateKey(userKey, featureId) {
    return `${normalizeString(userKey, 80) || 'guest-user'}::${normalizeString(featureId, 80)}`;
  }


  // Route: /notifications/send
  router.post('/notifications/send', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80) || 'global';
    const type = normalizeString(req.body?.type, 80) || 'system';
    const channel = normalizeString(req.body?.channel, 40) || 'in_app';
    const title = normalizeString(req.body?.title, 160);
    const message = normalizeString(req.body?.message, 800);

    if (!title || !message) {
      return res.status(400).json({ ok: false, message: 'title and message are required' });
    }

    const notification = {
      id: crypto.randomUUID(),
      userKey,
      type,
      channel,
      title,
      message,
      read: false,
      meta: safeObject(req.body?.meta),
      createdAt: new Date().toISOString()
    };

    store.notifications.push(notification);
    if (store.notifications.length > MAX_NOTIFICATIONS) {
      store.notifications.splice(0, store.notifications.length - MAX_NOTIFICATIONS);
    }
    queuePersist();

    return res.status(201).json({ ok: true, notification });
  });


  // Route: /notifications/:userKey
  router.get('/notifications/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const unreadOnly = normalizeString(req.query.unreadOnly, 10) === 'true';
    const items = store.notifications.filter((item) => item.userKey === userKey || item.userKey === 'global');
    const filtered = unreadOnly ? items.filter((item) => !item.read) : items;
    return res.status(200).json({ ok: true, count: filtered.length, items: filtered.slice(-500) });
  });


  // Route: /notifications/:id/read
  router.post('/notifications/:id/read', (req, res) => {
    const store = getStore();
    const id = normalizeString(req.params.id, 80);
    const match = store.notifications.find((item) => item.id === id);
    if (!match) return res.status(404).json({ ok: false, message: 'Notification not found' });
    match.read = true;
    match.readAt = new Date().toISOString();
    queuePersist();
    return res.status(200).json({ ok: true, notification: match });
  });
}
// === FUTURE_ROUTES_BUSINESS_NOTIFICATIONROUTES_END ===

module.exports = router;
