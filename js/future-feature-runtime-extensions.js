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

  function applyDistrictDirectoryModule(feature) {
    var card = ensureCard('district-directory', 'Rajasthan District Directory');
    if (!card) return;
    var body = card.querySelector('.ff-runtime-card-body');
    if (!body || body.querySelector('#ffx-district-refresh')) return;

    body.innerHTML = [
      '<div style=\"display:flex;gap:8px;flex-wrap:wrap;\">',
      '<button type=\"button\" id=\"ffx-district-refresh\" style=\"padding:8px 10px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;\">Load Districts</button>',
      '<input id=\"ffx-district-search\" placeholder=\"Search district\" style=\"padding:8px;border:1px solid #c8d8f8;border-radius:8px;min-width:180px;\"/>',
      '</div>',
      '<div id=\"ffx-district-list\" style=\"margin-top:8px;max-height:220px;overflow:auto;background:#fff;border:1px solid #dbe7ff;border-radius:8px;padding:8px;font-size:12px;\"></div>'
    ].join('');

    var list = body.querySelector('#ffx-district-list');
    var cache = [];

    function render(items) {
      if (!list) return;
      if (!items.length) {
        list.textContent = 'No districts found.';
        return;
      }
      list.innerHTML = items.map(function (district, index) {
        return '<span style=\"display:inline-block;margin:4px;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#24416d;\">' + (index + 1) + '. ' + escapeHtml(district) + '</span>';
      }).join('');
    }

    function loadDistricts() {
      getBusiness('/districts').then(function (data) {
        cache = data && Array.isArray(data.districts) ? data.districts : [];
        render(cache);
        executeFeature(feature, 'districts-loaded', { count: cache.length });
      });
    }

    body.querySelector('#ffx-district-refresh').addEventListener('click', loadDistricts);
    body.querySelector('#ffx-district-search').addEventListener('input', function () {
      var q = normalize(this.value);
      if (!q) {
        render(cache);
        return;
      }
      render(cache.filter(function (item) {
        return normalize(item).indexOf(q) !== -1;
      }));
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

  function applyModules(feature) {
    var text = normalize(feature.description);

    if (hasAny(text, ['signup', 'register', 'login', 'otp', 'google', 'facebook'])) applyAuthModule(feature);
    if (hasAny(text, ['profile', 'photo', 'address', 'privacy', 'password', 'delete account', 'emergency contact', 'email', 'phone'])) applyProfileModule(feature);
    if (hasAny(text, ['document', 'kyc', 'license', 'rc', 'pan', 'aadhar', 'insurance', 'id proof', 'verification'])) applyKycModule(feature);
    if (hasAny(text, ['payment', 'upi', 'paypal', 'wallet', 'coupon', 'refund', 'advance'])) applyPaymentModule(feature);
    if (hasAny(text, ['emergency', 'police', 'ambulance', 'sos', 'helpline', '24x7'])) applyEmergencyModule(feature);
    if (hasAny(text, ['tourist', 'district', 'history', 'fort', 'palace', 'temple', 'museum', 'festival', 'parking'])) applyTourismModule(feature);
    if (hasAny(text, ['district', 'all district', '50 district', 'rajasthan district', 'jaipur', 'udaipur', 'jodhpur'])) applyDistrictDirectoryModule(feature);
    if (hasAny(text, ['rating', 'review', 'feedback', 'star'])) applyRatingModule(feature);
    if (hasAny(text, ['local', 'outstation', 'rental', 'airport', 'ride type'])) applyRideModule(feature);
    if (hasAny(text, ['driver', 'vehicle', 'hatchback', 'sedan', 'suv', 'ac', 'non-ac', 'seating'])) applyDriverVehicleModule(feature);
    if (hasAny(text, ['accept', 'reject', 'extra booking', 'cancel'])) applyBookingOpsModule(feature);
    if (hasAny(text, ['live location', 'tracking', 'gps'])) applyLiveTrackingModule(feature);
    if (hasAny(text, ['hotel', 'restaurant', 'shop', 'commission', 'guest house'])) applyPartnerCommissionModule(feature);
    if (hasAny(text, ['listing', 'searchable', 'categorized', 'specialty', 'contact'])) applyListingModule(feature);
    if (hasAny(text, ['tour package', 'package booking', 'family', 'honeymoon', 'adventure', 'itinerary', 'book now'])) applyTourPackageModule(feature);
    if (hasAny(text, ['referral', 'affiliate', 'utm', 'coupon', 'partner tracking'])) applyReferralAffiliateModule(feature);
    if (hasAny(text, ['fare', 'currency', 'distance', 'season', 'auto-calculated'])) applyFareEstimatorModule(feature);
    if (hasAny(text, ['disclaimer', 'liability', 'terms consent', 'terms checkbox'])) applyTermsConsentModule(feature);
    if (hasAny(text, ['help desk', 'helpdesk', 'support', 'ticket'])) applySupportHelpdeskModule(feature);
    if (hasAny(text, ['dashboard', 'monitoring', 'admin panel', 'summary', 'performance logs'])) applyAdminMonitoringModule(feature);
    if (hasAny(text, ['ai', 'recommendation', 'smart', 'chatbot', 'suggestion'])) applyAIRecommendationModule(feature);
    if (hasAny(text, ['review', 'rating', 'real user review', 'social proof'])) applyReviewModule(feature);
    if (hasAny(text, ['api', 'webhook', 'integration', 'partner integration'])) applyPartnerIntegrationModule(feature);
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
