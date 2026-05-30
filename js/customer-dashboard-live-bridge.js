(function () {
  'use strict';

  var RUNTIME_HISTORY_SYNC_KEY = 'goindiaride.customer.dashboard.runtime-history-sync.v1';
  var PUBLIC_ADMIN_QUEUE_SYNC_KEY = 'goindiaride.customer.dashboard.public-admin-queue-sync.v1';
  var LOCAL_BOOKING_KEYS = [
    'bookings',
    'goride_bookings',
    'goindiaride_active_bookings',
    'customerBookings',
    'customer_bookings',
    'goindiaride_admin_customer_bookings_current_v1',
    'goindiaride_live_customer_booking_queue_v1'
  ];
  var RUNTIME_BOOKING_CACHE_MS = 10000;
  var RUNTIME_BOOKING_MAX_ROWS_PER_KEY = 220;
  var RUNTIME_BOOKING_MAX_VALUE_CHARS = 520000;
  var RUNTIME_BOOKING_WRITE_LIMIT = 260;
  var bridge = window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__ || {};
  window.__GOINDIARIDE_DISABLE_AUTOMATED_CHAT_SEED__ = true;

  function scheduleRuntimeIdle(callback, delayMs) {
    var run = function () {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(callback, { timeout: 10000 });
        return;
      }
      window.setTimeout(callback, 140);
    };
    window.setTimeout(run, delayMs || 0);
  }

  function parseJson(raw, fallback) {
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeTextValue(value, maxLen) {
    var limit = Number.isFinite(maxLen) ? maxLen : 180;
    return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }

  function normalizeApiBaseValue(base) {
    if (typeof normalizeApiBase === 'function') return normalizeApiBase(base);
    return String(base || '').trim().replace(/\/+$/, '');
  }

  function getStoredUser() {
    if (typeof currentUser !== 'undefined' && currentUser && typeof currentUser === 'object') return currentUser;
    return parseJson(localStorage.getItem('currentUser') || 'null', null);
  }

  function buildRuntimeIdentity(user) {
    var source = user && typeof user === 'object' ? user : {};
    var rawId = String(source.id || source.userId || source.customerId || '').trim();
    var rawEmail = String(source.email || source.userEmail || '').trim().toLowerCase();
    var rawPhone = String(source.phone || source.mobile || source.contact || '').trim();
    var rawName = String(source.fullname || source.name || '').trim();
    return {
      user: source,
      userKey: rawId ? ('customer:' + rawId) : (rawEmail || rawPhone || 'guest-user'),
      profile: {
        id: rawId,
        name: rawName,
        fullname: rawName,
        email: rawEmail,
        phone: rawPhone,
        mobile: rawPhone,
        isPhoneVerified: Boolean(source.isPhoneVerified || source.phoneVerified),
        phoneVerified: Boolean(source.isPhoneVerified || source.phoneVerified)
      }
    };
  }

  function bootstrapIdentityFromUser(user) {
    var identity = buildRuntimeIdentity(user || getStoredUser());
    if (!identity.userKey || identity.userKey === 'guest-user') return identity;
    window.__GOINDIARIDE_DASHBOARD_RUNTIME_USER__ = identity.user;
    try {
      localStorage.setItem('goindiaride.runtime.userKey', identity.userKey);
      localStorage.setItem('goindiaride.profile.runtime', JSON.stringify(identity.profile));
    } catch (_error) {}
    return identity;
  }

  function getRuntimeUserKey() {
    return buildRuntimeIdentity(getStoredUser()).userKey;
  }

  function getDashboardApiBasesSafe() {
    var host = String((window.location && window.location.hostname) || '').toLowerCase();
    var isPrimaryWebsiteHost = /(^|\.)goindiaride\.in$/i.test(host);
    var sameOriginBase = normalizeApiBaseValue((window.location && window.location.origin) || '');
    var continuityBases = window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.getApiBases === 'function'
      ? window.GoIndiaSessionContinuity.getApiBases(window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || window.__GOINDIARIDE_API_ORIGIN__ || '')
      : [];
    var provided = typeof getDashboardAdminEmailApiBases === 'function'
      ? getDashboardAdminEmailApiBases()
      : [
          isPrimaryWebsiteHost ? 'https://goindiaride.onrender.com' : sameOriginBase,
          window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ || '',
          window.__GOINDIARIDE_API_ORIGIN__ || '',
          isPrimaryWebsiteHost ? sameOriginBase : 'https://goindiaride.onrender.com'
        ];
    return continuityBases.concat(provided)
      .map(function (item) { return normalizeApiBaseValue(item); })
      .filter(function (item, index, arr) { return item && arr.indexOf(item) === index; });
  }

  function getDashboardBusinessApiBases() {
    return getDashboardApiBasesSafe()
      .map(function (base) { return base ? (base + '/api/future-runtime-business') : ''; })
      .filter(function (item, index, arr) { return item && arr.indexOf(item) === index; });
  }

  function fetchWithTimeoutSafe(url, options, timeoutMs) {
    if (typeof dashboardFetchWithTimeout === 'function') return dashboardFetchWithTimeout(url, options || {}, timeoutMs || 15000);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort('request_timeout'); }, timeoutMs || 15000);
    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal })).finally(function () { clearTimeout(timer); });
  }

  function createDashboardIdempotencyKey(prefix) {
    var safePrefix = String(prefix || 'gir-dashboard')
      .replace(/[^A-Za-z0-9:_-]/g, '_')
      .slice(0, 80) || 'gir-dashboard';
    return safePrefix + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 14);
  }

  function softDelay(ms, value) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(value); }, ms);
    });
  }

  async function waitForSoftSync(promise, timeoutMs) {
    return Promise.race([
      Promise.resolve(promise).then(function () { return true; }).catch(function () { return false; }),
      softDelay(timeoutMs || 1200, false)
    ]);
  }

  async function requestDashboardBusiness(method, path, payload) {
    var route = String(path || '/').trim() || '/';
    if (route.charAt(0) !== '/') route = '/' + route;
    var bases = getDashboardBusinessApiBases();
    for (var i = 0; i < bases.length; i += 1) {
      try {
        var headers = { Accept: 'application/json' };
        if (method !== 'GET') {
          headers['Content-Type'] = 'application/json';
        }
        var response = await fetchWithTimeoutSafe(bases[i] + route, {
          method: method,
          headers: headers,
          body: method === 'GET' ? undefined : JSON.stringify(payload || {})
        }, 15000);
        var data = await response.json().catch(function () { return null; });
        if (response.ok && data) return data;
      } catch (_error) {}
    }
    return null;
  }

  function getBookingRef(row) {
    return String((row && (row.bookingId || row.id)) || '').trim();
  }

  function sortBookingRows(rows) {
    return safeArray(rows).slice().sort(function (left, right) {
      return new Date((right && (right.updatedAt || right.createdAt)) || 0).getTime()
        - new Date((left && (left.updatedAt || left.createdAt)) || 0).getTime();
    });
  }

  function toTimestampSafe(value) {
    var time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function bookingFreshness(row) {
    if (!row || typeof row !== 'object') return 0;
    return Math.max(
      toTimestampSafe(row.adminLastEditedAt),
      toTimestampSafe(row.lastEditedAt),
      toTimestampSafe(row.adminCustomerSyncedAt),
      toTimestampSafe(row.backendSyncedAt),
      toTimestampSafe(row.updatedAt),
      toTimestampSafe(row.createdAt)
    );
  }

  function bookingQualityScore(row) {
    if (!row || typeof row !== 'object') return 0;
    var score = 0;
    var source = String(row.sourceKey || '').toLowerCase();
    if (row.adminLastEditedAt || row.adminCustomerSyncStatus || row.adminCustomerSyncedAt) score += 40;
    if (source.indexOf('admin') >= 0 || source.indexOf('fallback') >= 0) score += 15;
    return score;
  }

  function shouldIncomingBookingWin(existing, incoming) {
    if (!existing) return true;
    var existingScore = bookingQualityScore(existing);
    var incomingScore = bookingQualityScore(incoming);
    if (incomingScore !== existingScore) return incomingScore > existingScore;
    return bookingFreshness(incoming) >= bookingFreshness(existing);
  }

  function mergeBookingRowSnapshots(existing, incoming) {
    if (!existing) return Object.assign({}, incoming || {});
    if (!incoming) return Object.assign({}, existing || {});
    return shouldIncomingBookingWin(existing, incoming)
      ? Object.assign({}, existing, incoming)
      : Object.assign({}, incoming, existing);
  }

  function mergeBookingCollections(existing, incoming) {
    var mergedMap = {};
    var looseRows = [];
    safeArray(existing).concat(safeArray(incoming)).forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      var ref = getBookingRef(row);
      if (!ref) {
        looseRows.push(row);
        return;
      }
      mergedMap[ref] = mergeBookingRowSnapshots(mergedMap[ref] || null, row);
    });
    return looseRows.concat(sortBookingRows(Object.keys(mergedMap).map(function (key) { return mergedMap[key]; })));
  }

  function readBookingRowsFromKey(key, options) {
    try {
      var raw = localStorage.getItem(key) || '[]';
      var maxChars = Number((options && options.maxChars) || RUNTIME_BOOKING_MAX_VALUE_CHARS);
      if (raw.length > maxChars && !(options && options.forceDeep)) return [];
      return safeArray(parseJson(raw, [])).slice(0, Number((options && options.maxRows) || RUNTIME_BOOKING_MAX_ROWS_PER_KEY));
    } catch (_error) {
      return [];
    }
  }

  function readLocalBookings(options) {
    var settings = options && typeof options === 'object' ? options : {};
    if (!settings.force && Array.isArray(bridge.localBookingCache) && Number(bridge.localBookingCacheAt || 0) > 0) {
      if (Date.now() - Number(bridge.localBookingCacheAt || 0) < RUNTIME_BOOKING_CACHE_MS) {
        return bridge.localBookingCache.slice();
      }
    }
    var merged = [];
    for (var i = 0; i < LOCAL_BOOKING_KEYS.length; i += 1) {
      merged = mergeBookingCollections(
        merged,
        readBookingRowsFromKey(LOCAL_BOOKING_KEYS[i], settings)
      );
    }
    bridge.localBookingCache = merged.slice();
    bridge.localBookingCacheAt = Date.now();
    return merged;
  }

  function writeLocalBookings(rows) {
    try {
      var mergedLocal = mergeBookingCollections(readLocalBookings({ force: true }), safeArray(rows)).slice(0, RUNTIME_BOOKING_WRITE_LIMIT);
      var mergedShared = mergeBookingCollections(
        readBookingRowsFromKey('goride_bookings', { force: true }),
        mergedLocal
      ).slice(0, RUNTIME_BOOKING_WRITE_LIMIT);
      [
        ['bookings', mergedLocal],
        ['goride_bookings', mergedShared],
        ['goindiaride_active_bookings', mergedLocal],
        ['customerBookings', mergedLocal],
        ['customer_bookings', mergedLocal],
        ['goindiaride_live_customer_booking_queue_v1', mergedLocal]
      ].forEach(function (entry) {
        var key = entry[0];
        var existing = localStorage.getItem(key) || '[]';
        if (existing.length > RUNTIME_BOOKING_MAX_VALUE_CHARS && key !== 'goindiaride_live_customer_booking_queue_v1') return;
        localStorage.setItem(key, JSON.stringify(entry[1].slice(0, RUNTIME_BOOKING_WRITE_LIMIT)));
      });
      bridge.localBookingCache = mergedLocal.slice();
      bridge.localBookingCacheAt = Date.now();
    } catch (_error) {}
  }

  function normalizePhoneToken(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var compact = raw.replace(/\s+/g, '');
    if (compact.indexOf('00') === 0) compact = '+' + compact.slice(2);
    if (compact.charAt(0) === '+') {
      var withCountry = compact.slice(1).replace(/\D/g, '');
      return withCountry.length >= 8 && withCountry.length <= 15 ? ('+' + withCountry) : '';
    }
    var digits = compact.replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return '+91' + digits;
    return digits.length >= 8 && digits.length <= 15 ? ('+' + digits) : '';
  }

  function normalizeEmailToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function uniqueTokens(values) {
    return Array.from(new Set(safeArray(values).map(function (item) { return String(item || '').trim(); }).filter(Boolean)));
  }

  function identityTokensForUser(user) {
    var source = user && typeof user === 'object' ? user : {};
    if (window.GoIndiaSessionContinuity && typeof window.GoIndiaSessionContinuity.getIdentityAliases === 'function') {
      try {
        var aliases = window.GoIndiaSessionContinuity.getIdentityAliases(source, 'customer');
        if (aliases && typeof aliases === 'object') {
          return {
            primaryId: String(aliases.primaryId || source.id || source.userId || '').trim(),
            ids: uniqueTokens([aliases.primaryId].concat(safeArray(aliases.ids))),
            emails: uniqueTokens(safeArray(aliases.emails).map(normalizeEmailToken)),
            phones: uniqueTokens(safeArray(aliases.phones).map(normalizePhoneToken))
          };
        }
      } catch (_error) {}
    }

    var primaryId = String(source.id || source.userId || source.customerId || source.backendUserId || source._id || '').trim();
    return {
      primaryId: primaryId,
      ids: uniqueTokens([primaryId, source.id, source.userId, source.customerId, source.backendUserId, source._id, source.uid]),
      emails: uniqueTokens([source.email, source.userEmail, source.customerEmail].map(normalizeEmailToken)),
      phones: uniqueTokens([source.phone, source.mobile, source.contact, source.customerPhone].map(normalizePhoneToken))
    };
  }

  function getPrimaryUserId(user) {
    var identity = identityTokensForUser(user);
    return String(identity.primaryId || (identity.ids && identity.ids[0]) || '').trim();
  }

  function bookingBelongsToUser(row, user) {
    if (!row || typeof row !== 'object') return false;
    var identity = identityTokensForUser(user);
    var recordIds = uniqueTokens([
      row.customerId,
      row.userId,
      row.ownerId,
      row.backendUserId,
      row.customerUserId,
      row.customer && row.customer.id,
      row.customer && row.customer.userId
    ]);
    for (var i = 0; i < recordIds.length; i += 1) {
      if (identity.ids.indexOf(recordIds[i]) >= 0) return true;
    }

    var recordEmails = uniqueTokens([
      row.customerEmail,
      row.email,
      row.userEmail,
      row.customer && row.customer.email,
      row.customerSnapshot && row.customerSnapshot.email
    ].map(normalizeEmailToken));
    for (var j = 0; j < recordEmails.length; j += 1) {
      if (identity.emails.indexOf(recordEmails[j]) >= 0) return true;
    }

    var recordPhones = uniqueTokens([
      row.customerPhone,
      row.phone,
      row.mobile,
      row.contact,
      row.customer && row.customer.phone,
      row.customerSnapshot && row.customerSnapshot.phone
    ].map(normalizePhoneToken));
    for (var k = 0; k < recordPhones.length; k += 1) {
      if (identity.phones.indexOf(recordPhones[k]) >= 0) return true;
    }

    return false;
  }

  function mapBackendBookingToLocal(item, user) {
    var bookingId = normalizeTextValue((item && item.bookingId) || (item && item.id) || '', 120) || ('BK-' + Date.now());
    var safeStops = Array.isArray(item && item.stops) ? item.stops.filter(Boolean).slice(0, 8) : [];
    var specialRequests = item && item.specialRequests && typeof item.specialRequests === 'object'
      ? item.specialRequests
      : ((item && item.customerFeatures && item.customerFeatures.specialRequests) || {});
    var safetyAccessibility = item && item.safetyAccessibility && typeof item.safetyAccessibility === 'object'
      ? item.safetyAccessibility
      : ((item && item.customerFeatures && item.customerFeatures.safetyAccessibility) || {});
    return {
      id: bookingId,
      bookingId: bookingId,
      customerId: getPrimaryUserId(user),
      backendUserId: String((user && (user.backendUserId || user._id || user.id || user.userId)) || '').trim(),
      customerName: String((user && (user.fullname || user.name)) || '').trim(),
      customerEmail: String((user && user.email) || '').trim(),
      customerPhone: String((user && (user.phone || user.mobile)) || '').trim(),
      pickup: normalizeTextValue(item && item.pickupLocation, 180),
      pickupLocation: normalizeTextValue(item && item.pickupLocation, 180),
      dropoff: normalizeTextValue(item && item.dropLocation, 180),
      drop: normalizeTextValue(item && item.dropLocation, 180),
      dropLocation: normalizeTextValue(item && item.dropLocation, 180),
      rideDate: normalizeTextValue(item && item.rideDate, 40),
      rideTime: normalizeTextValue(item && item.rideTime, 16),
      returnDate: normalizeTextValue(item && item.returnDate, 40),
      returnTime: normalizeTextValue(item && item.returnTime, 16),
      returnTrip: { returnDate: normalizeTextValue(item && item.returnDate, 40), returnTime: normalizeTextValue(item && item.returnTime, 16) },
      tripPlan: normalizeTextValue(item && item.tripPlan, 40),
      paymentMethod: normalizeTextValue(item && item.paymentMethod, 40),
      rideType: normalizeTextValue((item && item.vehicleType) || '', 40),
      vehicleType: normalizeTextValue((item && item.vehicleType) || '', 40),
      passengers: Number(item && item.passengers) || 1,
      luggage: normalizeTextValue(item && item.luggage, 40),
      notes: normalizeTextValue(item && item.notes, 600),
      stops: safeStops,
      specialRequests: specialRequests,
      safetyAccessibility: safetyAccessibility,
      customerFeatures: { specialRequests: specialRequests, safetyAccessibility: safetyAccessibility },
      totalFare: Number((item && item.amount) || 0),
      amount: Number((item && item.amount) || 0),
      distance: Number((item && item.distanceKm) || 0),
      distanceKm: Number((item && item.distanceKm) || 0),
      duration: item && item.durationMin ? (String(item.durationMin) + ' mins') : '',
      status: normalizeTextValue(item && item.status, 40) || 'created',
      driverId: item && item.driverId ? String(item.driverId) : '',
      driverName: normalizeTextValue(item && item.driverName, 120),
      fareBreakdown: item && item.fareBreakdown && typeof item.fareBreakdown === 'object' ? item.fareBreakdown : {},
      fareQuote: item && item.fareQuote && typeof item.fareQuote === 'object' ? item.fareQuote : {},
      payment: item && item.payment && typeof item.payment === 'object' ? item.payment : {},
      promo: item && item.promo && typeof item.promo === 'object' ? item.promo : {},
      editCount: Number(item && item.editCount) || 0,
      editHistory: Array.isArray(item && item.editHistory) ? item.editHistory : [],
      editPolicyVersion: normalizeTextValue(item && item.editPolicyVersion, 80),
      createdAt: item && item.createdAt ? item.createdAt : new Date().toISOString(),
      updatedAt: item && item.updatedAt ? item.updatedAt : new Date().toISOString(),
      lastEditedAt: normalizeTextValue(item && item.lastEditedAt, 80),
      adminLastEditedAt: normalizeTextValue(item && (item.adminLastEditedAt || item.lastEditedAt), 80),
      adminReviewStatus: normalizeTextValue(item && item.adminReviewStatus, 40) || 'pending',
      adminCustomerSyncStatus: normalizeTextValue(item && item.adminCustomerSyncStatus, 40) || '',
      adminCustomerSyncedAt: normalizeTextValue(item && (item.adminCustomerSyncedAt || item.adminLastEditedAt || item.lastEditedAt), 80),
      backendSyncStatus: 'synced',
      backendSyncedAt: new Date().toISOString()
    };
  }

  function hasPendingLocalEdit(row) {
    return String((row && row.editSyncStatus) || '').trim().toLowerCase() === 'pending';
  }

  function toTimestamp(value) {
    return toTimestampSafe(value);
  }

  function localRowLooksFresher(existing, mapped) {
    if (!existing || !mapped) return false;
    var localUpdatedAt = bookingFreshness(existing);
    var backendUpdatedAt = bookingFreshness(mapped);
    if (!localUpdatedAt || !backendUpdatedAt) return false;
    if (localUpdatedAt <= backendUpdatedAt) return false;
    var hasAdminSyncMarker = Boolean(
      existing.adminCustomerSyncedAt
      || existing.adminCustomerSyncStatus
      || existing.adminLastEditedAt
      || existing.lastEditedAt
    );
    return hasAdminSyncMarker;
  }

  function mergeBackendBookingRow(existing, mapped) {
    if (!existing) {
      return Object.assign({}, mapped || {});
    }

    var localHasAdminSyncMarker = Boolean(
      existing && (
        existing.adminCustomerSyncedAt
        || existing.adminCustomerSyncStatus
        || existing.adminLastEditedAt
        || existing.lastEditedAt
      )
    );
    var mappedHasAdminSyncMarker = Boolean(
      mapped && (
        mapped.adminCustomerSyncedAt
        || mapped.adminCustomerSyncStatus
        || mapped.adminLastEditedAt
        || mapped.lastEditedAt
      )
    );

    if (localHasAdminSyncMarker && !mappedHasAdminSyncMarker) {
      return Object.assign({}, mapped, existing, {
        liveBackendSnapshot: mapped,
        editSyncStatus: String((existing && existing.editSyncStatus) || 'pending').trim().toLowerCase() || 'pending',
        editSyncConflict: true
      });
    }

    if (hasPendingLocalEdit(existing) || localRowLooksFresher(existing, mapped)) {
      return Object.assign({}, mapped, existing, {
        liveBackendSnapshot: mapped,
        editSyncStatus: String((existing && existing.editSyncStatus) || 'pending').trim().toLowerCase() || 'pending',
        editSyncConflict: true
      });
    }

    return Object.assign({}, existing || {}, mapped);
  }

  function mergeMappedBookingsIntoLocal(mappedRows, user) {
    var localRows = readLocalBookings();
    var localCurrentUserRows = localRows.filter(function (row) { return bookingBelongsToUser(row, user); });
    var localOtherRows = localRows.filter(function (row) { return !bookingBelongsToUser(row, user); });
    var mergedMap = {};
    localCurrentUserRows.forEach(function (row) { var ref = getBookingRef(row); if (ref) mergedMap[ref] = Object.assign({}, row); });
    safeArray(mappedRows).forEach(function (mapped) {
      var ref = getBookingRef(mapped);
      if (ref) mergedMap[ref] = mergeBackendBookingRow(mergedMap[ref] || null, mapped);
    });
    var mergedCurrentUserRows = Object.keys(mergedMap).map(function (key) { return mergedMap[key]; });
    mergedCurrentUserRows.sort(function (left, right) {
      return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
    });
    writeLocalBookings(localOtherRows.concat(mergedCurrentUserRows));
    return mergedCurrentUserRows;
  }

  function mergeBackendBookingsIntoLocal(items, user) {
    var mappedRows = safeArray(items).map(function (item) {
      return mapBackendBookingToLocal(item, user);
    });
    return mergeMappedBookingsIntoLocal(mappedRows, user);
  }

  async function fetchFallbackAdminQueueBookings(user) {
    var apiBases = getDashboardApiBasesSafe();
    var statuses = ['pending', 'approved', 'rejected'];
    var existingRefs = {};
    readLocalBookings()
      .filter(function (row) { return bookingBelongsToUser(row, user); })
      .forEach(function (row) {
        var ref = getBookingRef(row);
        if (ref) existingRefs[ref] = true;
      });
    for (var i = 0; i < apiBases.length; i += 1) {
      var collected = [];
      var anySuccess = false;
      for (var s = 0; s < statuses.length; s += 1) {
        try {
          var response = await fetchWithTimeoutSafe(
            apiBases[i] + '/api/bookings/fallback/admin-review-queue?limit=220&status=' + statuses[s],
            {
              method: 'GET',
              headers: {
                Accept: 'application/json',
                'x-booking-client': 'goindiaride-web'
              }
            },
            15000
          );
          var payload = await response.json().catch(function () { return {}; });
          if (response.ok && payload && Array.isArray(payload.items)) {
            anySuccess = true;
            collected = collected.concat(payload.items);
          }
        } catch (_error) {}
      }
      if (!anySuccess) continue;
      var mappedRows = [];
      safeArray(collected).forEach(function (item) {
        var ref = getBookingRef(item);
        var belongsToCurrentUser = bookingBelongsToUser(item, user);
        if (!belongsToCurrentUser && !(ref && existingRefs[ref])) return;
        var mapped = mapBackendBookingToLocal(item, user);
        mapped.adminCustomerSyncStatus = normalizeTextValue(item && (item.adminCustomerSyncStatus || item.adminReviewStatus || 'synced'), 40) || 'synced';
        mapped.adminCustomerSyncedAt = normalizeTextValue(item && (item.adminCustomerSyncedAt || item.adminLastEditedAt || item.lastEditedAt || item.updatedAt), 80) || new Date().toISOString();
        mapped.adminLastEditedAt = normalizeTextValue(item && (item.adminLastEditedAt || item.lastEditedAt || item.updatedAt), 80) || mapped.adminCustomerSyncedAt;
        mappedRows.push(mapped);
      });
      return { ok: true, items: mappedRows };
    }
    return { ok: false, items: [] };
  }

  function getDashboardAccessTokenSafe() {
    if (typeof getDashboardAccessToken === 'function') return getDashboardAccessToken();
    return String(
      localStorage.getItem('accessToken') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('token') ||
      ''
    ).trim();
  }

  function shouldSyncLocalBooking(row) {
    if (!getBookingRef(row)) return false;
    var status = String((row && (row.backendSyncStatus || row.liveBackendStatus)) || '').trim().toLowerCase();
    if (status === 'synced') return false;
    return true;
  }

  function markLocalBookingSyncResults(items, user) {
    var resultMap = {};
    safeArray(items).forEach(function (item) {
      var ref = getBookingRef(item);
      if (ref) resultMap[ref] = String(item.state || '').trim().toLowerCase();
    });
    if (!Object.keys(resultMap).length) return;

    var rows = readLocalBookings().map(function (row) {
      var ref = getBookingRef(row);
      var state = ref ? resultMap[ref] : '';
      if (!state || !bookingBelongsToUser(row, user)) return row;
      if (state === 'synced' || state === 'existing') {
        return Object.assign({}, row, {
          backendSyncStatus: 'synced',
          backendSyncedAt: new Date().toISOString(),
          editSyncStatus: 'synced',
          editSyncConflict: false
        });
      }
      return Object.assign({}, row, {
        backendSyncStatus: 'retry',
        backendSyncLastError: state || 'failed'
      });
    });
    writeLocalBookings(rows);
  }

  function getPublicAdminQueueSyncState() {
    return parseJson(localStorage.getItem(PUBLIC_ADMIN_QUEUE_SYNC_KEY) || '{}', {});
  }

  function savePublicAdminQueueSyncState(state) {
    try {
      localStorage.setItem(PUBLIC_ADMIN_QUEUE_SYNC_KEY, JSON.stringify(state && typeof state === 'object' ? state : {}));
    } catch (_error) {}
  }

  function getPublicAdminQueueFingerprint(row) {
    return [
      getBookingRef(row),
      normalizeTextValue(row && (row.updatedAt || row.lastEditedAt || row.createdAt), 80),
      normalizeTextValue(row && row.status, 40),
      normalizeTextValue(row && row.adminReviewStatus, 40),
      Number(row && (row.totalFare || row.amount || row.fare || 0))
    ].join('|');
  }

  function shouldQueueLocalBookingForPublicAdmin(row, syncState) {
    var ref = getBookingRef(row);
    if (!ref) return false;
    var status = String((row && row.status) || '').trim().toLowerCase();
    if (status === 'completed' || status === 'cancelled') return false;
    var backendStatus = String((row && row.backendSyncStatus) || '').trim().toLowerCase();
    var adminQueueStatus = String((row && row.adminQueueSyncStatus) || '').trim().toLowerCase();
    if (backendStatus === 'synced' && (adminQueueStatus === 'queued' || adminQueueStatus === 'existing')) return false;
    return syncState[ref] !== getPublicAdminQueueFingerprint(row);
  }

  function buildPublicAdminQueueBooking(row, user, reason) {
    var source = row && typeof row === 'object' ? row : {};
    return Object.assign({}, source, {
      id: getBookingRef(source),
      bookingId: getBookingRef(source),
      customerId: normalizeTextValue(source.customerId || source.userId || getPrimaryUserId(user), 120),
      customerName: normalizeTextValue(source.customerName || (user && (user.fullname || user.name)) || 'Customer', 140),
      customerEmail: normalizeTextValue(source.customerEmail || (user && user.email) || '', 180),
      customerPhone: normalizeTextValue(source.customerPhone || source.phone || (user && (user.phone || user.mobile)) || '', 40),
      pickup: normalizeTextValue(source.pickup || source.pickupLocation, 180),
      pickupLocation: normalizeTextValue(source.pickupLocation || source.pickup, 180),
      dropoff: normalizeTextValue(source.dropoff || source.drop || source.dropLocation, 180),
      drop: normalizeTextValue(source.drop || source.dropoff || source.dropLocation, 180),
      dropLocation: normalizeTextValue(source.dropLocation || source.dropoff || source.drop, 180),
      amount: Number(source.amount || source.totalFare || source.fare || 0),
      totalFare: Number(source.totalFare || source.amount || source.fare || 0),
      sourceKey: 'customer_dashboard_public_sync',
      mode: 'customer_dashboard_public_sync',
      backendStatus: normalizeTextValue(reason || 'queued_without_backend_token', 80),
      adminReviewStatus: normalizeTextValue(source.adminReviewStatus || 'pending', 40) || 'pending',
      status: normalizeTextValue(source.status || 'pending_admin_review', 40) || 'pending_admin_review'
    });
  }

  function markPublicAdminQueueResults(items, candidates) {
    var state = getPublicAdminQueueSyncState();
    var candidateMap = {};
    safeArray(candidates).forEach(function (row) {
      var ref = getBookingRef(row);
      if (ref) candidateMap[ref] = row;
    });
    var successful = {};
    safeArray(items).forEach(function (item) {
      var ref = getBookingRef(item);
      var status = String((item && item.state) || '').trim().toLowerCase();
      if (!ref || (status !== 'queued' && status !== 'existing')) return;
      if (candidateMap[ref]) {
        state[ref] = getPublicAdminQueueFingerprint(candidateMap[ref]);
        successful[ref] = true;
      }
    });
    savePublicAdminQueueSyncState(state);

    if (!Object.keys(successful).length) return;
    writeLocalBookings(readLocalBookings().map(function (row) {
      var ref = getBookingRef(row);
      if (!ref || !successful[ref]) return row;
      return Object.assign({}, row, {
        adminQueueSyncStatus: 'queued',
        adminQueueSyncedAt: new Date().toISOString()
      });
    }));
  }

  async function syncLocalBookingsToPublicAdminQueue(user, reason) {
    if (bridge.publicAdminQueueSyncInFlight) return bridge.publicAdminQueueSyncInFlight;
    var syncState = getPublicAdminQueueSyncState();
    var candidates = readLocalBookings()
      .filter(function (row) { return bookingBelongsToUser(row, user); })
      .filter(function (row) { return shouldQueueLocalBookingForPublicAdmin(row, syncState); })
      .slice(0, 80);
    if (!candidates.length) return { ok: true, queued: 0, existing: 0, invalid: 0 };

    bridge.publicAdminQueueSyncInFlight = (async function () {
      var apiBases = getDashboardApiBasesSafe();
      var payloadRows = candidates.map(function (row) {
        return buildPublicAdminQueueBooking(row, user, reason || 'dashboard_public_queue');
      });
      for (var i = 0; i < apiBases.length; i += 1) {
        try {
          var response = await fetchWithTimeoutSafe(apiBases[i] + '/api/bookings/fallback/admin-review-queue', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'x-booking-client': 'goindiaride-web',
              'x-idempotency-key': createDashboardIdempotencyKey('gir-dashboard-admin-review-queue')
            },
            body: JSON.stringify({
              source: 'customer_dashboard_public_sync',
              reason: reason || 'dashboard_public_queue',
              bookings: payloadRows
            })
          }, 16000);
          var data = await response.json().catch(function () { return null; });
          if (response.ok && data && data.ok !== false) {
            markPublicAdminQueueResults(data.items || [], candidates);
            return data;
          }
        } catch (_error) {}
      }
      return { ok: false, reason: 'public_admin_queue_failed', queued: 0 };
    })();

    try {
      return await bridge.publicAdminQueueSyncInFlight;
    } finally {
      bridge.publicAdminQueueSyncInFlight = null;
    }
  }

  async function syncLocalBookingsToBackend(user) {
    if (bridge.localBookingSyncInFlight) return bridge.localBookingSyncInFlight;
    var token = getDashboardAccessTokenSafe();
    if (!token) return syncLocalBookingsToPublicAdminQueue(user, 'missing_access_token');

    var candidates = readLocalBookings()
      .filter(function (row) { return bookingBelongsToUser(row, user); })
      .filter(shouldSyncLocalBooking)
      .slice(0, 150);
    if (!candidates.length) {
      await syncLocalBookingsToPublicAdminQueue(user, 'backend_synced_queue_mirror');
      return { ok: true, synced: 0, existing: 0, publicQueueSynced: true };
    }

    bridge.localBookingSyncInFlight = (async function () {
      var apiBases = getDashboardApiBasesSafe();
      for (var i = 0; i < apiBases.length; i += 1) {
        try {
          var response = await fetchWithTimeoutSafe(apiBases[i] + '/api/bookings/sync-local', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token,
              'x-booking-client': 'goindiaride-web',
              'x-idempotency-key': createDashboardIdempotencyKey('gir-dashboard-local-booking-sync')
            },
            body: JSON.stringify({ bookings: candidates })
          }, 18000);
          var data = await response.json().catch(function () { return null; });
          if (response.ok && data && data.ok !== false) {
            markLocalBookingSyncResults(data.items || [], user);
            await syncLocalBookingsToPublicAdminQueue(user, 'backend_synced_queue_mirror');
            return Object.assign({}, data, { publicQueueSynced: true });
          }
        } catch (_error) {}
      }
      await syncLocalBookingsToPublicAdminQueue(user, 'backend_sync_failed');
      return { ok: false, reason: 'backend_sync_failed', synced: 0 };
    })();

    try {
      return await bridge.localBookingSyncInFlight;
    } finally {
      bridge.localBookingSyncInFlight = null;
    }
  }

  async function fetchBackendBookings(user, forceSync) {
    var token = typeof getDashboardAccessToken === 'function' ? getDashboardAccessToken() : '';
    if (!token) return { ok: false, reason: 'missing_access_token', items: [] };
    var apiBases = getDashboardApiBasesSafe();
    var limit = forceSync ? 150 : 80;
    for (var i = 0; i < apiBases.length; i += 1) {
      try {
        var response = await fetchWithTimeoutSafe(apiBases[i] + '/api/bookings/my?limit=' + limit, {
          method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer ' + token }
        }, 15000);
        var data = await response.json().catch(function () { return {}; });
        if (response.ok && data && Array.isArray(data.items)) return { ok: true, items: data.items };
      } catch (_error) {}
    }
    return { ok: false, reason: 'backend_fetch_failed', items: [] };
  }

  async function syncRuntimeBusinessState(bookings, user) {
    var identity = bootstrapIdentityFromUser(user);
    if (!identity.userKey || identity.userKey === 'guest-user') return;
    var latestRide = safeArray(bookings)[0] || null;
    var latestDistrict = latestRide
      ? normalizeTextValue(latestRide.dropoff || latestRide.dropLocation || latestRide.pickup || latestRide.pickupLocation || 'Jaipur', 80)
      : 'Jaipur';

    await requestDashboardBusiness('POST', '/preferences/' + encodeURIComponent(identity.userKey), {
      district: latestDistrict,
      city: latestDistrict,
      language: 'Hindi',
      preferredListingType: 'hotel',
      push: true,
      sms: true,
      email: true
    });

    var syncState = parseJson(localStorage.getItem(RUNTIME_HISTORY_SYNC_KEY) || '{}', {});
    if (!syncState[identity.userKey] || typeof syncState[identity.userKey] !== 'object') syncState[identity.userKey] = {};
    var userSyncState = syncState[identity.userKey];

    var rowsToSync = safeArray(bookings).slice(0, 20);
    for (var i = 0; i < rowsToSync.length; i += 1) {
      var booking = rowsToSync[i];
      var bookingRef = getBookingRef(booking);
      if (!bookingRef) continue;
      var status = String(booking.status || '').toLowerCase();
      if (status !== 'completed' && status !== 'cancelled' && status !== 'accepted') continue;
      var fingerprint = [status, normalizeTextValue(booking.updatedAt || booking.createdAt || '', 80), Number(booking.totalFare || booking.amount || 0)].join('|');
      if (userSyncState[bookingRef] === fingerprint) continue;
      var historyResponse = await requestDashboardBusiness('POST', '/history/ride', {
        userKey: identity.userKey,
        bookingId: bookingRef,
        from: normalizeTextValue(booking.pickup || booking.pickupLocation, 180),
        to: normalizeTextValue(booking.dropoff || booking.dropLocation, 180),
        distanceKm: Number(booking.distanceKm || booking.distance || 0),
        fare: Number(booking.totalFare || booking.amount || 0),
        status: status,
        driverName: normalizeTextValue(booking.driverName, 120),
        rating: Number(booking.rating || 0),
        feedback: normalizeTextValue(booking.notes || '', 400)
      });
      if (historyResponse && historyResponse.ok !== false) userSyncState[bookingRef] = fingerprint;
    }

    localStorage.setItem(RUNTIME_HISTORY_SYNC_KEY, JSON.stringify(syncState));
  }

  function scheduleBackgroundBookingSync(user, delayMs) {
    if (bridge.backgroundBookingSyncScheduled) return;
    bridge.backgroundBookingSyncScheduled = true;
    scheduleRuntimeIdle(function () {
      bridge.backgroundBookingSyncScheduled = false;
      getBookings({ forceSync: true, background: true, user: user }).catch(function () { return null; });
    }, delayMs || 6500);
  }

  async function getBookings(options) {
    var settings = options && typeof options === 'object' ? options : {};
    if (!settings.forceSync && Array.isArray(bridge.cachedBookings) && bridge.cachedBookings.length && Number(bridge.cachedBookingsAt || 0) > 0) {
      if (Date.now() - Number(bridge.cachedBookingsAt || 0) < 12000) {
        window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__ = bridge.cachedBookings.slice();
        return bridge.cachedBookings.slice();
      }
    }
    var user = getStoredUser();
    var identity = bootstrapIdentityFromUser(user);
    if (!settings.forceSync && settings.background !== true) {
      var fastLocalRows = readLocalBookings().filter(function (row) { return bookingBelongsToUser(row, user); });
      window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__ = fastLocalRows.slice();
      window.__GOINDIARIDE_DASHBOARD_RUNTIME_USER__ = identity.user;
      bridge.cachedBookings = fastLocalRows.slice();
      bridge.cachedBookingsAt = Date.now();
      scheduleBackgroundBookingSync(user);
      return fastLocalRows;
    }
    await syncLocalBookingsToBackend(user);
    writeLocalBookings(readLocalBookings());
    var localRows = readLocalBookings().filter(function (row) { return bookingBelongsToUser(row, user); });
    var fallback = await fetchFallbackAdminQueueBookings(user);
    if (fallback.ok && fallback.items.length) {
      localRows = mergeMappedBookingsIntoLocal(fallback.items, user);
    }
    var remote = await fetchBackendBookings(user, Boolean(settings.forceSync));
    var mergedRows = remote.ok && remote.items.length ? mergeBackendBookingsIntoLocal(remote.items, user) : localRows;
    window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__ = mergedRows.slice();
    window.__GOINDIARIDE_DASHBOARD_RUNTIME_USER__ = identity.user;
    bridge.cachedBookings = mergedRows.slice();
    bridge.cachedBookingsAt = Date.now();
    await syncRuntimeBusinessState(mergedRows, user);
    return mergedRows;
  }

  function findRideById(rideId) {
    var target = String(rideId || '').trim();
    if (!target) return null;
    var bookings = safeArray(window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__);
    for (var i = 0; i < bookings.length; i += 1) {
      var row = bookings[i];
      if (String((row && row.id) || '').trim() === target || String((row && row.bookingId) || '').trim() === target) return row;
    }
    return null;
  }

  function replaceWithClone(element) {
    if (!element || !element.parentNode) return null;
    var clone = element.cloneNode(true);
    element.parentNode.replaceChild(clone, element);
    return clone;
  }

  function ensureCardMeta(card, text) {
    if (!card) return null;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body) return null;
    var meta = body.querySelector('.goi-runtime-live-note');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'goi-runtime-live-note';
      meta.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:12px;background:#eff6ff;border:1px solid #dbeafe;color:#1e3a5f;font-size:12px;line-height:1.55;';
      body.appendChild(meta);
    }
    if (text !== undefined) meta.textContent = text;
    return meta;
  }

  function enhanceAuthCard() {
    var card = document.getElementById('ff-runtime-card-auth');
    if (!card || card.dataset.liveEnhanced === '1') return;
    var emailInput = card.querySelector('#ffx-auth-email');
    var phoneInput = card.querySelector('#ffx-auth-phone');
    var otpInput = card.querySelector('#ffx-auth-otp');
    var signupBtn = replaceWithClone(card.querySelector('#ffx-auth-signup'));
    var verifyBtn = replaceWithClone(card.querySelector('#ffx-auth-login'));
    var emailOtpBtn = replaceWithClone(card.querySelector('#ffx-auth-google'));
    var phoneOtpBtn = replaceWithClone(card.querySelector('#ffx-auth-facebook'));
    if (!signupBtn || !verifyBtn || !emailOtpBtn || !phoneOtpBtn) return;
    var user = getStoredUser() || {};
    if (emailInput && !emailInput.value) emailInput.value = String(user.email || '').trim();
    if (phoneInput && !phoneInput.value) phoneInput.value = String(user.phone || user.mobile || '').trim();
    signupBtn.textContent = 'Open Signup';
    verifyBtn.textContent = 'Verify OTP';
    emailOtpBtn.textContent = 'Send Email OTP';
    phoneOtpBtn.textContent = 'Send Mobile OTP';
    var note = ensureCardMeta(card, 'Session-ready identity linked. Use email/mobile OTP for secure dashboard actions.');
    signupBtn.addEventListener('click', function () { window.location.href = './signup.html'; });
    emailOtpBtn.addEventListener('click', async function () {
      var payload = { userKey: getRuntimeUserKey(), destination: String((emailInput && emailInput.value) || '').trim(), channel: 'email' };
      if (!payload.destination) { if (note) note.textContent = 'Active email address required for email OTP.'; return; }
      var data = await requestDashboardBusiness('POST', '/auth/otp/send', payload);
      if (data && data.ok) { card.dataset.latestOtpId = String(data.otpId || '').trim(); if (note) note.textContent = 'Email OTP sent successfully. Check your inbox and enter the OTP here.'; }
      else if (note) note.textContent = 'Email OTP send failed. Please retry in a moment.';
    });
    phoneOtpBtn.addEventListener('click', async function () {
      var payload = { userKey: getRuntimeUserKey(), destination: String((phoneInput && phoneInput.value) || '').trim(), channel: 'sms' };
      if (!payload.destination) { if (note) note.textContent = 'Active mobile number required for SMS OTP.'; return; }
      var data = await requestDashboardBusiness('POST', '/auth/otp/send', payload);
      if (data && data.ok) { card.dataset.latestOtpId = String(data.otpId || '').trim(); if (note) note.textContent = 'Mobile OTP sent successfully. Enter OTP and verify to confirm the action.'; }
      else if (note) note.textContent = 'Mobile OTP send failed. Please retry in a moment.';
    });
    verifyBtn.addEventListener('click', async function () {
      var otpId = String(card.dataset.latestOtpId || '').trim();
      var code = String((otpInput && otpInput.value) || '').trim();
      if (!otpId || !code) { if (note) note.textContent = 'First request OTP, then enter the received OTP to verify.'; return; }
      var data = await requestDashboardBusiness('POST', '/auth/otp/verify', { userKey: getRuntimeUserKey(), otpId: otpId, code: code });
      if (note) note.textContent = data && data.ok ? 'OTP verified successfully. Your dashboard identity is now confirmed.' : 'OTP verification failed. Please retry with a valid OTP.';
    });
    card.dataset.liveEnhanced = '1';
  }

  function enhanceProfileCard() {
    var card = document.getElementById('ff-runtime-card-profile');
    if (!card || card.dataset.profileEnhanced === '1') return;
    var user = getStoredUser() || {};
    var nameInput = card.querySelector('#ffx-profile-name');
    var addressInput = card.querySelector('#ffx-profile-address');
    var contact1Input = card.querySelector('#ffx-profile-contact1');
    var contact2Input = card.querySelector('#ffx-profile-contact2');
    var contact3Input = card.querySelector('#ffx-profile-contact3');
    if (nameInput && !nameInput.value) nameInput.value = String(user.fullname || user.name || '').trim();
    if (contact1Input && !contact1Input.value) contact1Input.value = String(user.phone || user.mobile || '').trim();
    if (addressInput && !addressInput.value) addressInput.value = String(user.address || user.city || '').trim();
    if (contact2Input && !contact2Input.value) contact2Input.value = String(user.emergencyContact1 || '').trim();
    if (contact3Input && !contact3Input.value) contact3Input.value = String(user.emergencyContact2 || '').trim();

    var saveBtn = replaceWithClone(card.querySelector('#ffx-profile-save'));
    var passwordBtn = replaceWithClone(card.querySelector('#ffx-profile-password'));
    var deleteBtn = replaceWithClone(card.querySelector('#ffx-profile-delete'));
    var note = ensureCardMeta(card, 'Profile card is linked with the main profile editor. Save here and dashboard profile stays in sync.');

    if (saveBtn) {
      saveBtn.textContent = 'Sync Profile Live';
      saveBtn.addEventListener('click', async function () {
        var nativeName = document.getElementById('profileNameInput');
        var nativeEmail = document.getElementById('profileEmailInput');
        var nativePhone = document.getElementById('profilePhoneInput');
        if (nativeName) nativeName.value = String((nameInput && nameInput.value) || '').trim();
        if (nativeEmail && !nativeEmail.value) nativeEmail.value = String(user.email || '').trim();
        if (nativePhone) nativePhone.value = String((contact1Input && contact1Input.value) || '').trim();
        if (typeof saveProfileDetails === 'function') {
          await saveProfileDetails();
          bootstrapIdentityFromUser(getStoredUser());
          if (note) note.textContent = 'Profile synced with dashboard and backend profile service.';
        } else if (note) {
          note.textContent = 'Main profile editor unavailable right now. Please refresh once.';
        }
      });
    }

    if (passwordBtn) {
      passwordBtn.textContent = 'Reset Password';
      passwordBtn.addEventListener('click', function () { window.location.href = './login.html#forgot-password'; });
    }

    if (deleteBtn) {
      deleteBtn.textContent = 'Delete Help';
      deleteBtn.addEventListener('click', async function () {
        var response = await requestDashboardBusiness('POST', '/support/ticket', {
          userKey: getRuntimeUserKey(),
          category: 'account',
          message: 'Customer requested account deletion help from customer dashboard profile card.'
        });
        if (typeof switchTab === 'function') switchTab('messages');
        if (note) note.textContent = response && response.ok !== false
          ? 'Account delete help ticket raised successfully. Support team will assist you.'
          : 'Support ticket could not be raised right now. Please retry.';
      });
    }

    card.dataset.profileEnhanced = '1';
  }

  async function loadSavedKycState(note) {
    var data = await requestDashboardBusiness('GET', '/feature/state/customer_dashboard_kyc?userKey=' + encodeURIComponent(getRuntimeUserKey()));
    var state = data && data.state ? data.state : null;
    if (!state || !state.payload) {
      if (note) note.textContent = 'No KYC submission saved yet. Upload your current documents to keep status live.';
      return;
    }
    var docs = safeArray(state.payload.documents).join(', ');
    if (note) note.textContent = 'Last saved KYC submission: ' + (docs || 'Document names saved') + ' | Status: ' + (state.status || 'submitted');
  }

  function enhanceKycCard() {
    var card = document.getElementById('ff-runtime-card-kyc');
    if (!card || card.dataset.kycEnhanced === '1') return;
    var uploadBtn = replaceWithClone(card.querySelector('#ffx-kyc-upload'));
    if (!uploadBtn) return;
    uploadBtn.textContent = 'Upload & Save Live Status';
    var note = ensureCardMeta(card);
    uploadBtn.addEventListener('click', async function () {
      var docIds = ['ffx-kyc-license', 'ffx-kyc-rc', 'ffx-kyc-insurance', 'ffx-kyc-pan', 'ffx-kyc-aadhar', 'ffx-kyc-police'];
      var docs = [];
      for (var i = 0; i < docIds.length; i += 1) {
        var input = card.querySelector('#' + docIds[i]);
        if (!input || !input.files || !input.files.length) continue;
        for (var j = 0; j < input.files.length; j += 1) docs.push(input.files[j].name);
      }
      if (!docs.length) { if (note) note.textContent = 'Please select at least one KYC document before saving live status.'; return; }
      var response = await requestDashboardBusiness('POST', '/feature/state', {
        userKey: getRuntimeUserKey(),
        featureId: 'customer_dashboard_kyc',
        category: 'customer',
        description: 'Customer dashboard KYC upload state',
        status: 'submitted',
        payload: { documents: docs, submittedAt: new Date().toISOString() }
      });
      if (note) note.textContent = response && response.ok !== false ? ('KYC documents saved live: ' + docs.join(', ')) : 'KYC live save failed. Please retry.';
    });
    loadSavedKycState(note);
    card.dataset.kycEnhanced = '1';
  }

  function enhanceLiveTrackingCard() {
    var card = document.getElementById('ff-runtime-card-live-tracking');
    if (!card || card.dataset.trackingEnhanced === '1') return;
    var startBtn = replaceWithClone(card.querySelector('#ffx-live-track-start'));
    var stopBtn = replaceWithClone(card.querySelector('#ffx-live-track-stop'));
    var statusNode = card.querySelector('#ffx-live-track-status');
    var note = ensureCardMeta(card, 'Live tracking session is ready. Start tracking to persist your latest trip position and status.');
    if (!startBtn || !stopBtn || !statusNode) return;

    function setTrackingStatus(text) {
      statusNode.textContent = text;
      if (note) note.textContent = text;
    }

    startBtn.textContent = 'Start Live Tracking';
    stopBtn.textContent = 'Stop Tracking';
    startBtn.addEventListener('click', async function () {
      if (!navigator.geolocation) { setTrackingStatus('Geolocation unavailable in this browser.'); return; }
      if (bridge.liveTrackingWatchId !== null && bridge.liveTrackingWatchId !== undefined) {
        setTrackingStatus('Live tracking is already running for this dashboard session.');
        return;
      }
      bridge.liveTrackingWatchId = navigator.geolocation.watchPosition(async function (position) {
        var lat = Number(position.coords && position.coords.latitude || 0);
        var lng = Number(position.coords && position.coords.longitude || 0);
        var accuracy = Number(position.coords && position.coords.accuracy || 0);
        var updateText = 'Tracking live at ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ' | Accuracy ' + accuracy.toFixed(0) + 'm';
        setTrackingStatus(updateText);
        await requestDashboardBusiness('POST', '/feature/state', {
          userKey: getRuntimeUserKey(),
          featureId: 'customer_dashboard_live_tracking',
          category: 'customer',
          description: 'Customer dashboard live tracking session',
          status: 'tracking',
          payload: { lat: lat, lng: lng, accuracy: accuracy, updatedAt: new Date().toISOString() }
        });
      }, function (error) {
        setTrackingStatus('Tracking error: ' + String((error && error.message) || 'unknown'));
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
      setTrackingStatus('Live tracking started. Waiting for GPS position...');
    });
    stopBtn.addEventListener('click', async function () {
      if (bridge.liveTrackingWatchId !== null && bridge.liveTrackingWatchId !== undefined && navigator.geolocation) {
        navigator.geolocation.clearWatch(bridge.liveTrackingWatchId);
      }
      bridge.liveTrackingWatchId = null;
      setTrackingStatus('Tracking stopped for this session.');
      await requestDashboardBusiness('POST', '/feature/state', {
        userKey: getRuntimeUserKey(),
        featureId: 'customer_dashboard_live_tracking',
        category: 'customer',
        description: 'Customer dashboard live tracking session',
        status: 'stopped',
        payload: { stoppedAt: new Date().toISOString() }
      });
    });
    card.dataset.trackingEnhanced = '1';
  }

  function enhanceRuntimeCards() {
    enhanceAuthCard();
    enhanceProfileCard();
    enhanceKycCard();
    enhanceLiveTrackingCard();
  }

  function observeRuntimeCards() {
    if (bridge.runtimeObserverInstalled) return;
    bridge.runtimeObserverInstalled = true;
    var mountIds = ['customerRuntimeActiveMount', 'customerRuntimeHistoryMount', 'customerRuntimeMessagesMount', 'customerRuntimeWalletMount', 'customerRuntimeProfileMount'];
    var observer = new MutationObserver(function () { enhanceRuntimeCards(); });
    for (var i = 0; i < mountIds.length; i += 1) {
      var mount = document.getElementById(mountIds[i]);
      if (mount) observer.observe(mount, { childList: true, subtree: true });
    }
    enhanceRuntimeCards();
  }

  bridge.bootstrapIdentityFromUser = bootstrapIdentityFromUser;
  bridge.getBookings = getBookings;
  bridge.findRideById = findRideById;
  bridge.getRuntimeUserKey = getRuntimeUserKey;
  bridge.requestBusiness = requestDashboardBusiness;
  bridge.observeRuntimeCards = observeRuntimeCards;
  bridge.enhanceRuntimeCards = enhanceRuntimeCards;
  bridge.liveTrackingWatchId = null;
  window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__ = bridge;
  bootstrapIdentityFromUser(getStoredUser());

  if (typeof loadDashboard === 'function') {
    var originalLoadDashboard = loadDashboard;
    window.loadDashboard = async function () {
      var context = this;
      var args = arguments;
      var syncPromise = getBookings({ forceSync: false }).catch(function () { return []; });
      var completedQuickly = await waitForSoftSync(syncPromise, 1200);
      var result = await originalLoadDashboard.apply(context, args);
      if (!completedQuickly) {
        syncPromise.then(function () {
          return originalLoadDashboard.apply(context, args);
        }).catch(function () {});
      }
      return result;
    };
  }

  if (typeof loadRides === 'function') {
    var originalLoadRides = loadRides;
    window.loadRides = async function () {
      var context = this;
      var args = arguments;
      var syncPromise = getBookings({ forceSync: false }).catch(function () { return []; });
      var completedQuickly = await waitForSoftSync(syncPromise, 900);
      var result = await originalLoadRides.apply(context, args);
      if (!completedQuickly) {
        syncPromise.then(function () {
          return originalLoadRides.apply(context, args);
        }).catch(function () {});
      }
      return result;
    };
  }

  if (typeof showPaymentModal === 'function') {
    var originalShowPaymentModal = showPaymentModal;
    window.showPaymentModal = async function () {
      await waitForSoftSync(getBookings({ forceSync: false }).catch(function () { return []; }), 900);
      return originalShowPaymentModal.apply(this, arguments);
    };
  }

  if (typeof checkForCompletedRides === 'function') {
    var originalCheckForCompletedRides = checkForCompletedRides;
    window.checkForCompletedRides = async function () {
      await waitForSoftSync(getBookings({ forceSync: false }).catch(function () { return []; }), 700);
      return originalCheckForCompletedRides.apply(this, arguments);
    };
  }

  if (typeof viewReceipt === 'function') {
    var originalViewReceipt = viewReceipt;
    window.viewReceipt = async function () {
      await waitForSoftSync(getBookings({ forceSync: false }).catch(function () { return []; }), 900);
      return originalViewReceipt.apply(this, arguments);
    };
  }

  if (typeof selectPaymentMethod === 'function') {
    var originalSelectPaymentMethod = selectPaymentMethod;
    window.selectPaymentMethod = async function (method) {
      await waitForSoftSync(getBookings({ forceSync: false }).catch(function () { return []; }), 900);
      var result = originalSelectPaymentMethod.apply(this, arguments);
      var ride = findRideById(typeof currentRideForPayment !== 'undefined' ? currentRideForPayment : '');
      if (ride) {
        await requestDashboardBusiness('POST', '/notifications/send', {
          userKey: getRuntimeUserKey(),
          type: 'payment',
          channel: 'in_app',
          title: 'Payment Completed',
          message: 'Payment marked complete for booking ' + (ride.bookingId || ride.id || '') + ' via ' + String(method || 'payment mode') + '.'
        });
        await syncRuntimeBusinessState(safeArray(window.__GOINDIARIDE_CUSTOMER_DASHBOARD_BOOKINGS__), getStoredUser());
      }
      return result;
    };
  }

  window.trackRide = async function () {
    await getBookings({ forceSync: false });
    if (typeof switchTab === 'function') switchTab('active');
    setTimeout(function () {
      var card = document.getElementById('ff-runtime-card-live-tracking');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var startBtn = card ? card.querySelector('#ffx-live-track-start') : null;
      if (startBtn) startBtn.click();
    }, 180);
    if (typeof showSuccessToast === 'function') showSuccessToast('Live tracking panel opened for your selected ride.', 'Tracking Ready');
  };

  window.rateRide = async function (rideId) {
    var rating = Number(prompt('Rate this ride (1-5 stars):', '5'));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
    var feedback = prompt('Optional feedback for this ride:', '') || '';
    var response = await requestDashboardBusiness('POST', '/reviews', {
      userKey: getRuntimeUserKey(),
      targetType: 'ride',
      targetId: String(rideId || '').trim() || 'ride',
      rating: rating,
      comment: feedback,
      locale: 'en-IN'
    });
    if (typeof switchTab === 'function') switchTab('history');
    setTimeout(function () {
      var card = document.getElementById('ff-runtime-card-rating') || document.getElementById('ff-runtime-card-reviews');
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
    if (typeof showSuccessToast === 'function') {
      showSuccessToast(response && response.ok !== false ? ('You rated this ride ' + rating + ' star.') : 'Rating submit request sent.', 'Thanks for rating');
    }
  };

  window.addEventListener('load', function () {
    bootstrapIdentityFromUser(getStoredUser());
    scheduleRuntimeIdle(function () {
      getBookings({ forceSync: true, background: true }).catch(function () { return null; });
    }, 7000);
    scheduleRuntimeIdle(function () {
      observeRuntimeCards();
      enhanceRuntimeCards();
    }, 3500);
  });
})();
