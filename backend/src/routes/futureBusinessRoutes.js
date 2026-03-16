const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

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

router.post('/wallet/topup', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const amount = normalizeAmount(req.body?.amount);
  const method = normalizeString(req.body?.method, 80) || 'manual';
  const note = normalizeString(req.body?.note, 250);

  if (!userKey || amount <= 0) {
    return res.status(400).json({ ok: false, message: 'userKey and positive amount are required' });
  }

  const wallet = walletForUser(store, userKey);
  wallet.balance = normalizeAmount(wallet.balance + amount);
  const entry = addWalletEntry(wallet, 'credit', amount, { method, note });
  queuePersist();

  return res.status(200).json({
    ok: true,
    wallet: clone(wallet),
    entry
  });
});

router.post('/wallet/spend', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const amount = normalizeAmount(req.body?.amount);
  const reason = normalizeString(req.body?.reason, 250) || 'ride-payment';

  if (!userKey || amount <= 0) {
    return res.status(400).json({ ok: false, message: 'userKey and positive amount are required' });
  }

  const wallet = walletForUser(store, userKey);
  if (wallet.balance < amount) {
    return res.status(409).json({
      ok: false,
      message: 'Insufficient wallet balance',
      balance: wallet.balance
    });
  }

  wallet.balance = normalizeAmount(wallet.balance - amount);
  const entry = addWalletEntry(wallet, 'debit', amount, { reason });
  queuePersist();

  return res.status(200).json({
    ok: true,
    wallet: clone(wallet),
    entry
  });
});

router.get('/wallet/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  if (!userKey) return res.status(400).json({ ok: false, message: 'Invalid userKey' });
  const wallet = walletForUser(store, userKey);
  return res.status(200).json({ ok: true, wallet: clone(wallet) });
});

router.post('/auth/otp/send', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const channel = normalizeString(req.body?.channel, 20) || 'sms';
  const destination = normalizeString(req.body?.destination, 120);
  if (!userKey || !destination) {
    return res.status(400).json({ ok: false, message: 'userKey and destination are required' });
  }

  const nowMs = Date.now();
  const recent = store.otpEvents.filter((item) => item.userKey === userKey && item.kind === 'send' && (nowMs - Number(item.tsMs || 0) < 60 * 1000));
  if (recent.length >= 3) {
    addAuthLog(store, {
      userKey,
      action: 'otp-send-rate-limited',
      channel,
      success: false,
      message: 'Rate limit exceeded'
    });
    queuePersist();
    return res.status(429).json({ ok: false, message: 'Too many OTP requests. Try after 1 minute.' });
  }

  const code = generateOtpCode();
  const event = {
    id: crypto.randomUUID(),
    kind: 'send',
    userKey,
    channel,
    destination,
    code,
    tsMs: nowMs,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 5 * 60 * 1000).toISOString(),
    verified: false
  };
  pushWithCap(store.otpEvents, event, MAX_OTP_EVENTS);
  addAuthLog(store, {
    userKey,
    action: 'otp-sent',
    channel,
    success: true,
    message: `OTP sent to ${destination}`
  });
  queuePersist();

  return res.status(201).json({
    ok: true,
    otpId: event.id,
    channel,
    expiresAt: event.expiresAt,
    // For demo runtime only. Remove this in production.
    code
  });
});

