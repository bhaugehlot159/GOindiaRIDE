# GOindiaRIDE Live Wiring and Security Verification

Date: 2026-06-13

This note documents the production live wiring added for Firebase Realtime Database, live GPS tracking, notifications, and the related security checks. It is a deployment guide and verification checklist; application code must still use the protected backend APIs as the source of truth.

## Firebase Realtime Database Paths

The backend mirrors operational events into the configured namespace, default `goindiaride`.

- `drivers/{driverId}/location`: latest driver GPS point for dispatch and operations.
- `rides/{rideId}/status`: compact booking status and admin review state.
- `rides/{rideId}/summary`: ride summary used by operations dashboards.
- `rides/{rideId}/liveLocation/{subjectType}/{userId}`: latest customer, driver, or admin GPS point on a ride.
- `rides/{rideId}/liveLocation/latest/{subjectType}`: compact latest subject location for fast read views.
- `rides/{rideId}/notifications/{notificationId}`: ride-linked notification fan-out.
- `notifications/{userId}/{notificationId}`: user notification inbox fan-out.
- Existing compatibility paths are preserved under `bookings/...` and `liveTracking/...`.

## Suggested Realtime Database Rules

Use the backend service account for writes. Direct client reads should be minimized; web clients should normally read through `/api/live-tracking`, `/api/bookings`, and `/api/notifications`.

```json
{
  "rules": {
    "goindiaride": {
      ".read": false,
      ".write": false,
      "drivers": {
        "$driverId": {
          "location": {
            ".read": "auth != null && (auth.uid === $driverId || root.child('goindiaride/admins').child(auth.uid).val() === true)",
            ".write": false
          }
        }
      },
      "rides": {
        "$rideId": {
          ".read": "auth != null && (root.child('goindiaride/rideParticipants').child($rideId).child(auth.uid).val() === true || root.child('goindiaride/admins').child(auth.uid).val() === true)",
          ".write": false
        }
      },
      "notifications": {
        "$userId": {
          ".read": "auth != null && auth.uid === $userId",
          ".write": false
        }
      },
      "bookings": {
        ".read": "auth != null && root.child('goindiaride/admins').child(auth.uid).val() === true",
        ".write": false
      },
      "liveTracking": {
        ".read": "auth != null && root.child('goindiaride/admins').child(auth.uid).val() === true",
        ".write": false
      }
    }
  }
}
```

Before applying rules, adjust the namespace if `FIREBASE_REALTIME_DATABASE_NAMESPACE` is not `goindiaride`. Maintain `admins` and `rideParticipants` through a trusted backend or Cloud Function if direct Firebase client reads are enabled.

## A-J Reverification Matrix

- A. Live Tracking System: driver and customer GPS use `navigator.geolocation.watchPosition`, protected `/api/live-tracking/location` writes, participant-safe `/api/live-tracking/locations` reads, admin operations views, and customer visible driver GPS map.
- B. Firebase RTDB Full Utilization: backend mirrors booking, ride status, ride live location, driver latest location, and notifications to RTDB with the paths above.
- C. Auth UI and Routes: auth UI is modular through route scripts; protected backend routes use JWT middleware and role checks; admin live operations remain admin-gated.
- D. Admin Control Panel: admin dashboard and operations center include active rides, customers, drivers, payments, fraud, notifications, health, matching, and live location panels.
- E. Fraud Detection Algorithms: phase 1 service checks booking velocity, device abuse, cancellation/cash-out risk, fake ride patterns, and admin fraud visibility.
- F. GDPR / Privacy Compliance: phase 2 GDPR export, portability, consent, request queue, legal notice, redaction, and privacy-minimized location operations are live.
- G. Security Audit and Hardening: Helmet, CORS allowlist, rate limiting, sanitization, route guards, security health, no-store API headers, and npm audit are part of verification.
- H. Push Notifications: web-push subscribe/unsubscribe/test/admin broadcast routes, service worker push/click handlers, database Notification records, and RTDB notification fan-out are wired.
- I. Real-time Matching Engine: phase 6 scores fresh driver GPS by distance/availability, applies matching, updates booking driver assignment, emits notifications, and exposes admin health.
- J. Payment and Firebase/PayPal Live Wiring: wallet gateway status, PayPal sandbox/live environment separation, PayPal order creation/capture verification, and graceful missing-credential errors are present.

## Verification Commands

Run these before production deploy:

```powershell
node --check backend/src/services/firebaseRealtimeDatabaseService.js
node --check backend/src/routes/liveTrackingRoutes.js
node --check js/customer-dashboard-live-bridge.js
node --check customer/chunks/dashboard/scripts/customer-live-ops.js
npm --prefix backend test
npm --prefix backend audit --omit=dev
git diff --check
git status --short --branch
```

After deploy, verify these live URLs:

- `https://goindiaride.onrender.com/health`
- `https://goindiaride.onrender.com/health/live-location-tracking`
- `https://goindiaride.onrender.com/health/realtime-matching-engine`
- `https://goindiaride.onrender.com/health/push-notifications`
- `https://goindiaride.onrender.com/health/gdpr-compliance`
- `https://goindiaride.onrender.com/health/security-hardening`
- `https://goindiaride.in/pages/customer-dashboard.html?v=20260613-driver-gps1`
- `https://goindiaride.in/js/customer-dashboard-live-bridge.js?v=20260613-driver-gps1`
- `https://goindiaride.in/customer/chunks/dashboard/scripts/customer-live-ops.js?v=20260613-driver-gps1`
- `https://goindiaride.in/sw.js?v=20260613-driver-gps1`

## Credential-Dependent Items

These cannot be truthfully marked live-successful without real production credentials:

- Firebase service account or database access token for live RTDB writes.
- VAPID keys and browser permission for real push delivery.
- PayPal live client ID/secret and settlement currency conversion rate.
- Razorpay or UPI gateway live keys for India payment collection.
- SMTP, SMS, WhatsApp, and any external map/geocoding provider credentials.
