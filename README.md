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