router.post('/auth/otp/verify', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const code = normalizeString(req.body?.code, 10);
  const otpId = normalizeString(req.body?.otpId, 80);
  if (!userKey || (!code && !otpId)) {
    return res.status(400).json({ ok: false, message: 'userKey and code/otpId are required' });
  }

  const nowMs = Date.now();
  let candidate = null;
  for (let i = store.otpEvents.length - 1; i >= 0; i -= 1) {
    const item = store.otpEvents[i];
    if (item.kind !== 'send' || item.userKey !== userKey) continue;
    if (otpId && item.id !== otpId) continue;
    if (code && item.code !== code) continue;
    candidate = item;
    break;
  }

  if (!candidate) {
    addAuthLog(store, {
      userKey,
      action: 'otp-verify',
      channel: 'app',
      success: false,
      message: 'OTP not found'
    });
    queuePersist();
    return res.status(404).json({ ok: false, message: 'OTP not found' });
  }

  if (candidate.verified) {
    return res.status(200).json({ ok: true, alreadyVerified: true, verifiedAt: candidate.verifiedAt });
  }

  const expiresMs = Number(new Date(candidate.expiresAt).getTime());
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    addAuthLog(store, {
      userKey,
      action: 'otp-expired',
      channel: candidate.channel,
      success: false,
      message: 'OTP expired'
    });
    queuePersist();
    return res.status(410).json({ ok: false, message: 'OTP expired' });
  }

  candidate.verified = true;
  candidate.verifiedAt = new Date(nowMs).toISOString();
  addAuthLog(store, {
    userKey,
    action: 'otp-verified',
    channel: candidate.channel,
    success: true,
    message: 'OTP verified successfully'
  });
  queuePersist();
  return res.status(200).json({ ok: true, verifiedAt: candidate.verifiedAt });
});

router.get('/auth/logs/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.authLogs.filter((item) => item.userKey === userKey).slice(-500);
  return res.status(200).json({ ok: true, count: items.length, items });
});

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

router.get('/saved-location/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.savedLocations.filter((item) => item.userKey === userKey).slice(-200);
  return res.status(200).json({ ok: true, count: items.length, items });
});

router.post('/booking/action', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const bookingId = normalizeString(req.body?.bookingId, 120) || `BK-${Date.now()}`;
  const action = normalizeBookingStatus(req.body?.action);
  const currentStatus = normalizeBookingStatus(req.body?.currentStatus);
  const pickedUp = Boolean(req.body?.pickedUp);

  if (!userKey) return res.status(400).json({ ok: false, message: 'userKey is required' });
  if (!action) return res.status(400).json({ ok: false, message: 'action is required' });

  // Policy example: after pickup, cancel action is blocked.
  if (pickedUp && action === 'cancelled') {
    const blocked = {
      id: crypto.randomUUID(),
      userKey,
      bookingId,
      action,
      currentStatus,
      pickedUp,
      allowed: false,
      message: 'Booking cannot be cancelled after pickup point is reached.',
      createdAt: new Date().toISOString()
    };
    pushWithCap(store.bookingActions, blocked, MAX_BOOKING_ACTIONS);
    queuePersist();
    return res.status(409).json({ ok: false, policyBlocked: true, item: blocked });
  }

  const item = {
    id: crypto.randomUUID(),
    userKey,
    bookingId,
    action,
    currentStatus,
    pickedUp,
    allowed: true,
    message: normalizeString(req.body?.message, 320),
    scheduleAt: normalizeString(req.body?.scheduleAt, 40),
    createdAt: new Date().toISOString()
  };

  pushWithCap(store.bookingActions, item, MAX_BOOKING_ACTIONS);
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/booking/action/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.bookingActions.filter((item) => item.userKey === userKey).slice(-500);
  return res.status(200).json({ ok: true, count: items.length, items });
});

router.post('/dispute/report', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const bookingId = normalizeString(req.body?.bookingId, 120);
  const issue = normalizeString(req.body?.issue, 1200);
  if (!userKey || !bookingId || !issue) {
    return res.status(400).json({ ok: false, message: 'userKey, bookingId and issue are required' });
  }
  const item = {
    id: crypto.randomUUID(),
    disputeCode: `DSP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    userKey,
    bookingId,
    issue,
    status: 'open',
    evidence: Array.isArray(req.body?.evidence)
      ? req.body.evidence.map((x) => normalizeString(x, 240)).filter(Boolean).slice(0, 20)
      : [],
    createdAt: new Date().toISOString()
  };
  pushWithCap(store.disputes, item, MAX_DISPUTES);
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/dispute/report', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.query.userKey, 80);
  const status = normalizeString(req.query.status, 30);
  let items = store.disputes;
  if (userKey) items = items.filter((item) => item.userKey === userKey);
  if (status) items = items.filter((item) => normalizeString(item.status, 30) === status);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-1000) });
});

router.get('/dispute/export.csv', (req, res) => {
  const store = getStore();
  const headers = ['disputeCode', 'userKey', 'bookingId', 'status', 'issue', 'createdAt'];
  const rows = [headers.join(',')];
  store.disputes.forEach((item) => {
    rows.push(headers.map((key) => `"${String(item[key] || '').replace(/"/g, '""')}"`).join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=\"disputes.csv\"');
  return res.status(200).send(rows.join('\n'));
});

