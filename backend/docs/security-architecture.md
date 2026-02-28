# Complete Security Architecture Diagram

```mermaid
flowchart TD
  Client[Web/Mobile Client] -->|HTTPS + HSTS| Edge[Cloudflare CDN/WAF]
  Edge --> App[Express API]

  App --> Sec1[Helmet + CORS + Rate Limits]
  App --> Sec2[CSRF + API Signature + Replay Guard]
  App --> Sec3[Bot Guard + VPN/Proxy Heuristics]
  App --> Auth[JWT + Refresh Cookie + RBAC]
  App --> Risk[AI Risk Engine]
  App --> Fraud[Fraud Detection Engine]
  App --> Monitor[Security Logs + Alerts]

  Risk -->|riskScore > 70| Block[Auto Temporary Ban]
  Risk -->|riskScore 40-70| OTP[Step-up OTP]
  Fraud --> Block

  Auth --> DB[(MongoDB Atlas)]
  Risk --> DB
  Fraud --> DB
  Monitor --> DB

  Admin[Admin Dashboard] -->|JWT admin role| Monitor
```

## AI Risk Engine (Implemented)
- Inputs: failed login, device trust, IP mismatch, behavior anomalies, fraud signals.
- Output:
  - `>70` => block
  - `40-70` => OTP required
  - `<40` => normal

## Device Fingerprinting (Implemented)
- Fingerprint from user-agent + OS + browser hash.
- Stored in `knownDevices` + `trustedDevices` with trust score progression.

## Fraud Detection Starter (Implemented)
- Same card across users
- Same IP bulk usage
- Referral burst abuse
- Rapid cancellation / high-velocity booking
