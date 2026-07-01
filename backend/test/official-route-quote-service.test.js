const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getOfficialRouteQuote
} = require('../src/services/officialRouteQuoteService');

test('official route quote returns clean unavailable response when Rajmarg fetch fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network blocked');
  };

  try {
    const quote = await getOfficialRouteQuote({
      pickup: 'Udaipur',
      drop: 'Jaisalmer Railway Station'
    });

    assert.equal(quote.ok, false);
    assert.equal(quote.error, 'official_route_unavailable');
    assert.match(quote.reason, /network blocked/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('official route quote returns clean invalid response when Rajmarg JSON cannot be parsed', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new Error('invalid json');
    }
  });

  try {
    const quote = await getOfficialRouteQuote({
      pickup: 'Udaipur',
      drop: 'Jaisalmer Railway Station'
    });

    assert.equal(quote.ok, false);
    assert.equal(quote.error, 'official_route_invalid_response');
    assert.match(quote.reason, /invalid json/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('official route quote normalizes Rajmarg distance, duration, and toll plazas', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({
        resultCode: 200,
        payload: {
          routes: [{
            data: {
              distance: '253.26 Km',
              duration: '5h 29m 27s',
              total_cost: '300',
              nh_cost: '300',
              state_cost: '0',
              total_tolls: 3,
              tollDetails: [
                { tp_name: 'Paduna', tp_rate: '75', tp_latitude: '24.271438', tp_longitude: '73.67379', isEligible: true },
                { tp_name: 'Khandi Obari', tp_rate: '190', tp_latitude: '23.9941418', tp_longitude: '73.6271827', isEligible: true },
                { tp_name: 'Vantada', tp_rate: '35', tp_latitude: '23.61615', tp_longitude: '73.254472', isEligible: true }
              ]
            }
          }]
        }
      })
    };
  };

  try {
    const quote = await getOfficialRouteQuote({
      pickup: 'Udaipur',
      drop: 'Ahmedabad',
      vehicleType: '35'
    });

    assert.equal(quote.ok, true);
    assert.equal(quote.source, 'rajmarg_yatra_route_planner');
    assert.equal(quote.distanceKm, 253.26);
    assert.equal(quote.durationMinutes, 329);
    assert.equal(quote.tollCharge, 300);
    assert.equal(quote.tollPlazaCount, 3);
    assert.deepEqual(
      quote.tollPlazas.map((item) => [item.name, item.amount]),
      [
        ['Paduna', 75],
        ['Khandi Obari', 190],
        ['Vantada', 35]
      ]
    );
    assert.match(calls[0].url, /rajmargyatra\.nhai\.gov\.in/);
    assert.equal(calls[0].options.headers.Referer, 'https://rajmargyatra.nhai.gov.in/');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fare quote endpoint keeps official-route failures as JSON instead of Express 500', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  assert.match(appSource, /official_route_quote_failed/);
  assert.match(appSource, /return res\.status\(200\)\.json\(\{\s*ok: false,\s*error: 'official_route_unavailable'/);
  assert.doesNotMatch(appSource, /official_route_quote_failed[\s\S]{0,180}return next\(error\)/);
});
