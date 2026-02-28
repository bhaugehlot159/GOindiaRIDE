# GO India RIDE Secure Backend

This backend layer was added without removing existing files and includes Level 1-5 security controls requested.

## Setup

1. Copy env:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run server:
   ```bash
   npm run dev
   ```

## Implemented Controls

- bcrypt password hashing with salt rounds 12.
- JWT access token (15m) + refresh token in httpOnly cookie.
- RBAC middleware for user/admin protected routes.
- Helmet headers, frameguard, HSTS, x-powered-by disabled.
- Rate limits (global, login, OTP).
- Mongo sanitize + XSS clean middleware.
- Strict CORS allowlist (`https://goindiaride.in`).
- `.env` driven secrets (`MONGO_URI`, `JWT_SECRET`, `FIREBASE_KEY`).
- Account lock after 5 failed logins for 30 minutes.
- Suspicious login log model (ip/device/time/status).
- Device fingerprint + geo mismatch triggers extra OTP flag.
- Risk scoring + temporary ban for high-risk logins.
- Login anomaly detection (high IP velocity).
- Booking fraud pattern detection (same card/ip/rapid cancel).
- Admin 2FA placeholder OTP + admin IP restriction + admin action logs.

> Note: OTP verification and geo-country detection are skeleton logic and should be wired to production OTP/email/IP intelligence providers.
