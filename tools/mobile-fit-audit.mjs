import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

const screenshotPages = new Set([
  'index.html',
  'pages/login.html',
  'pages/signup.html',
  'pages/booking.html',
  'pages/customer-dashboard.html',
  'pages/driver-dashboard.html',
  'pages/admin-dashboard.html',
  'pages/services.html',
  'pages/contact.html',
  'pages/pricing.html',
  'blog/index.html',
  'admin/login.html'
]);

const ignoredHtmlDirs = new Set([
  '.git',
  '.mobile-audit',
  '.tools',
  '.worktrees',
  '.codex-main-push',
  '.codex-phone-main',
  'node_modules',
  'PropertySetu'
]);

function findChrome() {
  for (const candidate of chromeCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome or Edge executable was not found.');
}

function walkHtml(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredHtmlDirs.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    const relative = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtml(absolute, relative));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      files.push(relative.replace(/\\/g, '/'));
    }
  }
  return files;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json' || ext === '.webmanifest') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.ico') return 'image/x-icon';
  return 'application/octet-stream';
}

function createStaticServer() {
  return http.createServer(async (req, res) => {
    try {
      const parsed = new URL(req.url || '/', 'http://127.0.0.1');
      let requested = decodeURIComponent(parsed.pathname);
      if (requested.endsWith('/')) requested += 'index.html';
      const filePath = path.resolve(rootDir, requested.replace(/^\/+/, ''));
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const stat = await fsp.stat(filePath);
      const finalPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
      res.writeHead(200, { 'Content-Type': contentType(finalPath) });
      fs.createReadStream(finalPath).pipe(res);
    } catch (_error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function waitForDevtools(port) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  for (let i = 0; i < 70; i += 1) {
    try {
      return await fetchJson(versionUrl);
    } catch (_error) {
      await delay(150);
    }
  }
  throw new Error('Chrome DevTools endpoint did not start.');
}

async function createTarget(port) {
  const encoded = encodeURIComponent('about:blank');
  const url = `http://127.0.0.1:${port}/json/new?${encoded}`;
  try {
    return await fetchJson(url, { method: 'PUT' });
  } catch (_error) {
    return fetchJson(url);
  }
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
    this.events = [];
    this.dialogs = [];
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => this.onMessage(event));
  }

  onMessage(event) {
    const payload = JSON.parse(event.data);
    if (payload.id && this.pending.has(payload.id)) {
      const { resolve, reject } = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message || 'CDP command failed'));
      else resolve(payload.result || {});
      return;
    }
    if (payload.method === 'Page.javascriptDialogOpening') {
      this.dialogs.push(payload.params?.message || '');
      this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
    this.events.push(payload);
  }

  send(method, params = {}) {
    const id = this.id;
    this.id += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timed out: ${method}`));
        }
      }, 12000);
    });
  }

  async waitFor(method, timeoutMs = 9000) {
    const existing = this.events.find((event) => event.method === method);
    if (existing) return existing;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = this.events.find((event) => event.method === method);
      if (found) return found;
      await delay(100);
    }
    return null;
  }

  close() {
    try {
      this.ws.close();
    } catch (_error) {
      // Ignore close races during audit cleanup.
    }
  }
}

function seedScript(pagePath) {
  let role = 'customer';
  if (pagePath.includes('driver')) role = 'driver';
  if (pagePath.includes('admin')) role = 'admin';
  return `
    try {
      localStorage.setItem('userRole', '${role}');
      localStorage.setItem('currentCustomer', JSON.stringify({ id: 'audit_customer', name: 'Mobile Audit Customer', email: 'audit.customer@example.com', phone: '+919999999999' }));
      localStorage.setItem('currentDriver', JSON.stringify({ id: 'audit_driver', name: 'Mobile Audit Driver', email: 'audit.driver@example.com', phone: '+919888888888' }));
      localStorage.setItem('currentAdmin', JSON.stringify({ id: 'audit_admin', name: 'Mobile Audit Admin', email: 'audit.admin@example.com' }));
    } catch (_error) {}
  `;
}

const layoutExpression = `(() => {
  const doc = document.documentElement;
  const body = document.body;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollWidth = Math.max(doc ? doc.scrollWidth : 0, body ? body.scrollWidth : 0);
  const scrollHeight = Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0);
  const offenders = [];
  const nodes = body ? Array.from(body.querySelectorAll('*')) : [];
  for (const el of nodes) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.right > viewportWidth + 2 || rect.left < -2) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: String(el.getAttribute('class') || '').slice(0, 90),
        text: String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      });
      if (offenders.length >= 8) break;
    }
  }
  return {
    title: document.title,
    bodyClass: body ? String(body.className || '') : '',
    viewport: viewportWidth + 'x' + viewportHeight,
    scrollWidth,
    scrollHeight,
    overflowX: scrollWidth > viewportWidth + 2,
    offenders
  };
})()`;

async function auditPage({ pagePath, appPort, devtoolsPort, screenshotDir }) {
  const target = await createTarget(devtoolsPort);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  const url = `http://127.0.0.1:${appPort}/${pagePath}`;
  let result = null;
  let screenshotPath = '';
  try {
    console.error(`checking ${pagePath}`);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable');
    await session.send('Network.setBlockedURLs', {
      urls: [
        'https://cdnjs.cloudflare.com/*',
        'https://fonts.googleapis.com/*',
        'https://fonts.gstatic.com/*',
        'https://www.google.com/*',
        'https://maps.google.com/*'
      ]
    });
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await session.send('Emulation.setScriptExecutionDisabled', { value: true });
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(pagePath) });
    await session.send('Page.navigate', { url });
    await session.waitFor('Page.loadEventFired', 3200);
    await session.send('Page.stopLoading').catch(() => {});
    await delay(120);
    const evaluation = await session.send('Runtime.evaluate', {
      expression: layoutExpression,
      returnByValue: true,
      awaitPromise: true
    });
    result = evaluation.result?.value || { overflowX: true, offenders: [] };
    if (screenshotPages.has(pagePath)) {
      const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const safeName = pagePath.replace(/[\\/]/g, '__').replace(/\.html$/i, '.png');
      screenshotPath = path.join(screenshotDir, safeName);
      await fsp.writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
    }
  } finally {
    session.close();
    if (target.id) {
      await fetch(`http://127.0.0.1:${devtoolsPort}/json/close/${target.id}`).catch(() => {});
    }
  }
  return {
    pagePath,
    url,
    screenshotPath,
    dialogs: session.dialogs,
    ...result
  };
}

