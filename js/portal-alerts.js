(function initPortalAlerts(global) {
  const STORAGE_KEY = 'goindia_portal_alerts';
  const MAX_ALERTS = 120;

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function write(alerts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS)));
  }

  function pushAlert(payload) {
    const entry = {
      id: 'alt_' + Date.now() + '_' + Math.random().toString(16).slice(2, 7),
      title: payload.title || 'Platform Alert',
      message: payload.message || '',
      type: payload.type || 'info',
      rideId: payload.rideId || null,
      roles: Array.isArray(payload.roles) && payload.roles.length ? payload.roles : ['admin', 'driver', 'customer'],
      createdAt: new Date().toISOString()
    };

    const alerts = read();
    alerts.unshift(entry);
    write(alerts);
    return entry;
  }

  function getAlertsForRole(role) {
    const alerts = read();
    if (!role) return alerts;
    return alerts.filter((a) => (a.roles || []).includes(role));
  }

  function timeAgo(iso) {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const delta = Math.max(0, Math.floor((now - then) / 1000));
    if (delta < 60) return 'just now';
    if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
    if (delta < 86400) return Math.floor(delta / 3600) + 'h ago';
    return Math.floor(delta / 86400) + 'd ago';
  }

  global.PortalAlerts = {
    pushAlert,
    getAlertsForRole,
    timeAgo
  };
})(window);
