(function bookingDistrictAutosuggest() {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_BOOKING_DISTRICT_AUTOSUGGEST_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_BOOKING_DISTRICT_AUTOSUGGEST_LOADED__ = true;

  function normalize(value) {
    return String(value || '').trim();
  }

  function normalizeKey(value) {
    return normalize(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function uniqueDistricts(values) {
    var map = {};
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var item = normalize(values[i]);
      if (!item) continue;
      var key = normalizeKey(item);
      if (!key || map[key]) continue;
      map[key] = true;
      out.push(item);
    }
    out.sort(function (a, b) {
      return a.localeCompare(b);
    });
    return out;
  }

  function emitInputEvents(node) {
    if (!node) return;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function getDistrictsFromData() {
    var districts = [];

    try {
      if (window.locationsData && window.locationsData.rajasthan) {
        if (Array.isArray(window.locationsData.rajasthan.districts)) {
          districts = districts.concat(window.locationsData.rajasthan.districts);
        }
        if (typeof window.locationsData.rajasthan === 'object') {
          districts = districts.concat(Object.keys(window.locationsData.rajasthan));
        }
      }

      if (window.RajasthanMasterData && typeof window.RajasthanMasterData === 'object') {
        districts = districts.concat(Object.keys(window.RajasthanMasterData));
      }

      if (window.RajasthanTouristPlaces && typeof window.RajasthanTouristPlaces === 'object') {
        districts = districts.concat(Object.keys(window.RajasthanTouristPlaces));
      }
    } catch (_error) {
      // ignore data parsing issues, fallback API will handle.
    }

    return uniqueDistricts(districts);
  }

  function fetchDistrictsFromApi() {
    if (typeof window.fetch !== 'function') return Promise.resolve([]);
    return window.fetch('/api/future-runtime-business/districts')
      .then(function (response) {
        if (!response.ok) return null;
        return response.json().catch(function () { return null; });
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.districts)) return [];
        return uniqueDistricts(data.districts);
      })
      .catch(function () {
        return [];
      });
  }

  function buildUi(pickupInput, dropoffInput) {
    if (!pickupInput || !dropoffInput) return null;

    if (document.getElementById('goiDistrictSuggestWrap')) {
      return document.getElementById('goiDistrictSuggestWrap');
    }

    var host = pickupInput.closest('.form-section') || pickupInput.parentElement;
    if (!host) return null;

    var wrap = document.createElement('div');
    wrap.id = 'goiDistrictSuggestWrap';
    wrap.style.cssText = [
      'margin-top:10px',
      'padding:10px',
      'border:1px solid #d9e7ff',
      'background:#f8fbff',
      'border-radius:10px',
      'display:grid',
      'grid-template-columns:repeat(auto-fit,minmax(170px,1fr))',
      'gap:8px'
    ].join(';');

    wrap.innerHTML = [
      '<div style="grid-column:1/-1;font-size:12px;color:#1f3f68;font-weight:600;">District Auto Suggestion</div>',
      '<select id="goiPickupDistrict" style="padding:8px;border:1px solid #c8d8f8;border-radius:8px;"><option value="">Pickup District</option></select>',
      '<select id="goiDropDistrict" style="padding:8px;border:1px solid #c8d8f8;border-radius:8px;"><option value="">Drop District</option></select>',
      '<button type="button" id="goiApplyDistricts" style="padding:8px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;">Apply Districts</button>',
      '<button type="button" id="goiSameDistrict" style="padding:8px;border:0;border-radius:8px;background:#0f766e;color:#fff;">Same District</button>'
    ].join('');

    host.appendChild(wrap);
    return wrap;
  }

  function populateSelect(selectNode, districts) {
    if (!selectNode) return;
    var current = normalize(selectNode.value);
    selectNode.innerHTML = '<option value="">' + (selectNode.id === 'goiPickupDistrict' ? 'Pickup District' : 'Drop District') + '</option>';
    for (var i = 0; i < districts.length; i += 1) {
      var d = districts[i];
      var option = document.createElement('option');
      option.value = d;
      option.textContent = d;
      selectNode.appendChild(option);
    }
    if (current) {
      for (var j = 0; j < selectNode.options.length; j += 1) {
        if (normalize(selectNode.options[j].value) === current) {
          selectNode.value = current;
          break;
        }
      }
    }
  }

  function applyDistrictToInput(inputNode, district) {
    if (!inputNode || !district) return;
    var formatted = district + ', Rajasthan';
    inputNode.value = formatted;
    emitInputEvents(inputNode);
  }

  function initialize() {
    var pickup = document.getElementById('pickup') || document.getElementById('pickupLocation');
    var dropoff = document.getElementById('dropoff') || document.getElementById('dropLocation');
    if (!pickup || !dropoff) return;

    var wrap = buildUi(pickup, dropoff);
    if (!wrap) return;

    var pickupSelect = document.getElementById('goiPickupDistrict');
    var dropoffSelect = document.getElementById('goiDropDistrict');
    var applyBtn = document.getElementById('goiApplyDistricts');
    var sameBtn = document.getElementById('goiSameDistrict');
    if (!pickupSelect || !dropoffSelect || !applyBtn || !sameBtn) return;

    var districts = getDistrictsFromData();
    populateSelect(pickupSelect, districts);
    populateSelect(dropoffSelect, districts);

    if (!pickupSelect.dataset.bound) {
      pickupSelect.dataset.bound = '1';
      applyBtn.addEventListener('click', function () {
        applyDistrictToInput(pickup, pickupSelect.value);
        applyDistrictToInput(dropoff, dropoffSelect.value);
      });
      sameBtn.addEventListener('click', function () {
        if (!pickupSelect.value) return;
        dropoffSelect.value = pickupSelect.value;
        applyDistrictToInput(pickup, pickupSelect.value);
        applyDistrictToInput(dropoff, pickupSelect.value);
      });
      pickupSelect.addEventListener('change', function () {
        if (!pickup.value.trim()) applyDistrictToInput(pickup, pickupSelect.value);
      });
      dropoffSelect.addEventListener('change', function () {
        if (!dropoff.value.trim()) applyDistrictToInput(dropoff, dropoffSelect.value);
      });
    }

    if (districts.length < 10) {
      fetchDistrictsFromApi().then(function (apiDistricts) {
        if (!apiDistricts.length) return;
        populateSelect(pickupSelect, apiDistricts);
        populateSelect(dropoffSelect, apiDistricts);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  window.addEventListener('goindiaride:rajasthan-live-ready', initialize);
})();
