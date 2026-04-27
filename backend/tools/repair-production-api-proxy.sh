#!/usr/bin/env bash
set -euo pipefail

# Idempotent production repair script for API proxy routing.
# This script does not delete existing config files; it only creates timestamped backups
# before writing refreshed Nginx site/api proxy config.

SITE_HOST="${SITE_HOST:-goindiaride.in}"
SITE_HOST_WWW="${SITE_HOST_WWW:-www.${SITE_HOST#www.}}"
API_HOST="${API_HOST:-api.goindiaride.in}"
APP_ROOT="${APP_ROOT:-/var/www/GOindiaRIDE}"
BACKEND_ROOT="${BACKEND_ROOT:-${APP_ROOT}/backend}"
UPSTREAM="${UPSTREAM:-http://127.0.0.1:5000}"
RUN_DIAGNOSE="${RUN_DIAGNOSE:-1}"

SITE_CONF="/etc/nginx/sites-available/goindiaride-site"
API_CONF="/etc/nginx/sites-available/goindiaride-api"
SITE_ENABLED="/etc/nginx/sites-enabled/goindiaride-site"
API_ENABLED="/etc/nginx/sites-enabled/goindiaride-api"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

backup_if_exists() {
  local file="$1"
  if [ -f "$file" ]; then
    local backup="${file}.backup.${TIMESTAMP}"
    sudo cp "$file" "$backup"
    echo "Backup created: ${backup}"
  fi
}

need_cmd sudo
need_cmd nginx
need_cmd systemctl
need_cmd ln
need_cmd cp

echo "Applying production API proxy repair..."
echo "SITE_HOST=${SITE_HOST}"
echo "API_HOST=${API_HOST}"
echo "UPSTREAM=${UPSTREAM}"

backup_if_exists "${SITE_CONF}"
backup_if_exists "${API_CONF}"

sudo tee "${SITE_CONF}" >/dev/null <<NGINX
server {
    listen 80;
    server_name ${SITE_HOST} ${SITE_HOST_WWW};

    root ${APP_ROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass ${UPSTREAM}/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

sudo tee "${API_CONF}" >/dev/null <<NGINX
server {
    listen 80;
    server_name ${API_HOST};

    location / {
        proxy_pass ${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

sudo ln -sfn "${SITE_CONF}" "${SITE_ENABLED}"
sudo ln -sfn "${API_CONF}" "${API_ENABLED}"

sudo nginx -t
sudo systemctl reload nginx

if command -v nslookup >/dev/null 2>&1; then
  echo "DNS check:"
  nslookup "${API_HOST}" || true
fi

if [ -d "${BACKEND_ROOT}" ]; then
  echo "Backend checks under ${BACKEND_ROOT}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 "${UPSTREAM}/health" || true
    curl -fsS --max-time 10 "${UPSTREAM}/api/future-runtime/status" || true

    AUTH_PROBE_PAYLOAD='{"email":"diagnose+auth@goindiaride.in","password":"Diagnose@123","website":"","submittedAt":1700000000000,"recaptchaToken":"gir_probe_abcdefghijklmnopqrstuvwxyz0123456789"}'
    for AUTH_PROBE_URL in \
      "https://${SITE_HOST}/api/auth/login" \
      "https://${SITE_HOST}/backend/api/auth/login" \
      "https://${API_HOST}/api/auth/login"; do
      AUTH_CODE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 \
        -X POST "${AUTH_PROBE_URL}" \
        -H "Origin: https://${SITE_HOST}" \
        -H "Content-Type: application/json" \
        --data "${AUTH_PROBE_PAYLOAD}" || true)"
      echo "Auth probe ${AUTH_PROBE_URL} -> ${AUTH_CODE}"
    done
  fi
  if command -v npm >/dev/null 2>&1; then
    (
      cd "${BACKEND_ROOT}"
      npm run pm2:restart || true
      if [ "${RUN_DIAGNOSE}" = "1" ]; then
        npm run diagnose:live -- --site "https://${SITE_HOST}" --api "https://${API_HOST}" --origin "https://${SITE_HOST}" || true
      fi
    )
  fi
fi

echo "Production API proxy repair complete."
