# Android App Conversion Runbook

Last updated: 2026-06-22

This runbook keeps the GO India RIDE website ready for Android app conversion through a PWA, WebView shell or Trusted Web Activity without changing the existing booking, driver, admin, wallet, OTP, push or tracking flows.

## Website-side files that must stay live

- PWA manifest: `https://goindiaride.in/manifest.json`
- Service worker: `https://goindiaride.in/service-worker.js`
- Runtime device checks: `https://goindiaride.in/pages/app-runtime-check.html`
- Android Digital Asset Links: `https://goindiaride.in/.well-known/assetlinks.json`
- TWA config source: `https://goindiaride.in/app/android/goindiaride-twa-config.json`
- Play listing source: `https://goindiaride.in/app/play-store-listing.json`
- Play data safety source: `https://goindiaride.in/app/play-data-safety.json`

## Android package and Digital Asset Links

Default Android package name: `in.goindiaride.app`

Set these Render environment variables before publishing a Trusted Web Activity build:

- `ANDROID_APP_PACKAGE_NAME=in.goindiaride.app`
- `ANDROID_APP_SHA256_CERT_FINGERPRINTS=<Google Play App Signing SHA-256 fingerprint>`

The backend serves `/.well-known/assetlinks.json` from those values. Do not use a fake SHA-256 fingerprint. The value must come from Google Play App Signing or the actual upload/signing certificate used for the Android app.

## Build steps

1. Install Android Studio or Android command-line tools and a current JDK.
2. Install Bubblewrap from the official Trusted Web Activity flow.
3. Initialize from the production manifest:

   ```bash
   bubblewrap init --manifest=https://goindiaride.in/manifest.json
   ```

4. Use package name `in.goindiaride.app`, host `goindiaride.in`, start URL `https://goindiaride.in/index.html?source=twa` and the app icon from `/assets/brand/goindiaride-app-icon-1024.png`.
5. Build an APK/AAB with the generated Android project.
6. Upload the app to Play Console and copy the Play App Signing SHA-256 certificate fingerprint.
7. Set `ANDROID_APP_SHA256_CERT_FINGERPRINTS` on Render, redeploy, then open `https://goindiaride.in/.well-known/assetlinks.json`.
8. Install the APK/AAB on a real Android phone and run `https://goindiaride.in/pages/app-runtime-check.html` inside the app shell.

## Required real-device checks

- Manifest and service worker load from the app shell.
- Firebase OTP WebView readiness is green before sending a real OTP.
- Notification permission and push subscription path can be checked after sign-in.
- Browser GPS and live tracking endpoint can be checked after sign-in on a real phone.
- Payment success and failure callbacks are tested with live/sandbox credentials before production release.

## Store policy sources

- Privacy Policy: `https://goindiaride.in/pages/legal/privacy-policy.html`
- Terms: `https://goindiaride.in/pages/legal/terms-and-conditions.html`
- Refund Policy: `https://goindiaride.in/pages/legal/refund-policy.html`
- Data Safety: `https://goindiaride.in/pages/legal/data-safety.html`
- Account Deletion: `https://goindiaride.in/pages/legal/account-deletion.html`
- Contact Support: `https://goindiaride.in/pages/contact.html`

## Official references

- Trusted Web Activity Quick Start: https://developer.chrome.com/docs/android/trusted-web-activity/quick-start/
- Google Play User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Android target SDK requirements: https://developer.android.com/google/play/requirements/target-sdk
