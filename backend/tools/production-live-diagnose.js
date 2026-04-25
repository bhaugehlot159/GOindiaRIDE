/* eslint-disable no-console */
const dns = require('dns');
const dnsPromises = dns.promises;
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || String(next).startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function normalizeBase(value, fallback = '') {
  const raw = String(value || fallback || '').trim();
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

function toHost(value) {
  try {
    return new URL(String(value || '')).hostname;
  } catch (_error) {
    return '';
  }
}

async function resolveDns(hostname) {
  if (!hostname) return { ok: false, addresses: [], error: 'hostname_missing' };
  try {
    const addresses = await dnsPromises.resolve4(hostname);
    return { ok: addresses.length > 0, addresses, error: null };
  } catch (error) {
    try {
      const lookedUp = await dnsPromises.lookup(hostname, { all: true });
      const addresses = Array.isArray(lookedUp)
        ? lookedUp.map((entry) => String(entry && entry.address ? entry.address : '')).filter(Boolean)
        : [];
      if (addresses.length) {
        return { ok: true, addresses, error: null };
      }
    } catch (_lookupError) {
      // Ignore fallback lookup error and return original error below.
    }
    return { ok: false, addresses: [], error: String(error && error.message ? error.message : 'dns_lookup_failed') };
  }
}

async function requestWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function httpProbe({ name, method, url, headers = {}, body = null, timeoutMs = 12000 }) {
  const result = {
    name,
    method,
    url,
    ok: false,
    status: 0,
    bodyPreview: '',
    error: null
  };

  try {
    const response = await requestWithTimeout(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body)
    }, timeoutMs);

    const text = await response.text().catch(() => '');
    result.status = Number(response.status || 0);
    result.bodyPreview = String(text || '').slice(0, 320);
    result.ok = response.ok;
    return result;
  } catch (error) {
    result.error = String(error && error.message ? error.message : 'network_error');
    return result;
  }
}

function routeReachableStatus(status) {
  return [200, 202, 400, 401, 403, 409, 422, 429].includes(Number(status || 0));
}

function healthReachableStatus(status) {
  return [200, 204].includes(Number(status || 0));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const siteBase = normalizeBase(args.site, 'https://goindiaride.in');
  const apiBase = normalizeBase(args.api, 'https://api.goindiaride.in');
  const origin = normalizeBase(args.origin, siteBase);
  const reportDir = path.join(__dirname, '..', 'reports');
  const reportPath = path.join(reportDir, 'production-live-diagnose-latest.json');

  const payload = {
    bookingId: `RIDCHECK${Date.now()}`,
    pickup: 'Udaipur',
    drop: 'Jaipur',
    customerName: 'Live Diagnosis',
    customerEmail: 'diagnose@goindiaride.in',
    customerPhone: '9999999999',
    tripPlan: 'one-way',
    paymentMethod: 'cash',
    vehicleType: 'economy',
    passengers: 1,
    rideDate: '2026-04-22',
    rideTime: '10:00'
  };

  const dnsSite = await resolveDns(toHost(siteBase));
  const dnsApi = await resolveDns(toHost(apiBase));

  const checks = [];
  checks.push(await httpProbe({
    name: 'site-health-direct',
    method: 'GET',
    url: `${siteBase}/health`
  }));
  checks.push(await httpProbe({
    name: 'site-future-runtime',
    method: 'GET',
    url: `${siteBase}/api/future-runtime/status`
  }));
  checks.push(await httpProbe({
    name: 'site-booking-fallback-email',
    method: 'POST',
    url: `${siteBase}/api/bookings/fallback/admin-alert-email`,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'x-booking-client': 'goindiaride-web'
    },
    body: payload
  }));
  checks.push(await httpProbe({
    name: 'site-backend-booking-fallback-email',
    method: 'POST',
    url: `${siteBase}/backend/api/bookings/fallback/admin-alert-email`,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'x-booking-client': 'goindiaride-web'
    },
    body: payload
  }));
  checks.push(await httpProbe({
    name: 'api-health-direct',
    method: 'GET',
    url: `${apiBase}/health`
  }));
  checks.push(await httpProbe({
    name: 'api-future-runtime',
    method: 'GET',
    url: `${apiBase}/api/future-runtime/status`
  }));
  checks.push(await httpProbe({
    name: 'api-booking-fallback-email',
    method: 'POST',
    url: `${apiBase}/api/bookings/fallback/admin-alert-email`,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'x-booking-client': 'goindiaride-web'
    },
    body: payload
  }));

  const summary = {
    siteDnsOk: dnsSite.ok,
    apiDnsOk: dnsApi.ok,
    siteHealthOk: checks.some((item) => item.name === 'site-health-direct' && healthReachableStatus(item.status)),
    apiHealthOk: checks.some((item) => item.name === 'api-health-direct' && healthReachableStatus(item.status)),
    siteBookingRouteOk: checks.some((item) => item.name === 'site-booking-fallback-email' && routeReachableStatus(item.status)),
    siteBackendBookingRouteOk: checks.some((item) => item.name === 'site-backend-booking-fallback-email' && routeReachableStatus(item.status)),
    apiBookingRouteOk: checks.some((item) => item.name === 'api-booking-fallback-email' && routeReachableStatus(item.status))
  };

  const recommendations = [];
  if (!summary.apiDnsOk) {
    recommendations.push('Create/fix DNS A record for api domain and verify with nslookup.');
  }
  if (!summary.siteBookingRouteOk && !summary.siteBackendBookingRouteOk) {
    recommendations.push('Configure website reverse proxy for /api/* or /backend/api/* to backend Node app (avoid static host 405).');
  }
  if (!summary.apiBookingRouteOk) {
    recommendations.push('Ensure api domain reverse proxy points to backend :5000 and allows POST methods.');
  }
  if (!summary.apiHealthOk && summary.apiDnsOk) {
    recommendations.push('Restart backend service and validate nginx upstream/SSL for api domain.');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    inputs: { siteBase, apiBase, origin },
    dns: {
      site: dnsSite,
      api: dnsApi
    },
    checks,
    summary,
    recommendations
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('=== GOIndiaRIDE Production Live Diagnose ===');
  console.log(`Site Base: ${siteBase}`);
  console.log(`API Base : ${apiBase}`);
  console.log(`Report   : ${reportPath}`);
  checks.forEach((item) => {
    const status = item.status ? `HTTP ${item.status}` : (item.error || 'NO_RESPONSE');
    console.log(`- ${item.name}: ${status}`);
  });
  console.log('Summary:', summary);
  if (recommendations.length) {
    console.log('Recommended Fixes:');
    recommendations.forEach((line, idx) => {
      console.log(`${idx + 1}. ${line}`);
    });
  } else {
    console.log('All critical live checks look healthy.');
  }

  const criticalOk = summary.siteBookingRouteOk || summary.apiBookingRouteOk;
  if (!criticalOk) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error('production-live-diagnose failed:', error && error.message ? error.message : error);
  process.exitCode = 1;
});
