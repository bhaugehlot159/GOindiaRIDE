const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..', '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      const safeKey = String(key);
      return store.has(safeKey) ? store.get(safeKey) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    }
  };
}

function createRuntimeSandbox(localStorage) {
  const listeners = {};
  const document = {
    readyState: 'complete',
    head: { appendChild() {} },
    body: { appendChild() {}, insertBefore() {}, firstChild: null },
    createElement() {
      return {
        id: '',
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        appendChild() {},
        addEventListener() {},
        parentNode: null
      };
    },
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    }
  };

  const sandbox = {
    console,
    localStorage,
    location: { pathname: '/customer-dashboard.html', search: '', href: 'http://localhost/pages/customer-dashboard.html' },
    document,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
        this.key = options.key || null;
      }
    },
    addEventListener(type, handler) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(handler);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((handler) => handler(event));
    },
    setTimeout(handler) {
      if (typeof handler === 'function') handler();
      return 0;
    },
    clearTimeout() {},
    alert() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

test('ultimate feature index is fully represented by category counts', () => {
  const index = JSON.parse(readRepoFile('js/ultimate/feature-index.json'));
  const items = Array.isArray(index.items) ? index.items : [];
  const byCategory = items.reduce((acc, item) => {
    assert.ok(item.featureId, 'featureId is required');
    assert.ok(item.category, `${item.featureId} category is required`);
    assert.ok(item.blockKey, `${item.featureId} blockKey is required`);
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  assert.equal(items.length, index.totalFeatureItems);
  assert.deepEqual(byCategory, index.byCategory);
  ['customer', 'driver', 'admin', 'security', 'additional'].forEach((category) => {
    assert.ok(byCategory[category] > 0, `${category} features should be present`);
  });
});

test('future runtime blocks and resumes each admin-controlled feature from universal store', () => {
  const feature = {
    featureId: 'U00003',
    category: 'customer',
    description: 'Area-wise pickup',
    blockKey: 'customer-ultimate-u00003-line-3'
  };
  const storeKey = 'goindiaride_admin_universal_feature_controls_v1';
  const controlKey = 'customer:u00003';
  const localStorage = createLocalStorage({
    [storeKey]: JSON.stringify({
      version: 1,
      features: {
        [controlKey]: {
          featureId: feature.featureId,
          category: feature.category,
          enabled: false,
          status: 'disabled'
        }
      }
    })
  });
  const sandbox = createRuntimeSandbox(localStorage);
  sandbox.__GOINDIARIDE_FUTURE_FEATURES = {
    [feature.blockKey]: [feature]
  };

  vm.runInNewContext(readRepoFile('js/future-feature-runtime.js'), sandbox, {
    filename: path.join(repoRoot, 'js/future-feature-runtime.js')
  });

  assert.equal(sandbox.__GOINDIARIDE_FUTURE_RUNTIME_STATE.activeFeatures.length, 0);
  assert.equal(sandbox.__GOINDIARIDE_FUTURE_RUNTIME_STATE.blockedFeatureKeys[controlKey], true);

  localStorage.setItem(storeKey, JSON.stringify({
    version: 1,
    features: {
      [controlKey]: {
        featureId: feature.featureId,
        category: feature.category,
        enabled: true,
        status: 'active'
      }
    }
  }));
  sandbox.dispatchEvent(new sandbox.CustomEvent('goindiaride:admin-universal-feature-control-update'));

  assert.equal(sandbox.__GOINDIARIDE_FUTURE_RUNTIME_STATE.activeFeatures.length, 1);
  assert.equal(sandbox.__GOINDIARIDE_FUTURE_RUNTIME_STATE.activeFeatures[0].featureId, feature.featureId);
});

test('admin live control files do not mark features as demo controls', () => {
  const files = [
    'admin/app.html',
    'admin/js/admin-app.js',
    'admin/js/admin-feature-control-center.js',
    'js/admin-control-bridge.js',
    'js/future-feature-runtime.js'
  ];
  const forbidden = /demo_live|demoReady|demoMode|demo\/live|Demo\/live|demo block/i;

  files.forEach((file) => {
    assert.equal(forbidden.test(readRepoFile(file)), false, `${file} should not expose demo feature control state`);
  });
});