async function main() {
  const server = createStaticServer();
  const appPort = await listen(server);
  const devtoolsPort = 9333 + Math.floor(Math.random() * 500);
  const auditRoot = path.join(rootDir, '.mobile-audit');
  const screenshotDir = path.join(auditRoot, 'screenshots');
  const userDataDir = path.join(auditRoot, `chrome-profile-${process.pid}`);
  let chrome = null;
  try {
    await fsp.mkdir(screenshotDir, { recursive: true });
    await fsp.mkdir(userDataDir, { recursive: true });

    chrome = spawn(findChrome(), [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${devtoolsPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ], { stdio: 'ignore' });

    await waitForDevtools(devtoolsPort);
    const pages = walkHtml(rootDir)
      .filter((file) => !file.includes('/node_modules/'))
      .filter((file) => !file.includes('/.mobile-audit/'))
      .sort();
    const results = [];
    for (const pagePath of pages) {
      results.push(await auditPage({ pagePath, appPort, devtoolsPort, screenshotDir }));
    }
    const failed = results.filter((item) => item.overflowX);
    const dialogs = results.filter((item) => item.dialogs && item.dialogs.length);
    console.log(JSON.stringify({
      checked: results.length,
      failed: failed.length,
      failedPages: failed.map((item) => ({
        pagePath: item.pagePath,
        scrollWidth: item.scrollWidth,
        viewport: item.viewport,
        offenders: item.offenders
      })),
      dialogs: dialogs.map((item) => ({ pagePath: item.pagePath, dialogs: item.dialogs })),
      screenshots: results.filter((item) => item.screenshotPath).map((item) => item.screenshotPath)
    }, null, 2));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    if (chrome) chrome.kill();
    server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
