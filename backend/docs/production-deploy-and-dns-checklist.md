# GOIndiaRIDE Backend Deploy + DNS Checklist

This runbook is command-ready for making all runtime/business features work end-to-end in production.

## 1) Server Provision (Ubuntu 22.04+)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v
npm -v
pm2 -v
```

## 2) Deploy Backend Code

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/bhaugehlot159/GOindiaRIDE.git
sudo chown -R $USER:$USER /var/www/GOindiaRIDE
cd /var/www/GOindiaRIDE/backend
npm install
cp .env.example .env
```

Update `/var/www/GOindiaRIDE/backend/.env` with real values:
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `FIREBASE_KEY`
- `CORS_ORIGIN=https://goindiaride.in`
- `SECURITY_ALLOWED_ORIGINS=https://goindiaride.in,https://www.goindiaride.in`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `BOOKING_ADMIN_ALERT_EMAILS=bhaugehlot159@gmail.com`

## 3) Start Backend with PM2

```bash
cd /var/www/GOindiaRIDE/backend
npm run pm2:start
pm2 save
pm2 startup
pm2 status
pm2 logs goindiaride-backend --lines 100
```

Health check:

```bash
curl -i http://127.0.0.1:5000/health
curl -i http://127.0.0.1:5000/api/future-runtime/status
curl -i http://127.0.0.1:5000/api/future-runtime-business/status
```

## 4) Nginx Reverse Proxy (Required to remove `405` on booking email route)

Use one of these production-safe setups. If `POST https://goindiaride.in/api/...` returns `405`, your site is serving static-only for `/api` and must be proxied.

### Option A: Same-domain API (`https://goindiaride.in/api/*`) recommended for website pages

Create `/etc/nginx/sites-available/goindiaride-api`:

```nginx
server {
    listen 80;
    server_name goindiaride.in www.goindiaride.in;

    # Static website
    root /var/www/GOindiaRIDE;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy (this removes 405 for POST /api/*)
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option B: Dedicated API subdomain (`https://api.goindiaride.in`) also supported

Create `/etc/nginx/sites-available/goindiaride-api-subdomain`:

```nginx
server {
    listen 80;
    server_name api.goindiaride.in;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/goindiaride-api /etc/nginx/sites-enabled/goindiaride-api
sudo nginx -t
sudo systemctl reload nginx
```

## 5) SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.goindiaride.in
sudo certbot renew --dry-run
```

## 6) DNS (Cloudflare) for Option B

Create record:
- Type: `A`
- Name: `api`
- Content: `<your-vps-public-ip>`
- Proxy: `Proxied` (recommended)

Then verify:

```bash
nslookup api.goindiaride.in
curl -i https://api.goindiaride.in/health
curl -i https://api.goindiaride.in/api/future-runtime/status
curl -i https://api.goindiaride.in/api/future-runtime-business/status
```

## 7) Frontend Runtime API Target

Runtime pages now auto-target `https://api.goindiaride.in` on `goindiaride.in` host.
If needed, override manually before runtime scripts:

```html
<script>
  window.__GOINDIARIDE_API_ORIGIN__ = "https://api.goindiaride.in";
</script>
```

For Option A (same-domain API), keep runtime API base same-origin:

```html
<script>
  window.__GOINDIARIDE_API_ORIGIN__ = "https://goindiaride.in";
</script>
```

## 8) Production Validation (including live diagnose + SMTP)

```bash
cd /var/www/GOindiaRIDE/backend
npm install
npm run diagnose:live -- --site https://goindiaride.in --api https://api.goindiaride.in --origin https://goindiaride.in
npm run smtp:test-admin -- --to bhaugehlot159@gmail.com

curl -i https://goindiaride.in/pages/booking.html
curl -i https://goindiaride.in/pages/customer-dashboard.html
curl -i https://goindiaride.in/pages/driver-dashboard.html
curl -i https://goindiaride.in/pages/admin-dashboard.html
curl -i https://api.goindiaride.in/api/future-runtime/status
curl -i https://api.goindiaride.in/api/future-runtime-business/status
```

If frontend page is `200` and both API status endpoints return `200`, runtime feature actions are wired correctly.
Additionally check `backend/reports/production-live-diagnose-latest.json` for route-level diagnosis and recommendations.
