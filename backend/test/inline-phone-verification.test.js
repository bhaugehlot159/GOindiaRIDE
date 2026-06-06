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
    ...readRepoFilesUnder('customer/chunks/booking/scripts', '.js'),
    ...readRepoFilesUnder('customer/chunks/booking/styles', '.css')
  ].join('\n');
}

function readCustomerDashboardRuntimeSource() {
  return [
    readRepoFile('pages/customer-dashboard.html'),
    ...readRepoFilesUnder('customer/chunks/dashboard/scripts', '.js')
  ].join('\n');
}

test('booking page requires contact number while OTP verification is temporarily gated off', () => {
  const html = readBookingRuntimeSource();

  assert.match(html, /id="bookingCustomerPhone"/);
  assert.match(html, /Contact Number/);
  assert.match(html, /Contact mobile number is required for booking/);
  assert.match(html, /const BOOKING_PHONE_OTP_REQUIRED = window\.__GOINDIARIDE_BOOKING_OTP_REQUIRED__ === true/);
  assert.match(html, /BOOKING_PHONE_OTP_REQUIRED && customerPhoneMeta\.hasVerificationMarker/);
  assert.match(html, /Booking ke liye customer mobile number compulsory hai\. Please enter your mobile number\./);
  assert.match(html, /status: BOOKING_PHONE_OTP_REQUIRED \? 'verified' : 'contact_only'/);
  assert.match(html, /source: BOOKING_PHONE_OTP_REQUIRED \? 'customer_otp' : 'customer_required_contact'/);
  assert.match(html, /OTP verification is temporarily disabled\. Contact number is enough for booking/);
  assert.match(html, /id="bookingPhoneOtp"/);
  assert.match(html, /<div class="form-group booking-otp-field" style="display: none; margin-top: 0\.75rem;">\s*<label for="bookingPhoneOtp">OTP Code<\/label>/);
  assert.match(html, /booking-phone-actions booking-otp-controls/);
  assert.match(html, /not\(\.booking-otp-required\).*booking-otp-controls/s);
  assert.match(html, /id="bookingPhoneRecaptchaContainer"/);
  assert.match(html, /function sendBookingPhoneOtp\(\)/);
  assert.match(html, /function verifyBookingPhoneOtp\(\)/);
  assert.match(html, /GoIndiaPhoneVerification\.sendOtp/);
  assert.match(html, /GoIndiaPhoneVerification\.verifyOtp/);
  assert.match(html, /sendBackendBookingPhoneOtp\(normalizedPhone\)/);
  assert.match(html, /verifyBackendBookingPhoneOtp\(backendOtpSession\.phone,\s*otpValue\)/);
  assert.match(html, /\/api\/auth\/request-otp/);
  assert.match(html, /\/api\/auth\/otp\/verify/);
  assert.match(html, /result\.ok && deliverySent/);
  assert.match(html, /shouldTryFirebaseAfterBackendOtpFailure/);
  assert.match(html, /meta_send_failed/);
  assert.match(html, /syncVerifiedPhoneWithBackend\(verifiedPhone\)/);
  assert.match(html, /isPhoneVerified:\s*true/);
  assert.match(html, /phone-verification\.js\?v=20260516-inline-phone1/);
  assert.doesNotMatch(html, /Mobile Verification<\/h3>/);
  assert.doesNotMatch(html, /Please enter your mobile number and verify OTP/);
  assert.doesNotMatch(html, /admin_review_pending/);
  assert.doesNotMatch(html, /service_unavailable_admin_review/);
  assert.doesNotMatch(html, /Phone OTP verification is currently paused/);
  assert.doesNotMatch(html, /Firebase OTP verification scripts are temporarily paused/);
});

test('backend OTP responses do not expose dev codes on live runtime', () => {
  const authRoutes = readRepoFile('backend/src/routes/authRoutes.js');

  assert.match(authRoutes, /function allowOtpDevResponse\(\)/);
  assert.match(authRoutes, /isProductionRuntime\(\)/);
  assert.match(authRoutes, /if \(!deliveryOk && !canExposeDevOtp\)/);
  assert.match(authRoutes, /\.\.\.\(canExposeDevOtp \? \{ devOtp: otp \} : \{\}\)/);
  assert.doesNotMatch(authRoutes, /\.\.\.\(isProd \? \{\} : \{ devOtp: otp \}\)/);
});

test('customer dashboard profile saves phone through live OTP verification', () => {
  const html = readCustomerDashboardRuntimeSource();

  assert.match(html, /id="profilePhoneInput"/);
  assert.match(html, /id="profilePhoneOtpInput"/);
  assert.match(html, /id="profilePhoneRecaptchaContainer"/);
  assert.match(html, /function sendProfilePhoneOtp\(\)/);
  assert.match(html, /function verifyAndSaveProfilePhone\(\)/);
  assert.match(html, /function isProfileBackendOtpFallbackEnabled\(\)/);
  assert.match(html, /window\.__GOINDIARIDE_PROFILE_BACKEND_OTP_FALLBACK__ === true/);
  assert.match(html, /sendProfileBackendPhoneOtp\(normalizedPhone\)/);
  assert.match(html, /GoIndiaPhoneVerification\.sendOtp[\s\S]*isProfileBackendOtpFallbackEnabled\(\)[\s\S]*sendProfileBackendPhoneOtp\(normalizedPhone\)/);
  assert.match(html, /verifyProfileBackendPhoneOtp\(backendOtpSession\.phone,\s*otpValue\)/);
  assert.match(html, /\/api\/auth\/profile-phone\/request-otp/);
  assert.match(html, /\/api\/auth\/profile-phone\/verify-otp/);
  assert.match(html, /GoIndiaPhoneVerification\.sendOtp/);
  assert.match(html, /GoIndiaPhoneVerification\.verifyOtp/);
  assert.match(html, /syncDashboardPhoneWithBackend\(verifiedPhone\)/);
  assert.match(html, /Verified:\s*\$\{phone\}/);
  assert.match(html, /verified:\s*Boolean\(profilePatch\.verified/);
  assert.match(html, /phone-verification\.js\?v=20260606-firebase-otp1/);
  assert.doesNotMatch(html, /Sending OTP through secure SMS gateway/);
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

test('auth routes support authenticated profile phone OTP without switching account', () => {
  const authRoutes = readRepoFile('backend/src/routes/authRoutes.js');
  const otpModel = readRepoFile('backend/src/models/Otp.js');

  assert.match(otpModel, /'profile_phone'/);
  assert.match(authRoutes, /const PROFILE_PHONE_PURPOSE = 'profile_phone'/);
  assert.match(authRoutes, /router\.post\('\/profile-phone\/request-otp', authenticate/);
  assert.match(authRoutes, /router\.post\('\/profile-phone\/verify-otp', authenticate/);
  assert.match(authRoutes, /purpose: PROFILE_PHONE_PURPOSE/);
  assert.match(authRoutes, /Phone already in use by another account/);
  assert.match(authRoutes, /user\.phone = normalizedPhone/);
  assert.match(authRoutes, /user\.isPhoneVerified = true/);
});
