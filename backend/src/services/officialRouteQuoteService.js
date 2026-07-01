const RAJMARG_BASE_URL = 'https://rajmargyatra.nhai.gov.in/nhai';
const ROUTE_PLANNER_URL = `${RAJMARG_BASE_URL}/api/v2.0/getMMIMultipleRoutePlannerDev`;
const DEFAULT_VEHICLE_TYPE = '35';

function cleanRouteText(value, maxLength = 180) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toMoney(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function parseDistanceKm(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDurationMinutes(value) {
  const text = String(value || '').toLowerCase();
  const hours = Number((text.match(/(\d+(?:\.\d+)?)\s*h/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+(?:\.\d+)?)\s*m/) || [])[1] || 0);
  const seconds = Number((text.match(/(\d+(?:\.\d+)?)\s*s/) || [])[1] || 0);
  const total = hours * 60 + minutes + seconds / 60;
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
}

function normalizeTollDetails(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const name = cleanRouteText(item && item.tp_name, 90);
      const amount = toMoney(item && item.tp_rate);
      if (!name && amount <= 0) return null;
      return {
        name,
        amount,
        latitude: Number(item && item.tp_latitude) || null,
        longitude: Number(item && item.tp_longitude) || null,
        isEligible: item && item.isEligible !== false
      };
    })
    .filter(Boolean);
}

function pickOfficialRoute(routes = []) {
  if (!Array.isArray(routes) || !routes.length) return null;
  const candidates = routes
    .map((route, index) => ({
      index,
      data: route && route.data ? route.data : {},
      raw: route
    }))
    .filter((route) => parseDistanceKm(route.data.distance) > 0);

  if (!candidates.length) return null;

  // Rajmarg Yatra renders the first route as the default recommendation.
  return candidates.find((route) => route.index === 0) || candidates[0];
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, {
      ...options,
      signal: controller ? controller.signal : undefined
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function getOfficialRouteQuote({
  pickup,
  drop,
  vehicleType = DEFAULT_VEHICLE_TYPE
} = {}) {
  const startAddress = cleanRouteText(pickup);
  const endAddress = cleanRouteText(drop);
  if (!startAddress || !endAddress) {
    return {
      ok: false,
      error: 'pickup_drop_required'
    };
  }

  let response;
  try {
    response = await fetchWithTimeout(ROUTE_PLANNER_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Referer: 'https://rajmargyatra.nhai.gov.in/',
        'User-Agent': 'GOIndiaRIDE-route-quote/1.0'
      },
      body: JSON.stringify({
        startAddress,
        endAddress,
        vehicletype: cleanRouteText(vehicleType, 20) || DEFAULT_VEHICLE_TYPE,
        source: 'web'
      })
    });
  } catch (error) {
    return {
      ok: false,
      error: 'official_route_unavailable',
      reason: cleanRouteText(error && error.message, 120) || 'official_route_fetch_failed'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: 'official_route_unavailable',
      status: response.status
    };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      ok: false,
      error: 'official_route_invalid_response',
      reason: cleanRouteText(error && error.message, 120) || 'official_route_json_failed'
    };
  }
  const selectedRoute = pickOfficialRoute(payload && payload.payload && payload.payload.routes);
  if (!selectedRoute) {
    return {
      ok: false,
      error: 'official_route_not_found',
      resultCode: payload && payload.resultCode
    };
  }

  const data = selectedRoute.data || {};
  const distanceKm = parseDistanceKm(data.distance);
  const tollPlazas = normalizeTollDetails(data.tollDetails);
  const positiveTollTotal = tollPlazas.reduce((sum, plaza) => sum + (plaza.amount || 0), 0);
  const tollCharge = toMoney(data.total_cost || data.nh_cost || positiveTollTotal);

  return {
    ok: true,
    source: 'rajmarg_yatra_route_planner',
    sourceUrl: 'https://rajmargyatra.nhai.gov.in/#/route-planner',
    routeIndex: selectedRoute.index,
    distanceKm,
    durationMinutes: parseDurationMinutes(data.duration),
    tollCharge,
    tollPlazaCount: tollPlazas.length,
    tollPlazas,
    routeData: {
      source: 'rajmarg_yatra_route_planner',
      sourceUrl: 'https://rajmargyatra.nhai.gov.in/#/route-planner',
      distance: data.distance || `${distanceKm} Km`,
      duration: data.duration || '',
      total_cost: tollCharge,
      nh_cost: toMoney(data.nh_cost),
      state_cost: toMoney(data.state_cost),
      total_tolls: Number(data.total_tolls) || tollPlazas.length,
      tollDetails: tollPlazas.map((plaza) => ({
        tp_name: plaza.name,
        tp_rate: plaza.amount,
        tp_latitude: plaza.latitude,
        tp_longitude: plaza.longitude,
        isEligible: plaza.isEligible
      }))
    }
  };
}

module.exports = {
  getOfficialRouteQuote,
  parseDistanceKm,
  parseDurationMinutes
};
