#!/usr/bin/env bash
# Brings the server up to date with the branch it was set up from. Run as root:
#   bash /srv/maeen/app/deploy/update.sh
set -euo pipefail

ROOT=/srv/maeen
APP="$ROOT/app"

git -C "$APP" pull --ff-only
"$ROOT/venv/bin/pip" install -r "$APP/backend/requirements.txt"
install -m 644 "$APP/deploy/maeen-backend.service" /etc/systemd/system/maeen-backend.service
systemctl daemon-reload
# A restart stops any analysis that is running at that moment; such a contract
# stays "processing" (see docs/DEPLOYMENT.md, "Stuck analysis").
systemctl restart maeen-backend

systemctl --no-pager status maeen-backend | head -5
