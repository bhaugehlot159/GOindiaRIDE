const express = require('express');
const fs = require('fs');
const path = require('path');

const { authenticate, authorizeRole } = require('../middleware/authMiddleware');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '../../../data/runtime');
const DATA_FILE = path.join(DATA_DIR, 'admin-feature-control-store.json');
const FEATURE_INDEX_FILE = path.join(__dirname, '../../../js/ultimate/feature-index.json');
const MAX_ACTIONS = 50000;
const BLOCKED_STATUSES = new Set(['disabled', 'paused', 'blocked', 'approval_required', 'pending_approval']);

router.use(authenticate, authorizeRole('admin'));

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeString(value, maxLength = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, maxLength);
}

function normalizeCategory(value) {
  const category = normalizeString(value, 40).toLowerCase();
  return category || 'general';
}

function normalizeFeatureId(value) {
  return normalizeString(value, 100);
}

function featureKey(category, featureId) {
  return `${normalizeCategory(category)}:${normalizeFeatureId(featureId).toLowerCase()}`;
}

function defaultStore() {
  return {
    version: 1,
    updatedAt: nowIso(),
    features: {},
    actions: []
  };
}

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultStore();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...defaultStore(),
      ...safeObject(parsed),
      features: safeObject(parsed.features),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(-MAX_ACTIONS) : []
    };
  } catch (_error) {
    return defaultStore();
  }
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function readFeatureCatalog() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FEATURE_INDEX_FILE, 'utf8'));
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items
      .map((item) => ({
        featureId: normalizeFeatureId(item.featureId),
        category: normalizeCategory(item.category),
        bucket: normalizeString(item.bucket, 80) || 'general',
        description: normalizeString(item.description || item.text, 900),
        blockKey: normalizeString(item.blockKey, 160),
        sourceLine: Number.isFinite(Number(item.sourceLine)) ? Number(item.sourceLine) : null
      }))
      .filter((item) => item.featureId);
  } catch (_error) {
    return [];
  }
}

function normalizeControlPatch(body = {}) {
  const status = normalizeString(body.status, 40).toLowerCase();
  const approvalRequired = body.approvalRequired === true || status === 'approval_required' || status === 'pending_approval';
  const enabled = body.enabled !== undefined
    ? Boolean(body.enabled)
    : !(BLOCKED_STATUSES.has(status) || approvalRequired);
  const normalizedStatus = status || (enabled ? 'active' : 'disabled');

  return {
    enabled,
    status: normalizedStatus,
    approvalRequired,
    reason: normalizeString(body.reason, 600),
    correction: normalizeString(body.correction, 1000),
    labelOverride: normalizeString(body.labelOverride, 160),
    owner: normalizeString(body.owner, 160),
    dueDate: normalizeString(body.dueDate, 80),
    payload: safeObject(body.payload)
  };
}

function summarizeCatalog(items, store) {
  const summary = {};
  items.forEach((item) => {
    const key = featureKey(item.category, item.featureId);
    const control = safeObject(store.features[key]);
    const status = normalizeString(control.status, 40).toLowerCase() || 'active';
    const blocked = control.enabled === false || control.approvalRequired === true || BLOCKED_STATUSES.has(status);
    const category = item.category || 'general';
    summary[category] = summary[category] || {
      total: 0,
      active: 0,
      paused: 0,
      approvalRequired: 0
    };
    summary[category].total += 1;
    if (control.approvalRequired === true || status === 'approval_required' || status === 'pending_approval') {
      summary[category].approvalRequired += 1;
    } else if (blocked) {
      summary[category].paused += 1;
    } else {
      summary[category].active += 1;
    }
  });
  return summary;
}

function withControl(item, store) {
  const key = featureKey(item.category, item.featureId);
  const control = safeObject(store.features[key]);
  return {
    ...item,
    control: {
      enabled: control.enabled !== false,
      status: normalizeString(control.status, 40).toLowerCase() || 'active',
      approvalRequired: control.approvalRequired === true,
      reason: normalizeString(control.reason, 600),
      correction: normalizeString(control.correction, 1000),
      labelOverride: normalizeString(control.labelOverride, 160),
      owner: normalizeString(control.owner, 160),
      dueDate: normalizeString(control.dueDate, 80),
      updatedAt: normalizeString(control.updatedAt, 80)
    }
  };
}

