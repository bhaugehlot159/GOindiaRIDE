(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__ = true;

  function normalizeOrigin(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  function detectApiOrigin() {
    var explicit = normalizeOrigin(
      window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ ||
      window.__GOINDIARIDE_API_ORIGIN__ ||
      ''
    );
    if (explicit) return explicit;

    return normalizeOrigin((window.location && window.location.origin) || '');
  }

  var EVENT_NAME = 'goindiaride:future-feature-item-ready';
  var API_ORIGIN = detectApiOrigin();
  var API_BASE = API_ORIGIN ? (API_ORIGIN + '/api/future-runtime') : '/api/future-runtime';
  var BUSINESS_API_BASE = API_ORIGIN ? (API_ORIGIN + '/api/future-runtime-business') : '/api/future-runtime-business';
  var registry = window.__GOINDIARIDE_FUTURE_FEATURES || {};
  var extState = window.__GOINDIARIDE_FUTURE_RUNTIME_EXT_STATE || {
    activatedKeys: {},
    syncKeys: {}
  };
  window.__GOINDIARIDE_FUTURE_RUNTIME_EXT_STATE = extState;

  function detectPageRole() {
    var path = normalize((window.location && window.location.pathname) || '');
    if (path.indexOf('/admin/') !== -1 || path.indexOf('admin-dashboard') !== -1) return 'admin';
    if (path.indexOf('/driver/') !== -1 || path.indexOf('driver-dashboard') !== -1) return 'driver';
    if (path.indexOf('/customer/') !== -1 || path.indexOf('customer-dashboard') !== -1) return 'customer';
    if (path.indexOf('booking') !== -1) return 'booking';
    return 'generic';
  }

  function toSet(values) {
    var out = {};
    for (var i = 0; i < values.length; i += 1) out[values[i]] = true;
    return out;
  }

  var PAGE_ROLE = detectPageRole();
  var RUNTIME_DEBUG = /(?:\?|&)ffdebug=1(?:&|$)/i.test((window.location && window.location.search) || '') ||
    window.__GOINDIARIDE_FUTURE_RUNTIME_DEBUG__ === true;
  var CATEGORY_ALLOWLIST = {
    booking: toSet(['additional']),
    customer: toSet(['customer']),
    driver: toSet(['driver']),
    admin: toSet(['admin']),
    generic: {}
  };
  var MODULE_ALLOWLIST = {
    booking: toSet([]),
    customer: toSet(['auth', 'profile', 'kyc', 'payment', 'tourism', 'districtDirectory', 'ride', 'liveTracking', 'rating', 'savedLocation', 'dispute', 'notificationCenter', 'travelCard', 'rideHistory', 'chatbot', 'translator', 'termsConsent', 'supportHelpdesk', 'aiRecommendation', 'review', 'trustBrand', 'policyRules']),
    driver: toSet(['driverVehicle', 'liveTracking', 'rating', 'bookingOps', 'bookingPolicy', 'notificationCenter', 'supportHelpdesk', 'emergency', 'termsConsent']),
    admin: toSet(['bookingOps', 'partnerCommission', 'listing', 'partnerIntegration', 'adminMonitoring', 'fraudAlert', 'otpSecurity', 'notificationCenter', 'review', 'aiRecommendation', 'policyRules', 'universalFeature']),
    generic: {}
  };

  // Additive allowlist extension: keep existing behavior and add broader page scopes.
  (function extendCategoryAllowlist() {
    function allow(role, category) {
      CATEGORY_ALLOWLIST[role] = CATEGORY_ALLOWLIST[role] || {};
      CATEGORY_ALLOWLIST[role][category] = true;
    }
    allow('booking', 'customer');
    allow('customer', 'additional');
    allow('driver', 'additional');
    allow('admin', 'security');
    allow('admin', 'additional');
  })();

  function isCategoryAllowed(feature) {
    if (RUNTIME_DEBUG) return true;
    var category = normalize((feature && feature.category) || 'general');
    var allowed = CATEGORY_ALLOWLIST[PAGE_ROLE] || {};
    return !!allowed[category];
  }

  function isModuleAllowed(key, feature) {
    if (!isCategoryAllowed(feature)) return false;
    if (RUNTIME_DEBUG) return true;
    var allowed = MODULE_ALLOWLIST[PAGE_ROLE] || {};
    return !!allowed[key];
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  function hasAny(text, keywords) {
    var haystack = normalize(text);
    for (var i = 0; i < keywords.length; i += 1) {
      if (haystack.indexOf(normalize(keywords[i])) !== -1) return true;
    }
    return false;
  }

  function postJson(path, payload) {
    if (typeof window.fetch !== 'function') return;
    window.fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).catch(function () {
      // Best effort sync.
    });
  }

  function postBusiness(path, payload) {
    return requestBusiness('POST', path, payload || {});
  }

  function getBusiness(path) {
    return requestBusiness('GET', path, null);
  }

  function currentUserKey() {
    try {
      if (window.localStorage) {
        var direct = window.localStorage.getItem('goindiaride.runtime.userKey');
        if (direct) return normalize(direct);
        var profileRaw = window.localStorage.getItem('goindiaride.profile.runtime');
        if (profileRaw) {
          var parsed = JSON.parse(profileRaw);
          var candidate = parsed.email || parsed.phone || parsed.name;
          if (candidate) return normalize(candidate);
        }
      }
    } catch (_error) {
      // ignore
    }
    return 'guest-user';
  }

  var LOCAL_BUSINESS_STORE_KEY = 'goindiaride.runtime.business-store.v1';
  var DEFAULT_DISTRICTS = [
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
  var DEFAULT_TOURISM_PLACES = [
    { id: 'seed-jaipur-amer', district: 'Jaipur', name: 'Amer Fort', category: 'Fort', history: '16th century hill fort.', openTime: '08:00', closeTime: '17:30', parking: true },
    { id: 'seed-jaipur-hawa', district: 'Jaipur', name: 'Hawa Mahal', category: 'Palace', history: 'Pink sandstone palace facade.', openTime: '09:00', closeTime: '17:00', parking: true },
    { id: 'seed-jodhpur-mehran', district: 'Jodhpur', name: 'Mehrangarh Fort', category: 'Fort', history: 'Historic fort above the blue city.', openTime: '09:00', closeTime: '17:30', parking: true },
    { id: 'seed-udaipur-citypalace', district: 'Udaipur', name: 'City Palace', category: 'Palace', history: 'Mewar dynasty royal complex.', openTime: '09:30', closeTime: '17:30', parking: true },
    { id: 'seed-ajmer-dargah', district: 'Ajmer', name: 'Ajmer Sharif Dargah', category: 'Heritage', history: 'Sufi shrine and spiritual site.', openTime: '05:00', closeTime: '22:00', parking: true },
    { id: 'seed-pushkar-brahma', district: 'Pushkar', name: 'Brahma Temple', category: 'Temple', history: 'Rare temple dedicated to Lord Brahma.', openTime: '06:00', closeTime: '20:00', parking: true }
  ];
  var CURRENCY_RATES = {
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0094,
    AED: 0.044
  };
  var VEHICLE_BASE_RATES = {
    economy: 10,
    sedan: 15,
    suv: 20,
    premium: 25,
    xl: 28
  };
  // On production custom domain we should avoid hitting GitHub Pages with
  // fallback API paths because that can trigger abuse/rate-limit pages.
  var BUSINESS_API_BASES = API_ORIGIN
    ? uniqueList([API_ORIGIN + '/api/future-runtime-business'])
    : uniqueList([
      BUSINESS_API_BASE,
      '/api/future-runtime-business'
    ]);

  function uniqueList(values) {
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var item = String(values[i] || '').trim();
      if (!item) continue;
      if (out.indexOf(item) === -1) out.push(item);
    }
    return out;
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? n : (Number.isFinite(fallback) ? fallback : 0);
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return null;
    }
  }

  function makeId(prefix) {
    return String(prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function simplifyText(value) {
    return normalize(value).replace(/[^a-z0-9]/g, '');
  }

  function fetchJson(url, options) {
    if (typeof window.fetch !== 'function') return Promise.resolve(null);

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var requestOptions = options ? Object.assign({}, options) : {};
    var timeoutId = null;
    if (controller) {
      requestOptions.signal = controller.signal;
      timeoutId = window.setTimeout(function () {
        try { controller.abort(); } catch (_error) { /* ignore */ }
      }, 8000);
    }

    return window.fetch(url, requestOptions)
      .then(function (response) {
        var contentType = '';
        try {
          contentType = response && response.headers && response.headers.get ? String(response.headers.get('content-type') || '') : '';
        } catch (_error) {
          contentType = '';
        }

        var parser = contentType.indexOf('application/json') !== -1
          ? response.json().catch(function () { return null; })
          : response.text().then(function (text) {
            if (!text) return null;
            try { return JSON.parse(text); } catch (_error) { return null; }
          }).catch(function () { return null; });

        return parser.then(function (json) {
          return {
            ok: !!response.ok,
            status: Number(response.status) || 0,
            json: json
          };
        });
      })
      .catch(function () {
        return null;
      })
      .then(function (result) {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        return result;
      });
  }

  function defaultLocalBusinessStore() {
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
      tourismPlaces: clone(DEFAULT_TOURISM_PLACES) || [],
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

  function loadLocalBusinessStore() {
    var base = defaultLocalBusinessStore();
    try {
      if (!window.localStorage) return base;
      var raw = window.localStorage.getItem(LOCAL_BUSINESS_STORE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;

      return {
        wallets: safeObject(parsed.wallets),
        notifications: safeArray(parsed.notifications),
        travelCards: safeObject(parsed.travelCards),
        commissions: safeArray(parsed.commissions),
        listings: safeArray(parsed.listings),
        packages: safeArray(parsed.packages),
        packageBookings: safeArray(parsed.packageBookings),
        referrals: safeArray(parsed.referrals),
        reviews: safeArray(parsed.reviews),
        otpEvents: safeArray(parsed.otpEvents),
        authLogs: safeArray(parsed.authLogs),
        bookingActions: safeArray(parsed.bookingActions),
        disputes: safeArray(parsed.disputes),
        fraudAlerts: safeArray(parsed.fraudAlerts),
        aiChats: safeArray(parsed.aiChats),
        savedLocations: safeArray(parsed.savedLocations),
        featureStates: safeObject(parsed.featureStates),
        featureActions: safeArray(parsed.featureActions),
        termsConsents: safeArray(parsed.termsConsents),
        supportTickets: safeArray(parsed.supportTickets),
        webhookEvents: safeArray(parsed.webhookEvents),
        tourismPlaces: safeArray(parsed.tourismPlaces).length ? safeArray(parsed.tourismPlaces) : (clone(DEFAULT_TOURISM_PLACES) || []),
        rideHistory: safeObject(parsed.rideHistory),
        preferences: safeObject(parsed.preferences),
        counters: Object.assign({}, safeObject(base.counters), safeObject(parsed.counters))
      };
    } catch (_error) {
      return base;
    }
  }

  function getLocalBusinessStore() {
    if (!extState.localBusinessStore) {
      extState.localBusinessStore = loadLocalBusinessStore();
    }
    return extState.localBusinessStore;
  }

  function persistLocalBusinessStore() {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(LOCAL_BUSINESS_STORE_KEY, JSON.stringify(getLocalBusinessStore()));
    } catch (_error) {
      // ignore persistence errors
    }
  }

  function defaultDistrictInfo() {
    return {
      population: 'N/A',
      area: 'N/A',
      bestTime: 'Oct - Mar'
    };
  }

  function districtNamesFromWindow() {
    try {
      var data = window.locationsData && window.locationsData.rajasthan;
      if (!data || typeof data !== 'object') return [];
      return Object.keys(data).map(function (name) { return String(name || '').trim(); }).filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function allDistrictNames(store) {
    var fromWindow = districtNamesFromWindow();
    var fromTourism = safeArray(store.tourismPlaces).map(function (item) {
      return String((item && item.district) || '').trim();
    }).filter(Boolean);
    var names = uniqueList(fromWindow.concat(DEFAULT_DISTRICTS, fromTourism));
    return names.sort(function (a, b) { return a.localeCompare(b); });
  }

  function resolveDistrictName(input, districtList) {
    var source = String(input || '').trim();
    if (!source) return '';
    var names = districtList && districtList.length ? districtList : DEFAULT_DISTRICTS;
    var direct = simplifyText(source);
    for (var i = 0; i < names.length; i += 1) {
      if (simplifyText(names[i]) === direct) return names[i];
    }
    for (var j = 0; j < names.length; j += 1) {
      var candidate = simplifyText(names[j]);
      if (!candidate) continue;
      if (candidate.indexOf(direct) !== -1 || direct.indexOf(candidate) !== -1) return names[j];
    }
    return source;
  }

  function districtDetailFromWindow(districtName) {
    try {
      var map = window.locationsData && window.locationsData.rajasthan;
      if (!map || typeof map !== 'object') return null;
      var keys = Object.keys(map);
      var resolvedKey = '';
      for (var i = 0; i < keys.length; i += 1) {
        if (simplifyText(keys[i]) === simplifyText(districtName)) {
          resolvedKey = keys[i];
          break;
        }
      }
      if (!resolvedKey) return null;
      var source = safeObject(map[resolvedKey]);
      var out = {};
      var sourceKeys = Object.keys(source);
      for (var j = 0; j < sourceKeys.length; j += 1) {
        var key = sourceKeys[j];
        var values = source[key];
        if (Array.isArray(values)) out[key] = values.slice(0, 200);
      }
      out.info = {
        population: source.population || source.population_count || source.info_population || 'N/A',
        area: source.area || source.area_km2 || source.info_area || 'N/A',
        bestTime: source.best_time || source.best_visit_time || 'Oct - Mar'
      };
      return out;
    } catch (_error) {
      return null;
    }
  }

  function tourismFromWindow(districtName) {
    var out = [];
    try {
      var detail = districtDetailFromWindow(districtName);
      if (!detail) return out;
      var pools = []
        .concat(safeArray(detail.tourist_places))
        .concat(safeArray(detail.forts))
        .concat(safeArray(detail.temples))
        .concat(safeArray(detail.landmarks))
        .concat(safeArray(detail.markets));
      var seen = {};
      for (var i = 0; i < pools.length; i += 1) {
        var name = String(pools[i] || '').trim();
        if (!name) continue;
        var uniqueKey = simplifyText(name);
        if (seen[uniqueKey]) continue;
        seen[uniqueKey] = true;
        out.push({
          id: makeId('place'),
          district: districtName,
          name: name,
          category: 'Tourism',
          history: 'Loaded from Rajasthan district data',
          openTime: '09:00',
          closeTime: '18:00',
          parking: true,
          createdAt: new Date().toISOString()
        });
      }
    } catch (_error) {
      return [];
    }
    return out.slice(0, 120);
  }

  function walletForUser(store, userKey) {
    var key = String(userKey || 'guest-user').trim() || 'guest-user';
    if (!store.wallets[key]) {
      store.wallets[key] = {
        userKey: key,
        balance: 0,
        history: []
      };
    }
    return store.wallets[key];
  }

  function addWalletEntry(wallet, type, amount, meta) {
    var entry = {
      id: makeId('wallet'),
      type: type || 'credit',
      amount: Number(toNumber(amount, 0).toFixed(2)),
      meta: safeObject(meta),
      createdAt: new Date().toISOString()
    };
    wallet.history.push(entry);
    if (wallet.history.length > 3000) wallet.history = wallet.history.slice(-3000);
    return entry;
  }

  function addAuthLog(store, item) {
    store.authLogs.push(Object.assign({
      id: makeId('auth'),
      createdAt: new Date().toISOString()
    }, safeObject(item)));
    if (store.authLogs.length > 50000) store.authLogs = store.authLogs.slice(-50000);
  }

  function chatbotAnswer(question) {
    var text = normalize(question);
    if (!text) return 'Please share your question. I can help with booking, fare, payment, and safety.';
    if (hasAny(text, ['fare', 'price', 'cost', 'estimate'])) return 'Use Real Fare & Currency Estimator for exact fare and active offers.';
    if (hasAny(text, ['district', 'tourist', 'place', 'udaipur', 'jaipur'])) return 'Open District Directory and Tourist Explorer to load live district and place data.';
    if (hasAny(text, ['wallet', 'coupon', 'payment', 'refund'])) return 'Wallet and coupon actions are active. You can top up, apply coupon, and track payment flow.';
    if (hasAny(text, ['support', 'ticket', 'help'])) return 'Raise a helpdesk ticket and track its status from Support / Helpdesk card.';
    return 'Feature active: booking, policy, tracking, payment, district explorer, tourism, and support are available.';
  }

  function parseBusinessRoute(path) {
    var route = String(path || '/').trim() || '/';
    if (route.charAt(0) !== '/') route = '/' + route;
    try {
      var parsed = new URL(route, 'https://goindiaride.local');
      return {
        pathname: parsed.pathname || '/',
        searchParams: parsed.searchParams
      };
    } catch (_error) {
      return {
        pathname: route.split('?')[0] || '/',
        searchParams: new URLSearchParams()
      };
    }
  }

  function localBusinessRequest(method, path, payload) {
    var parsed = parseBusinessRoute(path);
    var pathname = parsed.pathname;
    var query = parsed.searchParams;
    var store = getLocalBusinessStore();
    var userKeyFromPayload = String((payload && payload.userKey) || '').trim() || currentUserKey();
    var nowIso = new Date().toISOString();

    if (method === 'GET' && pathname === '/status') {
      return Promise.resolve({
        ok: true,
        source: 'local-fallback',
        apiReachable: false,
        storage: 'localStorage',
        updatedAt: nowIso
      });
    }

    if (method === 'POST' && pathname === '/notifications/send') {
      var notification = {
        id: makeId('notify'),
        userKey: userKeyFromPayload,
        type: String((payload && payload.type) || 'custom'),
        channel: String((payload && payload.channel) || 'in_app'),
        title: String((payload && payload.title) || 'Notification'),
        message: String((payload && payload.message) || ''),
        read: false,
        createdAt: nowIso
      };
      store.notifications.push(notification);
      if (store.notifications.length > 20000) store.notifications = store.notifications.slice(-20000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: notification });
    }

    var notificationsMatch = pathname.match(/^\/notifications\/([^/]+)$/);
    if (method === 'GET' && notificationsMatch) {
      var notifyUser = decodeURIComponent(notificationsMatch[1] || '');
      var notifyItems = store.notifications.filter(function (item) {
        var key = String((item && item.userKey) || '');
        return key === notifyUser || key === 'global';
      });
      return Promise.resolve({ ok: true, items: notifyItems });
    }

    if (method === 'POST' && pathname === '/wallet/topup') {
      var wallet = walletForUser(store, userKeyFromPayload);
      var amount = toNumber(payload && payload.amount, 0);
      wallet.balance = Number((wallet.balance + amount).toFixed(2));
      var topupEntry = addWalletEntry(wallet, 'credit', amount, {
        method: payload && payload.method,
        note: payload && payload.note
      });
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, wallet: wallet, entry: topupEntry });
    }

    var walletMatch = pathname.match(/^\/wallet\/([^/]+)$/);
    if (method === 'GET' && walletMatch) {
      var walletUser = decodeURIComponent(walletMatch[1] || '');
      var userWallet = walletForUser(store, walletUser);
      return Promise.resolve({ ok: true, wallet: userWallet });
    }

    if (method === 'GET' && pathname === '/tourism/places') {
      var districtQuery = String(query.get('district') || '').trim();
      var districtName = districtQuery ? resolveDistrictName(districtQuery, allDistrictNames(store)) : '';
      var tourism = safeArray(store.tourismPlaces).slice();
      if (districtName) {
        tourism = tourism.filter(function (item) {
          return simplifyText(item && item.district) === simplifyText(districtName);
        });
      }

      if (!tourism.length && districtName) {
        tourism = tourismFromWindow(districtName);
      } else if (!tourism.length && !districtName) {
        var names = allDistrictNames(store).slice(0, 20);
        for (var ti = 0; ti < names.length; ti += 1) {
          tourism = tourism.concat(tourismFromWindow(names[ti]).slice(0, 4));
        }
      }

      return Promise.resolve({ ok: true, items: tourism.slice(0, 400) });
    }

    if (method === 'POST' && pathname === '/tourism/places') {
      var tourismDistrict = resolveDistrictName((payload && payload.district) || 'Jaipur', allDistrictNames(store));
      var placeItem = {
        id: makeId('place'),
        district: tourismDistrict,
        name: String((payload && payload.name) || 'Tourist Place'),
        category: String((payload && payload.category) || 'Heritage'),
        history: String((payload && payload.history) || 'Added from runtime extension'),
        openTime: String((payload && payload.openTime) || '09:00'),
        closeTime: String((payload && payload.closeTime) || '18:00'),
        parking: Boolean((payload && payload.parking) !== false),
        createdAt: nowIso
      };
      store.tourismPlaces.push(placeItem);
      if (store.tourismPlaces.length > 15000) store.tourismPlaces = store.tourismPlaces.slice(-15000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: placeItem });
    }

    if (method === 'POST' && pathname === '/history/ride') {
      var rideUser = userKeyFromPayload;
      if (!store.rideHistory[rideUser]) store.rideHistory[rideUser] = [];
      var record = {
        id: makeId('ride'),
        bookingId: String((payload && payload.bookingId) || ('BK-' + Date.now())),
        from: String((payload && payload.from) || ''),
        to: String((payload && payload.to) || ''),
        distanceKm: Number(toNumber(payload && payload.distanceKm, 0).toFixed(2)),
        fare: Number(toNumber(payload && payload.fare, 0).toFixed(2)),
        status: String((payload && payload.status) || 'completed'),
        driverName: String((payload && payload.driverName) || ''),
        rating: Number(toNumber(payload && payload.rating, 0).toFixed(1)),
        feedback: String((payload && payload.feedback) || ''),
        createdAt: nowIso
      };
      store.rideHistory[rideUser].push(record);
      if (store.rideHistory[rideUser].length > 5000) store.rideHistory[rideUser] = store.rideHistory[rideUser].slice(-5000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: record });
    }

    var rideHistoryMatch = pathname.match(/^\/history\/ride\/([^/]+)$/);
    if (method === 'GET' && rideHistoryMatch) {
      var rideUserKey = decodeURIComponent(rideHistoryMatch[1] || '');
      return Promise.resolve({ ok: true, items: safeArray(store.rideHistory[rideUserKey]).slice() });
    }

    if (method === 'POST' && pathname.match(/^\/preferences\/[^/]+$/)) {
      var prefUser = decodeURIComponent(pathname.split('/').pop() || '') || userKeyFromPayload;
      store.preferences[prefUser] = Object.assign({}, safeObject(store.preferences[prefUser]), safeObject(payload), { updatedAt: nowIso });
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, userKey: prefUser, preference: store.preferences[prefUser] });
    }

    var prefMatch = pathname.match(/^\/preferences\/([^/]+)$/);
    if (method === 'GET' && prefMatch) {
      var prefUserKey = decodeURIComponent(prefMatch[1] || '');
      return Promise.resolve({ ok: true, userKey: prefUserKey, preference: safeObject(store.preferences[prefUserKey]) });
    }

    if (method === 'GET' && pathname === '/districts') {
      return Promise.resolve({ ok: true, districts: allDistrictNames(store) });
    }

    var districtDetailMatch = pathname.match(/^\/districts\/([^/]+)\/detail$/);
    if (method === 'GET' && districtDetailMatch) {
      var districtInput = decodeURIComponent(districtDetailMatch[1] || '');
      var districtResolved = resolveDistrictName(districtInput, allDistrictNames(store));
      var detail = districtDetailFromWindow(districtResolved);
      if (!detail) {
        detail = {
          info: defaultDistrictInfo(),
          tourist_places: tourismFromWindow(districtResolved).map(function (item) { return item.name; })
        };
      }
      var tourismCount = safeArray(store.tourismPlaces).filter(function (item) {
        return simplifyText(item && item.district) === simplifyText(districtResolved);
      }).length;
      var listingCount = safeArray(store.listings).filter(function (item) {
        return simplifyText(item && item.city) === simplifyText(districtResolved);
      }).length;
      return Promise.resolve({
        ok: true,
        districtName: districtResolved,
        datasetAvailable: !!districtDetailFromWindow(districtResolved),
        detail: detail,
        runtime: {
          tourismPlacesCount: tourismCount,
          listingsCount: listingCount
        }
      });
    }

    if (method === 'POST' && pathname === '/listings') {
      var listing = {
        id: makeId('listing'),
        type: String((payload && payload.type) || 'Listing'),
        name: String((payload && payload.name) || 'Untitled Listing'),
        city: String((payload && payload.city) || ''),
        contact: String((payload && payload.contact) || ''),
        rating: Number(toNumber(payload && payload.rating, 0).toFixed(1)),
        specialty: String((payload && payload.specialty) || ''),
        createdAt: nowIso
      };
      store.listings.push(listing);
      if (store.listings.length > 20000) store.listings = store.listings.slice(-20000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: listing });
    }

    if (method === 'GET' && pathname === '/listings') {
      var listingCity = String(query.get('city') || '').trim();
      var listingType = String(query.get('type') || '').trim();
      var listingItems = safeArray(store.listings).filter(function (item) {
        var cityOk = !listingCity || simplifyText(item && item.city).indexOf(simplifyText(listingCity)) !== -1;
        var typeOk = !listingType || simplifyText(item && item.type).indexOf(simplifyText(listingType)) !== -1;
        return cityOk && typeOk;
      });
      return Promise.resolve({ ok: true, items: listingItems });
    }

    if (method === 'POST' && pathname === '/packages') {
      var packageItem = {
        id: makeId('pkg'),
        title: String((payload && payload.title) || 'New Package'),
        theme: String((payload && payload.theme) || 'Family'),
        durationDays: Math.max(1, Math.round(toNumber(payload && payload.durationDays, 1))),
        priceInr: Number(toNumber(payload && payload.priceInr, 0).toFixed(2)),
        localGuide: Boolean((payload && payload.localGuide) !== false),
        includesVehicle: Boolean((payload && payload.includesVehicle) !== false),
        createdAt: nowIso
      };
      store.packages.push(packageItem);
      if (store.packages.length > 8000) store.packages = store.packages.slice(-8000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: packageItem });
    }

    if (method === 'GET' && pathname === '/packages') {
      return Promise.resolve({ ok: true, items: safeArray(store.packages) });
    }

    var packageBookMatch = pathname.match(/^\/packages\/([^/]+)\/book$/);
    if (method === 'POST' && packageBookMatch) {
      var packageId = decodeURIComponent(packageBookMatch[1] || '');
      var bookingItem = {
        id: makeId('pkg-book'),
        packageId: packageId,
        userKey: userKeyFromPayload,
        travelers: Math.max(1, Math.round(toNumber(payload && payload.travelers, 1))),
        paymentMethod: String((payload && payload.paymentMethod) || 'cash'),
        createdAt: nowIso
      };
      store.packageBookings.push(bookingItem);
      if (store.packageBookings.length > 30000) store.packageBookings = store.packageBookings.slice(-30000);
      store.counters.packagesBooked = Math.max(0, toNumber(store.counters.packagesBooked, 0)) + 1;
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: bookingItem });
    }

    if (method === 'POST' && pathname === '/referrals/track') {
      var bookingValue = Math.max(0, toNumber(payload && payload.bookingValue, 0));
      var commissionPercent = 5;
      var eventItem = {
        id: makeId('ref'),
        userKey: userKeyFromPayload,
        partner: String((payload && payload.partner) || ''),
        code: String((payload && payload.code) || ''),
        bookingValue: Number(bookingValue.toFixed(2)),
        commissionPercent: commissionPercent,
        commissionAmount: Number((bookingValue * (commissionPercent / 100)).toFixed(2)),
        eventType: String((payload && payload.eventType) || 'booking'),
        createdAt: nowIso
      };
      store.referrals.push(eventItem);
      if (store.referrals.length > 40000) store.referrals = store.referrals.slice(-40000);
      store.counters.referralsTracked = Math.max(0, toNumber(store.counters.referralsTracked, 0)) + 1;
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, event: eventItem });
    }

    if (method === 'GET' && pathname === '/referrals/summary') {
      var summaryPartner = String(query.get('partner') || '').trim();
      var summaryCode = String(query.get('code') || '').trim();
      var refItems = safeArray(store.referrals).filter(function (item) {
        var partnerOk = !summaryPartner || simplifyText(item && item.partner) === simplifyText(summaryPartner);
        var codeOk = !summaryCode || simplifyText(item && item.code) === simplifyText(summaryCode);
        return partnerOk && codeOk;
      });
      var totalBookingValue = 0;
      var totalCommission = 0;
      for (var ri = 0; ri < refItems.length; ri += 1) {
        totalBookingValue += toNumber(refItems[ri] && refItems[ri].bookingValue, 0);
        totalCommission += toNumber(refItems[ri] && refItems[ri].commissionAmount, 0);
      }
      return Promise.resolve({
        ok: true,
        count: refItems.length,
        totalBookingValue: Number(totalBookingValue.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2))
      });
    }

    if (method === 'POST' && pathname === '/fare/estimate') {
      var distance = Math.max(0, toNumber(payload && payload.distanceKm, 0));
      var duration = Math.max(0, toNumber(payload && payload.durationMin, 0));
      var vehicleType = normalize((payload && payload.vehicleType) || 'economy');
      var offerPercent = Math.max(0, Math.min(80, toNumber(payload && payload.offerPercent, 0)));
      var currency = String((payload && payload.currency) || 'INR').toUpperCase();
      var baseRate = VEHICLE_BASE_RATES[vehicleType] || VEHICLE_BASE_RATES.economy;
      var baseFare = (distance * baseRate) + (duration * 1.5) + 30;
      var discount = baseFare * (offerPercent / 100);
      var finalInr = Math.max(0, baseFare - discount);
      var rate = CURRENCY_RATES[currency] || 1;
      return Promise.resolve({
        ok: true,
        estimate: {
          distanceKm: Number(distance.toFixed(2)),
          durationMin: Number(duration.toFixed(2)),
          vehicleType: vehicleType || 'economy',
          currency: currency,
          offerPercent: offerPercent,
          baseInr: Number(baseFare.toFixed(2)),
          discountInr: Number(discount.toFixed(2)),
          finalInr: Number(finalInr.toFixed(2)),
          convertedFare: Number((finalInr * rate).toFixed(2))
        }
      });
    }

    if (method === 'POST' && pathname === '/terms/consent') {
      var consentItem = {
        id: makeId('terms'),
        userKey: userKeyFromPayload,
        version: String((payload && payload.version) || 'v2026'),
        source: String((payload && payload.source) || ''),
        accepted: Boolean(payload && payload.accepted),
        createdAt: nowIso
      };
      store.termsConsents.push(consentItem);
      if (store.termsConsents.length > 30000) store.termsConsents = store.termsConsents.slice(-30000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: consentItem });
    }

    var termsMatch = pathname.match(/^\/terms\/consent\/([^/]+)$/);
    if (method === 'GET' && termsMatch) {
      var consentUser = decodeURIComponent(termsMatch[1] || '');
      var consentItems = safeArray(store.termsConsents).filter(function (item) {
        return String((item && item.userKey) || '') === consentUser;
      });
      return Promise.resolve({ ok: true, items: consentItems });
    }

    if (method === 'POST' && pathname === '/support/ticket') {
      var ticketItem = {
        id: makeId('ticket'),
        ticketCode: 'SUP-' + Date.now(),
        userKey: userKeyFromPayload,
        category: String((payload && payload.category) || 'general'),
        message: String((payload && payload.message) || ''),
        status: 'open',
        createdAt: nowIso
      };
      store.supportTickets.push(ticketItem);
      if (store.supportTickets.length > 30000) store.supportTickets = store.supportTickets.slice(-30000);
      store.counters.supportTickets = Math.max(0, toNumber(store.counters.supportTickets, 0)) + 1;
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: ticketItem });
    }

    var supportMatch = pathname.match(/^\/support\/ticket\/([^/]+)$/);
    if (method === 'GET' && supportMatch) {
      var supportUser = decodeURIComponent(supportMatch[1] || '');
      var supportItems = safeArray(store.supportTickets).filter(function (item) {
        return String((item && item.userKey) || '') === supportUser;
      });
      return Promise.resolve({ ok: true, items: supportItems });
    }

    if (method === 'GET' && pathname === '/admin/summary') {
      var walletKeys = Object.keys(safeObject(store.wallets));
      var totalWallet = 0;
      for (var wi = 0; wi < walletKeys.length; wi += 1) {
        totalWallet += toNumber(store.wallets[walletKeys[wi]] && store.wallets[walletKeys[wi]].balance, 0);
      }
      return Promise.resolve({
        ok: true,
        metrics: {
          listings: safeArray(store.listings).length,
          packages: safeArray(store.packages).length,
          packageBookings: safeArray(store.packageBookings).length,
          referrals: safeArray(store.referrals).length,
          notifications: safeArray(store.notifications).length,
          supportTickets: safeArray(store.supportTickets).length,
          disputes: safeArray(store.disputes).length,
          fraudAlerts: safeArray(store.fraudAlerts).length,
          totalWalletBalance: Number(totalWallet.toFixed(2))
        }
      });
    }

    var recommendationMatch = pathname.match(/^\/recommendations\/([^/]+)$/);
    if (method === 'GET' && recommendationMatch) {
      var recoUser = decodeURIComponent(recommendationMatch[1] || '');
      var pref = safeObject(store.preferences[recoUser]);
      var preferredDistrict = String(pref.district || pref.city || '').trim();
      if (!preferredDistrict) {
        var saved = safeArray(store.savedLocations).filter(function (item) {
          return String((item && item.userKey) || '') === recoUser;
        });
        if (saved.length) preferredDistrict = String(saved[saved.length - 1].district || '').trim();
      }
      preferredDistrict = preferredDistrict || 'Jaipur';
      var resolvedDistrict = resolveDistrictName(preferredDistrict, allDistrictNames(store));
      var recoListings = safeArray(store.listings).filter(function (item) {
        return simplifyText(item && item.city).indexOf(simplifyText(resolvedDistrict)) !== -1;
      }).slice(-5).reverse();
      var recoPlaces = tourismFromWindow(resolvedDistrict).slice(0, 5);
      if (!recoPlaces.length) {
        recoPlaces = safeArray(store.tourismPlaces).filter(function (item) {
          return simplifyText(item && item.district) === simplifyText(resolvedDistrict);
        }).slice(-5).reverse();
      }
      return Promise.resolve({
        ok: true,
        userKey: recoUser,
        preferredDistrict: resolvedDistrict,
        listings: recoListings,
        places: recoPlaces
      });
    }

    if (method === 'POST' && pathname === '/reviews') {
      var reviewItem = {
        id: makeId('review'),
        userKey: userKeyFromPayload,
        targetType: String((payload && payload.targetType) || 'driver'),
        targetId: String((payload && payload.targetId) || 'generic'),
        rating: Math.max(1, Math.min(5, Math.round(toNumber(payload && payload.rating, 5)))),
        comment: String((payload && payload.comment) || ''),
        createdAt: nowIso
      };
      store.reviews.push(reviewItem);
      if (store.reviews.length > 30000) store.reviews = store.reviews.slice(-30000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: reviewItem });
    }

    if (method === 'GET' && pathname === '/reviews') {
      var reviewTargetType = String(query.get('targetType') || '').trim();
      var reviewTargetId = String(query.get('targetId') || '').trim();
      var reviewItems = safeArray(store.reviews).filter(function (item) {
        var typeOk = !reviewTargetType || simplifyText(item && item.targetType) === simplifyText(reviewTargetType);
        var idOk = !reviewTargetId || simplifyText(item && item.targetId) === simplifyText(reviewTargetId);
        return typeOk && idOk;
      });
      var reviewTotal = 0;
      for (var rv = 0; rv < reviewItems.length; rv += 1) reviewTotal += toNumber(reviewItems[rv] && reviewItems[rv].rating, 0);
      var avg = reviewItems.length ? Number((reviewTotal / reviewItems.length).toFixed(2)) : 0;
      return Promise.resolve({ ok: true, averageRating: avg, items: reviewItems });
    }

    if (method === 'POST' && pathname === '/partner/webhook/log') {
      var webhookItem = {
        id: makeId('webhook'),
        partner: String((payload && payload.partner) || ''),
        eventType: String((payload && payload.eventType) || 'event'),
        payload: safeObject(payload && payload.payload),
        createdAt: nowIso
      };
      store.webhookEvents.push(webhookItem);
      if (store.webhookEvents.length > 20000) store.webhookEvents = store.webhookEvents.slice(-20000);
      store.counters.webhookEvents = Math.max(0, toNumber(store.counters.webhookEvents, 0)) + 1;
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: webhookItem });
    }

    if (method === 'GET' && pathname === '/partner/webhook/logs') {
      var webhookPartner = String(query.get('partner') || '').trim();
      var webhookItems = safeArray(store.webhookEvents).filter(function (item) {
        return !webhookPartner || simplifyText(item && item.partner) === simplifyText(webhookPartner);
      });
      return Promise.resolve({ ok: true, items: webhookItems });
    }

    if (method === 'POST' && pathname === '/auth/otp/send') {
      var otpCode = String(Math.floor(100000 + Math.random() * 900000));
      var otpItem = {
        id: makeId('otp'),
        userKey: userKeyFromPayload,
        destination: String((payload && payload.destination) || ''),
        channel: String((payload && payload.channel) || 'sms'),
        code: otpCode,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        used: false,
        createdAt: nowIso
      };
      store.otpEvents.push(otpItem);
      if (store.otpEvents.length > 50000) store.otpEvents = store.otpEvents.slice(-50000);
      addAuthLog(store, {
        userKey: userKeyFromPayload,
        action: 'otp-send',
        success: true,
        channel: otpItem.channel,
        destination: otpItem.destination
      });
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, otpId: otpItem.id, code: otpCode });
    }

    if (method === 'POST' && pathname === '/auth/otp/verify') {
      var otpId = String((payload && payload.otpId) || '');
      var code = String((payload && payload.code) || '');
      var otpEvents = safeArray(store.otpEvents);
      var found = null;
      for (var oi = otpEvents.length - 1; oi >= 0; oi -= 1) {
        if (String(otpEvents[oi] && otpEvents[oi].id) === otpId) {
          found = otpEvents[oi];
          break;
        }
      }
      var success = false;
      if (found && !found.used && String(found.code) === code) {
        var expiryTime = Date.parse(found.expiresAt || '');
        success = !Number.isFinite(expiryTime) || Date.now() <= expiryTime;
      }
      if (found && success) found.used = true;
      addAuthLog(store, {
        userKey: userKeyFromPayload,
        action: 'otp-verify',
        success: success,
        otpId: otpId
      });
      persistLocalBusinessStore();
      return Promise.resolve({ ok: success });
    }

    var authLogsMatch = pathname.match(/^\/auth\/logs\/([^/]+)$/);
    if (method === 'GET' && authLogsMatch) {
      var authUser = decodeURIComponent(authLogsMatch[1] || '');
      var authItems = safeArray(store.authLogs).filter(function (item) {
        return String((item && item.userKey) || '') === authUser;
      });
      return Promise.resolve({ ok: true, items: authItems });
    }

    if (method === 'POST' && pathname === '/saved-location') {
      var locationItem = {
        id: makeId('location'),
        userKey: userKeyFromPayload,
        label: String((payload && payload.label) || 'Saved Place'),
        address: String((payload && payload.address) || ''),
        district: String((payload && payload.district) || ''),
        createdAt: nowIso
      };
      store.savedLocations.push(locationItem);
      if (store.savedLocations.length > 30000) store.savedLocations = store.savedLocations.slice(-30000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: locationItem });
    }

    var savedLocationMatch = pathname.match(/^\/saved-location\/([^/]+)$/);
    if (method === 'GET' && savedLocationMatch) {
      var locationUser = decodeURIComponent(savedLocationMatch[1] || '');
      var locationItems = safeArray(store.savedLocations).filter(function (item) {
        return String((item && item.userKey) || '') === locationUser;
      });
      return Promise.resolve({ ok: true, items: locationItems });
    }

    if (method === 'POST' && pathname === '/booking/action') {
      var bookingAction = normalize((payload && payload.action) || '');
      var pickedUp = Boolean(payload && payload.pickedUp);
      var blocked = pickedUp && (bookingAction === 'cancel' || bookingAction === 'cancelled' || bookingAction === 'reject');
      var bookingItem = {
        id: makeId('policy'),
        userKey: userKeyFromPayload,
        bookingId: String((payload && payload.bookingId) || ('BK-' + Date.now())),
        action: String((payload && payload.action) || ''),
        pickedUp: pickedUp,
        allowed: !blocked,
        policyBlocked: blocked,
        createdAt: nowIso
      };
      store.bookingActions.push(bookingItem);
      if (store.bookingActions.length > 50000) store.bookingActions = store.bookingActions.slice(-50000);
      persistLocalBusinessStore();
      return Promise.resolve({
        ok: !blocked,
        policyBlocked: blocked,
        item: bookingItem
      });
    }

    var bookingActionMatch = pathname.match(/^\/booking\/action\/([^/]+)$/);
    if (method === 'GET' && bookingActionMatch) {
      var actionUser = decodeURIComponent(bookingActionMatch[1] || '');
      var actionItems = safeArray(store.bookingActions).filter(function (item) {
        return String((item && item.userKey) || '') === actionUser;
      });
      return Promise.resolve({ ok: true, items: actionItems });
    }

    if (method === 'POST' && pathname === '/dispute/report') {
      var disputeItem = {
        id: makeId('dispute'),
        disputeCode: 'DSP-' + Date.now(),
        userKey: userKeyFromPayload,
        bookingId: String((payload && payload.bookingId) || ''),
        issue: String((payload && payload.issue) || ''),
        status: 'open',
        createdAt: nowIso
      };
      store.disputes.push(disputeItem);
      if (store.disputes.length > 20000) store.disputes = store.disputes.slice(-20000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: disputeItem });
    }

    if (method === 'GET' && pathname === '/dispute/report') {
      var disputeUser = String(query.get('userKey') || '').trim();
      var disputeItems = safeArray(store.disputes).filter(function (item) {
        return !disputeUser || String((item && item.userKey) || '') === disputeUser;
      });
      return Promise.resolve({ ok: true, items: disputeItems });
    }

    if (method === 'POST' && pathname === '/fraud/alert') {
      var fraudItem = {
        id: makeId('fraud'),
        userKey: userKeyFromPayload,
        severity: String((payload && payload.severity) || 'medium'),
        note: String((payload && payload.note) || ''),
        category: String((payload && payload.category) || 'runtime-flag'),
        createdAt: nowIso
      };
      store.fraudAlerts.push(fraudItem);
      if (store.fraudAlerts.length > 20000) store.fraudAlerts = store.fraudAlerts.slice(-20000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: fraudItem });
    }

    if (method === 'GET' && pathname === '/fraud/alert') {
      var fraudUser = String(query.get('userKey') || '').trim();
      var fraudItems = safeArray(store.fraudAlerts).filter(function (item) {
        return !fraudUser || String((item && item.userKey) || '') === fraudUser;
      });
      return Promise.resolve({ ok: true, items: fraudItems });
    }

    if (method === 'POST' && pathname === '/ai/chatbot') {
      var question = String((payload && payload.question) || '');
      var chatItem = {
        id: makeId('chat'),
        userKey: userKeyFromPayload,
        question: question,
        answer: chatbotAnswer(question),
        createdAt: nowIso
      };
      store.aiChats.push(chatItem);
      if (store.aiChats.length > 60000) store.aiChats = store.aiChats.slice(-60000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: chatItem });
    }

    var chatHistoryMatch = pathname.match(/^\/ai\/chatbot\/([^/]+)$/);
    if (method === 'GET' && chatHistoryMatch) {
      var chatUser = decodeURIComponent(chatHistoryMatch[1] || '');
      var chatItems = safeArray(store.aiChats).filter(function (item) {
        return String((item && item.userKey) || '') === chatUser;
      });
      return Promise.resolve({ ok: true, items: chatItems });
    }

    if (method === 'POST' && pathname === '/feature/state') {
      var featureId = String((payload && payload.featureId) || '');
      if (!featureId) return Promise.resolve({ ok: false, message: 'featureId required' });
      var stateKey = featureId + '::' + userKeyFromPayload;
      store.featureStates[stateKey] = Object.assign({}, safeObject(payload), {
        userKey: userKeyFromPayload,
        featureId: featureId,
        updatedAt: nowIso
      });
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, state: store.featureStates[stateKey] });
    }

    var featureStateMatch = pathname.match(/^\/feature\/state\/([^/]+)$/);
    if (method === 'GET' && featureStateMatch) {
      var stateFeatureId = decodeURIComponent(featureStateMatch[1] || '');
      var stateUser = String(query.get('userKey') || '').trim() || currentUserKey();
      var stateItem = store.featureStates[stateFeatureId + '::' + stateUser] || null;
      return Promise.resolve({ ok: true, state: stateItem });
    }

    if (method === 'POST' && pathname === '/feature/action') {
      var actionItem = Object.assign({}, safeObject(payload), {
        id: makeId('feature-action'),
        userKey: userKeyFromPayload,
        createdAt: nowIso
      });
      store.featureActions.push(actionItem);
      if (store.featureActions.length > 120000) store.featureActions = store.featureActions.slice(-120000);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: actionItem });
    }

    var featureActionMatch = pathname.match(/^\/feature\/action\/([^/]+)$/);
    if (method === 'GET' && featureActionMatch) {
      var actionFeatureId = decodeURIComponent(featureActionMatch[1] || '');
      var actionUserKey = String(query.get('userKey') || '').trim() || currentUserKey();
      var actionItems = safeArray(store.featureActions).filter(function (item) {
        return String((item && item.featureId) || '') === actionFeatureId && String((item && item.userKey) || '') === actionUserKey;
      });
      return Promise.resolve({ ok: true, items: actionItems });
    }

    if (method === 'POST' && pathname === '/travel-card/issue') {
      var cardItem = {
        cardId: 'TC-' + Date.now(),
        userKey: userKeyFromPayload,
        fullName: String((payload && payload.fullName) || 'Guest User'),
        phone: String((payload && payload.phone) || ''),
        email: String((payload && payload.email) || ''),
        idProofType: String((payload && payload.idProofType) || 'Aadhar'),
        status: 'active',
        createdAt: nowIso
      };
      if (!store.travelCards[userKeyFromPayload]) store.travelCards[userKeyFromPayload] = [];
      store.travelCards[userKeyFromPayload].push(cardItem);
      persistLocalBusinessStore();
      return Promise.resolve({ ok: true, item: cardItem });
    }

    var travelUserMatch = pathname.match(/^\/travel-card\/user\/([^/]+)$/);
    if (method === 'GET' && travelUserMatch) {
      var travelUser = decodeURIComponent(travelUserMatch[1] || '');
      return Promise.resolve({ ok: true, items: safeArray(store.travelCards[travelUser]) });
    }

    return Promise.resolve({ ok: false, message: 'Local fallback route not mapped', path: pathname });
  }

  function requestBusiness(method, path, payload) {
    var route = String(path || '/').trim() || '/';
    if (route.charAt(0) !== '/') route = '/' + route;

    var options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-GoindiaRide-Runtime': 'future-feature-runtime-extensions'
      }
    };
    if (method !== 'GET') {
      options.body = JSON.stringify(payload || {});
    }

    function tryAt(index) {
      if (index >= BUSINESS_API_BASES.length) return Promise.resolve(null);
      var url = BUSINESS_API_BASES[index] + route;
      return fetchJson(url, options).then(function (result) {
        if (!result) return tryAt(index + 1);
        if (result.ok && result.json !== null) return result.json;
        // If API returns 200 with empty/non-JSON body (e.g. HTML fallback), keep trying
        // next base and finally local fallback instead of treating it as successful data.
        if (result.ok && result.json === null) return tryAt(index + 1);
        return tryAt(index + 1);
      });
    }

    return tryAt(0).then(function (remote) {
      if (remote !== null) return remote;
      return localBusinessRequest(method, route, payload || {});
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function featureFromDetail(detail) {
    var blockKey = detail && detail.blockKey;
    var featureId = detail && detail.featureId;
    if (!blockKey || !registry[blockKey] || !registry[blockKey].length) return null;
    var list = registry[blockKey];
    for (var i = 0; i < list.length; i += 1) {
      if (!featureId || list[i].featureId === featureId) return list[i];
    }
    return list[0] || null;
  }

  function ensureWorkspace() {
    if (PAGE_ROLE === 'generic' && !RUNTIME_DEBUG) return null;
    var root = document.querySelector('.dashboard-main, .dashboard-content, .booking-panel, .container, main, body');
    if (!root) return null;

    var box = document.getElementById('ff-runtime-extension-workspace');
    if (box) return box;

    box = document.createElement('section');
    box.id = 'ff-runtime-extension-workspace';
    box.style.cssText = 'margin:12px 0;display:grid;gap:10px;';
    root.appendChild(box);
    return box;
  }

  function ensureCard(cardId, title) {
    var workspace = ensureWorkspace();
    if (!workspace) return null;
    var id = 'ff-runtime-card-' + cardId;
    var card = document.getElementById(id);
    if (card) return card;

    card = document.createElement('section');
    card.id = id;
    card.style.cssText = 'padding:12px;border:1px solid #d9e7ff;background:#f8fbff;border-radius:10px;';
    card.innerHTML = '<h5 style=\"margin:0 0 8px 0;color:#143a69;font-family:Segoe UI,Tahoma,sans-serif;\">' + title + '</h5><div class=\"ff-runtime-card-body\"></div>';
    workspace.appendChild(card);
    return card;
  }

  function placeCustomerAccountCard(cardId) {
    if (PAGE_ROLE !== 'customer') return;
    var workspace = ensureWorkspace();
    if (!workspace) return;

    var authCard = document.getElementById('ff-runtime-card-auth');
    var profileCard = document.getElementById('ff-runtime-card-profile');
    var targetCard = document.getElementById('ff-runtime-card-' + cardId);
    if (!targetCard || targetCard.parentNode !== workspace) return;

    if (cardId === 'auth') {
      if (workspace.firstElementChild !== authCard) {
        workspace.insertBefore(authCard, workspace.firstElementChild);
      }
      if (profileCard && authCard.nextElementSibling !== profileCard) {
        workspace.insertBefore(profileCard, authCard.nextElementSibling);
      }
      return;
    }

    if (cardId === 'profile') {
      if (authCard) {
        if (authCard.nextElementSibling !== profileCard) {
          workspace.insertBefore(profileCard, authCard.nextElementSibling);
        }
      } else if (workspace.firstElementChild !== profileCard) {
        workspace.insertBefore(profileCard, workspace.firstElementChild);
      }
    }
  }

  function ensureSelectOption(selectEl, value, label) {
    if (!selectEl) return;
    for (var i = 0; i < selectEl.options.length; i += 1) {
      var opt = normalize(selectEl.options[i].value + ' ' + selectEl.options[i].text);
      if (opt.indexOf(normalize(value)) !== -1 || opt.indexOf(normalize(label)) !== -1) return;
    }
    var option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    selectEl.appendChild(option);
  }

  function executeFeature(feature, action, payload) {
    postJson('/execute/' + encodeURIComponent(feature.featureId || 'NA'), {
      category: feature.category || 'general',
      action: action || 'manual-run',
      pagePath: window.location.pathname,
      payload: payload || {}
    });
  }

  function syncActivation(feature, detail) {
    var key = (feature.category || 'general') + ':' + (detail.blockKey || 'block') + ':' + (feature.featureId || 'NA');
    if (extState.syncKeys[key]) return;
    extState.syncKeys[key] = true;

    postJson('/activate', {
      source: 'frontend-runtime-extension',
      detail: detail || {},
      feature: {
        featureId: feature.featureId,
        category: feature.category || 'general',
        blockKey: (detail && detail.blockKey) || feature.blockKey || '',
        sourceLine: feature.sourceLine || null,
        description: feature.description || '',
        implemented: true,
        status: feature.status || 'enabled-from-itemwise-block',
        pagePath: window.location.pathname
      }
    });
  }

  function applyAuthModule(feature) {
    var card = ensureCard('auth', 'Signup / Login / OTP');
    if (!card) return;
    placeCustomerAccountCard('auth');
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-auth-login')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-auth-email\" placeholder=\"Email\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-auth-phone\" placeholder=\"Phone\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-auth-otp\" placeholder=\"OTP\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-auth-signup\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Signup</button>',
      '<button type=\"button\" id=\"ffx-auth-login\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Login</button>',
      '<button type=\"button\" id=\"ffx-auth-google\" style=\"padding:8px;border:0;border-radius:8px;background:#ef4444;color:#fff;\">Google Login</button>',
      '<button type=\"button\" id=\"ffx-auth-facebook\" style=\"padding:8px;border:0;border-radius:8px;background:#1e40af;color:#fff;\">Facebook Login</button>',
      '</div>'
    ].join('');

    function payload() {
      return {
        email: (body.querySelector('#ffx-auth-email') || {}).value || '',
        phone: (body.querySelector('#ffx-auth-phone') || {}).value || '',
        otp: (body.querySelector('#ffx-auth-otp') || {}).value || ''
      };
    }

    body.querySelector('#ffx-auth-signup').addEventListener('click', function () { executeFeature(feature, 'auth-signup', payload()); });
    body.querySelector('#ffx-auth-login').addEventListener('click', function () { executeFeature(feature, 'auth-login', payload()); });
    body.querySelector('#ffx-auth-google').addEventListener('click', function () { executeFeature(feature, 'auth-google', payload()); });
    body.querySelector('#ffx-auth-facebook').addEventListener('click', function () { executeFeature(feature, 'auth-facebook', payload()); });
  }

  function applyProfileModule(feature) {
    var card = ensureCard('profile', 'Profile, Contacts, Privacy');
    if (!card) return;
    placeCustomerAccountCard('profile');
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-profile-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-profile-name\" placeholder=\"Full name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-address\" placeholder=\"Address\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-contact1\" placeholder=\"Emergency contact 1\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-contact2\" placeholder=\"Emergency contact 2\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-contact3\" placeholder=\"Emergency contact 3\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-photo\" type=\"file\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-profile-id\" type=\"file\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-profile-lang\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>Hindi</option><option>English</option><option>Rajasthani</option></select>',
      '<button type=\"button\" id=\"ffx-profile-save\" style=\"padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Save Profile</button>',
      '<button type=\"button\" id=\"ffx-profile-password\" style=\"padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Change Password</button>',
      '<button type=\"button\" id=\"ffx-profile-delete\" style=\"padding:8px;border:0;border-radius:8px;background:#b91c1c;color:#fff;\">Delete Account</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-profile-save').addEventListener('click', function () {
      var payload = {
        name: (body.querySelector('#ffx-profile-name') || {}).value || '',
        address: (body.querySelector('#ffx-profile-address') || {}).value || '',
        contact1: (body.querySelector('#ffx-profile-contact1') || {}).value || '',
        contact2: (body.querySelector('#ffx-profile-contact2') || {}).value || '',
        contact3: (body.querySelector('#ffx-profile-contact3') || {}).value || '',
        language: (body.querySelector('#ffx-profile-lang') || {}).value || ''
      };
      executeFeature(feature, 'profile-save', {
        name: payload.name,
        address: payload.address,
        contact1: payload.contact1,
        contact2: payload.contact2,
        contact3: payload.contact3,
        language: payload.language
      });

      if (window.localStorage) {
        window.localStorage.setItem('goindiaride.profile.runtime', JSON.stringify(payload));
        window.localStorage.setItem('goindiaride.runtime.userKey', normalize(payload.contact1 || payload.name || 'guest-user'));
      }

      postBusiness('/preferences/' + encodeURIComponent(currentUserKey()), {
        language: payload.language,
        push: true,
        sms: true,
        email: true,
        whatsapp: false
      });
    });
    body.querySelector('#ffx-profile-password').addEventListener('click', function () { executeFeature(feature, 'profile-password-change', {}); });
    body.querySelector('#ffx-profile-delete').addEventListener('click', function () { executeFeature(feature, 'profile-delete-request', {}); });
  }

  function applyPaymentModule(feature) {
    var selectors = ['select[name*=\"payment\" i]', 'select[id*=\"payment\" i]', '#paymentMethod', '#payment-method'];
    for (var i = 0; i < selectors.length; i += 1) {
      var selectEl = document.querySelector(selectors[i]);
      if (selectEl) {
        ensureSelectOption(selectEl, 'upi', 'UPI');
        ensureSelectOption(selectEl, 'paypal', 'PayPal');
        ensureSelectOption(selectEl, 'wallet', 'Wallet');
      }
    }

    var card = ensureCard('payment', 'Payment / Wallet / Coupon');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-payment-apply')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-payment-coupon\" placeholder=\"Coupon code\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-payment-apply\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Apply Coupon</button>',
      '<input id=\"ffx-payment-wallet\" placeholder=\"Wallet amount\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-payment-wallet-add\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Add Wallet</button>',
      '</div>',
      '<div id=\"ffx-payment-output\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#173b67;\">Wallet balance: loading...</div>'
    ].join('');

    var output = body.querySelector('#ffx-payment-output');
    function setOutput(text) {
      if (output) output.textContent = text || '';
    }
    function refreshWallet() {
      getBusiness('/wallet/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var wallet = data && data.wallet ? data.wallet : null;
        var balance = wallet && Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance).toFixed(2) : '0.00';
        setOutput('Wallet balance: INR ' + balance);
      });
    }

    body.querySelector('#ffx-payment-apply').addEventListener('click', function () {
      var code = (body.querySelector('#ffx-payment-coupon') || {}).value || '';
      executeFeature(feature, 'coupon-apply', { code: code });
      postBusiness('/notifications/send', {
        userKey: currentUserKey(),
        type: 'coupon',
        channel: 'in_app',
        title: 'Coupon Applied',
        message: code ? ('Coupon ' + code + ' applied successfully.') : 'Coupon apply action performed.'
      }).then(function () {
        setOutput(code
          ? ('Coupon ' + code + ' applied and notification sent.')
          : 'Coupon action completed.');
      });
    });
    body.querySelector('#ffx-payment-wallet-add').addEventListener('click', function () {
      var amount = (body.querySelector('#ffx-payment-wallet') || {}).value || '';
      executeFeature(feature, 'wallet-add', { amount: amount });
      postBusiness('/wallet/topup', {
        userKey: currentUserKey(),
        amount: Number(amount || 0),
        method: 'runtime-ui',
        note: 'Top-up from runtime extension'
      }).then(function (data) {
        var wallet = data && data.wallet ? data.wallet : null;
        var balance = wallet && Number.isFinite(Number(wallet.balance)) ? Number(wallet.balance).toFixed(2) : null;
        if (balance !== null) setOutput('Wallet topped up. Balance: INR ' + balance);
        else setOutput('Wallet top-up completed.');
        refreshWallet();
      });
    });

    refreshWallet();
  }

  function applyRideModule(feature) {
    var selectors = ['select[name*=\"trip\" i]', 'select[id*=\"trip\" i]', 'select[name*=\"ride\" i]', 'select[id*=\"ride\" i]'];
    for (var i = 0; i < selectors.length; i += 1) {
      var selectEl = document.querySelector(selectors[i]);
      if (selectEl) {
        ensureSelectOption(selectEl, 'local', 'Local');
        ensureSelectOption(selectEl, 'outstation', 'Outstation');
        ensureSelectOption(selectEl, 'rental', 'Rental');
        ensureSelectOption(selectEl, 'airport', 'Airport');
      }
    }
    executeFeature(feature, 'ride-mode-options-enabled', {});
  }

  function applyEmergencyModule(feature) {
    // Booking page already has its own native emergency section.
    // Do not render duplicate runtime emergency card there.
    if (PAGE_ROLE === 'booking') {
      var existingEmergencyCard = document.getElementById('ff-runtime-card-emergency');
      if (existingEmergencyCard && existingEmergencyCard.parentNode) {
        existingEmergencyCard.parentNode.removeChild(existingEmergencyCard);
      }
      if (feature) feature.implemented = true;
      return;
    }

    var card = ensureCard('emergency', 'Emergency & 24x7 Support');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-emergency-sos')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<a href=\"tel:100\" style=\"padding:8px 10px;border-radius:8px;background:#1d4ed8;color:#fff;text-decoration:none;\">Police 100</a>',
      '<a href=\"tel:108\" style=\"padding:8px 10px;border-radius:8px;background:#dc2626;color:#fff;text-decoration:none;\">Ambulance 108</a>',
      '<button type=\"button\" id=\"ffx-emergency-sos\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#7c3aed;color:#fff;\">SOS Alert</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-emergency-sos').addEventListener('click', function () {
      executeFeature(feature, 'sos-alert', { status: 'triggered' });
      postBusiness('/notifications/send', {
        userKey: 'global',
        type: 'emergency',
        channel: 'in_app',
        title: 'Emergency SOS',
        message: 'Runtime SOS alert triggered by user: ' + currentUserKey()
      });
      window.alert('SOS Alert triggered');
    });
  }

  function applyTourismModule(feature) {
    var listId = 'ffx-tourist-datalist';
    var enableNativeDatalist = window.__GOINDIARIDE_ENABLE_PICKUP_DATALIST__ === true;
    if (enableNativeDatalist) {
      var datalist = document.getElementById(listId);
      if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = listId;
        var places = ['Amer Fort', 'Hawa Mahal', 'City Palace Jaipur', 'Mehrangarh Fort', 'City Palace Udaipur', 'Pushkar Temple', 'Jantar Mantar'];
        for (var i = 0; i < places.length; i += 1) {
          var option = document.createElement('option');
          option.value = places[i];
          datalist.appendChild(option);
        }
        document.body.appendChild(datalist);
      }
    }
    var pickup = document.querySelector('input[name*=\"pickup\" i], input[id*=\"pickup\" i]');
    var dropoff = document.querySelector('input[name*=\"drop\" i], input[id*=\"drop\" i]');
    if (enableNativeDatalist) {
      if (pickup) pickup.setAttribute('list', listId);
      if (dropoff) dropoff.setAttribute('list', listId);
    } else {
      if (pickup && pickup.getAttribute('list') === listId) pickup.removeAttribute('list');
      if (dropoff && dropoff.getAttribute('list') === listId) dropoff.removeAttribute('list');
    }

    var card = ensureCard('tourism', 'Tourist Places & District Explorer');
    if (card) {
      var body = card.querySelector('.ff-runtime-card-body');
      if (body && !body.querySelector('#ffx-tourism-load')) {
        body.innerHTML = [
          '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
          '<input id=\"ffx-tourism-district\" placeholder=\"District (e.g. Jaipur)\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
          '<button type=\"button\" id=\"ffx-tourism-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Places</button>',
          '<input id=\"ffx-tourism-place\" placeholder=\"New place name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
          '<button type=\"button\" id=\"ffx-tourism-add\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Add Place</button>',
          '</div>',
          '<div id=\"ffx-tourism-status\" style=\"margin-top:8px;font-size:12px;color:#24416d;\"></div>',
          '<div id=\"ffx-tourism-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
        ].join('');

        var districtInput = body.querySelector('#ffx-tourism-district');
        var listEl = body.querySelector('#ffx-tourism-list');
        var statusEl = body.querySelector('#ffx-tourism-status');
        function setStatus(text) {
          if (statusEl) statusEl.textContent = text || '';
        }

        body.querySelector('#ffx-tourism-load').addEventListener('click', function () {
          var district = (districtInput || {}).value || '';
          setStatus('Loading places...');
          getBusiness('/tourism/places?district=' + encodeURIComponent(district)).then(function (data) {
            var items = data && Array.isArray(data.items) ? data.items : [];
            if (!listEl) return;
            if (!items.length) {
              listEl.textContent = 'No places found';
              setStatus('No places found for "' + (district || 'all districts') + '".');
              return;
            }
            listEl.innerHTML = items.slice(0, 80).map(function (item) {
              return '<div style=\"padding:5px 0;border-bottom:1px solid #edf2ff;\"><strong>' + item.name + '</strong> (' + item.district + ') - ' + (item.openTime || 'N/A') + ' to ' + (item.closeTime || 'N/A') + '</div>';
            }).join('');
            setStatus('Loaded ' + items.length + ' place(s).');
          });
        });

        body.querySelector('#ffx-tourism-add').addEventListener('click', function () {
          var district = (districtInput || {}).value || '';
          var placeName = (body.querySelector('#ffx-tourism-place') || {}).value || '';
          postBusiness('/tourism/places', {
            district: district || 'Jaipur',
            name: placeName || 'New Tourist Place',
            category: 'Heritage',
            history: 'Added from runtime extension',
            openTime: '09:00',
            closeTime: '18:00',
            parking: true
          }).then(function () {
            setStatus('Place added successfully.');
            body.querySelector('#ffx-tourism-load').click();
          });
          executeFeature(feature, 'tourism-place-add', { district: district, name: placeName });
        });

        if (districtInput) districtInput.value = districtInput.value || 'Udaipur';
        body.querySelector('#ffx-tourism-load').click();
      }
    }

    executeFeature(feature, 'tourism-suggestions-enabled', { listId: listId });
  }

  function applyRatingModule(feature) {
    var card = ensureCard('rating', 'Driver Rating');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-rating-save')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:6px;flex-wrap:wrap;\">',
      '<button type=\"button\" data-rating=\"1\" style=\"padding:6px 8px;border:0;border-radius:8px;background:#dbeafe;\">1★</button>',
      '<button type=\"button\" data-rating=\"2\" style=\"padding:6px 8px;border:0;border-radius:8px;background:#dbeafe;\">2★</button>',
      '<button type=\"button\" data-rating=\"3\" style=\"padding:6px 8px;border:0;border-radius:8px;background:#dbeafe;\">3★</button>',
      '<button type=\"button\" data-rating=\"4\" style=\"padding:6px 8px;border:0;border-radius:8px;background:#dbeafe;\">4★</button>',
      '<button type=\"button\" data-rating=\"5\" style=\"padding:6px 8px;border:0;border-radius:8px;background:#dbeafe;\">5★</button>',
      '</div>',
      '<input id=\"ffx-rating-feedback\" placeholder=\"Feedback\" style=\"margin-top:8px;padding:8px;width:100%;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-rating-save\" style=\"margin-top:8px;padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Save Rating</button>',
      '<div id=\"ffx-rating-output\" style=\"margin-top:8px;font-size:12px;color:#24416d;\"></div>'
    ].join('');

    var selected = 0;
    var output = body.querySelector('#ffx-rating-output');
    var buttons = body.querySelectorAll('[data-rating]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function () {
        selected = Number(this.getAttribute('data-rating')) || 0;
        if (output) output.textContent = 'Selected rating: ' + selected + ' star';
      });
    }
    body.querySelector('#ffx-rating-save').addEventListener('click', function () {
      var feedback = (body.querySelector('#ffx-rating-feedback') || {}).value || '';
      executeFeature(feature, 'rating-submit', {
        rating: selected,
        feedback: feedback
      });
      postBusiness('/history/ride', {
        userKey: currentUserKey(),
        from: 'Pickup',
        to: 'Drop',
        fare: 0,
        status: 'completed',
        rating: selected,
        feedback: feedback
      }).then(function () {
        if (output) output.textContent = 'Rating saved successfully.';
      });
    });
  }

  function applyDriverVehicleModule(feature) {
    var card = ensureCard('driver-vehicle', 'Driver Registration & Vehicle');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-driver-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-driver-name\" placeholder=\"Driver name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-driver-email\" placeholder=\"Driver email\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-driver-phone\" placeholder=\"Driver phone\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-driver-experience\" placeholder=\"Experience years\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-driver-languages\" placeholder=\"Languages known\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-vehicle-model\" placeholder=\"Vehicle model\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-vehicle-make\" placeholder=\"Vehicle make\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-vehicle-year\" placeholder=\"Vehicle year\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-vehicle-reg\" placeholder=\"Registration number\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-vehicle-type\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>Hatchback</option><option>Sedan</option><option>SUV</option><option>MUV</option></select>',
      '<input id=\"ffx-vehicle-color\" placeholder=\"Vehicle color\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-vehicle-front\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-vehicle-back\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-vehicle-left\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-vehicle-right\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-driver-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Save Driver + Vehicle</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-driver-save').addEventListener('click', function () {
      executeFeature(feature, 'driver-vehicle-save', {
        driverName: (body.querySelector('#ffx-driver-name') || {}).value || '',
        email: (body.querySelector('#ffx-driver-email') || {}).value || '',
        phone: (body.querySelector('#ffx-driver-phone') || {}).value || '',
        experience: (body.querySelector('#ffx-driver-experience') || {}).value || '',
        languages: (body.querySelector('#ffx-driver-languages') || {}).value || '',
        model: (body.querySelector('#ffx-vehicle-model') || {}).value || '',
        make: (body.querySelector('#ffx-vehicle-make') || {}).value || '',
        year: (body.querySelector('#ffx-vehicle-year') || {}).value || '',
        reg: (body.querySelector('#ffx-vehicle-reg') || {}).value || '',
        type: (body.querySelector('#ffx-vehicle-type') || {}).value || '',
        color: (body.querySelector('#ffx-vehicle-color') || {}).value || ''
      });
    });
  }

  function applyKycModule(feature) {
    var card = ensureCard('kyc', 'KYC & Document Verification');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-kyc-upload')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input type=\"file\" id=\"ffx-kyc-license\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-kyc-rc\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-kyc-insurance\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-kyc-pan\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-kyc-aadhar\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input type=\"file\" id=\"ffx-kyc-police\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-kyc-upload\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Upload & Verify</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-kyc-upload').addEventListener('click', function () {
      executeFeature(feature, 'kyc-upload', {
        license: Boolean((body.querySelector('#ffx-kyc-license') || {}).value),
        rc: Boolean((body.querySelector('#ffx-kyc-rc') || {}).value),
        insurance: Boolean((body.querySelector('#ffx-kyc-insurance') || {}).value),
        pan: Boolean((body.querySelector('#ffx-kyc-pan') || {}).value),
        aadhar: Boolean((body.querySelector('#ffx-kyc-aadhar') || {}).value),
        policeVerification: Boolean((body.querySelector('#ffx-kyc-police') || {}).value)
      });
    });
  }

  function applyBookingOpsModule(feature) {
    var card = ensureCard('booking-ops', 'Booking Operations');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-booking-accept')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<button type=\"button\" id=\"ffx-booking-accept\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Accept Booking</button>',
      '<button type=\"button\" id=\"ffx-booking-reject\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#dc2626;color:#fff;\">Reject Booking</button>',
      '<button type=\"button\" id=\"ffx-booking-extra\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Post Extra Booking</button>',
      '<button type=\"button\" id=\"ffx-booking-cancel-policy\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#334155;color:#fff;\">Apply Cancel Policy</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-booking-accept').addEventListener('click', function () { executeFeature(feature, 'booking-accept', {}); });
    body.querySelector('#ffx-booking-reject').addEventListener('click', function () { executeFeature(feature, 'booking-reject', {}); });
    body.querySelector('#ffx-booking-extra').addEventListener('click', function () { executeFeature(feature, 'booking-extra-post', {}); });
    body.querySelector('#ffx-booking-cancel-policy').addEventListener('click', function () { executeFeature(feature, 'booking-cancel-policy', {}); });

    body.querySelector('#ffx-booking-accept').addEventListener('click', function () {
      postBusiness('/notifications/send', {
        userKey: currentUserKey(),
        type: 'booking',
        channel: 'in_app',
        title: 'Booking Accepted',
        message: 'Driver accepted your booking.'
      });
      postBusiness('/history/ride', {
        userKey: currentUserKey(),
        from: 'Pickup',
        to: 'Drop',
        distanceKm: 0,
        fare: 0,
        status: 'accepted'
      });
    });

    body.querySelector('#ffx-booking-reject').addEventListener('click', function () {
      postBusiness('/notifications/send', {
        userKey: currentUserKey(),
        type: 'booking',
        channel: 'in_app',
        title: 'Booking Rejected',
        message: 'Driver rejected/cancelled your booking.'
      });
    });
  }

  function applyLiveTrackingModule(feature) {
    var card = ensureCard('live-tracking', 'Live Tracking & Trip Monitoring');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-live-track-start')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<button type=\"button\" id=\"ffx-live-track-start\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Start Tracking</button>',
      '<button type=\"button\" id=\"ffx-live-track-stop\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#334155;color:#fff;\">Stop</button>',
      '</div>',
      '<div id=\"ffx-live-track-status\" style=\"margin-top:8px;padding:8px;border-radius:8px;background:#edf4ff;color:#1e3a5f;\">Tracking idle</div>'
    ].join('');

    var watchId = null;
    var status = body.querySelector('#ffx-live-track-status');

    body.querySelector('#ffx-live-track-start').addEventListener('click', function () {
      if (!navigator.geolocation) {
        status.textContent = 'Geolocation unavailable';
        executeFeature(feature, 'live-tracking-unavailable', {});
        return;
      }
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(function (pos) {
        var payload = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        status.textContent = 'Tracking: ' + payload.lat.toFixed(5) + ', ' + payload.lng.toFixed(5);
        executeFeature(feature, 'live-tracking-update', payload);
      }, function (err) {
        status.textContent = 'Tracking error: ' + ((err && err.message) || 'unknown');
        executeFeature(feature, 'live-tracking-error', { message: (err && err.message) || 'unknown' });
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    });

    body.querySelector('#ffx-live-track-stop').addEventListener('click', function () {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      status.textContent = 'Tracking stopped';
      executeFeature(feature, 'live-tracking-stop', {});
    });
  }

  function applyPartnerCommissionModule(feature) {
    var card = ensureCard('partners', 'Hotel/Restaurant/Shop Commission');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-partner-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-partner-name\" placeholder=\"Partner name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-partner-type\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>Hotel</option><option>Restaurant</option><option>Shop</option><option>Guest House</option></select>',
      '<input id=\"ffx-partner-commission\" placeholder=\"Commission %\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-partner-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Save Partner</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-partner-save').addEventListener('click', function () {
      executeFeature(feature, 'partner-commission-save', {
        name: (body.querySelector('#ffx-partner-name') || {}).value || '',
        type: (body.querySelector('#ffx-partner-type') || {}).value || '',
        commissionPercent: (body.querySelector('#ffx-partner-commission') || {}).value || ''
      });
    });
  }

  function applyTrustBrandModule(feature) {
    var card = ensureCard('trust-brand', 'Trust & Experience Widgets');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-trust-reload')) return;

    body.innerHTML = [
      '<div style=\"display:grid;gap:8px;\">',
      '<div style=\"padding:8px;border-radius:8px;background:#eef5ff;color:#1d3f6f;\">Why Trust Us: Verified drivers, secure payments, live tracking.</div>',
      '<div style=\"padding:8px;border-radius:8px;background:#eef5ff;color:#1d3f6f;\">Real Trip Photos + Trip Before Preview + Social Proof.</div>',
      '<button type=\"button\" id=\"ffx-trust-reload\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Refresh Trust Widgets</button>',
      '</div>'
    ].join('');

    body.querySelector('#ffx-trust-reload').addEventListener('click', function () {
      executeFeature(feature, 'trust-widgets-refresh', {});
    });
  }

  function applyPolicyRulesModule(feature) {
    var card = ensureCard('policy-rules', 'Road Rules & Legal Compliance');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-policy-ack')) return;

    body.innerHTML = [
      '<div style=\"padding:8px;border-radius:8px;background:#fff7ed;color:#7c2d12;\">Road safety and government compliance rules are active for all rides.</div>',
      '<button type=\"button\" id=\"ffx-policy-ack\" style=\"margin-top:8px;padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Acknowledge Rules</button>'
    ].join('');

    body.querySelector('#ffx-policy-ack').addEventListener('click', function () {
      executeFeature(feature, 'policy-acknowledged', {});
    });
  }

  function applyNotificationCenterModule(feature) {
    var card = ensureCard('notifications', 'Notification Center');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-notification-send')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-notification-title\" placeholder=\"Notification title\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-notification-message\" placeholder=\"Notification message\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-notification-channel\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option value=\"in_app\">In-App</option><option value=\"sms\">SMS</option><option value=\"email\">Email</option><option value=\"whatsapp\">WhatsApp</option></select>',
      '<button type=\"button\" id=\"ffx-notification-send\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Send</button>',
      '<button type=\"button\" id=\"ffx-notification-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Refresh Feed</button>',
      '</div>',
      '<div id=\"ffx-notification-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-notification-list');

    function refreshList() {
      getBusiness('/notifications/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No notifications';
          return;
        }
        list.innerHTML = items.slice(-30).reverse().map(function (item) {
          return '<div style=\"padding:5px 0;border-bottom:1px solid #edf2ff;\"><strong>' + item.title + '</strong><br/>' + item.message + '</div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-notification-send').addEventListener('click', function () {
      var title = (body.querySelector('#ffx-notification-title') || {}).value || 'System Notification';
      var message = (body.querySelector('#ffx-notification-message') || {}).value || 'Message from runtime extension';
      var channel = (body.querySelector('#ffx-notification-channel') || {}).value || 'in_app';
      postBusiness('/notifications/send', {
        userKey: currentUserKey(),
        type: 'custom',
        channel: channel,
        title: title,
        message: message
      }).then(function () {
        executeFeature(feature, 'notification-send', { title: title, channel: channel });
        refreshList();
      });
    });

    body.querySelector('#ffx-notification-refresh').addEventListener('click', refreshList);
    refreshList();
  }

  function applyTravelCardModule(feature) {
    var card = ensureCard('travel-card', 'Digital Travel Card');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-travelcard-issue')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-travelcard-name\" placeholder=\"Full name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-travelcard-phone\" placeholder=\"Phone\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-travelcard-email\" placeholder=\"Email\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-travelcard-issue\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Issue Card</button>',
      '<button type=\"button\" id=\"ffx-travelcard-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">My Cards</button>',
      '</div>',
      '<div id=\"ffx-travelcard-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-travelcard-list');

    function refreshCards() {
      getBusiness('/travel-card/user/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No travel cards issued.';
          return;
        }
        list.innerHTML = items.slice(-20).reverse().map(function (item) {
          return '<div style=\"padding:5px 0;border-bottom:1px solid #edf2ff;\"><strong>' + item.cardId + '</strong> - ' + item.fullName + ' (' + item.status + ')</div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-travelcard-issue').addEventListener('click', function () {
      var fullName = (body.querySelector('#ffx-travelcard-name') || {}).value || 'Guest User';
      var phone = (body.querySelector('#ffx-travelcard-phone') || {}).value || '';
      var email = (body.querySelector('#ffx-travelcard-email') || {}).value || '';
      postBusiness('/travel-card/issue', {
        userKey: currentUserKey(),
        fullName: fullName,
        phone: phone,
        email: email,
        idProofType: 'Aadhar'
      }).then(function () {
        executeFeature(feature, 'travel-card-issued', { fullName: fullName });
        refreshCards();
      });
    });

    body.querySelector('#ffx-travelcard-refresh').addEventListener('click', refreshCards);
    refreshCards();
  }

  function applyRideHistoryModule(feature) {
    var card = ensureCard('ride-history', 'Ride History Management');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-history-refresh')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<button type=\"button\" id=\"ffx-history-refresh\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Refresh History</button>',
      '<a id=\"ffx-history-export\" href=\"#\" style=\"padding:8px 10px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;\">Export CSV</a>',
      '</div>',
      '<div id=\"ffx-history-list\" style=\"margin-top:8px;max-height:200px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-history-list');
    var exportLink = body.querySelector('#ffx-history-export');

    function refreshHistory() {
      var userKey = currentUserKey();
      if (exportLink) {
        exportLink.href = BUSINESS_API_BASE + '/history/ride/' + encodeURIComponent(userKey) + '/export.csv';
      }
      getBusiness('/history/ride/' + encodeURIComponent(userKey)).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No rides yet.';
          return;
        }
        list.innerHTML = items.slice(-50).reverse().map(function (item) {
          return '<div style=\"padding:5px 0;border-bottom:1px solid #edf2ff;\"><strong>' + item.bookingId + '</strong> ' + (item.from || 'N/A') + ' -> ' + (item.to || 'N/A') + ' | Fare: ' + (item.fare || 0) + '</div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-history-refresh').addEventListener('click', function () {
      executeFeature(feature, 'ride-history-refresh', {});
      refreshHistory();
    });

    refreshHistory();
  }

  function applyDistrictDirectoryModule(feature) {
    var legacyCard = document.getElementById('ff-runtime-card-district-directory');
    if (legacyCard && legacyCard.parentNode) {
      legacyCard.parentNode.removeChild(legacyCard);
    }

    var tourismCard = document.getElementById('ff-runtime-card-tourism') || ensureCard('tourism', 'Tourist Places & District Explorer');
    if (!tourismCard) return;

    var body = tourismCard.querySelector('.ff-runtime-card-body');
    if (!body) return;

    if (!body.querySelector('#ffx-tourism-load')) {
      applyTourismModule(feature);
      body = tourismCard.querySelector('.ff-runtime-card-body');
      if (!body) return;
    }

    var mergedBlock = body.querySelector('#ffx-tourism-district-merge');
    if (mergedBlock && mergedBlock.parentNode) {
      mergedBlock.parentNode.removeChild(mergedBlock);
    }

    var districtInput = body.querySelector('#ffx-tourism-district');
    if (!districtInput) return;

    var statusEl = body.querySelector('#ffx-tourism-status');
    var noteEl = body.querySelector('#ffx-tourism-district-inline-note');
    if (!noteEl) {
      noteEl = document.createElement('div');
      noteEl.id = 'ffx-tourism-district-inline-note';
      noteEl.style.cssText = 'margin-top:6px;font-size:12px;color:#24416d;';
      if (statusEl && statusEl.parentNode) {
        statusEl.parentNode.insertBefore(noteEl, statusEl.nextSibling);
      } else {
        body.appendChild(noteEl);
      }
    }

    if (districtInput.dataset.districtMergedReady === '1') {
      executeFeature(feature, 'districts-merged-inline', { reused: true });
      return;
    }
    districtInput.dataset.districtMergedReady = '1';

    var listId = 'ffx-tourism-district-inline-list';
    var datalist = document.getElementById(listId);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = listId;
      document.body.appendChild(datalist);
    }
    districtInput.setAttribute('list', listId);

    function setNote(text) {
      if (noteEl) noteEl.textContent = text || '';
    }

    function setDistrictOptions(items) {
      var safe = Array.isArray(items) ? items : [];
      datalist.innerHTML = safe.map(function (district) {
        return '<option value=\"' + escapeHtml(district) + '\"></option>';
      }).join('');
    }

    function loadDistricts() {
      getBusiness('/districts').then(function (data) {
        var districts = data && Array.isArray(data.districts) ? data.districts : [];
        setDistrictOptions(districts);
        setNote('District directory merged in this explorer. Loaded ' + districts.length + ' districts.');
        executeFeature(feature, 'districts-merged-inline', { count: districts.length });
      });
    }

    districtInput.addEventListener('change', function () {
      var districtName = String(districtInput.value || '').trim();
      if (!districtName) return;
      getBusiness('/districts/' + encodeURIComponent(districtName) + '/detail').then(function (data) {
        if (!data || !data.ok) {
          setNote('Details unavailable for ' + districtName);
          return;
        }
        var info = data.detail && data.detail.info ? data.detail.info : {};
        setNote(
          districtName + ' | Best Time: ' + (info.bestTime || 'N/A') +
          ' | Population: ' + (info.population || 'N/A')
        );
      });
    });

    loadDistricts();
  }

  function applyListingModule(feature) {
    var card = ensureCard('listing', 'Hotel / Restaurant / Shop Listings');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-listing-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<select id=\"ffx-listing-type\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>Hotel</option><option>Guest House</option><option>Restaurant</option><option>Shop</option><option>Local Service</option></select>',
      '<input id=\"ffx-listing-name\" placeholder=\"Listing name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-listing-city\" placeholder=\"City/District\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-listing-contact\" placeholder=\"Contact\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-listing-rating\" placeholder=\"Rating (0-5)\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-listing-specialty\" placeholder=\"Specialty\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-listing-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Save Listing</button>',
      '<button type=\"button\" id=\"ffx-listing-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Search Listings</button>',
      '</div>',
      '<div id=\"ffx-listing-list\" style=\"margin-top:8px;max-height:220px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-listing-list');

    function render(items) {
      if (!list) return;
      if (!items.length) {
        list.textContent = 'No listings yet.';
        return;
      }
      list.innerHTML = items.slice(-40).reverse().map(function (item) {
        return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.name) + '</strong> (' + escapeHtml(item.type) + ')<br/>' + escapeHtml(item.city) + ' | Rating: ' + escapeHtml(item.rating) + '</div>';
      }).join('');
    }

    function refresh() {
      var city = (body.querySelector('#ffx-listing-city') || {}).value || '';
      var type = (body.querySelector('#ffx-listing-type') || {}).value || '';
      var query = '/listings?city=' + encodeURIComponent(city) + '&type=' + encodeURIComponent(type);
      getBusiness(query).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        render(items);
      });
    }

    body.querySelector('#ffx-listing-save').addEventListener('click', function () {
      var payload = {
        type: (body.querySelector('#ffx-listing-type') || {}).value || '',
        name: (body.querySelector('#ffx-listing-name') || {}).value || '',
        city: (body.querySelector('#ffx-listing-city') || {}).value || '',
        contact: (body.querySelector('#ffx-listing-contact') || {}).value || '',
        rating: (body.querySelector('#ffx-listing-rating') || {}).value || '',
        specialty: (body.querySelector('#ffx-listing-specialty') || {}).value || ''
      };
      postBusiness('/listings', payload).then(function (data) {
        executeFeature(feature, 'listing-save', payload);
        if (data && data.item) refresh();
      });
    });
    body.querySelector('#ffx-listing-refresh').addEventListener('click', refresh);
    refresh();
  }

  function applyTourPackageModule(feature) {
    var card = ensureCard('packages', 'Tour / Package Booking');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-package-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-package-title\" placeholder=\"Package title\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-package-theme\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>Family</option><option>Solo</option><option>Honeymoon</option><option>Adventure</option><option>Heritage</option></select>',
      '<input id=\"ffx-package-days\" placeholder=\"Duration days\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-package-price\" placeholder=\"Price INR\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-package-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Create Package</button>',
      '<button type=\"button\" id=\"ffx-package-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Packages</button>',
      '</div>',
      '<div id=\"ffx-package-list\" style=\"margin-top:8px;max-height:220px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-package-list');

    function refresh() {
      getBusiness('/packages').then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No packages yet.';
          return;
        }
        list.innerHTML = items.slice(-30).reverse().map(function (item) {
          var safeTitle = escapeHtml(item.title);
          var safeTheme = escapeHtml(item.theme);
          var safeId = escapeHtml(item.id);
          return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + safeTitle + '</strong> (' + safeTheme + ') - INR ' + escapeHtml(item.priceInr) + '<br/><button type=\"button\" data-package-book=\"' + safeId + '\" style=\"margin-top:4px;padding:5px 8px;border:0;border-radius:6px;background:#2563eb;color:#fff;\">Book</button></div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-package-save').addEventListener('click', function () {
      var payload = {
        title: (body.querySelector('#ffx-package-title') || {}).value || '',
        theme: (body.querySelector('#ffx-package-theme') || {}).value || '',
        durationDays: (body.querySelector('#ffx-package-days') || {}).value || '1',
        priceInr: (body.querySelector('#ffx-package-price') || {}).value || '0',
        localGuide: true,
        includesVehicle: true
      };
      postBusiness('/packages', payload).then(function (data) {
        executeFeature(feature, 'package-create', payload);
        if (data && data.item) refresh();
      });
    });

    body.addEventListener('click', function (event) {
      var button = event.target.closest('[data-package-book]');
      if (!button) return;
      var packageId = button.getAttribute('data-package-book');
      if (!packageId) return;
      postBusiness('/packages/' + encodeURIComponent(packageId) + '/book', {
        userKey: currentUserKey(),
        travelers: 1,
        paymentMethod: 'cash'
      }).then(function () {
        executeFeature(feature, 'package-book', { packageId: packageId });
      });
    });

    body.querySelector('#ffx-package-refresh').addEventListener('click', refresh);
    refresh();
  }

  function applyReferralAffiliateModule(feature) {
    var card = ensureCard('referral', 'Referral / Affiliate Tracking');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-ref-track')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-ref-partner\" placeholder=\"Partner name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-ref-code\" placeholder=\"Referral code\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-ref-value\" placeholder=\"Booking value\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-ref-track\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Track Event</button>',
      '<button type=\"button\" id=\"ffx-ref-summary\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Get Summary</button>',
      '</div>',
      '<div id=\"ffx-ref-output\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-ref-output');

    body.querySelector('#ffx-ref-track').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        partner: (body.querySelector('#ffx-ref-partner') || {}).value || '',
        code: (body.querySelector('#ffx-ref-code') || {}).value || '',
        bookingValue: (body.querySelector('#ffx-ref-value') || {}).value || '0',
        eventType: 'booking'
      };
      postBusiness('/referrals/track', payload).then(function (data) {
        executeFeature(feature, 'referral-track', payload);
        if (output) {
          output.textContent = data && data.event
            ? ('Tracked with commission: INR ' + data.event.commissionAmount)
            : 'Tracking failed';
        }
      });
    });

    body.querySelector('#ffx-ref-summary').addEventListener('click', function () {
      var partner = (body.querySelector('#ffx-ref-partner') || {}).value || '';
      var code = (body.querySelector('#ffx-ref-code') || {}).value || '';
      getBusiness('/referrals/summary?partner=' + encodeURIComponent(partner) + '&code=' + encodeURIComponent(code)).then(function (data) {
        if (!output) return;
        if (!data || !data.ok) {
          output.textContent = 'Summary unavailable';
          return;
        }
        output.innerHTML = 'Events: <strong>' + escapeHtml(data.count) + '</strong> | Booking Value: <strong>INR ' + escapeHtml(data.totalBookingValue) + '</strong> | Commission: <strong>INR ' + escapeHtml(data.totalCommission) + '</strong>';
      });
    });
  }

  function applyFareEstimatorModule(feature) {
    var card = ensureCard('fare-estimator', 'Real Fare & Currency Estimator');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-fare-calc')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;\">',
      '<input id=\"ffx-fare-distance\" placeholder=\"Distance km\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-fare-duration\" placeholder=\"Duration min\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-fare-vehicle\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>economy</option><option>sedan</option><option>suv</option><option>premium</option><option>xl</option></select>',
      '<select id=\"ffx-fare-currency\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option></select>',
      '<input id=\"ffx-fare-offer\" placeholder=\"Offer %\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-fare-calc\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Estimate Fare</button>',
      '</div>',
      '<div id=\"ffx-fare-output\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-fare-output');
    body.querySelector('#ffx-fare-calc').addEventListener('click', function () {
      var payload = {
        distanceKm: (body.querySelector('#ffx-fare-distance') || {}).value || '0',
        durationMin: (body.querySelector('#ffx-fare-duration') || {}).value || '0',
        vehicleType: (body.querySelector('#ffx-fare-vehicle') || {}).value || 'economy',
        currency: (body.querySelector('#ffx-fare-currency') || {}).value || 'INR',
        offerPercent: (body.querySelector('#ffx-fare-offer') || {}).value || '0'
      };
      postBusiness('/fare/estimate', payload).then(function (data) {
        executeFeature(feature, 'fare-estimate', payload);
        if (!output) return;
        var estimate = data && data.estimate ? data.estimate : null;
        if (!estimate) {
          output.textContent = 'Fare estimate unavailable.';
          return;
        }
        output.innerHTML = 'Final INR: <strong>' + escapeHtml(estimate.finalInr) + '</strong> | ' +
          escapeHtml(estimate.currency) + ': <strong>' + escapeHtml(estimate.convertedFare) + '</strong>';
      });
    });
  }

  function applyTermsConsentModule(feature) {
    var card = ensureCard('terms-consent', 'Terms / Disclaimer Consent');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-terms-save')) return;

    body.innerHTML = [
      '<div style=\"font-size:12px;color:#35557d;margin-bottom:8px;\">GOindiaRIDE acts as facilitator. Service/refund/quality belongs to partner vendor as per booking terms.</div>',
      '<label style=\"display:flex;gap:6px;align-items:center;font-size:12px;\"><input type=\"checkbox\" id=\"ffx-terms-check\"/> I accept Terms & Liability policy</label>',
      '<button type=\"button\" id=\"ffx-terms-save\" style=\"margin-top:8px;padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Save Consent</button>',
      '<div id=\"ffx-terms-output\" style=\"margin-top:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-terms-output');
    body.querySelector('#ffx-terms-save').addEventListener('click', function () {
      var accepted = Boolean((body.querySelector('#ffx-terms-check') || {}).checked);
      postBusiness('/terms/consent', {
        userKey: currentUserKey(),
        version: 'v2026-03',
        source: window.location.pathname,
        accepted: accepted
      }).then(function (data) {
        executeFeature(feature, 'terms-consent', { accepted: accepted });
        if (output) {
          output.textContent = data && data.item
            ? ('Consent saved at ' + data.item.createdAt)
            : 'Unable to save consent';
        }
      });
    });
  }

  function applySupportHelpdeskModule(feature) {
    var card = ensureCard('support-helpdesk', 'Support / Helpdesk');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-support-create')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<select id=\"ffx-support-category\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>booking</option><option>payment</option><option>safety</option><option>refund</option><option>general</option></select>',
      '<input id=\"ffx-support-message\" placeholder=\"Issue details\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-support-create\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Raise Ticket</button>',
      '<button type=\"button\" id=\"ffx-support-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">My Tickets</button>',
      '</div>',
      '<div id=\"ffx-support-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-support-list');

    function refresh() {
      getBusiness('/support/ticket/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No support tickets.';
          return;
        }
        list.innerHTML = items.slice(-20).reverse().map(function (item) {
          return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.ticketCode) + '</strong> [' + escapeHtml(item.status) + '] - ' + escapeHtml(item.category) + '</div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-support-create').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        category: (body.querySelector('#ffx-support-category') || {}).value || 'general',
        message: (body.querySelector('#ffx-support-message') || {}).value || ''
      };
      postBusiness('/support/ticket', payload).then(function () {
        executeFeature(feature, 'support-ticket-create', payload);
        refresh();
      });
    });
    body.querySelector('#ffx-support-refresh').addEventListener('click', refresh);
    refresh();
  }

  function applyAdminMonitoringModule(feature) {
    var card = ensureCard('admin-monitoring', 'Admin Monitoring Snapshot');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-admin-refresh')) return;

    body.innerHTML = [
      '<button type=\"button\" id=\"ffx-admin-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Refresh Admin Metrics</button>',
      '<div id=\"ffx-admin-summary\" style=\"margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;\"></div>'
    ].join('');

    var summary = body.querySelector('#ffx-admin-summary');
    function renderMetric(label, value) {
      return '<div style=\"padding:8px;border:1px solid #dbe7ff;border-radius:8px;background:#fff;\"><div style=\"font-size:11px;color:#5b7498;\">' + escapeHtml(label) + '</div><div style=\"font-size:18px;font-weight:700;color:#173b67;\">' + escapeHtml(value) + '</div></div>';
    }

    function refresh() {
      getBusiness('/admin/summary').then(function (data) {
        if (!summary) return;
        var metrics = data && data.metrics ? data.metrics : null;
        if (!metrics) {
          summary.textContent = 'Metrics unavailable.';
          return;
        }
        summary.innerHTML = [
          renderMetric('Listings', metrics.listings || 0),
          renderMetric('Packages', metrics.packages || 0),
          renderMetric('Bookings', metrics.packageBookings || 0),
          renderMetric('Referrals', metrics.referrals || 0),
          renderMetric('Notifications', metrics.notifications || 0),
          renderMetric('Support', metrics.supportTickets || 0),
          renderMetric('Wallet INR', metrics.totalWalletBalance || 0)
        ].join('');
        executeFeature(feature, 'admin-summary-refresh', {});
      });
    }

    body.querySelector('#ffx-admin-refresh').addEventListener('click', refresh);
    refresh();
  }

  function applyAIRecommendationModule(feature) {
    var card = ensureCard('ai-recommendation', 'AI Suggestions & Recommendations');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-ai-reco-load')) return;

    body.innerHTML = [
      '<button type=\"button\" id=\"ffx-ai-reco-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Smart Recommendations</button>',
      '<div id=\"ffx-ai-reco-output\" style=\"margin-top:8px;max-height:200px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-ai-reco-output');
    body.querySelector('#ffx-ai-reco-load').addEventListener('click', function () {
      getBusiness('/recommendations/' + encodeURIComponent(currentUserKey())).then(function (data) {
        if (!output) return;
        if (!data || !data.ok) {
          output.textContent = 'No recommendations available.';
          return;
        }
        var listings = Array.isArray(data.listings) ? data.listings : [];
        var places = Array.isArray(data.places) ? data.places : [];
        output.innerHTML = '<div><strong>Preferred District:</strong> ' + escapeHtml(data.preferredDistrict || 'N/A') + '</div>' +
          '<div style=\"margin-top:6px;\"><strong>Listings:</strong> ' + (listings.map(function (x) { return escapeHtml(x.name); }).join(', ') || 'N/A') + '</div>' +
          '<div style=\"margin-top:6px;\"><strong>Places:</strong> ' + (places.map(function (x) { return escapeHtml(x.name); }).join(', ') || 'N/A') + '</div>';
        executeFeature(feature, 'ai-recommendation-load', {});
      });
    });
  }

  function applyReviewModule(feature) {
    var card = ensureCard('reviews', 'Reviews & Ratings');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-review-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;\">',
      '<select id=\"ffx-review-target-type\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option value=\"driver\">Driver</option><option value=\"ride\">Ride</option><option value=\"listing\">Listing</option></select>',
      '<input id=\"ffx-review-target-id\" placeholder=\"Target ID\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-review-rating\" placeholder=\"Rating 1-5\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-review-comment\" placeholder=\"Comment\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-review-save\" style=\"padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Save Review</button>',
      '<button type=\"button\" id=\"ffx-review-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Reviews</button>',
      '</div>',
      '<div id=\"ffx-review-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-review-list');
    function loadReviews() {
      var targetType = (body.querySelector('#ffx-review-target-type') || {}).value || '';
      var targetId = (body.querySelector('#ffx-review-target-id') || {}).value || '';
      getBusiness('/reviews?targetType=' + encodeURIComponent(targetType) + '&targetId=' + encodeURIComponent(targetId)).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        list.innerHTML = '<div style=\"margin-bottom:6px;\">Average: <strong>' + escapeHtml(data && data.averageRating ? data.averageRating : 0) + '</strong></div>' +
          (items.slice(-30).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\">' + escapeHtml(item.rating) + '★ - ' + escapeHtml(item.comment || '') + '</div>';
          }).join('') || 'No reviews.');
      });
    }

    body.querySelector('#ffx-review-save').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        targetType: (body.querySelector('#ffx-review-target-type') || {}).value || 'driver',
        targetId: (body.querySelector('#ffx-review-target-id') || {}).value || 'generic',
        rating: (body.querySelector('#ffx-review-rating') || {}).value || '5',
        comment: (body.querySelector('#ffx-review-comment') || {}).value || ''
      };
      postBusiness('/reviews', payload).then(function () {
        executeFeature(feature, 'review-save', payload);
        loadReviews();
      });
    });
    body.querySelector('#ffx-review-load').addEventListener('click', loadReviews);
    loadReviews();
  }

  function applyPartnerIntegrationModule(feature) {
    var card = ensureCard('partner-integration', 'Partner API / Webhook Integration');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-webhook-send')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;\">',
      '<input id=\"ffx-webhook-partner\" placeholder=\"Partner name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-webhook-event\" placeholder=\"Event type\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-webhook-send\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Log Webhook Event</button>',
      '<button type=\"button\" id=\"ffx-webhook-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Events</button>',
      '</div>',
      '<div id=\"ffx-webhook-list\" style=\"margin-top:8px;max-height:160px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-webhook-list');
    function loadEvents() {
      var partner = (body.querySelector('#ffx-webhook-partner') || {}).value || '';
      getBusiness('/partner/webhook/logs?partner=' + encodeURIComponent(partner)).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        if (!items.length) {
          list.textContent = 'No webhook events logged.';
          return;
        }
        list.innerHTML = items.slice(-20).reverse().map(function (item) {
          return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.partner) + '</strong> - ' + escapeHtml(item.eventType) + '</div>';
        }).join('');
      });
    }

    body.querySelector('#ffx-webhook-send').addEventListener('click', function () {
      var payload = {
        partner: (body.querySelector('#ffx-webhook-partner') || {}).value || '',
        eventType: (body.querySelector('#ffx-webhook-event') || {}).value || 'booking-created',
        payload: {
          userKey: currentUserKey(),
          page: window.location.pathname
        }
      };
      postBusiness('/partner/webhook/log', payload).then(function () {
        executeFeature(feature, 'partner-webhook-log', payload);
        loadEvents();
      });
    });
    body.querySelector('#ffx-webhook-load').addEventListener('click', loadEvents);
    loadEvents();
  }

  function applyOtpSecurityModule(feature) {
    var card = ensureCard('otp-security', 'OTP Auth & Security');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-otp-send')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-otp-destination\" placeholder=\"Phone or Email\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-otp-channel\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option value=\"sms\">SMS</option><option value=\"email\">Email</option></select>',
      '<button type=\"button\" id=\"ffx-otp-send\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Send OTP</button>',
      '<input id=\"ffx-otp-code\" placeholder=\"Enter OTP\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-otp-verify\" style=\"padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Verify OTP</button>',
      '<button type=\"button\" id=\"ffx-otp-log\" style=\"padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Auth Logs</button>',
      '</div>',
      '<div id=\"ffx-otp-output\" style=\"margin-top:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-otp-output');
    var latestOtpId = '';
    function setOutput(text) {
      if (output) output.textContent = text || '';
    }

    body.querySelector('#ffx-otp-send').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        destination: (body.querySelector('#ffx-otp-destination') || {}).value || '',
        channel: (body.querySelector('#ffx-otp-channel') || {}).value || 'sms'
      };
      postBusiness('/auth/otp/send', payload).then(function (data) {
        executeFeature(feature, 'otp-send', payload);
        if (data && data.ok) {
          latestOtpId = data.otpId || '';
          setOutput('OTP sent. Demo OTP: ' + (data.code || 'hidden'));
        } else {
          setOutput('OTP send failed.');
        }
      });
    });

    body.querySelector('#ffx-otp-verify').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        otpId: latestOtpId,
        code: (body.querySelector('#ffx-otp-code') || {}).value || ''
      };
      postBusiness('/auth/otp/verify', payload).then(function (data) {
        executeFeature(feature, 'otp-verify', { success: !!(data && data.ok) });
        setOutput(data && data.ok ? 'OTP verified successfully.' : 'OTP verify failed.');
      });
    });

    body.querySelector('#ffx-otp-log').addEventListener('click', function () {
      getBusiness('/auth/logs/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        setOutput(items.slice(-5).map(function (item) {
          return item.action + ' [' + (item.success ? 'ok' : 'fail') + ']';
        }).join(' | ') || 'No auth logs.');
      });
    });
  }

  function applySavedLocationModule(feature) {
    var card = ensureCard('saved-locations', 'Saved Locations / Favorites');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-location-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;\">',
      '<input id=\"ffx-location-label\" placeholder=\"Label (Home/Office)\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-location-address\" placeholder=\"Address\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-location-district\" placeholder=\"District\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-location-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Save Location</button>',
      '<button type=\"button\" id=\"ffx-location-refresh\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">My Locations</button>',
      '</div>',
      '<div id=\"ffx-location-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-location-list');
    function loadLocations() {
      getBusiness('/saved-location/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        list.innerHTML = items.length
          ? items.slice(-20).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.label) + '</strong> - ' + escapeHtml(item.address) + '</div>';
          }).join('')
          : 'No saved locations.';
      });
    }

    body.querySelector('#ffx-location-save').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        label: (body.querySelector('#ffx-location-label') || {}).value || '',
        address: (body.querySelector('#ffx-location-address') || {}).value || '',
        district: (body.querySelector('#ffx-location-district') || {}).value || ''
      };
      postBusiness('/saved-location', payload).then(function () {
        executeFeature(feature, 'saved-location-add', payload);
        loadLocations();
      });
    });
    body.querySelector('#ffx-location-refresh').addEventListener('click', loadLocations);
    loadLocations();
  }

  function applyBookingPolicyModule(feature) {
    var card = ensureCard('booking-policy', 'Booking Policy & Reschedule/Cancel');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-policy-run')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;\">',
      '<input id=\"ffx-policy-booking-id\" placeholder=\"Booking ID\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-policy-action\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>rescheduled</option><option>cancelled</option><option>picked_up</option><option>completed</option></select>',
      '<label style=\"display:flex;gap:6px;align-items:center;font-size:12px;\"><input type=\"checkbox\" id=\"ffx-policy-picked\"/> Pickup reached</label>',
      '<button type=\"button\" id=\"ffx-policy-run\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Apply Action</button>',
      '<button type=\"button\" id=\"ffx-policy-log\" style=\"padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Action History</button>',
      '</div>',
      '<div id=\"ffx-policy-output\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-policy-output');
    function setOutput(text) {
      if (output) output.textContent = text || '';
    }

    body.querySelector('#ffx-policy-run').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        bookingId: (body.querySelector('#ffx-policy-booking-id') || {}).value || '',
        action: (body.querySelector('#ffx-policy-action') || {}).value || '',
        pickedUp: Boolean((body.querySelector('#ffx-policy-picked') || {}).checked)
      };
      postBusiness('/booking/action', payload).then(function (data) {
        executeFeature(feature, 'booking-policy-action', payload);
        if (data && data.ok) setOutput('Action applied: ' + (data.item && data.item.action ? data.item.action : 'done'));
        else if (data && data.policyBlocked) setOutput('Blocked by policy: cancellation after pickup not allowed.');
        else setOutput('Action failed.');
      });
    });

    body.querySelector('#ffx-policy-log').addEventListener('click', function () {
      getBusiness('/booking/action/' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        setOutput(items.slice(-5).map(function (item) {
          return item.bookingId + ':' + item.action + (item.allowed ? '' : ' (blocked)');
        }).join(' | ') || 'No booking actions.');
      });
    });
  }

  function applyDisputeModule(feature) {
    var card = ensureCard('dispute', 'Dispute & Evidence Reporting');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-dispute-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-dispute-booking\" placeholder=\"Booking ID\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<input id=\"ffx-dispute-issue\" placeholder=\"Issue details\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-dispute-save\" style=\"padding:8px;border:0;border-radius:8px;background:#b91c1c;color:#fff;\">Raise Dispute</button>',
      '<button type=\"button\" id=\"ffx-dispute-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">My Disputes</button>',
      '<a href=\"' + BUSINESS_API_BASE + '/dispute/export.csv\" target=\"_blank\" style=\"padding:8px;border-radius:8px;background:#0f766e;color:#fff;text-decoration:none;\">Export CSV</a>',
      '</div>',
      '<div id=\"ffx-dispute-list\" style=\"margin-top:8px;max-height:160px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-dispute-list');
    function refresh() {
      getBusiness('/dispute/report?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        list.innerHTML = items.length
          ? items.slice(-20).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.disputeCode) + '</strong> [' + escapeHtml(item.status) + ']</div>';
          }).join('')
          : 'No disputes.';
      });
    }
    body.querySelector('#ffx-dispute-save').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        bookingId: (body.querySelector('#ffx-dispute-booking') || {}).value || '',
        issue: (body.querySelector('#ffx-dispute-issue') || {}).value || ''
      };
      postBusiness('/dispute/report', payload).then(function () {
        executeFeature(feature, 'dispute-raise', payload);
        refresh();
      });
    });
    body.querySelector('#ffx-dispute-load').addEventListener('click', refresh);
    refresh();
  }

  function applyFraudAlertModule(feature) {
    var card = ensureCard('fraud-alert', 'Fraud / Suspicious Detection');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-fraud-save')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;\">',
      '<select id=\"ffx-fraud-severity\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>low</option><option>medium</option><option>high</option><option>critical</option></select>',
      '<input id=\"ffx-fraud-note\" placeholder=\"Suspicious activity note\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<button type=\"button\" id=\"ffx-fraud-save\" style=\"padding:8px;border:0;border-radius:8px;background:#b91c1c;color:#fff;\">Report Alert</button>',
      '<button type=\"button\" id=\"ffx-fraud-load\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Recent Alerts</button>',
      '</div>',
      '<div id=\"ffx-fraud-list\" style=\"margin-top:8px;max-height:160px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-fraud-list');
    function refresh() {
      getBusiness('/fraud/alert?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
        var items = data && Array.isArray(data.items) ? data.items : [];
        if (!list) return;
        list.innerHTML = items.length
          ? items.slice(-20).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.severity) + '</strong> - ' + escapeHtml(item.note) + '</div>';
          }).join('')
          : 'No fraud alerts.';
      });
    }
    body.querySelector('#ffx-fraud-save').addEventListener('click', function () {
      var payload = {
        userKey: currentUserKey(),
        severity: (body.querySelector('#ffx-fraud-severity') || {}).value || 'medium',
        note: (body.querySelector('#ffx-fraud-note') || {}).value || '',
        category: 'runtime-flag'
      };
      postBusiness('/fraud/alert', payload).then(function () {
        executeFeature(feature, 'fraud-alert-report', payload);
        refresh();
      });
    });
    body.querySelector('#ffx-fraud-load').addEventListener('click', refresh);
    refresh();
  }

  function applyChatbotModule(feature) {
    var card = ensureCard('chatbot', 'AI Chatbot Support');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-chat-send')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<input id=\"ffx-chat-question\" placeholder=\"Ask about booking/payment/safety\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;min-width:260px;flex:1;\"/>',
      '<button type=\"button\" id=\"ffx-chat-send\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Ask</button>',
      '<button type=\"button\" id=\"ffx-chat-history\" style=\"padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">History</button>',
      '</div>',
      '<div id=\"ffx-chat-output\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-chat-output');

    body.querySelector('#ffx-chat-send').addEventListener('click', function () {
      var question = (body.querySelector('#ffx-chat-question') || {}).value || '';
      postBusiness('/ai/chatbot', { userKey: currentUserKey(), question: question }).then(function (data) {
        executeFeature(feature, 'ai-chatbot-ask', { question: question });
        if (!output) return;
        if (data && data.item) {
          output.innerHTML = '<div><strong>You:</strong> ' + escapeHtml(data.item.question) + '</div><div style=\"margin-top:6px;\"><strong>Bot:</strong> ' + escapeHtml(data.item.answer) + '</div>' + output.innerHTML;
        }
      });
    });

    body.querySelector('#ffx-chat-history').addEventListener('click', function () {
      getBusiness('/ai/chatbot/' + encodeURIComponent(currentUserKey())).then(function (data) {
        if (!output) return;
        var items = data && Array.isArray(data.items) ? data.items : [];
        output.innerHTML = items.length
          ? items.slice(-10).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>Q:</strong> ' + escapeHtml(item.question) + '<br/><strong>A:</strong> ' + escapeHtml(item.answer) + '</div>';
          }).join('')
          : 'No chat history.';
      });
    });
  }

  function applyTranslatorModule(feature) {
    var card = ensureCard('translator', 'Language & Communication');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-translate')) return;

    body.innerHTML = [
      '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;\">',
      '<input id=\"ffx-translator-text\" placeholder=\"Text to translate\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
      '<select id=\"ffx-translator-lang\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option value=\"Hindi\">Hindi</option><option value=\"English\">English</option><option value=\"Rajasthani\">Rajasthani</option></select>',
      '<button type=\"button\" id=\"ffx-translate\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Translate</button>',
      '</div>',
      '<div id=\"ffx-translator-output\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#173b67;\"></div>'
    ].join('');

    var output = body.querySelector('#ffx-translator-output');
    var dictionary = {
      Hindi: { booking: 'बुकिंग', payment: 'पेमेंट', safety: 'सुरक्षा', ride: 'राइड' },
      English: { 'बुकिंग': 'booking', 'पेमेंट': 'payment', 'सुरक्षा': 'safety', 'राइड': 'ride' },
      Rajasthani: { booking: 'बुकिंग', payment: 'भुगतान', safety: 'सुरक्शा', ride: 'सवारी' }
    };

    body.querySelector('#ffx-translate').addEventListener('click', function () {
      var text = (body.querySelector('#ffx-translator-text') || {}).value || '';
      var lang = (body.querySelector('#ffx-translator-lang') || {}).value || 'Hindi';
      var tokens = text.split(/\s+/).filter(Boolean);
      var mapped = tokens.map(function (token) {
        var key = token.toLowerCase();
        var map = dictionary[lang] || {};
        return map[key] || map[token] || token;
      }).join(' ');
      if (output) output.textContent = mapped || text;
      executeFeature(feature, 'language-translate', { lang: lang, text: text, output: mapped });
    });
  }

  function applyUniversalFeatureModule(feature) {
    var card = ensureCard('universal-runner', 'Universal Feature Runner (All Features)');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body) return;

    extState.universalFeatures = extState.universalFeatures || {};
    var featureId = String(feature.featureId || '').trim();
    if (!featureId) return;
    extState.universalFeatures[featureId] = {
      featureId: featureId,
      category: feature.category || 'general',
      description: feature.description || '',
      sourceLine: feature.sourceLine || null
    };

    if (!body.querySelector('#ffx-universal-feature')) {
      body.innerHTML = [
        '<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;\">',
        '<select id=\"ffx-universal-feature\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"></select>',
        '<input id=\"ffx-universal-owner\" placeholder=\"Owner\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
        '<input id=\"ffx-universal-due\" type=\"date\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
        '<select id=\"ffx-universal-status\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"><option>active</option><option>planned</option><option>in-progress</option><option>blocked</option><option>completed</option></select>',
        '<input id=\"ffx-universal-notes\" placeholder=\"Notes\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
        '<input id=\"ffx-universal-action\" placeholder=\"Action name\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;\"/>',
        '<button type=\"button\" id=\"ffx-universal-save\" style=\"padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;\">Save State</button>',
        '<button type=\"button\" id=\"ffx-universal-run\" style=\"padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Run Action</button>',
        '<button type=\"button\" id=\"ffx-universal-load\" style=\"padding:8px;border:0;border-radius:8px;background:#334155;color:#fff;\">Load State</button>',
        '<button type=\"button\" id=\"ffx-universal-history\" style=\"padding:8px;border:0;border-radius:8px;background:#7c3aed;color:#fff;\">Load History</button>',
        '</div>',
        '<div id=\"ffx-universal-description\" style=\"margin-top:8px;padding:8px;background:#fff;border:1px solid #dbe7ff;border-radius:8px;font-size:12px;color:#1d3f6f;\"></div>',
        '<div id=\"ffx-universal-output\" style=\"margin-top:8px;max-height:220px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;color:#173b67;\"></div>'
      ].join('');

      var select = body.querySelector('#ffx-universal-feature');
      var ownerInput = body.querySelector('#ffx-universal-owner');
      var dueInput = body.querySelector('#ffx-universal-due');
      var statusInput = body.querySelector('#ffx-universal-status');
      var notesInput = body.querySelector('#ffx-universal-notes');
      var actionInput = body.querySelector('#ffx-universal-action');
      var desc = body.querySelector('#ffx-universal-description');
      var output = body.querySelector('#ffx-universal-output');

      function currentMeta() {
        var selected = select ? select.value : '';
        return extState.universalFeatures[selected] || null;
      }

      function renderDescription() {
        var meta = currentMeta();
        if (!desc) return;
        if (!meta) {
          desc.textContent = 'No feature selected.';
          return;
        }
        desc.innerHTML = '<strong>' + escapeHtml(meta.featureId) + '</strong> [' + escapeHtml(meta.category || 'general') + '] - ' + escapeHtml(meta.description || '');
      }

      function setOutput(text) {
        if (output) output.textContent = text || '';
      }

      body.querySelector('#ffx-universal-save').addEventListener('click', function () {
        var meta = currentMeta();
        if (!meta) return;
        var payload = {
          userKey: currentUserKey(),
          featureId: meta.featureId,
          category: meta.category,
          description: meta.description,
          owner: ownerInput ? ownerInput.value : '',
          dueDate: dueInput ? dueInput.value : '',
          status: statusInput ? statusInput.value : 'active',
          notes: notesInput ? notesInput.value : ''
        };
        postBusiness('/feature/state', payload).then(function (data) {
          executeFeature(meta, 'universal-save-state', payload);
          setOutput(data && data.ok ? 'State saved for ' + meta.featureId : 'State save failed');
        });
      });

      body.querySelector('#ffx-universal-run').addEventListener('click', function () {
        var meta = currentMeta();
        if (!meta) return;
        var payload = {
          userKey: currentUserKey(),
          featureId: meta.featureId,
          category: meta.category,
          action: (actionInput && actionInput.value) || 'manual-run',
          status: 'executed',
          payload: {
            notes: notesInput ? notesInput.value : '',
            owner: ownerInput ? ownerInput.value : ''
          },
          result: 'Action executed via universal runner'
        };
        postBusiness('/feature/action', payload).then(function (data) {
          executeFeature(meta, 'universal-run-action', payload);
          setOutput(data && data.ok ? 'Action executed for ' + meta.featureId : 'Action failed');
        });
      });

      body.querySelector('#ffx-universal-load').addEventListener('click', function () {
        var meta = currentMeta();
        if (!meta) return;
        getBusiness('/feature/state/' + encodeURIComponent(meta.featureId) + '?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
          var state = data && data.state ? data.state : null;
          if (!state) {
            setOutput('No saved state for ' + meta.featureId);
            return;
          }
          if (ownerInput) ownerInput.value = state.owner || '';
          if (dueInput) dueInput.value = state.dueDate || '';
          if (statusInput) statusInput.value = state.status || 'active';
          if (notesInput) notesInput.value = state.notes || '';
          setOutput('Loaded state: ' + meta.featureId + ' | status=' + (state.status || 'active'));
        });
      });

      body.querySelector('#ffx-universal-history').addEventListener('click', function () {
        var meta = currentMeta();
        if (!meta) return;
        getBusiness('/feature/action/' + encodeURIComponent(meta.featureId) + '?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
          var items = data && Array.isArray(data.items) ? data.items : [];
          if (!items.length) {
            setOutput('No action history for ' + meta.featureId);
            return;
          }
          if (!output) return;
          output.innerHTML = items.slice(-20).reverse().map(function (item) {
            return '<div style=\"padding:6px 0;border-bottom:1px solid #edf2ff;\"><strong>' + escapeHtml(item.action) + '</strong> - ' + escapeHtml(item.createdAt) + '</div>';
          }).join('');
        });
      });

      select.addEventListener('change', renderDescription);
    }

    var selectEl = body.querySelector('#ffx-universal-feature');
    if (!selectEl) return;
    var exists = false;
    for (var i = 0; i < selectEl.options.length; i += 1) {
      if (selectEl.options[i].value === featureId) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      var option = document.createElement('option');
      option.value = featureId;
      option.textContent = featureId + ' - ' + (feature.category || 'general');
      selectEl.appendChild(option);
      if (!selectEl.value) selectEl.value = featureId;
    }
    var descEl = body.querySelector('#ffx-universal-description');
    if (descEl && selectEl.value === featureId) {
      descEl.innerHTML = '<strong>' + escapeHtml(featureId) + '</strong> [' + escapeHtml(feature.category || 'general') + '] - ' + escapeHtml(feature.description || '');
    }
  }

  function applyModules(feature) {
    if (!isCategoryAllowed(feature)) return;
    var text = normalize(feature.description);

    if (isModuleAllowed('auth', feature) && hasAny(text, ['signup', 'register', 'login', 'otp', 'google', 'facebook'])) applyAuthModule(feature);
    if (isModuleAllowed('profile', feature) && hasAny(text, ['profile', 'photo', 'address', 'privacy', 'password', 'delete account', 'emergency contact', 'email', 'phone'])) applyProfileModule(feature);
    if (isModuleAllowed('kyc', feature) && hasAny(text, ['document', 'kyc', 'license', 'rc', 'pan', 'aadhar', 'insurance', 'id proof', 'verification'])) applyKycModule(feature);
    if (isModuleAllowed('payment', feature) && hasAny(text, ['payment', 'upi', 'paypal', 'wallet', 'coupon', 'refund', 'advance'])) applyPaymentModule(feature);
    if (isModuleAllowed('emergency', feature) && hasAny(text, ['emergency', 'police', 'ambulance', 'sos', 'helpline', '24x7'])) applyEmergencyModule(feature);
    if (isModuleAllowed('tourism', feature) && hasAny(text, ['tourist', 'district', 'history', 'fort', 'palace', 'temple', 'museum', 'festival', 'parking'])) applyTourismModule(feature);
    if (isModuleAllowed('districtDirectory', feature) && hasAny(text, ['district', 'all district', '50 district', 'rajasthan district', 'jaipur', 'udaipur', 'jodhpur'])) applyDistrictDirectoryModule(feature);
    if (isModuleAllowed('rating', feature) && hasAny(text, ['rating', 'review', 'feedback', 'star'])) applyRatingModule(feature);
    if (isModuleAllowed('ride', feature) && hasAny(text, ['local', 'outstation', 'rental', 'airport', 'ride type'])) applyRideModule(feature);
    if (isModuleAllowed('driverVehicle', feature) && hasAny(text, ['driver', 'vehicle', 'hatchback', 'sedan', 'suv', 'ac', 'non-ac', 'seating'])) applyDriverVehicleModule(feature);
    if (isModuleAllowed('bookingOps', feature) && hasAny(text, ['accept', 'reject', 'extra booking', 'cancel'])) applyBookingOpsModule(feature);
    if (isModuleAllowed('bookingPolicy', feature) && hasAny(text, ['cancel policy', 'reschedule', 'booking policy', 'cancel after pickup'])) applyBookingPolicyModule(feature);
    if (isModuleAllowed('liveTracking', feature) && hasAny(text, ['live location', 'tracking', 'gps'])) applyLiveTrackingModule(feature);
    if (isModuleAllowed('partnerCommission', feature) && hasAny(text, ['hotel', 'restaurant', 'shop', 'commission', 'guest house'])) applyPartnerCommissionModule(feature);
    if (isModuleAllowed('listing', feature) && hasAny(text, ['listing', 'searchable', 'categorized', 'specialty', 'contact'])) applyListingModule(feature);
    if (isModuleAllowed('tourPackage', feature) && hasAny(text, ['tour package', 'package booking', 'family', 'honeymoon', 'adventure', 'itinerary', 'book now'])) applyTourPackageModule(feature);
    if (isModuleAllowed('referralAffiliate', feature) && hasAny(text, ['referral', 'affiliate', 'utm', 'coupon', 'partner tracking'])) applyReferralAffiliateModule(feature);
    if (isModuleAllowed('fareEstimator', feature) && hasAny(text, ['fare', 'currency', 'distance', 'season', 'auto-calculated'])) applyFareEstimatorModule(feature);
    if (isModuleAllowed('otpSecurity', feature) && hasAny(text, ['otp', 'anti-fraud', 'auth security', 'suspicious'])) applyOtpSecurityModule(feature);
    if (isModuleAllowed('savedLocation', feature) && hasAny(text, ['favorite location', 'saved location', 'home office', 'pickup suggestion'])) applySavedLocationModule(feature);
    if (isModuleAllowed('dispute', feature) && hasAny(text, ['dispute', 'complaint', 'evidence', 'liability claim'])) applyDisputeModule(feature);
    if (isModuleAllowed('fraudAlert', feature) && hasAny(text, ['fraud', 'spam', 'anomaly', 'suspicious'])) applyFraudAlertModule(feature);
    if (isModuleAllowed('chatbot', feature) && hasAny(text, ['chatbot', 'faq', 'support bot'])) applyChatbotModule(feature);
    if (isModuleAllowed('translator', feature) && hasAny(text, ['language', 'communication', 'translator', 'multi lingual'])) applyTranslatorModule(feature);
    if (isModuleAllowed('termsConsent', feature) && hasAny(text, ['disclaimer', 'liability', 'terms consent', 'terms checkbox'])) applyTermsConsentModule(feature);
    if (isModuleAllowed('supportHelpdesk', feature) && hasAny(text, ['help desk', 'helpdesk', 'support', 'ticket'])) applySupportHelpdeskModule(feature);
    if (isModuleAllowed('adminMonitoring', feature) && hasAny(text, ['dashboard', 'monitoring', 'admin panel', 'summary', 'performance logs'])) applyAdminMonitoringModule(feature);
    if (isModuleAllowed('aiRecommendation', feature) && hasAny(text, ['ai', 'recommendation', 'smart', 'chatbot', 'suggestion'])) applyAIRecommendationModule(feature);
    if (isModuleAllowed('review', feature) && hasAny(text, ['review', 'rating', 'real user review', 'social proof'])) applyReviewModule(feature);
    if (isModuleAllowed('partnerIntegration', feature) && hasAny(text, ['api', 'webhook', 'integration', 'partner integration'])) applyPartnerIntegrationModule(feature);
    if (isModuleAllowed('trustBrand', feature) && hasAny(text, ['why trust', 'real trip photos', 'trip preview', 'social proof', 'experience'])) applyTrustBrandModule(feature);
    if (isModuleAllowed('policyRules', feature) && hasAny(text, ['road rule', 'government', 'law', 'compliance', 'legal'])) applyPolicyRulesModule(feature);
    if (isModuleAllowed('notificationCenter', feature) && hasAny(text, ['notification', 'alert', 'reminder', 'sms', 'email', 'whatsapp', 'push'])) applyNotificationCenterModule(feature);
    if (isModuleAllowed('travelCard', feature) && hasAny(text, ['travel card', 'digital travel card', 'tourist card'])) applyTravelCardModule(feature);
    if (isModuleAllowed('rideHistory', feature) && hasAny(text, ['ride history', 'history', 'past booking', 'export', 'invoice'])) applyRideHistoryModule(feature);

    if (isModuleAllowed('universalFeature', feature) && (RUNTIME_DEBUG || PAGE_ROLE === 'admin')) {
      applyUniversalFeatureModule(feature);
    }
  }

  function activate(detail) {
    var feature = featureFromDetail(detail || {});
    if (!feature) return;
    var runtimeKey = (feature.category || 'general') + ':' + ((detail && detail.blockKey) || 'block') + ':' + (feature.featureId || 'NA');
    if (extState.activatedKeys[runtimeKey]) return;
    extState.activatedKeys[runtimeKey] = true;

    feature.blockKey = feature.blockKey || ((detail && detail.blockKey) || 'block');
    feature.implemented = true;
    applyModules(feature);
    syncActivation(feature, detail || {});
  }

  function replay() {
    var keys = Object.keys(registry || {});
    for (var i = 0; i < keys.length; i += 1) {
      var blockKey = keys[i];
      var items = registry[blockKey] || [];
      for (var j = 0; j < items.length; j += 1) {
        activate({
          category: items[j].category || 'general',
          blockKey: blockKey,
          featureId: items[j].featureId
        });
      }
    }
  }

  window.addEventListener(EVENT_NAME, function (event) {
    activate((event && event.detail) || {});
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replay);
  } else {
    replay();
  }
})();