router.post('/fraud/alert', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80);
  const category = normalizeString(req.body?.category, 80) || 'suspicious-activity';
  const severity = normalizeString(req.body?.severity, 20) || 'medium';
  const note = normalizeString(req.body?.note, 600);
  if (!userKey || !note) {
    return res.status(400).json({ ok: false, message: 'userKey and note are required' });
  }
  const item = {
    id: crypto.randomUUID(),
    userKey,
    category,
    severity,
    note,
    resolved: false,
    createdAt: new Date().toISOString()
  };
  pushWithCap(store.fraudAlerts, item, MAX_FRAUD_ALERTS);
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/fraud/alert', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.query.userKey, 80);
  const severity = normalizeString(req.query.severity, 20);
  let items = store.fraudAlerts;
  if (userKey) items = items.filter((item) => item.userKey === userKey);
  if (severity) items = items.filter((item) => normalizeString(item.severity, 20) === severity);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-1000) });
});

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

router.get('/ai/chatbot/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.aiChats.filter((item) => item.userKey === userKey).slice(-200);
  return res.status(200).json({ ok: true, count: items.length, items });
});

router.post('/feature/state', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80) || 'guest-user';
  const featureId = normalizeString(req.body?.featureId, 80);
  const category = normalizeString(req.body?.category, 80) || 'general';
  if (!featureId) {
    return res.status(400).json({ ok: false, message: 'featureId is required' });
  }

  const key = buildFeatureStateKey(userKey, featureId);
  const previous = safeObject(store.featureStates[key]);
  store.featureStates[key] = {
    featureId,
    userKey,
    category,
    description: normalizeString(req.body?.description, 600),
    status: normalizeString(req.body?.status, 40) || previous.status || 'active',
    owner: normalizeString(req.body?.owner, 120) || previous.owner || '',
    dueDate: normalizeString(req.body?.dueDate, 40) || previous.dueDate || '',
    notes: normalizeString(req.body?.notes, 2000) || '',
    payload: safeObject(req.body?.payload),
    updatedAt: new Date().toISOString(),
    createdAt: previous.createdAt || new Date().toISOString()
  };

  const keys = Object.keys(store.featureStates);
  if (keys.length > MAX_FEATURE_STATES) {
    keys.sort((a, b) => {
      const at = new Date(store.featureStates[a].updatedAt || 0).getTime();
      const bt = new Date(store.featureStates[b].updatedAt || 0).getTime();
      return at - bt;
    });
    const removeCount = keys.length - MAX_FEATURE_STATES;
    for (let i = 0; i < removeCount; i += 1) {
      delete store.featureStates[keys[i]];
    }
  }

  queuePersist();
  return res.status(200).json({ ok: true, state: store.featureStates[key] });
});

router.get('/feature/state/:featureId', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.query.userKey, 80) || 'guest-user';
  const featureId = normalizeString(req.params.featureId, 80);
  if (!featureId) return res.status(400).json({ ok: false, message: 'featureId is required' });
  const key = buildFeatureStateKey(userKey, featureId);
  const state = store.featureStates[key] || null;
  return res.status(200).json({ ok: true, state });
});

