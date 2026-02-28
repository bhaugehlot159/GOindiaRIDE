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

## Global Security Foundation (Level 15)
- Enforce HTTPS Everywhere at edge and origin.
- Minimum TLS version: 1.2; prefer TLS 1.3.
- Use strong cipher suites managed by Cloudflare.
- Enable Cloudflare WAF managed rules for SQLi/XSS/path traversal.
- Enable bot fight mode + geo blocking + adaptive rate limiting.
