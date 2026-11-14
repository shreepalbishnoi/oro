#!/usr/bin/env bash
# Pull-based continuous deployment: redeploys when origin/main moves. Run by the systemd timer that
# infra/install-autodeploy.sh installs. A failed build leaves the running containers untouched
# (compose builds before it replaces anything), and the next run retries.
set -euo pipefail
cd "$(dirname "$0")/.."
exec 9>/tmp/oro-autodeploy.lock
flock -n 9 || exit 0
git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi
echo "$(date -u +%FT%TZ) deploying $(git rev-parse --short origin/main)"
git merge -q --ff-only origin/main
bash infra/deploy.sh
docker image prune -f >/dev/null
