(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_TOURISM_FULL_AUTOSUGGEST_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_TOURISM_FULL_AUTOSUGGEST_LOADED__ = true;

  var STORE_KEY = 'goindiaride.runtime.business-store.v1';
  var state = {
    scripts: {},
    seeded: false,
    enhancerBound: false,
    timer: null
  };

  function normalize(value) {
    return String(value || '').toLowerCase().trim();
  }

  function simplify(value) {
    return normalize(value).replace(/[^a-z0-9]/g, '');
  }

  function unique(values) {
    var out = [];
    for (var i = 0; i < values.length; i += 1) {
      var item = String(values[i] || '').trim();
      if (!item) continue;
      if (out.indexOf(item) === -1) out.push(item);
    }
    return out;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function loadScriptOnce(src, readyCheck) {
    if (state.scripts[src]) return state.scripts[src];

    state.scripts[src] = new Promise(function (resolve) {
      if (typeof readyCheck === 'function' && readyCheck()) {
        resolve(true);
        return;
      }

      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve(typeof readyCheck === 'function' ? readyCheck() : true);
        }, { once: true });
        existing.addEventListener('error', function () { resolve(false); }, { once: true });
        window.setTimeout(function () {
          resolve(typeof readyCheck === 'function' ? readyCheck() : true);
        }, 2500);
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        resolve(typeof readyCheck === 'function' ? readyCheck() : true);
      };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });

    return state.scripts[src];
  }

  function ensureDatasetReady() {
    return Promise.resolve()
      .then(function () {
        return Promise.all([
          loadScriptOnce('/js/rajasthan-data.js', function () {
            return !!(window.Rajasthan && typeof window.Rajasthan === 'object') || (typeof Rajasthan !== 'undefined' && Rajasthan && typeof Rajasthan === 'object');
          }),
          loadScriptOnce('/js/data/rajasthan-master-data.js', function () {
            return !!(window.RajasthanMasterData && typeof window.RajasthanMasterData === 'object');
          }),
          loadScriptOnce('/js/data/rajasthan-tourist-places.js', function () {
            return !!(window.RajasthanTouristPlaces && typeof window.RajasthanTouristPlaces === 'object');
          })
        ]);
      })
      .then(function () {
        return loadScriptOnce('/js/rajasthan-live-data.js', function () {
          return !!(window.locationsData && window.locationsData.rajasthan && Object.keys(window.locationsData.rajasthan).length > 0);
        });
      })
      .catch(function () {
        return false;
      });
  }

  var CATEGORY_LABELS = {
    tourist_places: 'Tourist Places',
    nearby_tourist_spots: 'Nearby Tourist Spots',
    forts: 'Forts',
    forts_durg: 'Forts / Durg',
    palaces_havelis: 'Palaces / Havelis',
    temples: 'Temples',
    temples_religious: 'Temples / Religious',
    museums_heritage: 'Museums / Heritage',
    landmarks: 'Landmarks',
    markets: 'Markets',
    markets_local_places: 'Markets / Local Places',
    lakes_water_bodies: 'Lakes / Water Bodies',
    gardens_parks: 'Gardens / Parks',
    wildlife_nature: 'Wildlife / Nature',
    desert_sand_dunes: 'Desert / Sand Dunes',
    hills_nature: 'Hills / Nature',
    places: 'Tourist Places'
  };

  function categoryLabel(key) {
    var raw = String(key || 'Tourism').trim();
    if (!raw) return 'Tourism';
    if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
    var normalized = raw.replace(/[_-]+/g, ' ');
    return normalized.replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }

  function districtSourceMaps() {
    var maps = [];

    try {
      if (window.locationsData && window.locationsData.rajasthan && typeof window.locationsData.rajasthan === 'object') {
        maps.push(window.locationsData.rajasthan);
      }
    } catch (_error) {
      // ignore
    }

    try {
      if (window.RajasthanMasterData && typeof window.RajasthanMasterData === 'object') {
        maps.push(window.RajasthanMasterData);
      }
    } catch (_error2) {
      // ignore
    }

    try {
      if (window.Rajasthan && typeof window.Rajasthan === 'object') {
        maps.push(window.Rajasthan);
      }
    } catch (_error3) {
      // ignore
    }

    try {
      if (typeof Rajasthan !== 'undefined' && Rajasthan && typeof Rajasthan === 'object') {
        maps.push(Rajasthan);
      }
    } catch (_error4) {
      // ignore
    }

    try {
      if (window.RajasthanTouristPlaces && typeof window.RajasthanTouristPlaces === 'object') {
        var converted = {};
        var keys = Object.keys(window.RajasthanTouristPlaces);
        for (var i = 0; i < keys.length; i += 1) {
          var district = keys[i];
          var block = safeObject(window.RajasthanTouristPlaces[district]);
          var places = safeArray(block.places).concat(safeArray(block.tourist_places));
          if (!places.length) continue;
          converted[district] = { tourist_places: places };
        }
        if (Object.keys(converted).length) maps.push(converted);
      }
    } catch (_error5) {
      // ignore
    }

    return maps;
  }

  function resolveDistrict(raw) {
    var value = String(raw || '').trim();
    if (!value) return '';

    var map = window.locationsData && window.locationsData.rajasthan && typeof window.locationsData.rajasthan === 'object'
      ? window.locationsData.rajasthan
      : {};
    var keys = Object.keys(map);
    var target = simplify(value);
    for (var i = 0; i < keys.length; i += 1) {
      if (simplify(keys[i]) === target) return keys[i];
    }
    for (var j = 0; j < keys.length; j += 1) {
      var key = simplify(keys[j]);
      if (key.indexOf(target) !== -1 || target.indexOf(key) !== -1) return keys[j];
    }
    return value;
  }

  function buildTourismCatalog() {
    var maps = districtSourceMaps();
    var out = [];
    var seen = {};

    for (var mi = 0; mi < maps.length; mi += 1) {
      var map = safeObject(maps[mi]);
      var districts = Object.keys(map);
      for (var di = 0; di < districts.length; di += 1) {
        var rawDistrict = districts[di];
        var districtName = resolveDistrict(rawDistrict);
        if (!districtName) continue;
        var districtData = safeObject(map[rawDistrict]);
        var categories = Object.keys(districtData);
        for (var ci = 0; ci < categories.length; ci += 1) {
          var categoryKey = categories[ci];
          var values = districtData[categoryKey];
          if (!Array.isArray(values)) continue;
          for (var vi = 0; vi < values.length; vi += 1) {
            var name = String(values[vi] || '').trim();
            if (!name) continue;
            var uniqueKey = simplify(districtName) + '::' + simplify(name);
            if (seen[uniqueKey]) continue;
            seen[uniqueKey] = true;
            out.push({
              id: 'seed-' + uniqueKey,
              district: districtName,
              name: name,
              category: categoryLabel(categoryKey),
              history: 'Loaded from Rajasthan dataset (' + categoryLabel(categoryKey) + ')',
              openTime: '09:00',
              closeTime: '18:00',
              parking: true,
              source: 'tourism-full-autosuggest',
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }

    return out;
  }

  function readStore() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      if (!window.localStorage) return;
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (_error) {
      // ignore
    }
  }

  function dedupeTourism(items) {
    var source = safeArray(items);
    var out = [];
    var seen = {};
    for (var i = 0; i < source.length; i += 1) {
      var district = String((source[i] && source[i].district) || '').trim();
      var name = String((source[i] && source[i].name) || '').trim();
      if (!district || !name) continue;
      var key = simplify(district) + '::' + simplify(name);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(source[i]);
    }
    return out;
  }

  function seedStoreWithFullTourism() {
    var store = readStore();
    store.tourismPlaces = safeArray(store.tourismPlaces);

    var fullCatalog = buildTourismCatalog();
    var merged = dedupeTourism(store.tourismPlaces.concat(fullCatalog));

    if (merged.length > store.tourismPlaces.length) {
      store.tourismPlaces = merged;
      writeStore(store);
    }

    state.seeded = true;
    return merged;
  }

  function getAllTourismItems() {
    var store = readStore();
    var items = dedupeTourism(safeArray(store.tourismPlaces));
    if (!items.length) {
      items = seedStoreWithFullTourism();
    }
    return dedupeTourism(items);
  }

  function ensureDatalist(id) {
    var node = document.getElementById(id);
    if (node) return node;
    node = document.createElement('datalist');
    node.id = id;
    document.body.appendChild(node);
    return node;
  }

  function fillDatalist(node, values, maxCount) {
    if (!node) return;
    var uniqueValues = unique(safeArray(values));
    uniqueValues.sort(function (a, b) { return a.localeCompare(b); });
    var limit = Math.max(10, Math.min(20000, Number(maxCount || 2000)));
    node.innerHTML = uniqueValues.slice(0, limit).map(function (value) {
      return '<option value="' + escapeHtml(value) + '"></option>';
    }).join('');
  }

  function queryTourism(items, district, search) {
    var districtKey = simplify(district);
    var searchKey = simplify(search);
    return safeArray(items).filter(function (item) {
      var districtOk = !districtKey || simplify(item && item.district) === districtKey;
      var searchOk = !searchKey ||
        simplify(item && item.name).indexOf(searchKey) !== -1 ||
        simplify(item && item.district).indexOf(searchKey) !== -1 ||
        simplify(item && item.category).indexOf(searchKey) !== -1 ||
        simplify(item && item.history).indexOf(searchKey) !== -1;
      return districtOk && searchOk;
    });
  }

  function toPickupValues(items) {
    var values = [];
    var safeItems = safeArray(items);
    for (var i = 0; i < safeItems.length; i += 1) {
      var name = String((safeItems[i] && safeItems[i].name) || '').trim();
      var district = String((safeItems[i] && safeItems[i].district) || '').trim();
      if (!name) continue;
      values.push(name);
      if (district) values.push(name + ', ' + district);
    }
    return values;
  }

  function ensureLocationsStore() {
    if (!window.locationsData || typeof window.locationsData !== 'object') {
      window.locationsData = {};
    }
    if (!window.locationsData.states || typeof window.locationsData.states !== 'object') {
      window.locationsData.states = {};
    }
    if (!window.locationsData.rajasthan || typeof window.locationsData.rajasthan !== 'object') {
      window.locationsData.rajasthan = {};
    }
    return window.locationsData;
  }

  function mergeTourismIntoLocationsData(items) {
    var source = safeArray(items);
    if (!source.length) return 0;

    var locations = ensureLocationsStore();
    var addedCount = 0;

    for (var i = 0; i < source.length; i += 1) {
      var districtRaw = String((source[i] && source[i].district) || '').trim();
      var place = String((source[i] && source[i].name) || '').trim();
      if (!districtRaw || !place) continue;

      var district = resolveDistrict(districtRaw) || districtRaw;
      var districtData = safeObject(locations.rajasthan[district]);
      if (districtData !== locations.rajasthan[district]) {
        locations.rajasthan[district] = districtData;
      }

      if (!Array.isArray(districtData.tourist_places)) {
        districtData.tourist_places = [];
      }

      if (districtData.tourist_places.indexOf(place) === -1) {
        districtData.tourist_places.push(place);
        addedCount += 1;
      }
    }

    return addedCount;
  }

  function enhanceTourismUI() {
    var districtInput = document.getElementById('ffx-tourism-district');
    var loadBtn = document.getElementById('ffx-tourism-load');
    var placeInput = document.getElementById('ffx-tourism-place');
    var addBtn = document.getElementById('ffx-tourism-add');
    var listEl = document.getElementById('ffx-tourism-list');
    var statusEl = document.getElementById('ffx-tourism-status');

    if (!districtInput || !loadBtn || !placeInput || !listEl) {
      return false;
    }

    var pickupDropListId = 'ffx-tourist-datalist-full';
    var districtListId = 'ffx-tourism-district-datalist-full';
    var placeListId = 'ffx-tourism-place-datalist-full';
    var enableNativePickupDatalist = window.__GOINDIARIDE_ENABLE_PICKUP_DATALIST__ === true;
    var pickupDropList = enableNativePickupDatalist ? ensureDatalist(pickupDropListId) : null;
    var districtList = ensureDatalist(districtListId);
    var placeList = ensureDatalist(placeListId);

    districtInput.setAttribute('list', districtListId);
    placeInput.setAttribute('list', placeListId);

    var pickup = document.querySelector('input[name*="pickup" i], input[id*="pickup" i]');
    var dropoff = document.querySelector('input[name*="drop" i], input[id*="drop" i]');
    if (enableNativePickupDatalist) {
      if (pickup) pickup.setAttribute('list', pickupDropListId);
      if (dropoff) dropoff.setAttribute('list', pickupDropListId);
    } else {
      if (pickup && pickup.getAttribute('list') === pickupDropListId) pickup.removeAttribute('list');
      if (dropoff && dropoff.getAttribute('list') === pickupDropListId) dropoff.removeAttribute('list');
    }

    var searchInput = document.getElementById('ffx-tourism-search-auto');
    if (!searchInput) {
      searchInput = document.createElement('input');
      searchInput.id = 'ffx-tourism-search-auto';
      searchInput.placeholder = 'Search place (auto suggestion)';
      searchInput.style.cssText = 'padding:8px;border:1px solid #c8d8f8;border-radius:8px;';
      var grid = districtInput.parentElement;
      if (grid) {
        grid.insertBefore(searchInput, placeInput);
      }
    }

    var allItems = getAllTourismItems();
    mergeTourismIntoLocationsData(allItems);
    var allDistricts = unique(allItems.map(function (item) { return item && item.district; }));
    fillDatalist(districtList, allDistricts, 5000);

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text || '';
    }

    function render(items) {
      var safeItems = dedupeTourism(items);
      fillDatalist(placeList, toPickupValues(safeItems), 9000);
      if (pickupDropList) {
        fillDatalist(pickupDropList, toPickupValues(safeItems), 12000);
      }
      mergeTourismIntoLocationsData(safeItems);

      if (!safeItems.length) {
        listEl.textContent = 'No places found';
        return;
      }

      listEl.innerHTML = safeItems.slice(0, 1200).map(function (item) {
        return '<div style="padding:6px 0;border-bottom:1px solid #edf2ff;">' +
          '<strong>' + escapeHtml(item.name) + '</strong> (' + escapeHtml(item.district) + ')' +
          ' <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:#eef4ff;color:#1d3f6f;">' + escapeHtml(item.category || 'Tourism') + '</span>' +
          '<div style="margin-top:2px;color:#4a6288;">' + escapeHtml(item.history || '') + '</div>' +
          '<div style="margin-top:2px;color:#4a6288;">Timing: ' + escapeHtml(item.openTime || 'N/A') + ' to ' + escapeHtml(item.closeTime || 'N/A') + ' | Parking: ' + ((item.parking === false) ? 'No' : 'Yes') + '</div>' +
          '</div>';
      }).join('');
    }

    function runFilter() {
      allItems = getAllTourismItems();
      mergeTourismIntoLocationsData(allItems);
      var district = String(districtInput.value || '').trim();
      var search = String(searchInput.value || '').trim();
      var filtered = queryTourism(allItems, district, search);
      render(filtered);
      setStatus('Loaded ' + filtered.length + ' place(s). Full dataset + auto suggestion active.');
    }

    function refreshPlaceSuggestions() {
      var searchText = String(placeInput.value || searchInput.value || '').trim();
      var district = String(districtInput.value || '').trim();
      var filtered = queryTourism(allItems, district, searchText).slice(0, 800);
      fillDatalist(placeList, toPickupValues(filtered), 5000);
    }

    if (!loadBtn.dataset.fullBound) {
      loadBtn.dataset.fullBound = '1';
      loadBtn.addEventListener('click', function () {
        window.setTimeout(runFilter, 80);
      });
    }

    if (!districtInput.dataset.fullBound) {
      districtInput.dataset.fullBound = '1';
      districtInput.addEventListener('change', runFilter);
      districtInput.addEventListener('input', function () {
        window.setTimeout(runFilter, 120);
      });
    }

    if (!searchInput.dataset.fullBound) {
      searchInput.dataset.fullBound = '1';
      searchInput.addEventListener('input', function () {
        if (state.timer) window.clearTimeout(state.timer);
        state.timer = window.setTimeout(runFilter, 220);
      });
    }

    if (!placeInput.dataset.fullBound) {
      placeInput.dataset.fullBound = '1';
      placeInput.addEventListener('input', function () {
        refreshPlaceSuggestions();
      });
    }

    if (addBtn && !addBtn.dataset.fullBound) {
      addBtn.dataset.fullBound = '1';
      addBtn.addEventListener('click', function () {
        window.setTimeout(function () {
          var district = String(districtInput.value || '').trim() || 'Jaipur';
          var placeName = String(placeInput.value || '').trim();
          if (placeName) {
            var store = readStore();
            store.tourismPlaces = safeArray(store.tourismPlaces);
            store.tourismPlaces.push({
              id: 'local-' + simplify(district + '-' + placeName),
              district: district,
              name: placeName,
              category: 'Tourism',
              history: 'Added from Tourist Explorer UI',
              openTime: '09:00',
              closeTime: '18:00',
              parking: true,
              createdAt: new Date().toISOString()
            });
            store.tourismPlaces = dedupeTourism(store.tourismPlaces);
            writeStore(store);
          }
          runFilter();
        }, 120);
      });
    }

    if (!districtInput.value) districtInput.value = 'Udaipur';
    runFilter();
    return true;
  }

  function boot() {
    ensureDatasetReady().then(function () {
      seedStoreWithFullTourism();
      enhanceTourismUI();

      if (!state.enhancerBound) {
        state.enhancerBound = true;
        window.setInterval(function () {
          enhanceTourismUI();
        }, 1000);
      }
    }).catch(function () {
      enhanceTourismUI();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
