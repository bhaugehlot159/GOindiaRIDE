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
