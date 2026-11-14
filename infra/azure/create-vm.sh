#!/usr/bin/env bash
# Creates ORO's server on Azure (Azure for Students credits). Run on your PC after `az login`:
#   bash infra/azure/create-vm.sh
# Defaults: Central India, Standard_B2pls_v2 (2 vCPU ARM, 4 GB, ~US$25/month), Ubuntu 24.04 ARM,
# 64 GB Premium SSD (P6, inside the student free allowance), static IP.
# Firewall: SSH only from this PC's current IP; 80/443 only from Cloudflare (the site is proxied).
set -euo pipefail

AZ=${AZ:-az}
RG=${RG:-oro-rg}
LOCATION=${LOCATION:-centralindia}
VM=${VM:-oro-vm}
SIZE=${SIZE:-Standard_B2pls_v2}
ADMIN=${ADMIN:-azureuser}
KEY=${KEY:-$HOME/.ssh/oro_azure}

if [[ "$SIZE" == *p*_v2 || "$SIZE" == *p*_v5 || "$SIZE" == *ps_* ]]; then
  IMAGE="Canonical:ubuntu-24_04-lts:server-arm64:latest"
else
  IMAGE="Canonical:ubuntu-24_04-lts:server:latest"
fi

[ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "oro-azure" -f "$KEY"
MYIP=$(curl -fsS https://api.ipify.org)
echo "== $VM ($SIZE, $IMAGE) in $LOCATION; SSH allowed from $MYIP"

$AZ group create -n "$RG" -l "$LOCATION" -o none
$AZ network nsg create -g "$RG" -n "$VM-nsg" -o none
$AZ network nsg rule create -g "$RG" --nsg-name "$VM-nsg" -n ssh-admin --priority 100 \
  --protocol Tcp --destination-port-ranges 22 --source-address-prefixes "$MYIP/32" --access Allow -o none
CF4=$(curl -fsS https://www.cloudflare.com/ips-v4 | tr '\n' ' ')
CF6=$(curl -fsS https://www.cloudflare.com/ips-v6 | tr '\n' ' ')
# shellcheck disable=SC2086
$AZ network nsg rule create -g "$RG" --nsg-name "$VM-nsg" -n web-cloudflare-v4 --priority 110 \
  --protocol '*' --destination-port-ranges 80 443 --source-address-prefixes $CF4 --access Allow -o none
# shellcheck disable=SC2086
$AZ network nsg rule create -g "$RG" --nsg-name "$VM-nsg" -n web-cloudflare-v6 --priority 120 \
  --protocol '*' --destination-port-ranges 80 443 --source-address-prefixes $CF6 --access Allow -o none

$AZ vm create -g "$RG" -n "$VM" --image "$IMAGE" --size "$SIZE" \
  --admin-username "$ADMIN" --ssh-key-values "$KEY.pub" \
  --nsg "$VM-nsg" --public-ip-sku Standard --public-ip-address-allocation static \
  --os-disk-size-gb 64 --storage-sku Premium_LRS -o none

IP=$($AZ vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)
echo
echo "Server ready: $IP"
echo "SSH: ssh -i $KEY $ADMIN@$IP"
echo "$IP" > "$(dirname "$0")/.vm-ip"
