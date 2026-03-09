# GOindiaRIDE Feature Implementation Roadmap
_Last updated: 2026-03-09_

Legend: ✅ built, 🟡 in-progress, ⏩ next sprint, 🗺️ backlog/future, 📄 needs design.

## Security & Identity (Levels 1–3, 8, 10, 11)
- ✅ Password hashing (bcrypt, salt rounds >=10) – backend/src/utils/auth.js
- ✅ JWT auth (15m access, refresh), role in token – backend/src/routes/authRoutes.js
- ✅ Rate limits: login 5/15m, OTP 3/15m, global 200/15m – backend/src/middleware/rateLimiters.js
- ✅ Helmet, CORS whitelist (goindiaride.in + env), xss-clean, express-mongo-sanitize, HPP – backend/src/app.js
- ✅ CSRF shield + token API – backend/src/middleware/csrfShieldMiddleware.js
- ✅ Request signature & replay guard – backend/src/middleware/requestSignatureMiddleware.js, models/RequestReplay.js
- ✅ Device/IP risk scoring, anomaly lock, login logs – riskService, authRoutes, models/LoginLog.js
- ✅ Admin IP restriction + 2FA (TOTP) – adminSecurityMiddleware.js, admin2faRoutes.js
- ✅ Suspicious activity logging & security incidents – models/SecurityIncident.js, SecurityLog.js
- ✅ Global HTTPS redirect + HSTS ready – app.js
- 🟡 Refresh-token httpOnly cookie flow – hook UI + document server deployment
- ⏩ Geo-location mismatch handling in UI & admin console surfacing
- 🗺️ Continuous auth checks per critical action (payments, profile change) on frontend

## Customer Portal (Section A/B key items)
- 🟡 New tri-colour landing + portal cards – frontend/src/App.jsx
- 🗺️ Fare estimator with toll/night charges preview
- 🗺️ Booking flow: pickup/drop autosuggest, vehicle catalogue, one-way/round-trip/day-rental
- 🗺️ SOS (police + ambulance) + emergency contacts
- 🗺️ Promo/referral, wallet, cancellation/refund policy display
- 🗺️ Multilingual UI (Hindi/English/Rajasthani/German/French/Spanish)

## Driver Portal (Section B)
- 🟡 UI entry point (portal card) – frontend/src/App.jsx
- 🗺️ Signup/login role = driver, doc upload (DL/RC/Insurance/Aadhaar/PAN), KYC verification queue
- 🗺️ Security deposit flow (₹5,000, 3‑month lock) + status tracking
- 🗺️ Booking inbox with accept/reject/auto-reject in 5 min
- 🗺️ Earnings dashboard, payouts, penalties, maintenance & document expiry alerts

## Admin Portal (Section C)
- ✅ Admin routes protected by role + 2FA/IP allowlist
- 🟡 Dashboard UI shell (reuses Dashboard view) – frontend/src/App.jsx
- 🗺️ Booking management, manual assignment, refunds, reports export
- 🗺️ Driver verification & security deposit ledger
- 🗺️ Fraud center: wallet freeze, multi-account detection, complaint automation
- 🗺️ Content & partner management (tourist places, hotels/shops), promo-code engine
- 🗺️ AI/auto controls: dispatch, demand prediction, smart fare, health monitoring, auto-blocks
- 🗺️ Live maps (drivers, heatmap), SOS command panel, virtual escort

## AI / Fraud / Risk (Levels 8–21, 26–28)
- ✅ Risk scoring hooks, anomaly bans, behavior events – riskService, behaviorService
- ✅ Bot defence: honeypot + timing check + optional reCAPTCHA presence – botProtectionMiddleware.js
- ⏩ Device fingerprint trust workflow + dashboard surfacing
- ⏩ Pattern-based fraud (rapid bookings, same card/IP) – extend models/BehaviorEvent
- 🗺️ AI risk engine UI, self-learning weights, auto-ban >85
- 🗺️ Payment fraud patterns, promo abuse detection, velocity checks
- 🗺️ Driver fatigue/overspeed monitoring (ingest telematics), return-trip optimisation

## Compliance / Governance (Levels 16, 23, 24, 29)
- ✅ .env sample with secrets outside git – backend/.env.example
- 🟡 Dependency scanning (npm audit) – add to CI
- 🗺️ GDPR/SOC2 artefacts: DSAR, breach 72h SOP, audit trail exposure in admin UI
- 🗺️ Key rotation policy (JWT/API/DB) & scheduler
- 🗺️ Incident response runbook + backup/restore tests (Atlas backups)

## Production Hardening (Levels 20, 25, 30)
- ✅ PM2 config – backend/ecosystem.config.js
- ✅ Health endpoint – /health
- 🟡 Reverse-proxy rate limit layer (Cloudflare/WAF) – infra step
- ⏩ Content Security Policy strict mode once frontend domains fixed
- 🗺️ Smart lockdown mode triggers (e.g., mass login attack -> force CAPTCHA + tighter limits)

## Frontend roadmap highlights
- ✅ Tri-colour themed landing + dashboard shells (customer/driver/admin entry)
- 🗺️ Dashboard widgets: fare estimator, live trips, SOS, alerts, risk feed
- 🗺️ Localization, accessibility, PWA + offline cache for booking drafts

## How to use this roadmap
- Ship in slices: Security ✅ (baseline) → Auth UX ⏩ → Customer booking 🗺️ → Driver workflows 🗺️ → Admin ops 🗺️ → AI/Fraud 🗺️
- No deletions; only additive migrations. Keep .env out of git. Protect admin by IP + 2FA before go-live.