router.post('/feature/action', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.body?.userKey, 80) || 'guest-user';
  const featureId = normalizeString(req.body?.featureId, 80);
  const action = normalizeString(req.body?.action, 100) || 'manual-run';
  if (!featureId) {
    return res.status(400).json({ ok: false, message: 'featureId is required' });
  }

  const item = {
    id: crypto.randomUUID(),
    featureId,
    userKey,
    category: normalizeString(req.body?.category, 80) || 'general',
    action,
    status: normalizeString(req.body?.status, 40) || 'executed',
    payload: safeObject(req.body?.payload),
    result: normalizeString(req.body?.result, 1000),
    createdAt: new Date().toISOString()
  };

  pushWithCap(store.featureActions, item, MAX_FEATURE_ACTIONS);
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/feature/action/:featureId', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.query.userKey, 80);
  const featureId = normalizeString(req.params.featureId, 80);
  if (!featureId) return res.status(400).json({ ok: false, message: 'featureId is required' });
  let items = store.featureActions.filter((item) => item.featureId === featureId);
  if (userKey) items = items.filter((item) => item.userKey === userKey);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
});

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

router.get('/notifications/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const unreadOnly = normalizeString(req.query.unreadOnly, 10) === 'true';
  const items = store.notifications.filter((item) => item.userKey === userKey || item.userKey === 'global');
  const filtered = unreadOnly ? items.filter((item) => !item.read) : items;
  return res.status(200).json({ ok: true, count: filtered.length, items: filtered.slice(-500) });
});

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

router.get('/travel-card/:cardId', (req, res) => {
  const store = getStore();
  const cardId = normalizeString(req.params.cardId, 80);
  const card = store.travelCards[cardId];
  if (!card) return res.status(404).json({ ok: false, message: 'Card not found' });
  return res.status(200).json({ ok: true, card });
});

router.get('/travel-card/user/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const cards = Object.values(store.travelCards).filter((item) => item.userKey === userKey);
  return res.status(200).json({ ok: true, count: cards.length, items: cards });
});

router.post('/commission/partner', (req, res) => {
  const store = getStore();
  const partnerType = normalizeString(req.body?.partnerType, 60);
  const partnerName = normalizeString(req.body?.partnerName, 140);
  const amount = normalizeAmount(req.body?.amount);
  const commissionPercent = normalizeAmount(req.body?.commissionPercent);
  const bookingId = normalizeString(req.body?.bookingId, 100);

  if (!partnerType || !partnerName || amount <= 0) {
    return res.status(400).json({ ok: false, message: 'partnerType, partnerName and positive amount are required' });
  }

  const commissionAmount = normalizeAmount(amount * (commissionPercent > 0 ? commissionPercent : 20) / 100);
  const item = {
    id: crypto.randomUUID(),
    partnerType,
    partnerName,
    bookingId,
    amount,
    commissionPercent: commissionPercent > 0 ? commissionPercent : 20,
    commissionAmount,
    createdAt: new Date().toISOString()
  };

  store.commissions.push(item);
  if (store.commissions.length > MAX_COMMISSIONS) {
    store.commissions = store.commissions.slice(-MAX_COMMISSIONS);
  }
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/commission/partner', (req, res) => {
  const store = getStore();
  const partnerType = normalizeString(req.query.partnerType, 60);
  const list = partnerType
    ? store.commissions.filter((item) => normalizeString(item.partnerType, 60) === partnerType)
    : store.commissions;
  const total = list.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0);
  return res.status(200).json({ ok: true, count: list.length, totalCommission: normalizeAmount(total), items: list.slice(-500) });
});

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

router.post('/history/ride', (req, res) => {
  const store = getStore();
  const record = addRideHistory(store, req.body || {});
  if (!record) {
    return res.status(400).json({ ok: false, message: 'userKey is required' });
  }
  queuePersist();
  return res.status(201).json({ ok: true, record });
});

router.get('/history/ride/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const list = Array.isArray(store.rideHistory[userKey]) ? store.rideHistory[userKey] : [];
  return res.status(200).json({ ok: true, count: list.length, items: list.slice(-1000) });
});

