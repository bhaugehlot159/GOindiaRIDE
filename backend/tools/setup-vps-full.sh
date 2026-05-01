#!/usr/bin/env bash
set -euo pipefail

# Full VPS bootstrap for GOIndiaRIDE backend.
# Non-destructive by design:
# - Never deletes files/directories
# - Creates timestamped backups before rewriting managed Nginx/.env files
# - Skips git pull when local repo has uncommitted changes

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEFAULT_DEPLOY_USER="${SUDO_USER:-$USER}"

DEPLOY_USER="${DEPLOY_USER:-$DEFAULT_DEPLOY_USER}"
REPO_URL="${REPO_URL:-https://github.com/bhaugehlot159/GOindiaRIDE.git}"
BRANCH="${BRANCH:-main}"
APP_ROOT="${APP_ROOT:-/var/www/GOindiaRIDE}"
BACKEND_ROOT="${BACKEND_ROOT:-${APP_ROOT}/backend}"
NODE_MAJOR="${NODE_MAJOR:-20}"

SITE_HOST="${SITE_HOST:-goindiaride.in}"
SITE_HOST_WWW="${SITE_HOST_WWW:-www.${SITE_HOST#www.}}"
API_HOST="${API_HOST:-api.goindiaride.in}"
UPSTREAM="${UPSTREAM:-http://127.0.0.1:5000}"

AUTO_PULL="${AUTO_PULL:-1}"
RUN_UFW="${RUN_UFW:-0}"
ENABLE_SSL="${ENABLE_SSL:-0}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
RUN_DIAGNOSE="${RUN_DIAGNOSE:-1}"
ENABLE_PM2_STARTUP="${ENABLE_PM2_STARTUP:-1}"

SITE_CONF="/etc/nginx/sites-available/goindiaride-site"
API_CONF="/etc/nginx/sites-available/goindiaride-api"
SITE_ENABLED="/etc/nginx/sites-enabled/goindiaride-site"
API_ENABLED="/etc/nginx/sites-enabled/goindiaride-api"

log() {
  printf "[%s] %s\n" "$(date +'%F %T')" "$*"
}

warn() {
  printf "[%s] WARNING: %s\n" "$(date +'%F %T')" "$*" >&2
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    warn "Missing required command: ${cmd}"
    exit 1
  fi
}

backup_if_exists() {
  local file="$1"
  if [ -f "$file" ]; then
    local backup="${file}.backup.${TIMESTAMP}"
    sudo cp "$file" "$backup"
    log "Backup created: ${backup}"
  fi
}

as_deploy_user() {
  local command="$1"
  if [ "$(id -un)" = "$DEPLOY_USER" ]; then
    bash -lc "$command"
  else
    sudo -u "$DEPLOY_USER" -H bash -lc "$command"
  fi
}

probe_url() {
  local url="$1"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 12 "$url" || true)"
  printf "%s -> %s\n" "$url" "$code"
}

need_cmd sudo
need_cmd curl
need_cmd git

log "Starting full VPS setup (non-destructive mode)."
log "DEPLOY_USER=${DEPLOY_USER}"
log "APP_ROOT=${APP_ROOT}"
log "SITE_HOST=${SITE_HOST}"
log "API_HOST=${API_HOST}"

log "Installing base packages..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y nginx git curl ufw ca-certificates gnupg

install_node=0
if ! command -v node >/dev/null 2>&1; then
  install_node=1
else
  current_node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [ "$current_node_major" -lt "$NODE_MAJOR" ]; then
    install_node=1
  fi
fi

if [ "$install_node" -eq 1 ]; then
  log "Installing Node.js ${NODE_MAJOR}.x ..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  log "Node.js already satisfies required major version (>= ${NODE_MAJOR})."
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2 globally..."
  sudo npm install -g pm2
else
  log "PM2 already installed."
fi

parent_dir="$(dirname "$APP_ROOT")"
sudo mkdir -p "$parent_dir"

if [ ! -d "${APP_ROOT}/.git" ]; then
  log "Cloning repository into ${APP_ROOT} ..."
  sudo git clone "$REPO_URL" "$APP_ROOT"
else
  log "Repository already exists at ${APP_ROOT}; keeping existing files."
fi

sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_ROOT"

if [ -d "${APP_ROOT}/.git" ] && [ "$AUTO_PULL" = "1" ]; then
  repo_is_clean=1
  if ! as_deploy_user "cd '$APP_ROOT' && git diff --quiet && git diff --cached --quiet"; then
    repo_is_clean=0
  fi

  if [ "$repo_is_clean" -eq 1 ]; then
    log "Repository is clean. Pulling latest branch ${BRANCH} with fast-forward only..."
    as_deploy_user "cd '$APP_ROOT' && git fetch origin '$BRANCH' && git pull --ff-only origin '$BRANCH'"
  else
    warn "Repository has uncommitted changes; skipping git pull to avoid overwriting local work."
  fi
fi

if [ ! -f "${BACKEND_ROOT}/package.json" ]; then
  warn "Backend package.json not found at ${BACKEND_ROOT}."
  exit 1
