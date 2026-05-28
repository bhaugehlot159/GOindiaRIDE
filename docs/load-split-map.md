# GO India RIDE Load Split Map

Purpose: keep pages small as the remaining product work grows. Do not add large inline CSS, inline JS, or generated feature data directly into HTML pages.

## Role Folders

- Customer live chunks: `customer/chunks/`
- Driver live chunks: `driver/chunks/`
- Admin live chunks: `admin/chunks/`
- Shared/auth/home chunks: `shared/chunks/`
- Generated customer data: `preserved/generated-blocks/customer/` and `preserved/generated-manifests/customer/`
- Generated driver data: `preserved/generated-blocks/driver/` and `preserved/generated-manifests/driver/`
- Generated admin data: `preserved/generated-blocks/admin/` and `preserved/generated-manifests/admin/`

## Current Page Chunks

- Booking page shell: `pages/booking.html`
- Booking CSS: `customer/chunks/booking/styles/`
- Booking JS: `customer/chunks/booking/scripts/`
- Booking CSS sections:
  `customer/chunks/booking/styles/compact/`,
  `customer/chunks/booking/styles/reference/`
- Booking page JS sections:
  `customer/chunks/booking/scripts/page/core/`,
  `customer/chunks/booking/scripts/page/airport/`,
  `customer/chunks/booking/scripts/page/map/`,
  `customer/chunks/booking/scripts/page/flow/`,
  `customer/chunks/booking/scripts/page/fare/`,
  `customer/chunks/booking/scripts/page/location/`,
  `customer/chunks/booking/scripts/page/submit/`,
  `customer/chunks/booking/scripts/page/post-ride/`
- Customer portal chunks: `customer/chunks/portal/`
- Preserved booking JS bundle: `preserved/original-bundles/customer/booking/`
- Customer dashboard shell: `pages/customer-dashboard.html`
- Customer dashboard CSS: `customer/chunks/dashboard/styles/`
- Customer dashboard JS: `customer/chunks/dashboard/scripts/`
- Customer dashboard page JS sections:
  `customer/chunks/dashboard/scripts/page/core/`,
  `customer/chunks/dashboard/scripts/page/rides/`,
  `customer/chunks/dashboard/scripts/page/donations/`,
  `customer/chunks/dashboard/scripts/page/profile/`,
  `customer/chunks/dashboard/scripts/page/payments/`,
  `customer/chunks/dashboard/scripts/page/navigation/`,
  `customer/chunks/dashboard/scripts/page/chat/`
- Driver dashboard shell: `pages/driver-dashboard.html`
- Driver dashboard CSS: `driver/chunks/dashboard/styles/`
- Driver dashboard JS: `driver/chunks/dashboard/scripts/`
- Driver portal chunks: `driver/chunks/portal/`
- Admin dashboard shell: `pages/admin-dashboard.html`
- Admin dashboard CSS: `admin/chunks/dashboard/styles/`
- Admin dashboard JS: `admin/chunks/dashboard/scripts/`
- Signup shell: `pages/signup.html`
- Signup chunks: `shared/chunks/auth/signup/`
- Login shell: `pages/login.html`
- Login chunks: `shared/chunks/auth/login/`
- Home shell: `index.html`
- Home chunks: `shared/chunks/home/`

## Feature Catalog Shards

- Browser admin catalog shards: `js/ultimate/feature-index/`
- Source feature-pack shards: `feature-pack/06-index/by-category/`

The browser admin catalog keeps compatibility manifest files at the old paths, but the actual item rows now live in nested part files such as `js/ultimate/feature-index/security/part-01.json`. Original full JSON copies are preserved under `preserved/original-bundles/js/ultimate/feature-index/`.

## Rule For Future Work

1. Keep HTML pages as shells: markup plus links only.
2. Put role-specific logic in the matching `customer/chunks`, `driver/chunks`, or `admin/chunks` folder.
3. Put generated or inactive future-feature blocks under `preserved/generated-blocks/<role>/`.
4. Put compact runtime manifests under `preserved/generated-manifests/<role>/`.
5. Use `data-goi-defer-src` for non-critical runtime scripts so the page loads first.
6. Do not delete feature/data content when splitting. Move it and reconnect it.
7. Keep heavy future-feature manifests and ultimate runtime scripts out of automatic startup. They can be loaded manually with `window.GoIndiaRideLoadDeferredFeatures()` or by opening a page with `?goiFutureRuntime=1`.