router.get('/history/ride/:userKey/export.csv', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const list = Array.isArray(store.rideHistory[userKey]) ? store.rideHistory[userKey] : [];
  const headers = ['bookingId', 'from', 'to', 'distanceKm', 'fare', 'status', 'driverName', 'rating', 'createdAt'];
  const rows = [headers.join(',')];

  list.forEach((item) => {
    const line = headers.map((key) => {
      const raw = String(item[key] ?? '').replace(/"/g, '""');
      return `"${raw}"`;
    }).join(',');
    rows.push(line);
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=\"ride-history-${userKey}.csv\"`);
  return res.status(200).send(rows.join('\n'));
});

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

router.post('/packages', (req, res) => {
  const store = getStore();
  const title = normalizeString(req.body?.title, 160);
  const theme = normalizeString(req.body?.theme, 80) || 'heritage';
  const durationDays = Math.max(1, Math.min(30, Math.round(normalizeAmount(req.body?.durationDays || 1))));
  const currency = normalizeCurrency(req.body?.currency || 'INR');
  const priceInr = Math.max(0, normalizeAmount(req.body?.priceInr || req.body?.price || 0));

  if (!title || priceInr <= 0) {
    return res.status(400).json({ ok: false, message: 'title and positive priceInr are required' });
  }

  const item = {
    id: crypto.randomUUID(),
    title,
    theme,
    durationDays,
    localGuide: Boolean(req.body?.localGuide),
    includesVehicle: req.body?.includesVehicle !== undefined ? Boolean(req.body?.includesVehicle) : true,
    meals: normalizeString(req.body?.meals, 120),
    inclusions: Array.isArray(req.body?.inclusions)
      ? req.body.inclusions.map((x) => normalizeString(x, 120)).filter(Boolean).slice(0, 20)
      : [],
    itinerary: Array.isArray(req.body?.itinerary)
      ? req.body.itinerary.map((x) => normalizeString(x, 240)).filter(Boolean).slice(0, 30)
      : [],
    priceInr,
    currency,
    convertedPrice: normalizeAmount(priceInr * (currencyRates[currency] || 1)),
    status: 'active',
    createdAt: new Date().toISOString()
  };

  store.packages.push(item);
  if (store.packages.length > MAX_PACKAGES) {
    store.packages = store.packages.slice(-MAX_PACKAGES);
  }
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/packages', (req, res) => {
  const store = getStore();
  const theme = normalizeString(req.query.theme, 80);
  const q = normalizeString(req.query.q, 140);

  let items = store.packages;
  if (theme) items = items.filter((item) => normalizeString(item.theme, 80) === theme);
  if (q) items = items.filter((item) => normalizeString(`${item.title} ${item.theme} ${(item.inclusions || []).join(' ')}`, 1200).includes(q));
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
});

router.post('/packages/:packageId/book', (req, res) => {
  const store = getStore();
  const packageId = normalizeString(req.params.packageId, 80);
  const userKey = normalizeString(req.body?.userKey, 80);
  const packageItem = store.packages.find((item) => item.id === packageId);
  if (!packageItem) return res.status(404).json({ ok: false, message: 'Package not found' });
  if (!userKey) return res.status(400).json({ ok: false, message: 'userKey is required' });

  const booking = {
    id: crypto.randomUUID(),
    bookingCode: `PKG-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    packageId,
    userKey,
    travelers: Math.max(1, Math.min(50, Math.round(normalizeAmount(req.body?.travelers || 1)))),
    startDate: normalizeString(req.body?.startDate, 30),
    paymentMethod: normalizeString(req.body?.paymentMethod, 40) || 'cash',
    amountInr: packageItem.priceInr,
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };

  store.packageBookings.push(booking);
  if (store.packageBookings.length > MAX_PACKAGE_BOOKINGS) {
    store.packageBookings = store.packageBookings.slice(-MAX_PACKAGE_BOOKINGS);
  }
  store.counters.packagesBooked = (Number(store.counters.packagesBooked || 0) + 1);
  queuePersist();
  return res.status(201).json({ ok: true, booking });
});

router.get('/packages/bookings/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.packageBookings.filter((item) => item.userKey === userKey);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
});

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

router.get('/terms/consent/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.termsConsents.filter((item) => item.userKey === userKey);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-200) });
});

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

router.get('/support/ticket/:userKey', (req, res) => {
  const store = getStore();
  const userKey = normalizeString(req.params.userKey, 80);
  const items = store.supportTickets.filter((item) => item.userKey === userKey);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-200) });
});

router.post('/fare/estimate', (req, res) => {
  const estimate = estimateFare(req.body || {});
  return res.status(200).json({ ok: true, estimate });
});

router.get('/currency/rates', (req, res) => {
  return res.status(200).json({
    ok: true,
    base: 'INR',
    rates: currencyRates,
    updatedAt: new Date().toISOString()
  });
});

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

router.post('/partner/webhook/log', (req, res) => {
  const store = getStore();
  const partner = normalizeString(req.body?.partner, 120) || 'unknown-partner';
  const eventType = normalizeString(req.body?.eventType, 80) || 'generic-event';
  const payload = safeObject(req.body?.payload);
  const item = {
    id: crypto.randomUUID(),
    partner,
    eventType,
    payload,
    createdAt: new Date().toISOString()
  };
  store.webhookEvents.push(item);
  if (store.webhookEvents.length > MAX_WEBHOOK_EVENTS) {
    store.webhookEvents = store.webhookEvents.slice(-MAX_WEBHOOK_EVENTS);
  }
  store.counters.webhookEvents = (Number(store.counters.webhookEvents || 0) + 1);
  queuePersist();
  return res.status(201).json({ ok: true, item });
});

router.get('/partner/webhook/logs', (req, res) => {
  const store = getStore();
  const partner = normalizeString(req.query.partner, 120);
  const eventType = normalizeString(req.query.eventType, 80);
  let items = store.webhookEvents;
  if (partner) items = items.filter((item) => normalizeString(item.partner, 120) === partner);
  if (eventType) items = items.filter((item) => normalizeString(item.eventType, 80) === eventType);
  return res.status(200).json({ ok: true, count: items.length, items: items.slice(-500) });
});

router.get('/admin/summary', (req, res) => {
  const store = getStore();
  const totalReferralCommission = normalizeAmount(store.referrals.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0));
  const totalPartnerCommission = normalizeAmount(store.commissions.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0));
  const totalWalletBalance = normalizeAmount(Object.values(store.wallets).reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0));

  return res.status(200).json({
    ok: true,
    metrics: {
      listings: store.listings.length,
      packages: store.packages.length,
      packageBookings: store.packageBookings.length,
      referrals: store.referrals.length,
      reviews: store.reviews.length,
      authLogs: store.authLogs.length,
      otpEvents: store.otpEvents.length,
      bookingActions: store.bookingActions.length,
      disputes: store.disputes.length,
      fraudAlerts: store.fraudAlerts.length,
      aiChats: store.aiChats.length,
      savedLocations: store.savedLocations.length,
      featureStates: Object.keys(store.featureStates).length,
      featureActions: store.featureActions.length,
      notifications: store.notifications.length,
      supportTickets: store.supportTickets.length,
      activeTravelCards: Object.keys(store.travelCards).length,
      tourismPlaces: store.tourismPlaces.length,
      rideHistoryUsers: Object.keys(store.rideHistory).length,
      totalReferralCommission,
      totalPartnerCommission,
      totalWalletBalance
    },
    counters: clone(store.counters),
    generatedAt: new Date().toISOString()
  });
});

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

router.post('/flush', (req, res) => {
  writeStore();
  return res.status(200).json({ ok: true, file: DATA_FILE });
});

module.exports = router;
