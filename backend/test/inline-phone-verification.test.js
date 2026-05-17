const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

test('booking page requires live inline phone verification before booking submit', () => {
  const html = readRepoFile('pages/booking.html');

  assert.match(html, /id="bookingCustomerPhone"/);
  assert.match(html, /id="bookingPhoneOtp"/);
  assert.match(html, /id="bookingPhoneRecaptchaContainer"/);
  assert.match(html, /function sendBookingPhoneOtp\(\)/);
  assert.match(html, /function verifyBookingPhoneOtp\(\)/);
  assert.match(html, /GoIndiaPhoneVerification\.sendOtp/);
  assert.match(html, /GoIndiaPhoneVerification\.verifyOtp/);
  assert.match(html, /sendBackendBookingPhoneOtp\(normalizedPhone\)/);
  assert.match(html, /verifyBackendBookingPhoneOtp\(backendOtpSession\.phone,\s*otpValue\)/);
  assert.match(html, /\/api\/auth\/request-otp/);
  assert.match(html, /\/api\/auth\/otp\/verify/);
  assert.match(html, /syncVerifiedPhoneWithBackend\(verifiedPhone\)/);
  assert.match(html, /isPhoneVerified:\s*true/);
  assert.match(html, /Booking ke liye verified mobile number compulsory hai/);
  assert.match(html, /phone-verification\.js\?v=20260516-inline-phone1/);
  assert.doesNotMatch(html, /admin_review_pending/);
  assert.doesNotMatch(html, /service_unavailable_admin_review/);
  assert.doesNotMatch(html, /Phone OTP verification is currently paused/);
  assert.doesNotMatch(html, /Firebase OTP verification scripts are temporarily paused/);
});

test('customer dashboard profile saves phone through live OTP verification', () => {
  const html = readRepoFile('pages/customer-dashboard.html');

  assert.match(html, /id="profilePhoneInput"/);
  assert.match(html, /id="profilePhoneOtpInput"/);
  assert.match(html, /id="profilePhoneRecaptchaContainer"/);
  assert.match(html, /function sendProfilePhoneOtp\(\)/);
  assert.match(html, /function verifyAndSaveProfilePhone\(\)/);
  assert.match(html, /GoIndiaPhoneVerification\.sendOtp/);
  assert.match(html, /GoIndiaPhoneVerification\.verifyOtp/);
  assert.match(html, /syncDashboardPhoneWithBackend\(verifiedPhone\)/);
  assert.match(html, /Verified:\s*\$\{phone\}/);
  assert.match(html, /verified:\s*Boolean\(profilePatch\.verified/);
  assert.match(html, /phone-verification\.js\?v=20260516-inline-phone1/);
  assert.doesNotMatch(html, /Phone OTP verification is currently paused/);
  assert.doesNotMatch(html, /Firebase OTP verification scripts are temporarily paused/);
});

test('backend profile routes persist verified mobile state', () => {
  const userRoutes = readRepoFile('backend/src/routes/userRoutes.js');
  const bookingRoutes = readRepoFile('backend/src/routes/bookingRoutes.js');

  assert.match(userRoutes, /router\.patch\('\/profile\/phone'/);
  assert.match(userRoutes, /user\.isPhoneVerified\s*=\s*req\.body\?\.verified === false \? false : true/);
  assert.match(userRoutes, /Object\.prototype\.hasOwnProperty\.call\(req\.body \|\| \{\}, 'verified'\)/);
  assert.match(bookingRoutes, /isPhoneVerified:\s*true/);
  assert.match(bookingRoutes, /x-otp-verified/);
});
