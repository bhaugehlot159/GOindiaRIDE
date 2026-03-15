const express = require('express');

const router = express.Router();

const MAX_ACTIVE_FEATURES = 10000;
const MAX_EXECUTION_LOGS = 20000;
const MAX_LIST_RESPONSE = 500;

function getStore() {
  if (!global.__GOINDIARIDE_FUTURE_RUNTIME_STORE__) {
    global.__GOINDIARIDE_FUTURE_RUNTIME_STORE__ = {
      featureMap: new Map(),
      features: [],
      executions: []
    };
  }
  return global.__GOINDIARIDE_FUTURE_RUNTIME_STORE__;
}

function normalizeString(value, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (!Number.isFinite(maxLength) || maxLength <= 0) return normalized;
  return normalized.slice(0, maxLength);
}

function sanitizeMeta(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const entries = Object.entries(input).slice(0, 30);
  return Object.fromEntries(entries.map(([key, value]) => [
    normalizeString(key, 60),
    typeof value === 'string' ? normalizeString(value, 320) : value
  ]));
}

function normalizeFeature(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const featureId = normalizeString(input.featureId, 40);
  const category = normalizeString(input.category, 50) || 'general';
  const blockKey = normalizeString(input.blockKey || input.featureBlockKey, 120);
  const sourceLine = Number(input.sourceLine);
  const description = normalizeString(input.description, 500);
  const pagePath = normalizeString(input.pagePath || input.path, 250);

  if (!featureId || !blockKey) {
    return null;
  }

  return {
    featureId,
    category,
    blockKey,
    sourceLine: Number.isFinite(sourceLine) ? sourceLine : null,
    description,
    implemented: Boolean(input.implemented),
    pagePath,
    status: normalizeString(input.status, 80) || 'enabled-from-itemwise-block',
    meta: sanitizeMeta(input.meta)
  };
}

function buildFeatureKey(feature) {
  return `${feature.category}::${feature.blockKey}::${feature.featureId}`;
}

function addOrUpdateFeature(feature, source) {
  const store = getStore();
  const key = buildFeatureKey(feature);
  const now = new Date().toISOString();
  const existing = store.featureMap.get(key);

  if (existing) {
    existing.lastSeenAt = now;
    existing.implemented = feature.implemented || existing.implemented;
    existing.status = feature.status || existing.status;
    existing.pagePath = feature.pagePath || existing.pagePath;
    existing.meta = { ...existing.meta, ...feature.meta };
    existing.source = source || existing.source;
    return {
      item: existing,
      created: false
    };
  }

  const item = {
    ...feature,
    source: source || 'runtime',
    firstSeenAt: now,
    lastSeenAt: now
  };

  store.featureMap.set(key, item);
  store.features.push(item);

  if (store.features.length > MAX_ACTIVE_FEATURES) {
    const removeCount = store.features.length - MAX_ACTIVE_FEATURES;
    const removed = store.features.splice(0, removeCount);
    removed.forEach((entry) => {
      const removeKey = buildFeatureKey(entry);
      if (store.featureMap.get(removeKey) === entry) {
        store.featureMap.delete(removeKey);
      }
    });
  }

  return {
    item,
    created: true
  };
}

function summarize(store) {
  const byCategory = {};
  store.features.forEach((item) => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  });
  return byCategory;
}

router.get('/status', (req, res) => {
  const store = getStore();
  return res.status(200).json({
    ok: true,
    totalActiveFeatures: store.features.length,
    totalExecutions: store.executions.length,
    byCategory: summarize(store),
    updatedAt: new Date().toISOString()
  });
});

router.get('/active', (req, res) => {
  const store = getStore();
  const category = normalizeString(req.query.category, 50).toLowerCase();
  const limitInput = Number(req.query.limit);
  const limit = Number.isFinite(limitInput) && limitInput > 0
    ? Math.min(limitInput, MAX_LIST_RESPONSE)
    : 100;

  const filtered = category
    ? store.features.filter((item) => item.category.toLowerCase() === category)
    : store.features;

  return res.status(200).json({
    ok: true,
    count: filtered.length,
    items: filtered.slice(-limit)
  });
});

router.post('/activate', (req, res) => {
  const feature = normalizeFeature(req.body?.feature || req.body);
  if (!feature) {
    return res.status(400).json({
      ok: false,
      message: 'Invalid feature payload. featureId and blockKey are required.'
    });
  }

  const detail = req.body?.detail || {};
  const source = normalizeString(req.body?.source, 60) || 'runtime';
  const { item, created } = addOrUpdateFeature({
    ...feature,
    meta: {
      ...feature.meta,
      detail: sanitizeMeta(detail)
    }
  }, source);

  return res.status(created ? 201 : 200).json({
    ok: true,
    created,
    feature: item
  });
});

router.post('/activate/bulk', (req, res) => {
  const list = Array.isArray(req.body?.features) ? req.body.features : [];
  if (!list.length) {
    return res.status(400).json({
      ok: false,
      message: 'features array is required'
    });
  }

  let created = 0;
  let updated = 0;
  const source = normalizeString(req.body?.source, 60) || 'runtime-bulk';

  list.forEach((raw) => {
    const feature = normalizeFeature(raw);
    if (!feature) return;
    const result = addOrUpdateFeature(feature, source);
    if (result.created) created += 1;
    else updated += 1;
  });

  return res.status(200).json({
    ok: true,
    received: list.length,
    created,
    updated
  });
});

router.post('/execute/:featureId', (req, res) => {
  const store = getStore();
  const featureId = normalizeString(req.params.featureId, 40);
  const action = normalizeString(req.body?.action, 80) || 'manual-run';
  const category = normalizeString(req.body?.category, 50).toLowerCase();

  const match = store.features.find((item) => {
    if (item.featureId !== featureId) return false;
    if (!category) return true;
    return item.category.toLowerCase() === category;
  });

  if (!match) {
    return res.status(404).json({
      ok: false,
      message: 'Feature not found in active runtime store.'
    });
  }

  const event = {
    featureId: match.featureId,
    category: match.category,
    blockKey: match.blockKey,
    action,
    pagePath: normalizeString(req.body?.pagePath, 250) || match.pagePath || '',
    payload: sanitizeMeta(req.body?.payload),
    createdAt: new Date().toISOString()
  };

  store.executions.push(event);
  if (store.executions.length > MAX_EXECUTION_LOGS) {
    store.executions.splice(0, store.executions.length - MAX_EXECUTION_LOGS);
  }

  return res.status(200).json({
    ok: true,
    event
  });
});

router.get('/execute/:featureId', (req, res) => {
  const store = getStore();
  const featureId = normalizeString(req.params.featureId, 40);
  const limitInput = Number(req.query.limit);
  const limit = Number.isFinite(limitInput) && limitInput > 0
    ? Math.min(limitInput, MAX_LIST_RESPONSE)
    : 100;

  const logs = store.executions.filter((entry) => entry.featureId === featureId);
  return res.status(200).json({
    ok: true,
    count: logs.length,
    items: logs.slice(-limit)
  });
});

module.exports = router;

