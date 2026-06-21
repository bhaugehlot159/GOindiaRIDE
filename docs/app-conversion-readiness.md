# GO India RIDE App Conversion Readiness

Last updated: 2026-06-22

This checklist keeps the public website, customer app, driver app and admin app ready for PWA/WebView/native-wrapper conversion without replacing the existing booking, login, wallet, tracking or admin setup.

## Production Surfaces

- Public booking app: `/manifest.webmanifest`, `/index.html`, `/book-cab.html`
- Customer app: `/customer/manifest.webmanifest`, `/customer/index.html`, `/pages/booking.html`, `/pages/customer-dashboard.html`
- Driver app: `/driver/manifest.webmanifest`, `/driver/index.html`, `/pages/driver-dashboard.html`
- Admin app: `/admin/manifest.webmanifest`, `/admin/app.html`
- Install prompt UI: `/js/pwa-app-shell.js` binds the browser `beforeinstallprompt` event, the home CTA, and injected customer/driver/admin install controls.

## Runtime Checks

- App-readiness health endpoint: `/health/app-readiness`
- Push health endpoint: `/health/push-notifications`
- Live GPS health endpoint: `/health/live-location-tracking`
- Payment creation and callback routes:
  - `POST /api/wallet/topup/order`
  - `POST /api/wallet/topup/razorpay/verify`
  - `POST /api/wallet/topup/razorpay-link/verify`
  - `POST /api/wallet/topup/paypal/capture`

## Required Production Configuration

- Firebase phone auth: enable phone provider, authorize `goindiaride.in`, configure SMS region policy, and keep reCAPTCHA available in WebView/browser shells.
- Firebase Realtime Database: set `FIREBASE_REALTIME_DATABASE_URL` and one server credential option from `.env.production.example`.
- Push: set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
- Razorpay/UPI: set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `UPI_MERCHANT_VPA` for India payment flows.
- PayPal: set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live`, settlement currency, and INR conversion rate when wallet currency differs.

## Store Disclosure Pages

- Privacy Policy: `/pages/legal/privacy-policy.html`
- Terms: `/pages/legal/terms-and-conditions.html`
- Refund Policy: `/pages/legal/refund-policy.html`
- Contact support: `/pages/contact.html`
- Data Safety Details: `/pages/legal/data-safety.html`
- Account Deletion: `/pages/legal/account-deletion.html`
- In-app deletion path: Customer Dashboard > Profile > Account deletion

## External References Used

- MDN Web App Manifest: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
- MDN beforeinstallprompt: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
- web.dev Offline Fallback: https://web.dev/articles/offline-fallback-page
- web.dev Installation Prompt: https://web.dev/learn/pwa/installation-prompt
- Firebase Cloud Messaging Web: https://firebase.google.com/docs/cloud-messaging/web/get-started
- Firebase Phone Auth Web: https://firebase.google.com/docs/auth/web/phone-auth
- Razorpay Checkout: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
- PayPal Standard Checkout: https://developer.paypal.com/docs/checkout/standard/integrate/
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play Account Deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
