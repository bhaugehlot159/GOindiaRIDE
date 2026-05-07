# GO India RIDE Secure Backend

This backend layer was added without removing existing files and includes Level 1-10 security controls requested.

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
- DB hardening: strict mongoose schema validation + phone/booking indexes.
- Production hardening: structured logger, sanitized error responses, PM2 ecosystem.
- Behavior AI: booking/login behavior tracking, midnight spike and ride-velocity checks.
- Device/network intelligence: trust score updates, proxy/VPN heuristic checks, honeypot + timing + reCAPTCHA token requirement.
- Level 11: CSRF protection (`csurf`), API request signature verification, replay-attack guard, and fare tamper detection.
- Level 12: security event collection (`securityLogs`), admin security dashboard stats, auto security alerts for critical events.
- Level 13: secure cookies, query-rate monitor, and smart lockdown mode.
- Level 14: future-AI extension hooks documented in architecture diagram.
- Level 15: HTTPS/TLS/Cloudflare/WAF production guidance in runbook.

## Operations
- Atlas backup and security runbook: `docs/security-operations.md`
- Complete architecture diagram: `docs/security-architecture.md`
- Production deploy + DNS + proxy runbook: `docs/production-deploy-and-dns-checklist.md`
- Full non-destructive VPS bootstrap script: `tools/setup-vps-full.sh` (`npm run setup:vps:full`)
- Local one-click E2E smoke: `../tools/run-local-e2e-smoke.ps1`

> Note: OTP verification, reCAPTCHA verification, and geo-country intelligence are skeleton logic and should be wired to production providers.

## Secure Wallet & Payment API

This release adds a production-ready wallet backend (/api/wallet) with Mongo persistence:

- Customer/Driver/Admin/Donation wallet ledgers
- Global payment mode control (India + International)
- Secure top-up order + confirmation flow (provider reference required)
- Withdrawal request flow with admin approval
- Auto settlement entry in admin wallet
- CSRF + JWT protected mutating routes
- High-value payment security logging

### Key routes
- GET /api/wallet/my - current account wallet snapshot
- POST /api/wallet/topup/order - create secure top-up order
- POST /api/wallet/topup/confirm - confirm top-up by provider reference
- POST /api/wallet/withdrawals - submit withdrawal request
- GET /api/wallet/withdrawals - list user withdrawal requests
- GET /api/wallet/admin/overview - admin wallet control overview
- POST /api/wallet/admin/withdrawals/:requestId/review - approve/reject withdrawals
- PUT /api/wallet/admin/payment-modes - admin payment mode control

### Go live checklist
1. Set all live gateway secrets in .env (PayPal primary; Razorpay/Stripe/Cashfree optional fallback).
2. Run backend on HTTPS domain and set CORS_ORIGIN + SECURITY_ALLOWED_ORIGINS.
3. Ensure frontend stores valid ccessToken after login.
4. Configure webhook verification using PAYMENT_WEBHOOK_SECRET.
5. Use PM2 (
pm run pm2:start) behind reverse proxy (Nginx/Cloudflare).

### PayPal live checkout readiness
Real wallet top-up opens PayPal Checkout first. It will not open until the backend process has server-side live PayPal credentials:

```bash
PAYPAL_ENV=live
PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_client_secret
PAYPAL_SETTLEMENT_CURRENCY=USD
PAYPAL_INR_TO_SETTLEMENT_RATE=current_inr_to_usd_rate
PAYMENT_WEBHOOK_SECRET=your_webhook_secret
```

On Render, set these as Environment variables for the `GOindiaRIDE` service, then redeploy/restart the service. The backend also accepts common existing PayPal aliases (`PAYPAL_LIVE_CLIENT_ID`, `PAYPAL_APP_CLIENT_ID`, `PAYPAL_LIVE_CLIENT_SECRET`, `PAYPAL_SECRET`) so older production dashboards do not need to be renamed immediately.

PayPal does not support INR as a payment currency. The wallet remains INR, but PayPal charges in `PAYPAL_SETTLEMENT_CURRENCY`; set `PAYPAL_INR_TO_SETTLEMENT_RATE` so the backend can convert the INR top-up amount before creating the PayPal order.

After login, verify readiness from any wallet page or directly:

```bash
GET /api/wallet/gateway/status
```

The response must show `gateways.paypal.configured: true` before real payment can happen.

