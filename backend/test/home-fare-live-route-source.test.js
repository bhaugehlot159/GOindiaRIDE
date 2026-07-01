const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const homeScriptPath = path.join(__dirname, '..', '..', 'shared', 'chunks', 'home', 'scripts', 'index.js');

test('homepage fare quote tries configured API bases including Render', () => {
  const source = fs.readFileSync(homeScriptPath, 'utf8');

  assert.match(source, /function fetchHomeOfficialRouteQuote/);
  assert.match(source, /getHomeReviewApiBases\(\)/);
  assert.match(source, /buildHomeApiUrl\(base, '\/api\/fares\/route-quote'\)/);
  assert.doesNotMatch(source, /window\.fetch\('\/api\/fares\/route-quote'/);
});

test('homepage fare calculator does not display synthetic fallback distance for unresolved routes', () => {
  const source = fs.readFileSync(homeScriptPath, 'utf8');

  assert.match(source, /function buildUnavailableHomeFare/);
  assert.match(source, /routeUnavailable: true/);
  assert.doesNotMatch(source, /useFallbackDistance: true/);
});

test('homepage fare calculator carries live resolved states into tax calculation', () => {
  const source = fs.readFileSync(homeScriptPath, 'utf8');

  assert.match(source, /pickupState: distanceDetails\.pickupState/);
  assert.match(source, /dropState: distanceDetails\.dropState/);
  assert.match(source, /routeData/);
  assert.match(source, /states: routeStates/);
});
