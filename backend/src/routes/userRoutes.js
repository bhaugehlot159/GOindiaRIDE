const express = require('express');
const { authenticate } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/profile', authenticate, async (req, res) => {
  return res.json({ message: 'Authenticated user route access granted', user: req.user });
});

// === FUTURE_ROUTES_BUSINESS_USERROUTES_START ===
/*
(function future_business_disabled_block_for_userroutes(router) {
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


  // Route: /status
  router.get('/status', (req, res) => {
    const store = getStore();
    return res.status(200).json({
      ok: true,
      wallets: Object.keys(store.wallets).length,
      notifications: store.notifications.length,
      travelCards: Object.keys(store.travelCards).length,
      commissions: store.commissions.length,
      listings: store.listings.length,
      packages: store.packages.length,
      packageBookings: store.packageBookings.length,
      referrals: store.referrals.length,
      reviews: store.reviews.length,
      otpEvents: store.otpEvents.length,
      authLogs: store.authLogs.length,
      bookingActions: store.bookingActions.length,
      disputes: store.disputes.length,
      fraudAlerts: store.fraudAlerts.length,
      aiChats: store.aiChats.length,
      savedLocations: store.savedLocations.length,
      featureStates: Object.keys(store.featureStates).length,
      featureActions: store.featureActions.length,
      termsConsents: store.termsConsents.length,
      supportTickets: store.supportTickets.length,
      webhookEvents: store.webhookEvents.length,
      tourismPlaces: store.tourismPlaces.length,
      rideHistoryUsers: Object.keys(store.rideHistory).length,
      preferences: Object.keys(store.preferences).length,
      counters: clone(store.counters)
    });
  });


  // Route: /saved-location
  router.post('/saved-location', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const label = normalizeString(req.body?.label, 80);
    const address = normalizeString(req.body?.address, 250);
    const district = normalizeString(req.body?.district, 80);
    if (!userKey || !label || !address) {
      return res.status(400).json({ ok: false, message: 'userKey, label and address are required' });
    }
    const item = {
      id: crypto.randomUUID(),
      userKey,
      label,
      address,
      district,
      latitude: normalizeAmount(req.body?.latitude),
      longitude: normalizeAmount(req.body?.longitude),
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.savedLocations, item, MAX_SAVED_LOCATIONS);
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /saved-location/:userKey
  router.get('/saved-location/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.savedLocations.filter((item) => item.userKey === userKey).slice(-200);
    return res.status(200).json({ ok: true, count: items.length, items });
  });


  // Route: /ai/chatbot
  router.post('/ai/chatbot', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80) || 'guest-user';
    const question = normalizeString(req.body?.question, 1000);
    if (!question) return res.status(400).json({ ok: false, message: 'question is required' });

    const lower = question.toLowerCase();
    let answer = 'Thanks for your question. Support team will help you shortly.';
    if (lower.includes('booking')) answer = 'Booking ke liye pickup/drop fill karo, ride type select karo, aur confirm par click karo.';
    else if (lower.includes('cancel')) answer = 'Pickup point reach hone ke baad cancellation block ho sakta hai. Terms check karo.';
    else if (lower.includes('payment') || lower.includes('upi')) answer = 'UPI, wallet, cash aur partner options available hain. Coupon apply karke discount le sakte ho.';
    else if (lower.includes('tour') || lower.includes('district')) answer = 'District explorer me Rajasthan ke places, timings, entry fee aur history available hai.';
    else if (lower.includes('safety') || lower.includes('sos')) answer = 'Emergency card me Police/Ambulance/SOS quick actions available hain.';

    const item = {
      id: crypto.randomUUID(),
      userKey,
      question,
      answer,
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.aiChats, item, MAX_AI_CHATS);
    queuePersist();
    return res.status(200).json({ ok: true, item });
  });


  // Route: /ai/chatbot/:userKey
  router.get('/ai/chatbot/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.aiChats.filter((item) => item.userKey === userKey).slice(-200);
    return res.status(200).json({ ok: true, count: items.length, items });
  });


  // Route: /travel-card/issue
  router.post('/travel-card/issue', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const fullName = normalizeString(req.body?.fullName, 140);
    const phone = normalizeString(req.body?.phone, 40);
    const email = normalizeString(req.body?.email, 140);

    if (!userKey || !fullName) {
      return res.status(400).json({ ok: false, message: 'userKey and fullName are required' });
    }

    const cardId = `GITC-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const card = {
      cardId,
      userKey,
      fullName,
      phone,
      email,
      idProofType: normalizeString(req.body?.idProofType, 60),
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiryAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };

    store.travelCards[cardId] = card;
    queuePersist();
    return res.status(201).json({ ok: true, card });
  });


  // Route: /travel-card/:cardId
  router.get('/travel-card/:cardId', (req, res) => {
    const store = getStore();
    const cardId = normalizeString(req.params.cardId, 80);
    const card = store.travelCards[cardId];
    if (!card) return res.status(404).json({ ok: false, message: 'Card not found' });
    return res.status(200).json({ ok: true, card });
  });


  // Route: /travel-card/user/:userKey
  router.get('/travel-card/user/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const cards = Object.values(store.travelCards).filter((item) => item.userKey === userKey);
    return res.status(200).json({ ok: true, count: cards.length, items: cards });
  });


  // Route: /tourism/places
  router.get('/tourism/places', (req, res) => {
    const store = getStore();
    const district = normalizeString(req.query.district, 80);
    const query = normalizeString(req.query.q, 140);

    let items = store.tourismPlaces;
    if (district) {
      items = items.filter((item) => normalizeString(item.district, 80) === district);
    }
    if (query) {
      items = items.filter((item) => normalizeString(`${item.name} ${item.history} ${item.category}`, 600).includes(query));
    }
    return res.status(200).json({ ok: true, count: items.length, items: items.slice(0, 1000) });
  });


  // Route: /tourism/places
  router.post('/tourism/places', (req, res) => {
    const store = getStore();
    const district = normalizeString(req.body?.district, 80);
    const name = normalizeString(req.body?.name, 160);
    if (!district || !name) {
      return res.status(400).json({ ok: false, message: 'district and name are required' });
    }

    const place = {
      id: crypto.randomUUID(),
      district,
      name,
      category: normalizeString(req.body?.category, 80) || 'General',
      history: normalizeString(req.body?.history, 1000),
      aartiTimings: normalizeString(req.body?.aartiTimings, 160),
      openingDays: normalizeString(req.body?.openingDays, 120),
      openTime: normalizeString(req.body?.openTime, 40),
      closeTime: normalizeString(req.body?.closeTime, 40),
      entryFee: normalizeString(req.body?.entryFee, 80),
      bestTimeToVisit: normalizeString(req.body?.bestTimeToVisit, 160),
      photographyAllowed: Boolean(req.body?.photographyAllowed),
      dressCode: normalizeString(req.body?.dressCode, 200),
      guidedTour: Boolean(req.body?.guidedTour),
      audioGuide: Boolean(req.body?.audioGuide),
      festivalInfo: normalizeString(req.body?.festivalInfo, 240),
      parking: Boolean(req.body?.parking),
      createdAt: new Date().toISOString()
    };

    store.tourismPlaces.push(place);
    if (store.tourismPlaces.length > MAX_TOURISM_PLACES) {
      store.tourismPlaces = store.tourismPlaces.slice(-MAX_TOURISM_PLACES);
    }
    queuePersist();
    return res.status(201).json({ ok: true, place });
  });


  // Route: /preferences/:userKey
  router.post('/preferences/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    if (!userKey) return res.status(400).json({ ok: false, message: 'Invalid userKey' });

    const payload = safeObject(req.body);
    store.preferences[userKey] = {
      ...safeObject(store.preferences[userKey]),
      language: normalizeString(payload.language, 60) || normalizeString(store.preferences[userKey]?.language, 60) || 'English',
      push: payload.push !== undefined ? Boolean(payload.push) : Boolean(store.preferences[userKey]?.push),
      sms: payload.sms !== undefined ? Boolean(payload.sms) : Boolean(store.preferences[userKey]?.sms),
      email: payload.email !== undefined ? Boolean(payload.email) : Boolean(store.preferences[userKey]?.email),
      whatsapp: payload.whatsapp !== undefined ? Boolean(payload.whatsapp) : Boolean(store.preferences[userKey]?.whatsapp),
      updatedAt: new Date().toISOString()
    };

    queuePersist();
    return res.status(200).json({ ok: true, preferences: store.preferences[userKey] });
  });


  // Route: /preferences/:userKey
  router.get('/preferences/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const preferences = store.preferences[userKey] || {
      language: 'English',
      push: true,
      sms: true,
      email: true,
      whatsapp: false
    };
    return res.status(200).json({ ok: true, preferences });
  });


  // Route: /districts
  router.get('/districts', (req, res) => {
    const store = getStore();
    const fromTourism = store.tourismPlaces.map((item) => normalizeString(item.district, 80)).filter(Boolean);
    const fromListings = store.listings.map((item) => normalizeString(item.city, 80)).filter(Boolean);
    const all = Array.from(new Set([]
      .concat(RAJASTHAN_DISTRICTS)
      .concat(fromTourism)
      .concat(fromListings)
      .map((item) => normalizeString(item, 80))
      .filter(Boolean)
    ));
    return res.status(200).json({ ok: true, count: all.length, districts: all });
  });


  // Route: /districts/full
  router.get('/districts/full', (req, res) => {
    const store = getStore();
    const includeRaw = normalizeString(req.query.includeRaw, 10) === 'true';
    const dataset = loadRajasthanDetails();

    const items = RAJASTHAN_DISTRICTS.map((districtName) => {
      const detail = resolveDistrictDetailByName(districtName);
      const tourismMatches = store.tourismPlaces.filter((item) => normalizeString(item.district, 80).toLowerCase() === normalizeString(districtName, 80).toLowerCase());
      const categories = detail ? Object.keys(detail).filter((key) => key !== 'info') : [];

      const summary = {
        name: districtName,
        datasetAvailable: Boolean(detail),
        tourismPlacesCount: tourismMatches.length,
        hasInfo: Boolean(detail && detail.info),
        categories
      };

      if (detail && detail.info) {
        summary.info = detail.info;
      }
      if (includeRaw && detail) {
        summary.detail = detail;
      }
      if (tourismMatches.length) {
        summary.runtimeTourismPlaces = tourismMatches.slice(0, 30);
      }
      return summary;
    });

    return res.status(200).json({
      ok: true,
      source: dataset.sourceFile,
      metadata: dataset.metadata,
      count: items.length,
      items
    });
  });


  // Route: /districts/:districtName/detail
  router.get('/districts/:districtName/detail', (req, res) => {
    const store = getStore();
    const districtName = normalizeString(req.params.districtName, 120);
    if (!districtName) return res.status(400).json({ ok: false, message: 'districtName is required' });

    const detail = resolveDistrictDetailByName(districtName);
    const tourismMatches = store.tourismPlaces.filter((item) => normalizeString(item.district, 80).toLowerCase() === districtName.toLowerCase());
    const listingMatches = store.listings.filter((item) => normalizeString(item.city, 80).toLowerCase() === districtName.toLowerCase());
    const packageMatches = store.packages.filter((item) => {
      const txt = normalizeString(`${item.title} ${item.theme} ${(item.inclusions || []).join(' ')}`, 1500).toLowerCase();
      return txt.includes(districtName.toLowerCase());
    });

    return res.status(200).json({
      ok: true,
      district: districtName,
      datasetAvailable: Boolean(detail),
      detail: detail || null,
      runtime: {
        tourismPlacesCount: tourismMatches.length,
        tourismPlaces: tourismMatches.slice(0, 200),
        listingsCount: listingMatches.length,
        listings: listingMatches.slice(0, 100),
        packageMentions: packageMatches.length,
        packages: packageMatches.slice(0, 100)
      }
    });
  });


  // Route: /listings
  router.post('/listings', (req, res) => {
    const store = getStore();
    const type = normalizeString(req.body?.type, 60) || 'hotel';
    const name = normalizeString(req.body?.name, 140);
    const city = normalizeString(req.body?.city, 80) || 'Jaipur';
    const contact = normalizeString(req.body?.contact, 80);
    const address = normalizeString(req.body?.address, 250);
    const specialty = normalizeString(req.body?.specialty, 250);
    const bookingUrl = normalizeString(req.body?.bookingUrl, 500);
    const rating = Math.max(0, Math.min(5, normalizeAmount(req.body?.rating || 0)));

    if (!name) {
      return res.status(400).json({ ok: false, message: 'name is required' });
    }

    const item = {
      id: crypto.randomUUID(),
      type,
      name,
      city,
      contact,
      address,
      specialty,
      bookingUrl,
      rating,
      photo: normalizeString(req.body?.photo, 500),
      createdAt: new Date().toISOString()
    };

    store.listings.push(item);
    if (store.listings.length > MAX_LISTINGS) {
      store.listings = store.listings.slice(-MAX_LISTINGS);
    }
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /listings
  router.get('/listings', (req, res) => {
    const store = getStore();
    const city = normalizeString(req.query.city, 80);
    const type = normalizeString(req.query.type, 60);
    const q = normalizeString(req.query.q, 140);
    const minRating = Math.max(0, Math.min(5, normalizeAmount(req.query.minRating || 0)));

    let items = store.listings;
    if (city) items = items.filter((item) => normalizeString(item.city, 80) === city);
    if (type) items = items.filter((item) => normalizeString(item.type, 60) === type);
    if (q) {
      items = items.filter((item) => normalizeString(`${item.name} ${item.address} ${item.specialty}`, 800).includes(q));
    }
    if (minRating > 0) {
      items = items.filter((item) => Number(item.rating || 0) >= minRating);
    }

    return res.status(200).json({
      ok: true,
      count: items.length,
      items: items.slice(-1000)
    });
  });


  // Route: /referrals/track
  router.post('/referrals/track', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const partner = normalizeString(req.body?.partner, 120);
    const code = normalizeString(req.body?.code, 60);
    const eventType = normalizeString(req.body?.eventType, 60) || 'click';
    const bookingValue = Math.max(0, normalizeAmount(req.body?.bookingValue || 0));
    const commissionPercent = Math.max(0, Math.min(100, normalizeAmount(req.body?.commissionPercent || 10)));

    if (!partner || !code) {
      return res.status(400).json({ ok: false, message: 'partner and code are required' });
    }

    const event = {
      id: crypto.randomUUID(),
      userKey: userKey || 'guest-user',
      partner,
      code,
      eventType,
      bookingValue,
      commissionPercent,
      commissionAmount: normalizeAmount((bookingValue * commissionPercent) / 100),
      utmSource: normalizeString(req.body?.utmSource, 100),
      utmCampaign: normalizeString(req.body?.utmCampaign, 100),
      createdAt: new Date().toISOString()
    };

    store.referrals.push(event);
    if (store.referrals.length > MAX_REFERRALS) {
      store.referrals = store.referrals.slice(-MAX_REFERRALS);
    }
    store.counters.referralsTracked = (Number(store.counters.referralsTracked || 0) + 1);
    queuePersist();
    return res.status(201).json({ ok: true, event });
  });


  // Route: /referrals/summary
  router.get('/referrals/summary', (req, res) => {
    const store = getStore();
    const partner = normalizeString(req.query.partner, 120);
    const code = normalizeString(req.query.code, 60);

    let items = store.referrals;
    if (partner) items = items.filter((item) => normalizeString(item.partner, 120) === partner);
    if (code) items = items.filter((item) => normalizeString(item.code, 60) === code);

    const totalBookingValue = normalizeAmount(items.reduce((sum, item) => sum + Number(item.bookingValue || 0), 0));
    const totalCommission = normalizeAmount(items.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0));
    return res.status(200).json({
      ok: true,
      count: items.length,
      totalBookingValue,
      totalCommission,
      items: items.slice(-1000)
    });
  });


  // Route: /terms/consent
  router.post('/terms/consent', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const version = normalizeString(req.body?.version, 40) || 'v1';
    const source = normalizeString(req.body?.source, 80) || 'booking-form';
    const accepted = Boolean(req.body?.accepted);

    if (!userKey) return res.status(400).json({ ok: false, message: 'userKey is required' });

    const item = {
      id: crypto.randomUUID(),
      userKey,
      version,
      source,
      accepted,
      ip: normalizeString(req.ip, 80),
      userAgent: normalizeString(req.headers['user-agent'], 220),
      createdAt: new Date().toISOString()
    };

    store.termsConsents.push(item);
    if (store.termsConsents.length > MAX_TERMS_CONSENTS) {
      store.termsConsents = store.termsConsents.slice(-MAX_TERMS_CONSENTS);
    }
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /terms/consent/:userKey
  router.get('/terms/consent/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.termsConsents.filter((item) => item.userKey === userKey);
    return res.status(200).json({ ok: true, count: items.length, items: items.slice(-200) });
  });


  // Route: /support/ticket
  router.post('/support/ticket', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const category = normalizeString(req.body?.category, 80) || 'general';
    const message = normalizeString(req.body?.message, 1200);
    if (!userKey || !message) {
      return res.status(400).json({ ok: false, message: 'userKey and message are required' });
    }
    const ticket = {
      id: crypto.randomUUID(),
      ticketCode: `SUP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      userKey,
      category,
      message,
      priority: normalizeString(req.body?.priority, 20) || 'normal',
      status: 'open',
      createdAt: new Date().toISOString()
    };
    store.supportTickets.push(ticket);
    if (store.supportTickets.length > MAX_SUPPORT_TICKETS) {
      store.supportTickets = store.supportTickets.slice(-MAX_SUPPORT_TICKETS);
    }
    store.counters.supportTickets = (Number(store.counters.supportTickets || 0) + 1);
    queuePersist();
    return res.status(201).json({ ok: true, ticket });
  });


  // Route: /support/ticket/:userKey
  router.get('/support/ticket/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const items = store.supportTickets.filter((item) => item.userKey === userKey);
    return res.status(200).json({ ok: true, count: items.length, items: items.slice(-200) });
  });


  // Route: /reviews
  router.post('/reviews', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.body?.userKey, 80);
    const targetType = normalizeString(req.body?.targetType, 40) || 'driver';
    const targetId = normalizeString(req.body?.targetId, 100) || 'unknown';
    const rating = Math.max(1, Math.min(5, Math.round(normalizeAmount(req.body?.rating || 0))));
    const comment = normalizeString(req.body?.comment, 500);
    if (!userKey || !targetId || !rating) {
      return res.status(400).json({ ok: false, message: 'userKey, targetId and rating are required' });
    }

    const item = {
      id: crypto.randomUUID(),
      userKey,
      targetType,
      targetId,
      rating,
      comment,
      locale: normalizeString(req.body?.locale, 30) || 'en-IN',
      createdAt: new Date().toISOString()
    };
    store.reviews.push(item);
    if (store.reviews.length > MAX_REVIEWS) {
      store.reviews = store.reviews.slice(-MAX_REVIEWS);
    }
    queuePersist();
    return res.status(201).json({ ok: true, item });
  });


  // Route: /reviews
  router.get('/reviews', (req, res) => {
    const store = getStore();
    const targetType = normalizeString(req.query.targetType, 40);
    const targetId = normalizeString(req.query.targetId, 100);
    let items = store.reviews;
    if (targetType) items = items.filter((item) => normalizeString(item.targetType, 40) === targetType);
    if (targetId) items = items.filter((item) => normalizeString(item.targetId, 100) === targetId);
    const avg = items.length
      ? normalizeAmount(items.reduce((sum, item) => sum + Number(item.rating || 0), 0) / items.length)
      : 0;
    return res.status(200).json({ ok: true, count: items.length, averageRating: avg, items: items.slice(-500) });
  });


  // Route: /recommendations/:userKey
  router.get('/recommendations/:userKey', (req, res) => {
    const store = getStore();
    const userKey = normalizeString(req.params.userKey, 80);
    const history = Array.isArray(store.rideHistory[userKey]) ? store.rideHistory[userKey] : [];
    const preferredDistrict = normalizeString(history.length ? history[history.length - 1].to : 'Jaipur', 80);
    const preferredType = normalizeString(
      (store.preferences[userKey] && store.preferences[userKey].preferredListingType) || 'hotel',
      60
    );

    const recommendedListings = store.listings
      .filter((item) => normalizeString(item.city, 80) === preferredDistrict || normalizeString(item.type, 60) === preferredType)
      .slice(-10)
      .reverse();

    const recommendedPlaces = store.tourismPlaces
      .filter((item) => normalizeString(item.district, 80) === preferredDistrict)
      .slice(0, 12);

    const recommendedPackages = store.packages
      .filter((item) => normalizeString(item.theme, 80).includes('heritage') || normalizeString(item.theme, 80).includes('family'))
      .slice(-6)
      .reverse();

    return res.status(200).json({
      ok: true,
      userKey,
      preferredDistrict,
      preferredType,
      listings: recommendedListings,
      places: recommendedPlaces,
      packages: recommendedPackages
    });
  });


  // Route: /flush
  router.post('/flush', (req, res) => {
    writeStore();
    return res.status(200).json({ ok: true, file: DATA_FILE });
  });


})(router);
*/
// === FUTURE_ROUTES_BUSINESS_USERROUTES_END ===

module.exports = router;