function recordAction(store, action) {
  store.actions.push({
    ...action,
    createdAt: nowIso()
  });
  if (store.actions.length > MAX_ACTIONS) {
    store.actions.splice(0, store.actions.length - MAX_ACTIONS);
  }
}

router.get('/catalog', (req, res) => {
  const store = readStore();
  const catalog = readFeatureCatalog();
  const category = normalizeCategory(req.query.category || '');
  const q = normalizeString(req.query.q, 120).toLowerCase();
  const limitInput = Number(req.query.limit);
  const limit = Number.isFinite(limitInput) && limitInput > 0 ? Math.min(limitInput, 1000) : 250;

  let items = catalog;
  if (category && category !== 'general') {
    items = items.filter((item) => item.category === category);
  }
  if (q) {
    items = items.filter((item) => [
      item.featureId,
      item.category,
      item.bucket,
      item.description,
      item.blockKey
    ].join(' ').toLowerCase().includes(q));
  }

  return res.status(200).json({
    ok: true,
    totalCatalogItems: catalog.length,
    count: items.length,
    summary: summarizeCatalog(catalog, store),
    items: items.slice(0, limit).map((item) => withControl(item, store)),
    storeUpdatedAt: store.updatedAt
  });
});

router.get('/state', (_req, res) => {
  const store = readStore();
  return res.status(200).json({
    ok: true,
    store
  });
});

router.put('/state/:category/:featureId', (req, res) => {
  const category = normalizeCategory(req.params.category);
  const featureId = normalizeFeatureId(req.params.featureId);
  if (!featureId) {
    return res.status(400).json({ ok: false, message: 'featureId is required' });
  }

  const store = readStore();
  const key = featureKey(category, featureId);
  const previous = safeObject(store.features[key]);
  const patch = normalizeControlPatch(req.body || {});
  const item = {
    ...previous,
    ...patch,
    featureId,
    category,
    blockKey: normalizeString(req.body?.blockKey || previous.blockKey, 160),
    bucket: normalizeString(req.body?.bucket || previous.bucket, 80),
    description: normalizeString(req.body?.description || previous.description, 900),
    updatedAt: nowIso(),
    createdAt: previous.createdAt || nowIso()
  };

  store.features[key] = item;
  store.updatedAt = item.updatedAt;
  recordAction(store, {
    action: 'feature_control_update',
    category,
    featureId,
    status: item.status,
    enabled: item.enabled,
    approvalRequired: item.approvalRequired,
    reason: item.reason,
    adminId: req.user && req.user.id ? String(req.user.id) : ''
  });
  writeStore(store);

  return res.status(200).json({ ok: true, key, control: item, updatedAt: store.updatedAt });
});

router.post('/bulk', (req, res) => {
  const store = readStore();
  const catalog = readFeatureCatalog();
  const category = normalizeCategory(req.body?.category || '');
  const featureIds = Array.isArray(req.body?.featureIds)
    ? req.body.featureIds.map(normalizeFeatureId).filter(Boolean)
    : [];
  const patch = normalizeControlPatch(req.body || {});
  const now = nowIso();

  let candidates = catalog;
  if (category && category !== 'general' && category !== 'all') {
    candidates = candidates.filter((item) => item.category === category);
  }
  if (featureIds.length) {
    const wanted = new Set(featureIds.map((item) => item.toLowerCase()));
    candidates = candidates.filter((item) => wanted.has(item.featureId.toLowerCase()));
  }

  candidates.forEach((feature) => {
    const key = featureKey(feature.category, feature.featureId);
    const previous = safeObject(store.features[key]);
    store.features[key] = {
      ...previous,
      ...feature,
      ...patch,
      updatedAt: now,
      createdAt: previous.createdAt || now
    };
  });
  store.updatedAt = now;
  recordAction(store, {
    action: 'feature_control_bulk_update',
    category: category || 'all',
    count: candidates.length,
    status: patch.status,
    enabled: patch.enabled,
    approvalRequired: patch.approvalRequired,
    reason: patch.reason,
    adminId: req.user && req.user.id ? String(req.user.id) : ''
  });
  writeStore(store);

  return res.status(200).json({
    ok: true,
    updated: candidates.length,
    updatedAt: store.updatedAt,
    summary: summarizeCatalog(catalog, store)
  });
});

module.exports = router;
