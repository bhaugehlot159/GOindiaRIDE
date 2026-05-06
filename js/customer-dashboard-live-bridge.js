(function () {
  'use strict';

  var RUNTIME_HISTORY_SYNC_KEY = 'goindiaride.customer.dashboard.runtime-history-sync.v1';
  var bridge = window.__GOINDIARIDE_CUSTOMER_RUNTIME_BRIDGE__ || {};
  window.__GOINDIARIDE_DISABLE_DEMO_CHAT__ = true;

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

  function readLocalBookings() {
    return safeArray(parseJson(localStorage.getItem('bookings') || '[]', []));
  }

  function writeLocalBookings(rows) {
    try { localStorage.setItem('bookings', JSON.stringify(safeArray(rows))); } catch (_error) {}
  }

  function getBookingRef(row) {
    return String((row && (row.bookingId || row.id)) || '').trim();
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
      customerId: String((user && (user.id || user.userId)) || '').trim(),
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
      adminReviewStatus: normalizeTextValue(item && item.adminReviewStatus, 40) || 'pending'
    };
  }

  function hasPendingLocalEdit(row) {
    return String((row && row.editSyncStatus) || '').trim().toLowerCase() === 'pending';
  }

  function mergeBackendBookingRow(existing, mapped) {
    if (!existing || !hasPendingLocalEdit(existing)) {
      return Object.assign({}, existing || {}, mapped);
    }

    return Object.assign({}, mapped, existing, {
      liveBackendSnapshot: mapped,
      editSyncStatus: 'pending',
      editSyncConflict: true
    });
  }

  function mergeBackendBookingsIntoLocal(items, user) {
    var localRows = readLocalBookings();
    var currentUserId = String((user && (user.id || user.userId)) || '').trim();
    var localCurrentUserRows = localRows.filter(function (row) { return String((row && row.customerId) || '').trim() === currentUserId; });
    var localOtherRows = localRows.filter(function (row) { return String((row && row.customerId) || '').trim() !== currentUserId; });
    var mergedMap = {};
    localCurrentUserRows.forEach(function (row) { var ref = getBookingRef(row); if (ref) mergedMap[ref] = Object.assign({}, row); });
    safeArray(items).forEach(function (item) {
      var mapped = mapBackendBookingToLocal(item, user);
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

    for (var i = 0; i < bookings.length; i += 1) {
      var booking = bookings[i];
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
    var localRows = readLocalBookings().filter(function (row) {
      return String((row && row.customerId) || '').trim() === String((user && (user.id || user.userId)) || '').trim();
    });
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

  if (typeof startDemoChat === 'function') {
    window.startDemoChat = function () { return false; };
  }

  if (typeof loadDashboard === 'function') {
    var originalLoadDashboard = loadDashboard;
    window.loadDashboard = async function () {
      await getBookings({ forceSync: true });
      return originalLoadDashboard.apply(this, arguments);
    };
  }

  if (typeof loadRides === 'function') {
    var originalLoadRides = loadRides;
    window.loadRides = async function () {
      await getBookings({ forceSync: false });
      return originalLoadRides.apply(this, arguments);
    };
  }

  if (typeof showPaymentModal === 'function') {
    var originalShowPaymentModal = showPaymentModal;
    window.showPaymentModal = async function () {
      await getBookings({ forceSync: false });
      return originalShowPaymentModal.apply(this, arguments);
    };
  }

  if (typeof checkForCompletedRides === 'function') {
    var originalCheckForCompletedRides = checkForCompletedRides;
    window.checkForCompletedRides = async function () {
      await getBookings({ forceSync: false });
      return originalCheckForCompletedRides.apply(this, arguments);
    };
  }

  if (typeof viewReceipt === 'function') {
    var originalViewReceipt = viewReceipt;
    window.viewReceipt = async function () {
      await getBookings({ forceSync: false });
      return originalViewReceipt.apply(this, arguments);
    };
  }

  if (typeof selectPaymentMethod === 'function') {
    var originalSelectPaymentMethod = selectPaymentMethod;
    window.selectPaymentMethod = async function (method) {
      await getBookings({ forceSync: false });
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
    getBookings({ forceSync: true }).catch(function () { return null; });
    observeRuntimeCards();
    enhanceRuntimeCards();
  });
})();
