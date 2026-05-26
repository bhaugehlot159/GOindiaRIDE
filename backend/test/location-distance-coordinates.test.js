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
