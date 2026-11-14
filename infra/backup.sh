#!/usr/bin/env bash
# Nightly encrypted Postgres backup (PLAN §4): pg_dump → age-encrypt → Cloudflare R2 (free 10 GB).
# Cron (as the deploy user):  15 2 * * * /srv/oro/infra/backup.sh >> /srv/oro/backup.log 2>&1
# Needs in .env: BACKUP_AGE_RECIPIENT (age public key; keep the private key OFF the server),
# and for upload R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
# Without R2 settings the encrypted dump stays in /srv/oro/backups (last 7 kept).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT in .env (age-keygen -y key.txt)}"

C="docker compose --env-file .env -f infra/docker-compose.yml"
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p backups
for db in oro oro_auth; do
  out="backups/${db}-${ts}.dump.age"
  $C exec -T db pg_dump -U oro -d "$db" -Fc | age -r "$BACKUP_AGE_RECIPIENT" > "$out"
  echo "$(date -u) wrote $out ($(du -h "$out" | cut -f1))"
  if [ -n "${R2_BUCKET:-}" ]; then
    docker run --rm -v "$PWD/backups:/b:ro" \
      -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      amazon/aws-cli:2.22.0 s3 cp "/b/$(basename "$out")" "s3://$R2_BUCKET/$(basename "$out")" \
      --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" --only-show-errors
  fi
done
ls -1t backups/*.age | tail -n +15 | xargs -r rm --
# Restore drill: age -d -i key.txt file.dump.age | docker compose ... exec -T db pg_restore -U oro -d oro_restore
