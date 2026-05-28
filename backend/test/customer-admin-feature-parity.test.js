const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

function readRepoFilesUnder(relativeDir, extension = '.js') {
  const baseDir = path.join(__dirname, '..', '..', relativeDir);
  if (!fs.existsSync(baseDir)) return [];
  const rows = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(extension)) {
        rows.push(fs.readFileSync(fullPath, 'utf8'));
      }
    }
  }
  walk(baseDir);
  return rows;
}

function readBookingRuntimeSource() {
  return [
    readRepoFile('pages/booking.html'),
    ...readRepoFilesUnder('customer/chunks/booking/scripts', '.js')
  ].join('\n');
}

function readCustomerDashboardRuntimeSource() {
  return [
    readRepoFile('pages/customer-dashboard.html'),
    ...readRepoFilesUnder('customer/chunks/dashboard/scripts', '.js')
  ].join('\n');
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
  const bookingHtml = readBookingRuntimeSource();
  const customerDashboardHtml = readCustomerDashboardRuntimeSource();
  const customerPortalJs = readRepoFile('customer/js/customer-portal.js');

  const expectedFeatures = extractCustomerFeatureDefinitions(bridgeSource);
  const bookingMapFeatures = extractMapKeys(bookingHtml, 'bookingPageFeatureMap');
  const dashboardMapFeatures = extractMapKeys(customerDashboardHtml, 'customerAdminFeatureMap');
  const customerPortalMapFeatures = extractMapKeys(customerPortalJs, 'customerFeatureMap');

  const union = new Set([...bookingMapFeatures, ...dashboardMapFeatures, ...customerPortalMapFeatures]);
  const missingFeatures = expectedFeatures.filter((featureId) => !union.has(featureId));
  const unknownFeatures = Array.from(union).filter((featureId) => !expectedFeatures.includes(featureId));

  assert.deepEqual(missingFeatures, [], `Customer runtime is missing features: ${missingFeatures.join(', ')}`);
  assert.deepEqual(unknownFeatures, [], `Customer runtime has unknown features: ${unknownFeatures.join(', ')}`);
  assert.deepEqual(
    expectedFeatures.filter((featureId) => !customerPortalMapFeatures.includes(featureId)),
    [],
    'Customer root portal is missing admin feature mappings'
  );
});

test('benchmark ride features are admin-controlled in both booking and dashboard flows', () => {
  const bookingHtml = readBookingRuntimeSource();
  const customerDashboardHtml = readCustomerDashboardRuntimeSource();
  const customerPortalJs = readRepoFile('customer/js/customer-portal.js');

  const bookingMapFeatures = extractMapKeys(bookingHtml, 'bookingPageFeatureMap');
  const dashboardMapFeatures = extractMapKeys(customerDashboardHtml, 'customerAdminFeatureMap');
  const customerPortalMapFeatures = extractMapKeys(customerPortalJs, 'customerFeatureMap');
  const benchmarkFeatureIds = ['airport_transfers', 'outstation_rides', 'hourly_rentals', 'trip_modes'];

  benchmarkFeatureIds.forEach((featureId) => {
    assert.ok(bookingMapFeatures.includes(featureId), `Booking page is missing ${featureId} admin feature mapping`);
    assert.ok(dashboardMapFeatures.includes(featureId), `Customer dashboard is missing ${featureId} admin feature mapping`);
    assert.ok(customerPortalMapFeatures.includes(featureId), `Customer root portal is missing ${featureId} admin feature mapping`);
  });
});
