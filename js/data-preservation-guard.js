(function initGoIndiaDataPreservation(global) {
  'use strict';

  if (!global || global.GoIndiaDataPreservation) return;

  var VERSION = '20260512-data-preserve1';
  var BACKUP_KEY = 'goindiaride_persistent_data_backup_v1';
  var LEGACY_ACCOUNT_BACKUP_KEY = 'goindiaride_accounts_backup_v2';
  var storage = null;
  var nativeGetItem = null;
  var nativeSetItem = null;
  var nativeRemoveItem = null;
  var nativeClear = null;
  var nativeKey = null;
  var internalWrite = false;
  var restoreTimer = null;
  var snapshotTimer = null;
  var lastSnapshotAt = 0;
  var lastRestoreAt = 0;
  var MAX_DEEP_PARSE_CHARS = 220000;
  var MAX_BACKUP_READ_CHARS = 900000;
  var MAX_KEYS_PER_PASS = 12;
  var MAX_BACKUP_KEYS = 50;
  var MIN_SNAPSHOT_INTERVAL_MS = 60000;
  var MIN_RESTORE_INTERVAL_MS = 30000;

  var EXACT_KEYS = [
    'users',
    'goride_users',
    'customers',
    'goindiaride_users',
    'goindiaride_customers',
    'registeredUsers',
    'registered_users',
    'goindia_users',
    'goindiaride_user_accounts',
    'user_accounts',
    'drivers',
    'goride_drivers',
    'goindiaride_drivers',
    'registeredDrivers',
    'registered_drivers',
    'goindia_drivers',
    'goindiaride_driver_accounts',
    'driver_accounts',
    'driver_data',
    'bookings',
    'goride_bookings',
    'customerBookings',
    'customer_bookings',
    'adminDemoBookings',
    'adminDemoDrivers',
    'adminDemoUsers',
    'goindiaride_admin_review_inbox_v1',
    'goindiaride_admin_customer_bookings_current_v1',
    'goindiaride_admin_driver_bookings_current_v1',
    'goindiaride_admin_booking_split_views_current_v1',
    'goindiaride_active_bookings',
    'goindiaride_scheduled_rides',
    'goindiaride_ride_history',
    'goindiaride_package_bookings',
    'goindiaride_virtual_escort_trips',
    'goindiaride_last_trip',
    'goindiaride_ride_preferences',
    'goride_messages',
    'goindiaride_portal_notifications',
    'goindiaride_admin_portal_controls_v1',
    'goindiaride_admin_app_settings_v1',
    'goindiaride_admin_portal_connection_v1',
    'adminAuditLogs',
    'wallet_data',
    'goindiaride_wallet',
    'goindiaride_wallet_transactions',
    'goindiaride_rewards',
    'goindiaride_donations',
    'goindiaride_withdraw_requests',
    'goindiaride_tourism_data',
    'goindiaride_event_notifications',
    'goindiaride_emergency_contacts',
    'goindiaride_emergency_numbers',
    'goindiaride_sos_logs',
    'goindiaride_user',
    'goindiaride_travel_id',
    'goindiaride.profile.runtime',
    'goindiaride.runtime.userKey',
    'goindiaride_customer_feature_state_v1',
    'goindiaride_driver_feature_state_v1',
    LEGACY_ACCOUNT_BACKUP_KEY
  ];

  var PREFIX_KEYS = [
    'wallet_',
    'driverWallet_',
    'customerDonations_',
    'ratings_',
    'messages_',
    'goride_chat_initialized_',
    'goindiaride_wallet_',
    'goindiaride_booking_',
    'goindiaride_customer_',
    'goindiaride_driver_',
    'goindiaride_message_',
    'goindiaride_notification_',
    'goindiaride_portal_',
    'goindiaride_admin_portal_',
    'goindiaride_admin_app_',
    'goindiaride_ride_',
    'goindiaride_active_booking',
    'goindiaride_scheduled_ride',
    'goindiaride_emergency_',
    'goindiaride_sos_',
    'goindiaride_tourism_',
    'goindiaride_event_',
    'goindiaride_package_',
    'goindiaride_rewards_',
    'goindiaride_donations_',
    'goindiaride_withdraw_'
  ];

  var EXCLUDED_KEYS = [
    BACKUP_KEY,
    'currentUser',
    'currentDriver',
    'currentAdmin',
    'userRole',
    'role',
    'accountType',
    'accessToken',
    'authToken',
    'token',
    'goindiaride_refresh_token',
    'goindiaride_refresh_token_v1',
    'goindiaride_session_continuity_v1',
    'goindiaride_auth_mode',
    'goindiaride_auth_reason',
    'goindiaride_api_base',
    'goindiaride_device_fingerprint_v1',
    'goindiaride_user_type',
    'goindiaride_visited',
    'goindiaride_active_section',
    'goindiaride_theme',
    'goindiaride_admin_session',
    'goindiaride_admin_otp_context',
    'admin2FAEmail',
    'admin2FAOTP',
    'admin2FAMethod'
  ];

  function toText(value) {
    return String(value === null || value === undefined ? '' : value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function arrayContains(list, value) {
    return list.indexOf(value) !== -1;
  }

  function startsWithAny(key, prefixes) {
    for (var i = 0; i < prefixes.length; i += 1) {
      if (key.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  function containsExcludedToken(key) {
    var lower = toText(key).toLowerCase();
    var tokens = [
      'otp',
      'token',
      'session',
      'auth',
      'fingerprint',
      'cooldown',
      'retry_queue',
      'seen_toasts',
      'failure',
      'failures',
      'quarantine'
    ];
    for (var i = 0; i < tokens.length; i += 1) {
      if (lower.indexOf(tokens[i]) !== -1) return true;
    }
    return false;
  }

  function shouldProtectKey(key) {
    var safeKey = toText(key);
    if (!safeKey || arrayContains(EXCLUDED_KEYS, safeKey)) return false;
    if (arrayContains(EXACT_KEYS, safeKey)) return true;
    if (containsExcludedToken(safeKey)) return false;
    return startsWithAny(safeKey, PREFIX_KEYS);
  }

  function safeParse(raw) {
    if (raw === null || raw === undefined) {
      return { exists: false, value: undefined, isJson: true };
    }
    var text = String(raw);
    if (text.length > MAX_DEEP_PARSE_CHARS) {
      return { exists: true, value: text, isJson: false, rawTooLarge: true };
    }
    try {
      return { exists: true, value: JSON.parse(text), isJson: true };
    } catch (_error) {
      return { exists: true, value: text, isJson: false };
    }
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function isEmptyLike(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (isPlainObject(value)) return Object.keys(value).length === 0;
    return false;
  }

  function normalizeEmail(value) {
    return toText(value).trim().toLowerCase();
  }

  function normalizePhone(value) {
    var raw = toText(value).trim();
    if (!raw) return '';
    var compact = raw.replace(/\s+/g, '');
    if (compact.charAt(0) === '+') {
      var plusDigits = compact.slice(1).replace(/\D/g, '');
      return plusDigits ? ('+' + plusDigits) : '';
    }
    var digits = compact.replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) return '+91' + digits;
    return digits ? ('+' + digits) : '';
  }

  function stableStringify(value) {
    if (!isPlainObject(value) && !Array.isArray(value)) return JSON.stringify(value);
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
  }

  function fnv1aHash(input) {
    var hash = 0x811c9dc5;
    var text = toText(input);
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = (hash >>> 0) * 0x01000193;
    }
    return (hash >>> 0).toString(16);
  }

  function identityKey(item, index) {
    if (!item || typeof item !== 'object') return 'primitive:' + toText(item);
    var fields = [
      'id',
      '_id',
      'bookingId',
      'booking_id',
      'rideId',
      'ride_id',
      'requestId',
      'transactionId',
      'txnId',
      'messageId',
      'notificationId',
      'driverId',
      'customerId',
      'userId',
      'backendUserId',
      'featureId',
      'blockKey',
      'sourceLine'
    ];
    for (var i = 0; i < fields.length; i += 1) {
      var value = item[fields[i]];
      if (!isEmptyLike(value)) return fields[i] + ':' + toText(value).trim().toLowerCase();
    }
    var email = normalizeEmail(item.email || item.userEmail || item.customerEmail || item.driverEmail);
    if (email) return 'email:' + email;
    var phone = normalizePhone(item.phone || item.mobile || item.contact || item.customerPhone || item.driverPhone);
    if (phone) return 'phone:' + phone;
    var timestamp = item.createdAt || item.timestamp || item.date || item.time;
    if (!isEmptyLike(timestamp)) return 'time:' + toText(timestamp).trim().toLowerCase() + ':' + fnv1aHash(stableStringify(item));
    return 'hash:' + (index || 0) + ':' + fnv1aHash(stableStringify(item));
  }

  function mergeValues(previous, incoming) {
    if (incoming === undefined) return previous;
    if (previous === undefined) return incoming;

    if (Array.isArray(previous) || Array.isArray(incoming)) {
      return mergeArrays(Array.isArray(previous) ? previous : [], Array.isArray(incoming) ? incoming : []);
    }

    if (isPlainObject(previous) && isPlainObject(incoming)) {
      return mergeObjects(previous, incoming);
    }

    if (typeof previous === 'number' && typeof incoming === 'number') {
      if (incoming === 0 && previous > 0) return previous;
      return incoming;
    }

    if (isEmptyLike(incoming) && !isEmptyLike(previous)) return previous;
    return incoming;
  }

  function mergeObjects(previous, incoming) {
    var result = {};
    var key;
    for (key in previous) {
      if (hasOwn(previous, key)) result[key] = previous[key];
    }
    for (key in incoming) {
      if (!hasOwn(incoming, key)) continue;
      result[key] = mergeValues(result[key], incoming[key]);
    }
    return result;
  }

  function mergeArrays(previous, incoming) {
    var map = {};
    var order = [];

    function upsert(item, index) {
      var key = identityKey(item, index);
      if (!hasOwn(map, key)) {
        order.push(key);
        map[key] = item;
        return;
      }
      map[key] = mergeValues(map[key], item);
    }

    (Array.isArray(previous) ? previous : []).forEach(upsert);
    (Array.isArray(incoming) ? incoming : []).forEach(upsert);
    return order.map(function (key) { return map[key]; });
  }

  function serializeValue(value, preferJson) {
    if (preferJson || typeof value !== 'string') {
      try {
        return { raw: JSON.stringify(value), value: value, isJson: true };
      } catch (_error) {
        return { raw: toText(value), value: toText(value), isJson: false };
      }
    }
    return { raw: toText(value), value: toText(value), isJson: false };
  }

  function getRaw(key) {
    if (!storage || !nativeGetItem) return null;
    try {
      return nativeGetItem.call(storage, key);
    } catch (_error) {
      return null;
    }
  }

  function setRaw(key, raw) {
    if (!storage || !nativeSetItem) return;
    internalWrite = true;
    try {
      nativeSetItem.call(storage, key, raw);
    } catch (_error) {
      // Ignore quota and blocked storage errors.
    } finally {
      internalWrite = false;
    }
  }

  function removeRaw(key) {
    if (!storage || !nativeRemoveItem) return;
    internalWrite = true;
    try {
      nativeRemoveItem.call(storage, key);
    } catch (_error) {
      // Ignore storage errors.
    } finally {
      internalWrite = false;
    }
  }

  function readBackup() {
    var raw = getRaw(BACKUP_KEY);
    if (raw && String(raw).length > MAX_BACKUP_READ_CHARS) {
      return {
        version: VERSION,
        stores: {},
        skippedOversizedBackupAt: new Date().toISOString()
      };
    }
    var parsed = safeParse(raw);
    var backup = parsed.exists && isPlainObject(parsed.value) ? parsed.value : {};
    if (!isPlainObject(backup.stores)) backup.stores = {};
    backup.version = VERSION;
    return backup;
  }

  function compactBackupForWrite(backup) {
    if (!backup || !isPlainObject(backup.stores)) return backup;
    var stores = backup.stores;
    var keys = Object.keys(stores);
    if (keys.length <= MAX_BACKUP_KEYS) return backup;

    keys.sort(function (left, right) {
      var leftAt = Date.parse((stores[left] && stores[left].updatedAt) || '') || 0;
      var rightAt = Date.parse((stores[right] && stores[right].updatedAt) || '') || 0;
      return rightAt - leftAt;
    });

    var compactStores = {};
    keys.slice(0, MAX_BACKUP_KEYS).forEach(function (key) {
      compactStores[key] = stores[key];
    });
    backup.stores = compactStores;
    backup.prunedAt = new Date().toISOString();
    backup.prunedKeyCount = keys.length - Object.keys(compactStores).length;
    return backup;
  }

  function writeBackup(backup) {
    if (!backup || !isPlainObject(backup.stores)) return;
    backup.version = VERSION;
    backup.updatedAt = new Date().toISOString();
    compactBackupForWrite(backup);
    var raw = '';
    try {
      raw = JSON.stringify(backup);
    } catch (_error) {
      return;
    }
    if (raw.length > MAX_BACKUP_READ_CHARS) {
      backup.stores = {};
      backup.prunedAt = new Date().toISOString();
      backup.prunedReason = 'backup-size-limit';
      raw = JSON.stringify(backup);
    }
    setRaw(BACKUP_KEY, raw);
  }

  function backupParsedValue(key, parsed, backup) {
    if (!shouldProtectKey(key) || !parsed || !parsed.exists) return backup;
    if (parsed.rawTooLarge) return backup || readBackup();
    var target = backup || readBackup();
    var previous = target.stores[key] && hasOwn(target.stores[key], 'value')
      ? target.stores[key].value
      : undefined;
    var merged = mergeValues(previous, parsed.value);
    var serialized = serializeValue(merged, parsed.isJson || typeof merged !== 'string');
    target.stores[key] = {
      raw: serialized.raw,
      value: serialized.value,
      isJson: serialized.isJson,
      updatedAt: new Date().toISOString()
    };
    return target;
  }

  function backupKey(key) {
    var safeKey = toText(key);
    var raw = getRaw(safeKey);
    if (raw === null || raw === undefined) return false;
    var backup = backupParsedValue(safeKey, safeParse(raw));
    writeBackup(backup);
    return true;
  }

  function normalizeRunOptions(options) {
    var settings = options && typeof options === 'object' ? options : {};
    return {
      force: Boolean(settings.force),
      maxKeys: Math.max(1, Number(settings.maxKeys) || MAX_KEYS_PER_PASS)
    };
  }

  function shouldThrottle(lastRunAt, intervalMs, force) {
    if (force) return false;
    return Date.now() - lastRunAt < intervalMs;
  }

  function snapshotAll(options) {
    if (!storage || !nativeKey) return false;
    var settings = normalizeRunOptions(options);
    if (shouldThrottle(lastSnapshotAt, MIN_SNAPSHOT_INTERVAL_MS, settings.force)) return false;
    lastSnapshotAt = Date.now();
    var backup = readBackup();
    var keys = [];
    try {
      for (var i = 0; i < storage.length; i += 1) {
        var key = nativeKey.call(storage, i);
        if (shouldProtectKey(key)) keys.push(key);
      }
    } catch (_error) {
      return false;
    }
    keys = keys.slice(0, settings.maxKeys);
    keys.forEach(function (key) {
      backupParsedValue(key, safeParse(getRaw(key)), backup);
    });
    writeBackup(backup);
    return true;
  }

  function restoreKeyFromEntry(key, entry) {
    if (!shouldProtectKey(key) || !entry || !hasOwn(entry, 'value')) return false;
    var current = safeParse(getRaw(key));
    var merged = current.exists ? mergeValues(entry.value, current.value) : entry.value;
    var serialized = serializeValue(merged, entry.isJson !== false || typeof merged !== 'string');
    if (!current.exists || getRaw(key) !== serialized.raw) {
      setRaw(key, serialized.raw);
      return true;
    }
    return false;
  }

  function restoreAll(options) {
    var settings = normalizeRunOptions(options);
    if (shouldThrottle(lastRestoreAt, MIN_RESTORE_INTERVAL_MS, settings.force)) return false;
    lastRestoreAt = Date.now();
    var backup = readBackup();
    var stores = backup.stores || {};
    var changed = false;
    Object.keys(stores).slice(0, settings.maxKeys).forEach(function (key) {
      if (restoreKeyFromEntry(key, stores[key])) changed = true;
    });
    if (changed) scheduleSnapshot({ maxKeys: settings.maxKeys });
    return changed;
  }

  function restoreFromBackup(backup) {
    if (!backup || !isPlainObject(backup.stores)) return false;
    writeBackup(backup);
    var changed = false;
    Object.keys(backup.stores).slice(0, MAX_KEYS_PER_PASS).forEach(function (key) {
      if (restoreKeyFromEntry(key, backup.stores[key])) changed = true;
    });
    if (changed) scheduleSnapshot();
    return changed;
  }

  function scheduleIdle(callback, timeoutMs) {
    if (typeof global.requestIdleCallback === 'function') {
      return global.requestIdleCallback(callback, { timeout: timeoutMs || 1200 });
    }
    return global.setTimeout(callback, timeoutMs || 2500);
  }

  function scheduleRestore(options) {
    if (restoreTimer) return;
    restoreTimer = scheduleIdle(function () {
      restoreTimer = null;
      restoreAll(options);
    }, 4500);
  }

  function scheduleSnapshot(options) {
    if (snapshotTimer) return;
    snapshotTimer = scheduleIdle(function () {
      snapshotTimer = null;
      snapshotAll(options);
    }, 9000);
  }

  function guardedSetItem(key, value) {
    var safeKey = toText(key);
    if (internalWrite || !shouldProtectKey(safeKey)) {
      return nativeSetItem.call(this, key, value);
    }

    var incomingRaw = toText(value);
    var existingRaw = getRaw(safeKey);
    if (existingRaw === incomingRaw) return undefined;

    if (incomingRaw.length > MAX_DEEP_PARSE_CHARS || (existingRaw && existingRaw.length > MAX_DEEP_PARSE_CHARS)) {
      internalWrite = true;
      try {
        nativeSetItem.call(storage, safeKey, incomingRaw);
      } finally {
        internalWrite = false;
      }
      scheduleSnapshot({ maxKeys: 4 });
      return undefined;
    }

    var backup = readBackup();
    var backupEntry = backup.stores[safeKey] || null;
    var existing = safeParse(existingRaw);
    var incoming = safeParse(incomingRaw);
    if (!incoming.exists) incoming = { exists: true, value: toText(value), isJson: false };

    var base = backupEntry && hasOwn(backupEntry, 'value') ? backupEntry.value : undefined;
    base = existing.exists ? mergeValues(base, existing.value) : base;
    var merged = mergeValues(base, incoming.value);
    var serialized = serializeValue(merged, incoming.isJson || existing.isJson || (backupEntry && backupEntry.isJson !== false));

    internalWrite = true;
    try {
      nativeSetItem.call(storage, safeKey, serialized.raw);
    } finally {
      internalWrite = false;
    }

    backup.stores[safeKey] = {
      raw: serialized.raw,
      value: serialized.value,
      isJson: serialized.isJson,
      updatedAt: new Date().toISOString()
    };
    writeBackup(backup);
    return undefined;
  }

  function guardedRemoveItem(key) {
    var safeKey = toText(key);
    if (!internalWrite && shouldProtectKey(safeKey)) {
      backupKey(safeKey);
      var result = nativeRemoveItem.call(this, key);
      scheduleRestore();
      return result;
    }
    return nativeRemoveItem.call(this, key);
  }

  function guardedClear() {
    var backup = null;
    if (!internalWrite) {
      snapshotAll({ force: true, maxKeys: MAX_BACKUP_KEYS });
      backup = readBackup();
    }
    var result = nativeClear.call(this);
    if (!internalWrite && backup) restoreFromBackup(backup);
    return result;
  }

  function installStorageGuard() {
    storage = global.localStorage || null;
    if (!storage) return false;

    var prototype = global.Storage && global.Storage.prototype;
    nativeGetItem = prototype && prototype.getItem ? prototype.getItem : storage.getItem;
    nativeSetItem = prototype && prototype.setItem ? prototype.setItem : storage.setItem;
    nativeRemoveItem = prototype && prototype.removeItem ? prototype.removeItem : storage.removeItem;
    nativeClear = prototype && prototype.clear ? prototype.clear : storage.clear;
    nativeKey = prototype && prototype.key ? prototype.key : storage.key;

    if (!nativeGetItem || !nativeSetItem || !nativeRemoveItem || !nativeClear || !nativeKey) return false;
    if (storage.__goIndiaDataPreservationPatched) return true;

    try {
      if (prototype && !prototype.__goIndiaDataPreservationPatched) {
        prototype.setItem = function setItemGuard(key, value) {
          if (this !== storage) return nativeSetItem.call(this, key, value);
          return guardedSetItem.call(this, key, value);
        };
        prototype.removeItem = function removeItemGuard(key) {
          if (this !== storage) return nativeRemoveItem.call(this, key);
          return guardedRemoveItem.call(this, key);
        };
        prototype.clear = function clearGuard() {
          if (this !== storage) return nativeClear.call(this);
          return guardedClear.call(this);
        };
        prototype.__goIndiaDataPreservationPatched = true;
      } else {
        storage.setItem = guardedSetItem;
        storage.removeItem = guardedRemoveItem;
        storage.clear = guardedClear;
      }
      storage.__goIndiaDataPreservationPatched = true;
    } catch (_error) {
      // If method patching is blocked, load-time restore and unload snapshots still protect data.
    }

    return true;
  }

  installStorageGuard();
  scheduleRestore({ maxKeys: 8 });
  scheduleSnapshot({ maxKeys: 8 });

  if (global.addEventListener) {
    global.addEventListener('DOMContentLoaded', function () {
      scheduleSnapshot({ maxKeys: 8 });
    });
    global.addEventListener('pagehide', function () {
      snapshotAll({ force: true, maxKeys: 10 });
    });
    global.addEventListener('beforeunload', function () {
      snapshotAll({ force: true, maxKeys: 10 });
    });
    global.addEventListener('visibilitychange', function () {
      if (!global.document || global.document.visibilityState === 'hidden') {
        scheduleSnapshot({ maxKeys: 10 });
      } else {
        scheduleRestore({ maxKeys: 8 });
      }
    });
    global.addEventListener('storage', function (event) {
      if (!event || !shouldProtectKey(event.key)) return;
      if (event.newValue === null || event.newValue === undefined) scheduleRestore();
      else backupKey(event.key);
    });
  }

  global.GoIndiaDataPreservation = {
    VERSION: VERSION,
    BACKUP_KEY: BACKUP_KEY,
    shouldProtectKey: shouldProtectKey,
    mergeValues: mergeValues,
    snapshotAll: snapshotAll,
    restoreAll: restoreAll,
    scheduleSnapshot: scheduleSnapshot,
    scheduleRestore: scheduleRestore,
    backupKey: backupKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
