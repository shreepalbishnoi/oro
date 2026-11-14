#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (Oracle Always Free A1 ARM or any VPS).
# Run as the default sudo user (ubuntu on Oracle):
#   curl -fsSL <raw url>/infra/provision.sh | bash      or      bash infra/provision.sh
# Idempotent: safe to run again.
set -euo pipefail

[ "$(id -u)" -eq 0 ] && { echo "Run as the sudo user, not root."; exit 1; }
. /etc/os-release
echo "== ORO provisioning on $PRETTY_NAME ($(uname -m))"

echo "== packages and automatic security updates"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades age jq
sudo dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker Engine + compose plugin"
if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER"
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "3" } }
JSON
sudo systemctl enable --now docker
sudo systemctl restart docker

echo "== 4 GB swap (headroom for builds)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== firewall: SSH, HTTP, HTTPS only"
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
# Oracle images ship iptables rules that reject everything but SSH; open 80/443 there too.
if sudo iptables -L INPUT -n | grep -q "REJECT"; then
  for p in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport "$p" -j ACCEPT
  done
  sudo sh -c 'command -v netfilter-persistent >/dev/null && netfilter-persistent save || true'
fi

echo "== SSH: keys only"
sudo sed -i -E 's/^#?PasswordAuthentication .*/PasswordAuthentication no/; s/^#?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl reload ssh || sudo systemctl reload sshd

echo "== app directory"
sudo mkdir -p /srv/oro && sudo chown "$USER":"$USER" /srv/oro

echo
echo "Done. Log out and back in (docker group), then:"
echo "  git clone <your repo> /srv/oro && cd /srv/oro"
echo "  copy your .env to /srv/oro/.env  (set ENV=prod, SITE_DOMAIN, PUBLIC_WEB_URL=https://<domain>, BETTER_AUTH_URL)"
echo "  bash infra/deploy.sh"
