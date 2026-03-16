(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_FUTURE_RUNTIME_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_FUTURE_RUNTIME_LOADED__ = true;

  var EVENT_NAME = 'goindiaride:future-feature-item-ready';
  var registry = window.__GOINDIARIDE_FUTURE_FEATURES || {};
  var state = window.__GOINDIARIDE_FUTURE_RUNTIME_STATE || {
    activeFeatureKeys: {},
    activeFeatures: []
  };
  window.__GOINDIARIDE_FUTURE_RUNTIME_STATE = state;

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
  var ENHANCEMENT_ALLOWLIST = {
    booking: toSet(['payment', 'language', 'emergency', 'rating', 'tourism', 'cancellation', 'genericPanel']),
    customer: toSet(['payment', 'language', 'emergency', 'rating', 'tourism', 'genericPanel']),
    driver: toSet(['language', 'emergency', 'rating', 'cancellation', 'genericPanel']),
    admin: toSet(['genericPanel']),
    generic: {}
  };
  var SHOW_FLOATING_PANEL = RUNTIME_DEBUG || PAGE_ROLE === 'admin';

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

  function isEnhancementAllowed(key, feature) {
    if (!isCategoryAllowed(feature)) return false;
    if (RUNTIME_DEBUG) return true;
    var allowed = ENHANCEMENT_ALLOWLIST[PAGE_ROLE] || {};
    return !!allowed[key];
  }

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  function hasAny(text, keywords) {
    var haystack = normalize(text);
    for (var i = 0; i < keywords.length; i += 1) {
      if (haystack.indexOf(normalize(keywords[i])) !== -1) {
        return true;
      }
    }
    return false;
  }

  function ensureStyle() {
    if (!SHOW_FLOATING_PANEL) {
      return;
    }
    if (document.getElementById('future-feature-runtime-style')) {
      return;
    }
    var style = document.createElement('style');
    style.id = 'future-feature-runtime-style';
    style.textContent = '' +
      '.ff-runtime-panel{position:fixed;right:14px;bottom:14px;z-index:9999;width:min(360px,92vw);max-height:40vh;overflow:auto;padding:12px;border-radius:12px;background:#0f2747;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:Segoe UI,Tahoma,sans-serif}' +
      '.ff-runtime-panel h4{margin:0 0 8px 0;font-size:15px}' +
      '.ff-runtime-list{margin:0;padding:0;list-style:none;display:grid;gap:6px}' +
      '.ff-runtime-item{padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.12);font-size:12px;line-height:1.35}' +
      '.ff-runtime-chip{display:inline-block;margin-right:6px;padding:2px 6px;border-radius:999px;background:#2d82ff;font-size:11px;font-weight:700}';
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (!SHOW_FLOATING_PANEL) {
      return null;
    }
    var panel = document.getElementById('future-feature-runtime-panel');
    if (panel) {
      return panel;
    }

    panel = document.createElement('aside');
    panel.id = 'future-feature-runtime-panel';
    panel.className = 'ff-runtime-panel';
    panel.innerHTML = [
      '<h4>Enabled Feature Blocks</h4>',
      '<ul id="future-feature-runtime-list" class="ff-runtime-list"></ul>'
    ].join('');
    document.body.appendChild(panel);
    return panel;
  }

  function getFeatureFromDetail(detail) {
    var blockKey = detail && detail.blockKey;
    var featureId = detail && detail.featureId;
    if (!blockKey || !registry[blockKey] || !registry[blockKey].length) {
      return null;
    }

    var list = registry[blockKey];
    for (var i = 0; i < list.length; i += 1) {
      if (!featureId || list[i].featureId === featureId) {
        return list[i];
      }
    }
    return list[0] || null;
  }

  function upsertPanelItem(feature) {
    if (!SHOW_FLOATING_PANEL) {
      return;
    }
    ensureStyle();
    ensurePanel();

    var list = document.getElementById('future-feature-runtime-list');
    if (!list) {
      return;
    }

    var id = 'ff-runtime-item-' + (feature.featureId || 'unknown');
    if (document.getElementById(id)) {
      return;
    }

    var li = document.createElement('li');
    li.id = id;
    li.className = 'ff-runtime-item';
    var category = feature.category || 'general';
    var featureId = feature.featureId || 'NA';
    var description = feature.description || 'No description available';
    li.innerHTML = '<span class="ff-runtime-chip">' + featureId + '</span>' +
      '<strong>[' + category + ']</strong> ' + description;
    list.appendChild(li);
  }

  function ensureSelectOption(selectEl, optionValue, optionLabel) {
    if (!selectEl) {
      return;
    }
    var hasOption = false;
    for (var i = 0; i < selectEl.options.length; i += 1) {
      var current = normalize(selectEl.options[i].value + ' ' + selectEl.options[i].text);
      if (current.indexOf(normalize(optionValue)) !== -1 || current.indexOf(normalize(optionLabel)) !== -1) {
        hasOption = true;
        break;
      }
    }
    if (!hasOption) {
      var option = document.createElement('option');
      option.value = optionValue;
      option.textContent = optionLabel;
      selectEl.appendChild(option);
    }
  }

  function applyPaymentEnhancements(feature) {
    var selectors = [
      'select[name*="payment" i]',
      'select[id*="payment" i]',
      '#paymentMethod',
      '#payment-method'
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var selectEl = document.querySelector(selectors[i]);
      if (selectEl) {
        ensureSelectOption(selectEl, 'upi', 'UPI');
        ensureSelectOption(selectEl, 'paypal', 'PayPal');
        ensureSelectOption(selectEl, 'wallet', 'Wallet Balance');
      }
    }

    var bookingContainer = document.querySelector('.booking-form, .booking-panel, .card, main, body');
    if (bookingContainer && !document.getElementById('ff-payment-trust-note')) {
      var note = document.createElement('div');
      note.id = 'ff-payment-trust-note';
      note.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #d7e7ff;background:#f7fbff;border-radius:8px;font-size:13px;color:#1a3f6e;';
      note.textContent = 'Payment trust enabled: UPI / PayPal / Wallet options are now available for this feature block.';
      bookingContainer.appendChild(note);
    }

    feature.implemented = true;
  }

  function applyLanguageEnhancements(feature) {
    var selectors = [
      'select[name*="lang" i]',
      'select[id*="lang" i]',
      '#languagePreference',
      '#language'
    ];

    for (var i = 0; i < selectors.length; i += 1) {
      var selectEl = document.querySelector(selectors[i]);
      if (selectEl) {
        ensureSelectOption(selectEl, 'hindi', 'Hindi');
        ensureSelectOption(selectEl, 'english', 'English');
        ensureSelectOption(selectEl, 'rajasthani', 'Rajasthani');
      }
    }

    feature.implemented = true;
  }

  function applyEmergencyEnhancements(feature) {
    if (document.getElementById('ff-emergency-bar')) {
      feature.implemented = true;
      return;
    }

    var host = document.querySelector('.dashboard-main, .card, main, body');
    if (!host) {
      return;
    }

    var bar = document.createElement('div');
    bar.id = 'ff-emergency-bar';
    bar.style.cssText = 'margin:10px 0;padding:10px;border:1px solid #ffd7d7;background:#fff4f4;border-radius:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;';
    bar.innerHTML = [
      '<strong style="color:#b91c1c;font-size:13px;">Emergency Quick Actions:</strong>',
      '<button type="button" data-phone="100" style="border:0;border-radius:6px;padding:7px 10px;background:#1d4ed8;color:#fff;cursor:pointer;">Police 100</button>',
      '<button type="button" data-phone="108" style="border:0;border-radius:6px;padding:7px 10px;background:#dc2626;color:#fff;cursor:pointer;">Ambulance 108</button>',
      '<button type="button" data-sos="1" style="border:0;border-radius:6px;padding:7px 10px;background:#7c3aed;color:#fff;cursor:pointer;">SOS Alert</button>'
    ].join('');

    bar.addEventListener('click', function (event) {
      var phoneButton = event.target.closest('[data-phone]');
      var sosButton = event.target.closest('[data-sos]');
      if (phoneButton) {
        window.location.href = 'tel:' + phoneButton.getAttribute('data-phone');
      } else if (sosButton) {
        window.alert('SOS alert has been triggered for this demo block.');
      }
    });

    host.insertBefore(bar, host.firstChild);
    feature.implemented = true;
  }

  function applyRatingEnhancements(feature) {
    if (document.getElementById('ff-driver-rating-widget')) {
      feature.implemented = true;
      return;
    }

    var host = document.querySelector('.ride-history, .trip-history, .card, main, body');
    if (!host) {
      return;
    }

    var panel = document.createElement('section');
    panel.id = 'ff-driver-rating-widget';
    panel.style.cssText = 'margin:10px 0;padding:12px;border:1px solid #dbe7ff;background:#f8fbff;border-radius:10px;';
    panel.innerHTML = [
      '<div style="font-weight:700;color:#173b67;margin-bottom:8px;">Driver Rating (1-5 Stars)</div>',
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">',
      '<button type="button" data-rt="1">1★</button>',
      '<button type="button" data-rt="2">2★</button>',
      '<button type="button" data-rt="3">3★</button>',
      '<button type="button" data-rt="4">4★</button>',
      '<button type="button" data-rt="5">5★</button>',
      '</div>',
      '<div id="ff-driver-rating-result" style="margin-top:8px;font-size:12px;color:#37567b;">No rating selected</div>'
    ].join('');

    panel.addEventListener('click', function (event) {
      var button = event.target.closest('[data-rt]');
      if (!button) {
        return;
      }
      var rating = button.getAttribute('data-rt');
      var result = panel.querySelector('#ff-driver-rating-result');
      if (result) {
        result.textContent = 'Saved rating: ' + rating + ' star(s)';
      }
    });

    host.appendChild(panel);
    feature.implemented = true;
  }

  function applyTourismEnhancements(feature) {
    var pickup = document.querySelector('input[name*="pickup" i], input[id*="pickup" i]');
    var dropoff = document.querySelector('input[name*="drop" i], input[id*="drop" i]');

    if (!pickup && !dropoff) {
      return;
    }

    var listId = 'ff-tourist-suggestions';
    var datalist = document.getElementById(listId);
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = listId;
      var fallbackPlaces = [
        'Jaipur Fort Area', 'Amer Fort', 'Hawa Mahal', 'City Palace', 'Jantar Mantar',
        'Jodhpur Mehrangarh', 'Udaipur City Palace', 'Pushkar Temple', 'Chittorgarh Fort'
      ];

      for (var i = 0; i < fallbackPlaces.length; i += 1) {
        var option = document.createElement('option');
        option.value = fallbackPlaces[i];
        datalist.appendChild(option);
      }
      document.body.appendChild(datalist);
    }

    if (pickup) {
      pickup.setAttribute('list', listId);
    }
    if (dropoff) {
      dropoff.setAttribute('list', listId);
    }

    feature.implemented = true;
  }

  function applyCancellationEnhancements(feature) {
    if (document.getElementById('ff-cancel-policy-note')) {
      feature.implemented = true;
      return;
    }

    var host = document.querySelector('.booking-form, .booking-panel, .card, main, body');
    if (!host) {
      return;
    }

    var note = document.createElement('div');
    note.id = 'ff-cancel-policy-note';
    note.style.cssText = 'margin-top:10px;padding:10px;border:1px solid #f3d9a3;background:#fffaf0;border-radius:8px;font-size:13px;color:#6c4a0b;';
    note.textContent = 'Cancellation policy enabled: pickup point ke baad cancellation restricted / policy-based charge apply hoga.';
    host.appendChild(note);

    feature.implemented = true;
  }

  function applyGenericEnhancement(feature) {
    if (isEnhancementAllowed('genericPanel', feature)) {
      upsertPanelItem(feature);
    }
    feature.implemented = true;
  }

  function applyEnhancement(feature) {
    var description = normalize(feature.description);

    if (isEnhancementAllowed('payment', feature) && hasAny(description, ['payment', 'upi', 'paypal', 'wallet', 'advance', 'refund'])) {
      applyPaymentEnhancements(feature);
    }
    if (isEnhancementAllowed('language', feature) && hasAny(description, ['language', 'hindi', 'english', 'rajasthani', 'भाषा'])) {
      applyLanguageEnhancements(feature);
    }
    if (isEnhancementAllowed('emergency', feature) && hasAny(description, ['emergency', 'sos', 'police', 'ambulance', 'हेल्पलाइन'])) {
      applyEmergencyEnhancements(feature);
    }
    if (isEnhancementAllowed('rating', feature) && hasAny(description, ['rating', 'star', 'feedback', 'review', 'रेटिंग'])) {
      applyRatingEnhancements(feature);
    }
    if (isEnhancementAllowed('tourism', feature) && hasAny(description, ['tourist', 'district', 'history', 'temple', 'fort', 'palace', 'museum', 'पर्यटन'])) {
      applyTourismEnhancements(feature);
    }
    if (isEnhancementAllowed('cancellation', feature) && hasAny(description, ['cancel', 'cancellation', 'केन्सल', 'रद्द'])) {
      applyCancellationEnhancements(feature);
    }

    applyGenericEnhancement(feature);
  }

  function activateFeature(detail) {
    var feature = getFeatureFromDetail(detail || {});
    if (!feature) {
      return;
    }

    var uniqueKey = (feature.category || 'general') + ':' + (feature.featureId || 'NA') + ':' + (detail.blockKey || 'block');
    if (state.activeFeatureKeys[uniqueKey]) {
      return;
    }
    state.activeFeatureKeys[uniqueKey] = true;
    state.activeFeatures.push(feature);

    applyEnhancement(feature);
  }

  function replayExisting() {
    var keys = Object.keys(registry || {});
    for (var i = 0; i < keys.length; i += 1) {
      var blockKey = keys[i];
      var list = registry[blockKey] || [];
      for (var j = 0; j < list.length; j += 1) {
        activateFeature({
          category: list[j].category,
          blockKey: blockKey,
          featureId: list[j].featureId
        });
      }
    }
  }

  window.addEventListener(EVENT_NAME, function (event) {
    activateFeature((event && event.detail) || {});
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replayExisting);
  } else {
    replayExisting();
  }
})();
