(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_FUTURE_RUNTIME_EXTENSIONS_LOADED__ = true;

  var EVENT_NAME = 'goindiaride:future-feature-item-ready';
  var API_BASE = '/api/future-runtime';
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
      executeFeature(feature, 'profile-save', {
        name: (body.querySelector('#ffx-profile-name') || {}).value || '',
        address: (body.querySelector('#ffx-profile-address') || {}).value || '',
        contact1: (body.querySelector('#ffx-profile-contact1') || {}).value || '',
        contact2: (body.querySelector('#ffx-profile-contact2') || {}).value || '',
        contact3: (body.querySelector('#ffx-profile-contact3') || {}).value || '',
        language: (body.querySelector('#ffx-profile-lang') || {}).value || ''
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
      executeFeature(feature, 'coupon-apply', { code: (body.querySelector('#ffx-payment-coupon') || {}).value || '' });
    });
    body.querySelector('#ffx-payment-wallet-add').addEventListener('click', function () {
      executeFeature(feature, 'wallet-add', { amount: (body.querySelector('#ffx-payment-wallet') || {}).value || '' });
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
      executeFeature(feature, 'rating-submit', {
        rating: selected,
        feedback: (body.querySelector('#ffx-rating-feedback') || {}).value || ''
      });
    });
  }

  function applyModules(feature) {
    var text = normalize(feature.description);

    if (hasAny(text, ['signup', 'register', 'login', 'otp', 'google', 'facebook'])) applyAuthModule(feature);
    if (hasAny(text, ['profile', 'photo', 'address', 'privacy', 'password', 'delete account', 'emergency contact', 'email', 'phone'])) applyProfileModule(feature);
    if (hasAny(text, ['document', 'kyc', 'license', 'rc', 'pan', 'aadhar', 'insurance', 'id proof', 'verification'])) applyProfileModule(feature);
    if (hasAny(text, ['payment', 'upi', 'paypal', 'wallet', 'coupon', 'refund', 'advance'])) applyPaymentModule(feature);
    if (hasAny(text, ['emergency', 'police', 'ambulance', 'sos', 'helpline', '24x7'])) applyEmergencyModule(feature);
    if (hasAny(text, ['tourist', 'district', 'history', 'fort', 'palace', 'temple', 'museum', 'festival', 'parking'])) applyTourismModule(feature);
    if (hasAny(text, ['rating', 'review', 'feedback', 'star'])) applyRatingModule(feature);
    if (hasAny(text, ['local', 'outstation', 'rental', 'airport', 'ride type'])) applyRideModule(feature);
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

