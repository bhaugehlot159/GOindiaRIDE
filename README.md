# 🚗 GO India RIDE - Complete Platform

## 📱 Features
- ✅ Customer Booking System
- ✅ Driver Management Dashboard
- ✅ Admin Control Panel
- ✅ Donation System (Integrated with Rides)
- ✅ Real-time Fare Calculation
- ✅ Automatic Driver Assignment
- ✅ Receipt Generation

## 🔑 Demo Login Credentials

| Role | Phone | Password |
|------|-------|----------|
| Customer | 9876543210 | 123456 |
| Driver | 8765432109 | 123456 |
| Admin | 7654321098 | 123456 |

## 📂 File Structure

## 🔐 Security Backend
- Added a secure Node.js backend in `backend/` with JWT auth, RBAC, Helmet, rate limiting, Mongo sanitize, XSS clean, strict CORS, account lock, risk scoring, and fraud/anomaly checks.

## 🛡️ AI Security Upgrade (Advanced)
- Added **AI Auto-Detective** layer for real-time threat scoring on web sessions.
- Added automated detection signals for:
  - bot click bursts
  - payload/script injection attempts
  - devtools/tamper behavior patterns
  - geo velocity anomalies
- Added frontend incident feed (`js/ai-auto-detective.js`) with protective action lock for sensitive buttons at high risk.
- Added backend incident pipeline:
  - model: `backend/src/models/SecurityIncident.js`
  - service: `backend/src/services/aiSecurityDetectiveService.js`
  - API routes: `/api/security/event`, `/api/security/incidents`, `/api/security/pulse`
- Added admin-facing AI Security Command Center panel in `admin-dashboard.html`.

## 🔒 High-Security Hardening (Customer + Driver + Admin)
- Added API gateway AI threat shield middleware with request velocity detection, payload attack pattern scans, and auto temporary traffic blocking.
- Added session security guard:
  - risk-based OTP step-up for mutating actions
  - blocked-device enforcement using trusted device fingerprint
  - temporary ban/lock enforcement from user risk profile
  - admin 2FA enforcement on protected admin routes
- Added strict access-control middleware for role + accountType enforcement.
- Hardened auth middleware to load live user state from DB on each protected request.
- Added stronger token claims (`sid`, `jti`, `accountType`) for access/refresh tokens.
- Added secure cookie behavior tied to production mode.
- Added booking API hardening:
  - account-type restrictions
  - write-rate limits
  - fraud/fake-ride auto incident escalation
  - secure driver booking-status update route
- Added admin security command-center APIs:
  - live incident overview
  - high-risk user lock action
  - recent audit feed
- Enabled AI auto-detective script across role portals/pages for client-side anomaly signals.

## 🧱 Zero-Trust API Additions (Latest)
- Added per-request security headers + request-id correlation middleware for all API traffic.
- Added CSRF shield for sensitive endpoints (/api/admin, /api/bookings, /api/security) with token issue endpoint: /api/security/csrf-token.
- Added strict cache-block headers for auth/admin/security APIs to reduce token/session leakage risk.
- Strengthened admin OTP verification middleware: DB-based Google Authenticator OTP validation + strict-mode enforcement.
- Fixed admin 2FA setup route to persist isTwoFactorEnabled correctly.
