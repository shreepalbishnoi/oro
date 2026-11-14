#!/usr/bin/env bash
# Installs a systemd timer that runs infra/autodeploy.sh every 5 minutes as the current user.
set -euo pipefail
DIR=$(cd "$(dirname "$0")/.." && pwd)
sudo tee /etc/systemd/system/oro-autodeploy.service >/dev/null <<EOF
[Unit]
Description=ORO pull-based deploy
After=network-online.target docker.service

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$DIR
ExecStart=/usr/bin/bash $DIR/infra/autodeploy.sh
StandardOutput=append:/var/log/oro-autodeploy.log
StandardError=append:/var/log/oro-autodeploy.log
EOF
sudo tee /etc/systemd/system/oro-autodeploy.timer >/dev/null <<EOF
[Unit]
Description=Check GitHub for a new ORO release every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
sudo touch /var/log/oro-autodeploy.log && sudo chown "$USER" /var/log/oro-autodeploy.log
sudo systemctl daemon-reload
sudo systemctl enable --now oro-autodeploy.timer
systemctl list-timers oro-autodeploy.timer --no-pager
