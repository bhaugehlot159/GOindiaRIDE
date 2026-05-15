const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

function extractMapKeys(source, variableName) {
  const mapRegex = new RegExp(`(?:const|var)\\s+${variableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};`);
  const match = source.match(mapRegex);
  assert.ok(match, `Missing map ${variableName}`);
  return Array.from(match[1].matchAll(/^\s*([a-z_]+)\s*:/gm)).map((item) => item[1]);
}

function extractCustomerFeatureDefinitions(bridgeSource) {
  const match = bridgeSource.match(/customer:\s*\[([\s\S]*?)\],\s*driver:\s*\[/);
  assert.ok(match, 'Could not parse customer feature definitions from admin-control-bridge.js');
  return Array.from(match[1].matchAll(/"([a-z_]+)"/g)).map((item) => item[1]);
}

test('customer feature runtime maps match admin control feature catalog', () => {
  const bridgeSource = readRepoFile('js/admin-control-bridge.js');
  const bookingHtml = readRepoFile('pages/booking.html');
  const customerDashboardHtml = readRepoFile('pages/customer-dashboard.html');

  const expectedFeatures = extractCustomerFeatureDefinitions(bridgeSource);
  const bookingMapFeatures = extractMapKeys(bookingHtml, 'bookingPageFeatureMap');
  const dashboardMapFeatures = extractMapKeys(customerDashboardHtml, 'customerAdminFeatureMap');

  const union = new Set([...bookingMapFeatures, ...dashboardMapFeatures]);
  const missingFeatures = expectedFeatures.filter((featureId) => !union.has(featureId));
  const unknownFeatures = Array.from(union).filter((featureId) => !expectedFeatures.includes(featureId));

  assert.deepEqual(missingFeatures, [], `Customer runtime is missing features: ${missingFeatures.join(', ')}`);
  assert.deepEqual(unknownFeatures, [], `Customer runtime has unknown features: ${unknownFeatures.join(', ')}`);
});

test('benchmark ride features are admin-controlled in both booking and dashboard flows', () => {
  const bookingHtml = readRepoFile('pages/booking.html');
  const customerDashboardHtml = readRepoFile('pages/customer-dashboard.html');

  const bookingMapFeatures = extractMapKeys(bookingHtml, 'bookingPageFeatureMap');
  const dashboardMapFeatures = extractMapKeys(customerDashboardHtml, 'customerAdminFeatureMap');
  const benchmarkFeatureIds = ['airport_transfers', 'outstation_rides', 'hourly_rentals', 'trip_modes'];

  benchmarkFeatureIds.forEach((featureId) => {
    assert.ok(bookingMapFeatures.includes(featureId), `Booking page is missing ${featureId} admin feature mapping`);
    assert.ok(dashboardMapFeatures.includes(featureId), `Customer dashboard is missing ${featureId} admin feature mapping`);
  });
});
