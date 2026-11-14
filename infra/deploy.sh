#!/usr/bin/env bash
# Build and (re)start ORO on a server. Run from the repo root: bash infra/deploy.sh
# Chooses the edge and size from .env:
#   ORO_EDGE=caddy   (default) Caddy on ports 80/443 terminates TLS for SITE_DOMAIN
#   ORO_EDGE=tunnel  Cloudflare Tunnel (no open ports; needs CLOUDFLARE_TUNNEL_TOKEN)
#   ORO_SIZE=small   2–4 GB servers (adds infra/docker-compose.small.yml); empty = full size
#   SMALL_EMBED=1    with ORO_SIZE=small, also run the embedding model (4 GB+ servers)
# First run also loads the reference data (instruments, industries, prices, NAVs, deals).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Missing .env (copy .env.example and fill it)"; exit 1; }
val() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
grep -q '^ENV=prod' .env || echo "warning: ENV is not prod in .env"

files=(-f infra/docker-compose.yml)
profiles=()
[ "$(val ORO_SIZE)" = "small" ] && files+=(-f infra/docker-compose.small.yml)
if [ "$(val ORO_EDGE)" = "tunnel" ]; then profiles+=(--profile tunnel); else profiles+=(--profile prod); fi
if [ "$(val ORO_SIZE)" != "small" ] || [ "$(val SMALL_EMBED)" = "1" ]; then profiles+=(--profile embed); fi
C=(docker compose --env-file .env "${files[@]}" "${profiles[@]}")

git pull --ff-only || true
"${C[@]}" build
"${C[@]}" up -d --remove-orphans
echo "== waiting for the API"
for _ in $(seq 1 60); do
  "${C[@]}" exec -T api python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz', timeout=2)" 2>/dev/null && break
  sleep 3
done

if [ ! -f .seeded ]; then
  echo "== first run: reference data"
  "${C[@]}" exec -T api python -m app.ingest.reference.instruments
  "${C[@]}" exec -T api python -c "from app.worker import eod_prices, deals; print(eod_prices()); print(deals())"
  touch .seeded
fi
"${C[@]}" ps
echo "Deployed. Site: https://$(val SITE_DOMAIN)"