fi

log "Installing backend dependencies..."
as_deploy_user "cd '$BACKEND_ROOT' && npm install"

if [ -f "${BACKEND_ROOT}/.env" ]; then
  backup_env="${BACKEND_ROOT}/.env.backup.${TIMESTAMP}"
  as_deploy_user "cp '$BACKEND_ROOT/.env' '$backup_env'"
  log "Existing .env backup created: ${backup_env}"
elif [ -f "${BACKEND_ROOT}/.env.example" ]; then
  as_deploy_user "cp '$BACKEND_ROOT/.env.example' '$BACKEND_ROOT/.env'"
  log "Created .env from .env.example"
else
  warn ".env.example not found. Please create ${BACKEND_ROOT}/.env manually."
fi

required_env_keys=(
  "MONGO_URI"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "FIREBASE_KEY"
  "CORS_ORIGIN"
  "SECURITY_ALLOWED_ORIGINS"
  "SMTP_HOST"
  "SMTP_PORT"
  "SMTP_SECURE"
  "SMTP_USER"
  "SMTP_PASS"
  "BOOKING_ADMIN_ALERT_EMAILS"
)

missing_env_keys=()
if [ -f "${BACKEND_ROOT}/.env" ]; then
  for key in "${required_env_keys[@]}"; do
    if ! as_deploy_user "grep -Eq '^${key}=' '$BACKEND_ROOT/.env'"; then
      missing_env_keys+=("$key")
    fi
  done
fi

if [ "${#missing_env_keys[@]}" -gt 0 ]; then
  warn "Missing .env keys: ${missing_env_keys[*]}"
  warn "Fill missing keys in ${BACKEND_ROOT}/.env before production traffic."
fi

log "Starting or restarting backend with PM2..."
if as_deploy_user "pm2 describe goindiaride-backend >/dev/null 2>&1"; then
  as_deploy_user "cd '$BACKEND_ROOT' && npm run pm2:restart"
else
  as_deploy_user "cd '$BACKEND_ROOT' && npm run pm2:start"
fi

as_deploy_user "pm2 save"

if [ "$ENABLE_PM2_STARTUP" = "1" ]; then
  deploy_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6 || true)"
  if [ -z "$deploy_home" ]; then
    deploy_home="/home/${DEPLOY_USER}"
  fi
  sudo env PATH="$PATH" pm2 startup systemd -u "$DEPLOY_USER" --hp "$deploy_home" >/dev/null 2>&1 || true
fi

log "Writing managed Nginx configs with backups..."
backup_if_exists "$SITE_CONF"
backup_if_exists "$API_CONF"

sudo tee "$SITE_CONF" >/dev/null <<NGINX
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

sudo tee "$API_CONF" >/dev/null <<NGINX
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

sudo ln -sfn "$SITE_CONF" "$SITE_ENABLED"
sudo ln -sfn "$API_CONF" "$API_ENABLED"

if [ -e /etc/nginx/sites-enabled/default ]; then
  warn "/etc/nginx/sites-enabled/default left untouched. Remove manually only if it conflicts."
fi

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

if [ "$RUN_UFW" = "1" ]; then
  log "Applying UFW rules..."
  sudo ufw allow OpenSSH || true
  sudo ufw allow "Nginx Full" || true
  sudo ufw --force enable || true
else
  warn "RUN_UFW=0, firewall unchanged. Set RUN_UFW=1 to apply OpenSSH + Nginx rules."
fi

if [ "$ENABLE_SSL" = "1" ]; then
  if [ -z "$CERTBOT_EMAIL" ]; then
    warn "ENABLE_SSL=1 but CERTBOT_EMAIL is empty. Skipping SSL."
  else
    log "Installing certbot and requesting certificates..."
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx --non-interactive --agree-tos -m "$CERTBOT_EMAIL" \
      -d "$SITE_HOST" -d "$SITE_HOST_WWW" -d "$API_HOST" --redirect || true
    sudo certbot renew --dry-run || true
  fi
fi

log "Health probes:"
probe_url "${UPSTREAM}/health"
probe_url "${UPSTREAM}/api/future-runtime/status"
probe_url "${UPSTREAM}/api/future-runtime-business/status"
probe_url "http://${SITE_HOST}/"
probe_url "http://${SITE_HOST}/api/future-runtime/status"
probe_url "http://${API_HOST}/health"
probe_url "http://${API_HOST}/api/future-runtime-business/status"

if [ "$RUN_DIAGNOSE" = "1" ]; then
  log "Running live diagnose script (non-fatal on errors)..."
  as_deploy_user "cd '$BACKEND_ROOT' && npm run diagnose:live -- --site 'https://${SITE_HOST}' --api 'https://${API_HOST}' --origin 'https://${SITE_HOST}' || true"
fi

log "VPS full setup completed."
log "If SSL is not enabled yet, complete DNS first and re-run with ENABLE_SSL=1 CERTBOT_EMAIL=<your-email>."
