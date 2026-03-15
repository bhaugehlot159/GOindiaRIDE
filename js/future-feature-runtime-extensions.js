(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__ = true;

  var EVENT_NAME = 'goindiaride:future-feature-item-ready';
  var API_BASE = '/api/future-runtime';
  var BUSINESS_API_BASE = '/api/future-runtime-business';
  var registry = window.__GOINDIARIDE_FUTURE_FEATURES || {};
  var extState = window.__GOINDIARIDE_FUTURE_RUNTIME_EXT_STATE || {
    activatedKeys: {},
    syncKeys: {}
  };
  window.__GOINDIARIDE_FUTURE_RUNTIME_EXT_STATE = extState;

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

  function getJson(basePath, path) {
    if (typeof window.fetch !== 'function') return Promise.resolve(null);
    return window.fetch(basePath + path)
      .then(function (response) {
        if (!response.ok) return null;
        return response.json().catch(function () { return null; });
      })
      .catch(function () { return null; });
  }

  function postBusiness(path, payload) {
    if (typeof window.fetch !== 'function') return Promise.resolve(null);
    return window.fetch(BUSINESS_API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json().catch(function () { return null; });
      })
      .catch(function () { return null; });
  }

  function getBusiness(path) {
    return getJson(BUSINESS_API_BASE, path);
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
    var root = document.querySelector('.dashboard-main, .dashboard-content, .booking-panel, .container, main, body');
    if (!root) return null;

    var box = document.getElementById('ff-runtime-extension-workspace');
    if (box) return box;

    box = document.createElement('section');
    box.id = 'ff-runtime-extension-workspace';
    box.style.cssText = 'margin:12px 0;display:grid;gap:10px;';
    if (root === document.body) root.insertBefore(box, root.firstChild);
    else root.appendChild(box);
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
      '</div>'
    ].join('');

    body.querySelector('#ffx-payment-apply').addEventListener('click', function () {
      var code = (body.querySelector('#ffx-payment-coupon') || {}).value || '';
      executeFeature(feature, 'coupon-apply', { code: code });
      postBusiness('/notifications/send', {
        userKey: currentUserKey(),
        type: 'coupon',
        channel: 'in_app',
        title: 'Coupon Applied',
        message: code ? ('Coupon ' + code + ' applied successfully.') : 'Coupon apply action performed.'
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
      });
    });
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
    var pickup = document.querySelector('input[name*=\"pickup\" i], input[id*=\"pickup\" i]');
    var dropoff = document.querySelector('input[name*=\"drop\" i], input[id*=\"drop\" i]');
    if (pickup) pickup.setAttribute('list', listId);
    if (dropoff) dropoff.setAttribute('list', listId);

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
          '<div id=\"ffx-tourism-list\" style=\"margin-top:8px;max-height:180px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
        ].join('');

        var districtInput = body.querySelector('#ffx-tourism-district');
        var listEl = body.querySelector('#ffx-tourism-list');

        body.querySelector('#ffx-tourism-load').addEventListener('click', function () {
          var district = (districtInput || {}).value || '';
          getBusiness('/tourism/places?district=' + encodeURIComponent(district)).then(function (data) {
            var items = data && Array.isArray(data.items) ? data.items : [];
            if (!listEl) return;
            if (!items.length) {
              listEl.textContent = 'No places found';
              return;
            }
            listEl.innerHTML = items.slice(0, 80).map(function (item) {
              return '<div style=\"padding:5px 0;border-bottom:1px solid #edf2ff;\"><strong>' + item.name + '</strong> (' + item.district + ') - ' + (item.openTime || 'N/A') + ' to ' + (item.closeTime || 'N/A') + '</div>';
            }).join('');
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
          });
          executeFeature(feature, 'tourism-place-add', { district: district, name: placeName });
        });
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
      '<button type=\"button\" id=\"ffx-rating-save\" style=\"margin-top:8px;padding:8px;border:0;border-radius:8px;background:#16a34a;color:#fff;\">Save Rating</button>'
    ].join('');

    var selected = 0;
    var buttons = body.querySelectorAll('[data-rating]');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function () {
        selected = Number(this.getAttribute('data-rating')) || 0;
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

  function applyModules(feature) {
    var text = normalize(feature.description);

    if (hasAny(text, ['signup', 'register', 'login', 'otp', 'google', 'facebook'])) applyAuthModule(feature);
    if (hasAny(text, ['profile', 'photo', 'address', 'privacy', 'password', 'delete account', 'emergency contact', 'email', 'phone'])) applyProfileModule(feature);
    if (hasAny(text, ['document', 'kyc', 'license', 'rc', 'pan', 'aadhar', 'insurance', 'id proof', 'verification'])) applyKycModule(feature);
    if (hasAny(text, ['payment', 'upi', 'paypal', 'wallet', 'coupon', 'refund', 'advance'])) applyPaymentModule(feature);
    if (hasAny(text, ['emergency', 'police', 'ambulance', 'sos', 'helpline', '24x7'])) applyEmergencyModule(feature);
    if (hasAny(text, ['tourist', 'district', 'history', 'fort', 'palace', 'temple', 'museum', 'festival', 'parking'])) applyTourismModule(feature);
    if (hasAny(text, ['rating', 'review', 'feedback', 'star'])) applyRatingModule(feature);
    if (hasAny(text, ['local', 'outstation', 'rental', 'airport', 'ride type'])) applyRideModule(feature);
    if (hasAny(text, ['driver', 'vehicle', 'hatchback', 'sedan', 'suv', 'ac', 'non-ac', 'seating'])) applyDriverVehicleModule(feature);
    if (hasAny(text, ['accept', 'reject', 'extra booking', 'cancel'])) applyBookingOpsModule(feature);
    if (hasAny(text, ['live location', 'tracking', 'gps'])) applyLiveTrackingModule(feature);
    if (hasAny(text, ['hotel', 'restaurant', 'shop', 'commission', 'guest house'])) applyPartnerCommissionModule(feature);
    if (hasAny(text, ['why trust', 'real trip photos', 'trip preview', 'social proof', 'experience'])) applyTrustBrandModule(feature);
    if (hasAny(text, ['road rule', 'government', 'law', 'compliance', 'legal'])) applyPolicyRulesModule(feature);
    if (hasAny(text, ['notification', 'alert', 'reminder', 'sms', 'email', 'whatsapp', 'push'])) applyNotificationCenterModule(feature);
    if (hasAny(text, ['travel card', 'digital travel card', 'tourist card'])) applyTravelCardModule(feature);
    if (hasAny(text, ['ride history', 'history', 'past booking', 'export', 'invoice'])) applyRideHistoryModule(feature);
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
