(function () {
  'use strict';

  if (typeof window === 'undefined' || window.__GOINDIARIDE_UNIVERSAL_LIVE_RUNNER_LOADED__) {
    return;
  }
  window.__GOINDIARIDE_UNIVERSAL_LIVE_RUNNER_LOADED__ = true;

  var EVENT_NAME = 'goindiaride:future-feature-item-ready';
  var registry = window.__GOINDIARIDE_FUTURE_FEATURES || {};
  var runnerState = window.__GOINDIARIDE_UNIVERSAL_LIVE_RUNNER_STATE || {
    features: {},
    sortedIds: [],
    filterText: '',
    lastVisibleCount: 0,
    lastMatchCount: 0,
    searchTimer: null
  };
  window.__GOINDIARIDE_UNIVERSAL_LIVE_RUNNER_STATE = runnerState;

  var LOCAL_STORE_KEY = 'goindiaride.runtime.universal-live-runner.v1';
  var MAX_OPTIONS_DEFAULT = 180;
  var MAX_OPTIONS_FILTERED = 800;

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateText(value, maxLen) {
    var text = String(value || '').trim();
    var limit = Number(maxLen || 80);
    if (!text || text.length <= limit) return text;
    return text.slice(0, Math.max(10, limit - 1)) + '…';
  }

  function detectPageRole() {
    var path = normalize((window.location && window.location.pathname) || '');
    if (path.indexOf('/admin/') !== -1 || path.indexOf('admin-dashboard') !== -1) return 'admin';
    if (path.indexOf('/driver/') !== -1 || path.indexOf('driver-dashboard') !== -1) return 'driver';
    if (path.indexOf('/customer/') !== -1 || path.indexOf('customer-dashboard') !== -1) return 'customer';
    if (path.indexOf('booking') !== -1) return 'booking';
    return 'generic';
  }

  function toSet(list) {
    var out = {};
    for (var i = 0; i < list.length; i += 1) out[list[i]] = true;
    return out;
  }

  var PAGE_ROLE = detectPageRole();
  var ENABLE_OUTSIDE_ADMIN = window.__GOINDIARIDE_ENABLE_UNIVERSAL_LIVE_RUNNER__ === true;
  if (PAGE_ROLE !== 'admin' && !ENABLE_OUTSIDE_ADMIN) {
    return;
  }

  var CATEGORY_ALLOW = {
    booking: toSet(['customer', 'additional']),
    customer: toSet(['customer', 'additional']),
    driver: toSet(['driver', 'additional']),
    admin: toSet(['admin', 'security', 'additional']),
    generic: toSet(['customer', 'additional', 'driver', 'admin', 'security'])
  };

  function isCategoryAllowed(category) {
    var allowed = CATEGORY_ALLOW[PAGE_ROLE] || CATEGORY_ALLOW.generic;
    return !!allowed[normalize(category) || 'additional'];
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

  function normalizeOrigin(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  var PRIMARY_DOMAIN_REGEX = /(^|\.)goindiaride\.in$/i;
  var GITHUB_PAGES_HOST_REGEX = /\.github\.io$/i;
  var DEFAULT_PRODUCTION_API_ORIGIN = 'https://api.goindiaride.in';

  function currentHostname() {
    return String((window.location && window.location.hostname) || '').toLowerCase();
  }

  function isLocalHostname(hostname) {
    var host = String(hostname || '').toLowerCase();
    return host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '0.0.0.0';
  }

  function shouldAvoidRelativeApiFallback(hostname) {
    var host = String(hostname || '').toLowerCase();
    return PRIMARY_DOMAIN_REGEX.test(host) || GITHUB_PAGES_HOST_REGEX.test(host);
  }

  function inferApiOriginFromHostname(hostname) {
    var host = String(hostname || '').toLowerCase();
    if (!host) return '';
    if (PRIMARY_DOMAIN_REGEX.test(host) || GITHUB_PAGES_HOST_REGEX.test(host)) {
      return DEFAULT_PRODUCTION_API_ORIGIN;
    }
    if (isLocalHostname(host)) {
      return normalizeOrigin((window.location && window.location.origin) || '');
    }
    return '';
  }

  function detectApiOrigin() {
    var explicit = normalizeOrigin(
      window.__GOINDIARIDE_RUNTIME_API_ORIGIN__ ||
      window.__GOINDIARIDE_API_ORIGIN__ ||
      ''
    );
    if (explicit) return explicit;

    var inferred = inferApiOriginFromHostname(currentHostname());
    if (inferred) return inferred;

    return normalizeOrigin((window.location && window.location.origin) || '');
  }

  var ALLOW_RELATIVE_API_FALLBACK = !shouldAvoidRelativeApiFallback(currentHostname());
  var API_ORIGIN = detectApiOrigin();
  var API_BASE = API_ORIGIN ? (API_ORIGIN + '/api/future-runtime-business') : (ALLOW_RELATIVE_API_FALLBACK ? '/api/future-runtime-business' : '');

  function parsePath(path) {
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

  function readLocalStore() {
    try {
      var raw = window.localStorage && window.localStorage.getItem(LOCAL_STORE_KEY);
      if (!raw) return { states: {}, actions: {} };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { states: {}, actions: {} };
      parsed.states = parsed.states && typeof parsed.states === 'object' ? parsed.states : {};
      parsed.actions = parsed.actions && typeof parsed.actions === 'object' ? parsed.actions : {};
      return parsed;
    } catch (_error) {
      return { states: {}, actions: {} };
    }
  }

  function writeLocalStore(store) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
      }
    } catch (_error) {
      // ignore
    }
  }

  function localBusiness(method, path, payload) {
    var parsed = parsePath(path);
    var pathname = parsed.pathname;
    var query = parsed.searchParams;
    var store = readLocalStore();
    var now = new Date().toISOString();
    var userKey = String((payload && payload.userKey) || query.get('userKey') || currentUserKey() || 'guest-user').trim() || 'guest-user';

    if (!store.states[userKey]) store.states[userKey] = {};
    if (!store.actions[userKey]) store.actions[userKey] = {};

    if (method === 'POST' && pathname === '/feature/state') {
      var statePayload = Object.assign({}, payload || {}, { updatedAt: now, userKey: userKey });
      var stateId = String((payload && payload.featureId) || '').trim();
      if (!stateId) return Promise.resolve({ ok: false, message: 'featureId required' });
      store.states[userKey][stateId] = statePayload;
      writeLocalStore(store);
      return Promise.resolve({ ok: true, state: statePayload, source: 'local-fallback' });
    }

    var stateMatch = pathname.match(/^\/feature\/state\/([^/]+)$/);
    if (method === 'GET' && stateMatch) {
      var featureIdForState = decodeURIComponent(stateMatch[1] || '');
      var featureState = store.states[userKey] && store.states[userKey][featureIdForState];
      return Promise.resolve({ ok: true, state: featureState || null, source: 'local-fallback' });
    }

    if (method === 'POST' && pathname === '/feature/action') {
      var actionPayload = Object.assign({}, payload || {}, { createdAt: now, userKey: userKey });
      var actionId = String((payload && payload.featureId) || '').trim();
      if (!actionId) return Promise.resolve({ ok: false, message: 'featureId required' });
      store.actions[userKey][actionId] = store.actions[userKey][actionId] || [];
      store.actions[userKey][actionId].push(actionPayload);
      if (store.actions[userKey][actionId].length > 2000) {
        store.actions[userKey][actionId] = store.actions[userKey][actionId].slice(-2000);
      }
      writeLocalStore(store);
      return Promise.resolve({ ok: true, item: actionPayload, source: 'local-fallback' });
    }

    var actionMatch = pathname.match(/^\/feature\/action\/([^/]+)$/);
    if (method === 'GET' && actionMatch) {
      var featureIdForAction = decodeURIComponent(actionMatch[1] || '');
      var items = (store.actions[userKey] && store.actions[userKey][featureIdForAction]) || [];
      return Promise.resolve({ ok: true, items: items, source: 'local-fallback' });
    }

    return Promise.resolve({ ok: false, message: 'Unsupported fallback path', source: 'local-fallback' });
  }

  function requestBusiness(method, path, payload) {
    if (typeof window.fetch !== 'function') return localBusiness(method, path, payload);

    var route = String(path || '').trim();
    if (!route) return Promise.resolve({ ok: false, message: 'Empty route' });
    if (route.charAt(0) !== '/') route = '/' + route;
    if (!API_BASE && !ALLOW_RELATIVE_API_FALLBACK) {
      return localBusiness(method, route, payload);
    }

    var tried = {};
    var bases = [API_BASE];
    if (ALLOW_RELATIVE_API_FALLBACK) {
      bases.push('/api/future-runtime-business');
    }
    var targets = [];
    for (var i = 0; i < bases.length; i += 1) {
      var base = String(bases[i] || '').replace(/\/+$/, '');
      var target = base + route;
      if (!tried[target]) {
        tried[target] = true;
        targets.push(target);
      }
    }

    function parseJsonSafe(text) {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (_error) {
        return null;
      }
    }

    function tryAt(index) {
      if (index >= targets.length) return localBusiness(method, route, payload);

      return window.fetch(targets[index], {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-GoindiaRide-Live-Runner': 'universal-live-runner'
        },
        body: method === 'GET' ? undefined : JSON.stringify(payload || {})
      }).then(function (response) {
        return response.text().then(function (text) {
          var json = parseJsonSafe(text);
          if (response.ok && json) return json;
          return tryAt(index + 1);
        });
      }).catch(function () {
        return tryAt(index + 1);
      });
    }

    return tryAt(0);
  }

  function ensureStyle() {
    if (document.getElementById('ff-universal-live-runner-style')) return;
    var style = document.createElement('style');
    style.id = 'ff-universal-live-runner-style';
    style.textContent = '' +
      '#ff-universal-live-runner{padding:12px;border:1px solid #d9e7ff;background:#ffffff;border-radius:12px;display:grid;gap:10px}' +
      '#ff-universal-live-runner h4{margin:0;color:#123a67;font:700 16px/1.3 Segoe UI,Tahoma,sans-serif}' +
      '#ff-universal-live-runner .fful-meta{font:600 12px/1.3 Segoe UI,Tahoma,sans-serif;color:#305380}' +
      '#ff-universal-live-runner .fful-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}' +
      '#ff-universal-live-runner input,#ff-universal-live-runner select,#ff-universal-live-runner button{padding:8px;border-radius:8px;font:500 13px/1.25 Segoe UI,Tahoma,sans-serif}' +
      '#ff-universal-live-runner input,#ff-universal-live-runner select{border:1px solid #c8d8f8}' +
      '#ff-universal-live-runner button{border:0;color:#fff;cursor:pointer}' +
      '#ff-universal-live-runner button[data-btn="save"]{background:#0f766e}' +
      '#ff-universal-live-runner button[data-btn="run"]{background:#1d4ed8}' +
      '#ff-universal-live-runner button[data-btn="load"]{background:#334155}' +
      '#ff-universal-live-runner button[data-btn="history"]{background:#7c3aed}' +
      '#ff-universal-live-runner .fful-desc{padding:8px;border:1px solid #dbe7ff;border-radius:8px;background:#f8fbff;color:#173b67;font:500 12px/1.45 Segoe UI,Tahoma,sans-serif}' +
      '#ff-universal-live-runner .fful-output{padding:8px;border:1px solid #dbe7ff;border-radius:8px;background:#fff;min-height:62px;max-height:220px;overflow:auto;color:#173b67;font:500 12px/1.45 Segoe UI,Tahoma,sans-serif}' +
      '#ff-universal-live-runner .fful-tag{display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;background:#eef5ff;color:#123a67;font-size:11px;font-weight:700}';
    document.head.appendChild(style);
  }

  function getDockBody() {
    var dockBody = document.getElementById('ff-runtime-dock-body');
    if (dockBody) return dockBody;

    var fallback = document.getElementById('ff-runtime-extension-workspace');
    if (fallback) return fallback;

    var root = document.getElementById('ff-universal-live-runner-root');
    if (root) return root;

    root = document.createElement('section');
    root.id = 'ff-universal-live-runner-root';
    root.style.cssText = 'margin:16px auto;max-width:1280px;padding:0 12px;box-sizing:border-box;';
    document.body.appendChild(root);
    return root;
  }

  function getFeatureFromDetail(detail) {
    var blockKey = detail && detail.blockKey;
    var featureId = detail && detail.featureId;
    if (!blockKey || !registry[blockKey] || !registry[blockKey].length) return null;
    var list = registry[blockKey];
    for (var i = 0; i < list.length; i += 1) {
      if (!featureId || list[i].featureId === featureId) return list[i];
    }
    return list[0] || null;
  }

  function registerFeature(feature) {
    if (!feature) return false;
    var featureId = String(feature.featureId || '').trim();
    if (!featureId) return false;

    var category = normalize(feature.category || 'additional') || 'additional';
    if (!isCategoryAllowed(category)) return false;

    if (!runnerState.features[featureId]) {
      runnerState.features[featureId] = {
        featureId: featureId,
        category: category,
        description: String(feature.description || '').trim(),
        sourceLine: Number(feature.sourceLine || 0) || 0,
        blockKey: feature.blockKey || ''
      };
      return true;
    }
    return false;
  }

  function rebuildFeatureIndex() {
    runnerState.sortedIds = Object.keys(runnerState.features).sort(function (a, b) {
      var aa = runnerState.features[a];
      var bb = runnerState.features[b];
      var lineA = Number((aa && aa.sourceLine) || 0);
      var lineB = Number((bb && bb.sourceLine) || 0);
      if (lineA && lineB && lineA !== lineB) return lineA - lineB;
      return a.localeCompare(b);
    });
  }

  function collectFromRegistry() {
    var changed = false;
    var keys = Object.keys(registry || {});
    for (var i = 0; i < keys.length; i += 1) {
      var blockKey = keys[i];
      var items = registry[blockKey] || [];
      for (var j = 0; j < items.length; j += 1) {
        if (registerFeature(items[j])) changed = true;
      }
    }
    if (changed) rebuildFeatureIndex();
    return changed;
  }

  function ensureCard() {
    ensureStyle();
    var card = document.getElementById('ff-universal-live-runner');
    if (card) return card;

    card = document.createElement('section');
    card.id = 'ff-universal-live-runner';
    card.innerHTML = [
      '<h4>Universal Feature Runner (Live Mode)</h4>',
      '<div class="fful-meta" id="fful-meta"></div>',
      '<div class="fful-grid">',
      '<input id="fful-search" placeholder="Search feature id / keyword" />',
      '<select id="fful-feature"></select>',
      '<input id="fful-owner" placeholder="Owner" />',
      '<input id="fful-due" type="date" />',
      '<select id="fful-status"><option>active</option><option>planned</option><option>in-progress</option><option>blocked</option><option>completed</option></select>',
      '<input id="fful-notes" placeholder="Notes" />',
      '<input id="fful-action" placeholder="Action name" />',
      '<button type="button" data-btn="save" id="fful-save">Save State</button>',
      '<button type="button" data-btn="run" id="fful-run">Run Action</button>',
      '<button type="button" data-btn="load" id="fful-load">Load State</button>',
      '<button type="button" data-btn="history" id="fful-history">Load History</button>',
      '</div>',
      '<div class="fful-desc" id="fful-desc">No feature selected.</div>',
      '<div class="fful-output" id="fful-output"></div>'
    ].join('');

    getDockBody().appendChild(card);
    bindCardEvents(card);
    return card;
  }

  function selectedFeature(card) {
    var select = card.querySelector('#fful-feature');
    var featureId = select ? String(select.value || '') : '';
    if (!featureId) return null;
    return runnerState.features[featureId] || null;
  }

  function setOutput(card, html) {
    var out = card.querySelector('#fful-output');
    if (!out) return;
    out.innerHTML = html || '';
  }

  function renderDescription(card) {
    var desc = card.querySelector('#fful-desc');
    if (!desc) return;
    var feature = selectedFeature(card);
    if (!feature) {
      desc.textContent = 'No feature selected.';
      return;
    }
    desc.innerHTML = '<span class="fful-tag">' + escapeHtml(feature.featureId) + '</span>' +
      '<span class="fful-tag">' + escapeHtml(feature.category) + '</span>' +
      'Line ' + escapeHtml(feature.sourceLine || '-') + '<br/>' +
      escapeHtml(feature.description || 'No description');
  }

  function renderMeta(card) {
    var meta = card.querySelector('#fful-meta');
    if (!meta) return;
    var total = runnerState.sortedIds.length;
    var visible = Number(runnerState.lastVisibleCount || 0);
    var matched = Number(runnerState.lastMatchCount || total);
    var info = 'Role: ' + PAGE_ROLE + ' | Loaded Features: ' + total + ' | Source: folder-wise live registries';
    if (matched && visible && visible !== matched) {
      info += ' | Showing: ' + visible + ' / ' + matched + ' (type in search to narrow)';
    }
    meta.textContent = info;
  }

  function refreshFeatureOptions(card) {
    var select = card.querySelector('#fful-feature');
    var search = card.querySelector('#fful-search');
    if (!select) return;

    var previous = select.value;
    var filterText = normalize(search ? search.value : runnerState.filterText);

    var matches = [];
    for (var i = 0; i < runnerState.sortedIds.length; i += 1) {
      var featureId = runnerState.sortedIds[i];
      var feature = runnerState.features[featureId];
      if (!feature) continue;
      var hay = normalize(feature.featureId + ' ' + feature.category + ' ' + feature.description);
      if (filterText && hay.indexOf(filterText) === -1) continue;
      matches.push(feature.featureId);
    }

    var maxOptions = filterText ? MAX_OPTIONS_FILTERED : MAX_OPTIONS_DEFAULT;
    var visibleIds = matches.slice(0, maxOptions);
    if (previous && runnerState.features[previous] && visibleIds.indexOf(previous) === -1) {
      visibleIds.unshift(previous);
      if (visibleIds.length > maxOptions) visibleIds.pop();
    }

    runnerState.lastMatchCount = matches.length;
    runnerState.lastVisibleCount = visibleIds.length;

    select.innerHTML = '';
    var fragment = document.createDocumentFragment();
    for (var vi = 0; vi < visibleIds.length; vi += 1) {
      var optionFeature = runnerState.features[visibleIds[vi]];
      if (!optionFeature) continue;
      var option = document.createElement('option');
      option.value = optionFeature.featureId;
      option.textContent = optionFeature.featureId + ' [' + optionFeature.category + '] - ' + truncateText(optionFeature.description || 'No description', 72);
      fragment.appendChild(option);
    }

    if (matches.length > visibleIds.length) {
      var more = document.createElement('option');
      more.value = '';
      more.disabled = true;
      more.textContent = '... ' + (matches.length - visibleIds.length) + ' more results (type to filter)';
      fragment.appendChild(more);
    }
    select.appendChild(fragment);

    if (previous && runnerState.features[previous] && select.querySelector('option[value="' + safeCssEscape(previous) + '"]')) {
      select.value = previous;
    }

    if (!select.value && select.options.length) {
      select.value = select.options[0].value;
    }

    renderDescription(card);
    renderMeta(card);
  }

  function bindCardEvents(card) {
    var search = card.querySelector('#fful-search');
    var select = card.querySelector('#fful-feature');
    var ownerInput = card.querySelector('#fful-owner');
    var dueInput = card.querySelector('#fful-due');
    var statusInput = card.querySelector('#fful-status');
    var notesInput = card.querySelector('#fful-notes');
    var actionInput = card.querySelector('#fful-action');

    if (search) {
      search.addEventListener('input', function () {
        runnerState.filterText = String(search.value || '');
        if (runnerState.searchTimer) window.clearTimeout(runnerState.searchTimer);
        runnerState.searchTimer = window.setTimeout(function () {
          refreshFeatureOptions(card);
        }, 120);
      });
    }

    if (select) {
      select.addEventListener('change', function () {
        renderDescription(card);
      });
    }

    var saveBtn = card.querySelector('#fful-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var feature = selectedFeature(card);
        if (!feature) return;
        var payload = {
          userKey: currentUserKey(),
          featureId: feature.featureId,
          category: feature.category,
          description: feature.description,
          sourceLine: feature.sourceLine || null,
          owner: ownerInput ? ownerInput.value : '',
          dueDate: dueInput ? dueInput.value : '',
          status: statusInput ? statusInput.value : 'active',
          notes: notesInput ? notesInput.value : ''
        };

        requestBusiness('POST', '/feature/state', payload).then(function (data) {
          if (data && data.ok) {
            setOutput(card, '<div>State saved for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
          } else {
            setOutput(card, '<div>State save failed for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
          }
        });
      });
    }

    var runBtn = card.querySelector('#fful-run');
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        var feature = selectedFeature(card);
        if (!feature) return;
        var payload = {
          userKey: currentUserKey(),
          featureId: feature.featureId,
          category: feature.category,
          action: (actionInput && actionInput.value) || 'manual-run',
          status: 'executed',
          payload: {
            notes: notesInput ? notesInput.value : '',
            owner: ownerInput ? ownerInput.value : ''
          },
          result: 'Executed from universal live runner'
        };

        requestBusiness('POST', '/feature/action', payload).then(function (data) {
          if (data && data.ok) {
            setOutput(card, '<div>Action executed for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
          } else {
            setOutput(card, '<div>Action failed for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
          }
        });
      });
    }

    var loadBtn = card.querySelector('#fful-load');
    if (loadBtn) {
      loadBtn.addEventListener('click', function () {
        var feature = selectedFeature(card);
        if (!feature) return;

        requestBusiness('GET', '/feature/state/' + encodeURIComponent(feature.featureId) + '?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
          var state = data && data.state ? data.state : null;
          if (!state) {
            setOutput(card, '<div>No saved state for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
            return;
          }
          if (ownerInput) ownerInput.value = state.owner || '';
          if (dueInput) dueInput.value = state.dueDate || '';
          if (statusInput) statusInput.value = state.status || 'active';
          if (notesInput) notesInput.value = state.notes || '';

          setOutput(card, '<div>Loaded state: <strong>' + escapeHtml(feature.featureId) + '</strong> | status=' + escapeHtml(state.status || 'active') + '</div>');
        });
      });
    }

    var historyBtn = card.querySelector('#fful-history');
    if (historyBtn) {
      historyBtn.addEventListener('click', function () {
        var feature = selectedFeature(card);
        if (!feature) return;

        requestBusiness('GET', '/feature/action/' + encodeURIComponent(feature.featureId) + '?userKey=' + encodeURIComponent(currentUserKey())).then(function (data) {
          var items = data && Array.isArray(data.items) ? data.items : [];
          if (!items.length) {
            setOutput(card, '<div>No action history for <strong>' + escapeHtml(feature.featureId) + '</strong>.</div>');
            return;
          }

          var html = items.slice(-25).reverse().map(function (item) {
            var action = escapeHtml(item.action || 'manual-run');
            var createdAt = escapeHtml(item.createdAt || '-');
            return '<div style="padding:6px 0;border-bottom:1px solid #edf2ff;"><strong>' + action + '</strong> - ' + createdAt + '</div>';
          }).join('');

          setOutput(card, html);
        });
      });
    }
  }

  function safeCssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function refreshCard() {
    var card = ensureCard();
    if (!card) return;

    var select = card.querySelector('#fful-feature');
    var previous = select ? String(select.value || '') : '';

    var search = card.querySelector('#fful-search');
    if (search && !search.value && runnerState.filterText) {
      search.value = runnerState.filterText;
    }

    refreshFeatureOptions(card);

    if (previous && select && select.querySelector('option[value="' + safeCssEscape(previous) + '"]')) {
      select.value = previous;
      renderDescription(card);
    }
  }

  function registerFromDetail(detail) {
    var feature = getFeatureFromDetail(detail || {});
    if (!feature) return false;
    return registerFeature(feature);
  }

  function boot() {
    collectFromRegistry();
    refreshCard();

    window.addEventListener(EVENT_NAME, function (event) {
      if (registerFromDetail((event && event.detail) || {})) {
        rebuildFeatureIndex();
        refreshCard();
      }
    });

    window.setInterval(function () {
      if (collectFromRegistry()) {
        refreshCard();
      }
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
