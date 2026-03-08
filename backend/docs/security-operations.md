# Security Operations Runbook

## MongoDB Atlas Backup (Level 6)
- Enable **Atlas Continuous Cloud Backup** for production clusters.
- Set retention policy to minimum 7 days.
- Test restore monthly on staging cluster.
- Store restore audit logs in admin compliance storage.

## Index Strategy
- `users.phone` indexed.
- `bookings.bookingId` indexed.
- Additional read indexes on `bookings.userId` and `bookings.ip`.

## Production Hardening (Level 7)
- Run service via PM2 (`npm run pm2:start`).
- Keep `NODE_ENV=production`.
- Return sanitized API errors in production via centralized error middleware.
- Avoid runtime `console.log` and use structured logger.

## Device/Network Intelligence (Level 10)
- Maintain a rolling blacklist for suspicious proxy/VPN ranges.
- Keep ASN deny list updated quarterly.
- Enforce reCAPTCHA token and honeypot checks on sensitive forms.

## AI Auto-Detective Incident Pipeline (Level 11)
- Ingest incident telemetry via `POST /api/security/event`.
- Use `aiSecurityDetectiveService` to score multi-signal risk:
  - login burst / credential stuffing velocity
  - impossible-travel behavioral signal
  - booking velocity and cancellation abuse
  - trusted-device takeover anomalies
- Persist incidents in `SecurityIncident` collection for audit and SOC workflows.
- Use `GET /api/security/pulse` for 24-hour severity and top event-type view.
- Use `GET /api/security/incidents` and `PATCH /api/security/incidents/:incidentId` for triage.
- Auto-response policy:
  - score `>= 75`: temporary protective hold
  - score `>= 90`: temporary protective ban and incident escalation

## Zero-Trust Route Hardening (Level 12)
- Every protected API route should apply:
  1. `authenticate`
  2. `buildSessionSecurityGuard(...)`
  3. role/accountType authorization guard
- `requestThreatShieldMiddleware` at `/api` now performs request intelligence and temporary block actions.
- Critical admin operations should use `adminCriticalLimiter` and audit logging.
- Booking write routes enforce device fingerprint and risk-based OTP step-up.

## Zero-Trust API Shield (Level 13)
- piSecurityHeadersMiddleware now adds request-id correlation and strict security headers for each API response.
- Sensitive APIs (/api/admin, /api/bookings, /api/security) are protected with CSRF shield middleware.
- Fetch CSRF token before sensitive state changes from GET /api/security/csrf-token and pass it as x-csrf-token.
- In strict mode, admin OTP validation is tied to DB-stored Google Authenticator secret for admin accounts.
## Global Security Foundation (Level 15)
- Enforce HTTPS Everywhere at edge and origin.
- Minimum TLS version: 1.2; prefer TLS 1.3.
- Use strong cipher suites managed by Cloudflare.
- Enable Cloudflare WAF managed rules for SQLi/XSS/path traversal.
- Enable bot fight mode + geo blocking + adaptive rate limiting.
