#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server for MAEEN. Run it once, as root:
#   bash setup.sh maeen.example.com
# It does not start the backend: fill in backend/.env first (see docs/DEPLOYMENT.md).
set -euo pipefail

DOMAIN="${1:?Usage: bash setup.sh <domain> [repository] [branch]}"
REPO="${2:-https://github.com/MAEEN-1/AI-Contract-Analyzer.git}"
BRANCH="${3:-main}"
ROOT=/srv/maeen
APP="$ROOT/app"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root." >&2
  exit 1
fi

echo "== 1. System updates and packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install python3 python3-venv git ufw fail2ban unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https curl gnupg
# Security updates install themselves every day.
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 2. Caddy (web server with automatic HTTPS) from its official repository"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get -y install caddy
fi

echo "== 3. Code and Python packages"
# The backend runs as "maeen", a user that cannot log in and cannot change the code.
id maeen >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin maeen
mkdir -p "$ROOT"
if [ -d "$APP/.git" ]; then
  git -C "$APP" pull --ff-only
else
  git clone --branch "$BRANCH" "$REPO" "$APP"
fi
python3 -m venv "$ROOT/venv"
"$ROOT/venv/bin/pip" install --upgrade pip
"$ROOT/venv/bin/pip" install -r "$APP/backend/requirements.txt"

echo "== 4. Secrets file (readable by root and the backend only)"
if [ ! -f "$APP/backend/.env" ]; then
  cp "$APP/backend/.env.example" "$APP/backend/.env"
fi
chown root:maeen "$APP/backend/.env"
chmod 640 "$APP/backend/.env"

echo "== 5. Services"
install -m 644 "$APP/deploy/maeen-backend.service" /etc/systemd/system/maeen-backend.service
sed "s/maeen.example.com/$DOMAIN/g" "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemctl enable maeen-backend
systemctl enable caddy
systemctl restart caddy

echo "== 6. Firewall: only SSH, HTTP (redirects to HTTPS) and HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
# fail2ban blocks addresses that keep guessing SSH passwords.
systemctl enable --now fail2ban

echo "== 7. SSH sign-in with keys only"
if [ -s /root/.ssh/authorized_keys ]; then
  cat > /etc/ssh/sshd_config.d/90-maeen.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh
  echo "Password sign-in is now off. Use your SSH key."
else
  echo "WARNING: /root/.ssh/authorized_keys is empty, so password sign-in was left on."
  echo "Add your SSH key, then run this script again to turn passwords off."
fi

cat <<EOF

Done. Next steps:
  1. nano $APP/backend/.env        (fill in the secrets, set MAEEN_ENV=production)
  2. systemctl start maeen-backend
  3. Open https://$DOMAIN
EOF
