# GOIndiaRIDE Production Fix Plan (Auto-Generated)

Generated At: 2026-04-22T13:26:37.882Z
Site Host: goindiaride.in
API Host: api.goindiaride.in
Admin Email: bhaugehlot159@gmail.com

## 1) Backend env update
```bash
cd /var/www/GOindiaRIDE/backend
cp .env .env.backup.$(date +%Y%m%d-%H%M%S)
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://goindiaride.in|' .env
sed -i 's|^SECURITY_ALLOWED_ORIGINS=.*|SECURITY_ALLOWED_ORIGINS=https://goindiaride.in,https://www.goindiaride.in|' .env
grep -q '^BOOKING_ADMIN_ALERT_EMAILS=' .env && sed -i 's|^BOOKING_ADMIN_ALERT_EMAILS=.*|BOOKING_ADMIN_ALERT_EMAILS=bhaugehlot159@gmail.com|' .env || echo 'BOOKING_ADMIN_ALERT_EMAILS=bhaugehlot159@gmail.com' >> .env
grep -q '^DEFAULT_ADMIN_ALERT_EMAIL=' .env && sed -i 's|^DEFAULT_ADMIN_ALERT_EMAIL=.*|DEFAULT_ADMIN_ALERT_EMAIL=bhaugehlot159@gmail.com|' .env || echo 'DEFAULT_ADMIN_ALERT_EMAIL=bhaugehlot159@gmail.com' >> .env
```

## 2) Nginx proxy fix for website /api (removes HTTP 405)
```bash
sudo tee /etc/nginx/sites-available/goindiaride-site >/dev/null <<'NGINX'
server {
    listen 80;
    server_name goindiaride.in www.goindiaride.in;

    root /var/www/GOindiaRIDE;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

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
NGINX

sudo ln -sf /etc/nginx/sites-available/goindiaride-site /etc/nginx/sites-enabled/goindiaride-site
sudo nginx -t
sudo systemctl reload nginx
```

## 3) Optional api subdomain proxy (recommended)
```bash
sudo tee /etc/nginx/sites-available/goindiaride-api >/dev/null <<'NGINX'
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
NGINX

sudo ln -sf /etc/nginx/sites-available/goindiaride-api /etc/nginx/sites-enabled/goindiaride-api
sudo nginx -t
sudo systemctl reload nginx
```

## 4) DNS checks (Cloudflare/Registrar)
```bash
nslookup api.goindiaride.in
nslookup goindiaride.in
```

## 5) Restart backend and verify
```bash
cd /var/www/GOindiaRIDE/backend
npm install
npm run pm2:restart
pm2 status
pm2 logs goindiaride-backend --lines 50
```

## 6) End-to-end tests
```bash
cd /var/www/GOindiaRIDE/backend
npm run smtp:test-admin -- --to bhaugehlot159@gmail.com
npm run diagnose:live -- --site https://goindiaride.in --api https://api.goindiaride.in --origin https://goindiaride.in
cat /var/www/GOindiaRIDE/backend/reports/production-live-diagnose-latest.json
```

## Success criteria
1. `smtp:test-admin` successful with messageId.
2. `diagnose:live` route checks no longer show `405` on `/api/bookings/fallback/admin-alert-email`.
3. Booking submit from website shows no `Admin Email Pending` toast.
