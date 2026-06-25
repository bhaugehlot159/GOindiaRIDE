const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require(path.join(__dirname, '..', '..', 'js', 'location-distance.js'));

test('browser distance estimator uses exact lat,lng pairs without random fallback', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  assert.equal(typeof estimator?.estimateDistanceKm, 'function');

  const estimate = await estimator.estimateDistanceKm('24.585400,73.712500', '24.617700,73.896100');

  assert.equal(estimate.source, 'browser_coordinate');
  assert.ok(estimate.km > 0);
  assert.notEqual(estimate.source, 'fallback');
});

test('browser distance estimator geocodes typed place names and uses live driving distance', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.includes('nominatim.openstreetmap.org')) {
      assert.match(requestUrl, /Khatu/);
      return {
        ok: true,
        json: async () => [{
          lat: '27.368900',
          lon: '75.391900',
          display_name: 'Khatu Shyam Ji Temple, Khatoo, Sikar, Rajasthan, India'
        }]
      };
    }
    if (requestUrl.includes('router.project-osrm.org')) {
      return {
        ok: true,
        json: async () => ({ routes: [{ distance: 424200 }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  try {
    const estimate = await estimator.estimateDistanceKm('Udaipur', 'Khatu Shyam Ji Temple, Sikar');

    assert.equal(estimate.source, 'live_route_hybrid_geo');
    assert.equal(Math.round(estimate.km), 424);
    assert.ok(calls.some((url) => url.includes('nominatim.openstreetmap.org')));
    assert.ok(calls.some((url) => url.includes('router.project-osrm.org')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('browser distance estimator falls back to Photon geocoding when primary geocoder blocks typed names', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.includes('nominatim.openstreetmap.org')) {
      return {
        ok: true,
        json: async () => {
          throw new Error('primary blocked');
        }
      };
    }
    if (requestUrl.includes('photon.komoot.io')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            geometry: { coordinates: [75.3919, 27.3689] },
            properties: {
              name: 'Shree Khatu Shyam Ji Temple',
              city: 'Khatoo',
              county: 'Sikar',
              state: 'Rajasthan',
              country: 'India'
            }
          }]
        })
      };
    }
    if (requestUrl.includes('router.project-osrm.org')) {
      return {
        ok: true,
        json: async () => ({ routes: [{ distance: 432900 }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  try {
    const estimate = await estimator.estimateDistanceKm('Udaipur', 'Shree Khatu Shyam Ji Temple, Khatoo');

    assert.equal(estimate.source, 'live_route_hybrid_geo');
    assert.equal(Math.round(estimate.km), 433);
    assert.ok(calls.some((url) => url.includes('nominatim.openstreetmap.org')));
    assert.ok(calls.some((url) => url.includes('photon.komoot.io')));
    assert.ok(calls.some((url) => url.includes('router.project-osrm.org')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('browser distance estimator rejects wrong-state geocoder names before using static route coordinates', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    if (requestUrl.includes('nominatim.openstreetmap.org')) {
      return {
        ok: true,
        json: async () => {
          throw new Error('primary blocked');
        }
      };
    }
    if (requestUrl.includes('photon.komoot.io')) {
      return {
        ok: true,
        json: async () => ({
          features: [{
            geometry: { coordinates: [78.0255583, 27.1976534] },
            properties: {
              name: 'Shree Khatu Shyam Ji Temple',
              city: 'Agra',
              county: 'Agra',
              state: 'Uttar Pradesh',
              country: 'India'
            }
          }]
        })
      };
    }
    if (requestUrl.includes('router.project-osrm.org')) {
      assert.match(requestUrl, /75\.402557,27\.363954/);
      return {
        ok: true,
        json: async () => ({ routes: [{ distance: 432900 }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  try {
    const estimate = await estimator.estimateDistanceKm('Udaipur', 'Khatu Shyam Ji Temple, Sikar Rajasthan');

    assert.equal(estimate.source, 'live_route_district_geo');
    assert.equal(Math.round(estimate.km), 433);
    assert.ok(calls.some((url) => url.includes('photon.komoot.io')));
    assert.ok(calls.some((url) => url.includes('router.project-osrm.org')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('browser distance estimator uses specific airport coordinates instead of city-only fallback', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    const requestUrl = String(url);
    calls.push(requestUrl);
    assert.doesNotMatch(requestUrl, /nominatim|photon/);
    if (requestUrl.includes('router.project-osrm.org')) {
      assert.match(requestUrl, /73\.896100,24\.617700/);
      return {
        ok: true,
        json: async () => ({ routes: [{ distance: 21800 }] })
      };
    }
    return { ok: false, json: async () => ({}) };
  };

  try {
    const estimate = await estimator.estimateDistanceKm('Udaipur', 'Udaipur Airport');

    assert.equal(estimate.source, 'live_route_district_geo');
    assert.equal(Math.round(estimate.km), 22);
    assert.ok(calls.some((url) => url.includes('router.project-osrm.org')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('browser distance estimator uses route table only as a fallback when live routing is unavailable', async () => {
  const estimator = globalThis.LocationDistanceEstimator;
  const originalFetch = global.fetch;

  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('router.project-osrm.org')) {
      return { ok: false, json: async () => ({}) };
    }
    return { ok: false, json: async () => ({}) };
  };

  try {
    const estimate = await estimator.estimateDistanceKm('Udaipur', 'Sirohi Bus Stand');

    assert.equal(estimate.source, 'route_table');
    assert.equal(Math.round(estimate.km), 126);
  } finally {
    global.fetch = originalFetch;
  }
});
