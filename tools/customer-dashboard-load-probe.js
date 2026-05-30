const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const port = 4173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function resolveRequest(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, '');
  const full = path.resolve(root, normalized || 'index.html');
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const requested = resolveRequest(req.url || '/');
    if (!requested) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const target = fs.existsSync(requested) && fs.statSync(requested).isDirectory()
      ? path.join(requested, 'index.html')
      : requested;

    fs.readFile(target, (error, data) => {
      if (error) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleRows = [];
  const pageErrors = [];
  page.on('console', (message) => consoleRows.push({
    type: message.type(),
    text: message.text().slice(0, 220)
  }));
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error).slice(0, 300)));

  try {
    await page.addInitScript(() => {
      const user = {
        id: 'cust-perf-001',
        _id: 'cust-perf-001',
        name: 'Performance Customer',
        fullName: 'Performance Customer',
        email: 'perf.customer@example.com',
        role: 'customer',
        token: 'perf-token'
      };
      localStorage.setItem('currentUser', JSON.stringify(user));
      localStorage.setItem('authToken', 'perf-token');
      localStorage.setItem('goindiaride_customer_session', JSON.stringify({ user, token: 'perf-token' }));
      const rows = Array.from({ length: 900 }, (_, index) => ({
        id: `RID-PERF-${index}`,
        bookingId: `RID-PERF-${index}`,
        customerId: 'cust-perf-001',
        customerEmail: 'perf.customer@example.com',
        pickup: `Ahmedabad Railway Station ${index}`,
        drop: `Surat Airport ${index}`,
        status: index % 5 === 0 ? 'completed' : 'pending',
        fare: 1200 + index,
        updatedAt: new Date(Date.now() - index * 1000).toISOString(),
        notes: 'seed '.repeat(12)
      }));
      [
        'bookings',
        'goindiaride_bookings',
        'goindiaride_active_bookings',
        'goindiaride_completed_rides',
        'goindiaride_admin_customer_bookings',
        'goindiaride_admin_customer_bookings_current_v1',
        'goindiaride_customer_bookings_v1',
        'goindiaride_live_customer_booking_queue_v1'
      ].forEach((key) => localStorage.setItem(key, JSON.stringify(rows)));
    });

    const startedAt = Date.now();
    await page.goto(`http://127.0.0.1:${port}/pages/customer-dashboard.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const result = await page.evaluate((startedAtValue) => {
      const nav = performance.getEntriesByType('navigation')[0];
      const runtime = window.GoIndiaRideCustomerRuntime || {};
      const cacheRows = runtime.getBookingsCache && runtime.getBookingsCache();
      const storageSizes = [
        'bookings',
        'goindiaride_bookings',
        'goindiaride_active_bookings',
        'goindiaride_completed_rides',
        'goindiaride_admin_customer_bookings',
        'goindiaride_admin_customer_bookings_current_v1',
        'goindiaride_customer_bookings_v1',
        'goindiaride_live_customer_booking_queue_v1'
      ].map((key) => ({ key, chars: (localStorage.getItem(key) || '').length }));

      return {
        readyState: document.readyState,
        scriptCount: document.scripts.length,
        duration: nav ? Math.round(nav.duration) : null,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
        elapsedAfterReloadMs: Date.now() - startedAtValue,
        cacheRows: Array.isArray(cacheRows) ? cacheRows.length : null,
        storageSizes
      };
    }, startedAt);

    console.log(JSON.stringify({
      result,
      consoleRows: consoleRows.slice(0, 12),
      pageErrors
    }, null, 2));
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
