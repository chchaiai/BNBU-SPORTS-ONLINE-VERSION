#!/usr/bin/env bash
# Restore the pre-business 503 site. Retain database, COS, secrets and images.
set -euo pipefail
base=/opt/bnbu-sports-production
backup="$base/backups/nginx-before-production.conf"
test -f "$backup"
test -f "$base/current/compose.yml"
cp /etc/nginx/sites-available/bnbu-staging-hk.conf "$base/backups/nginx-before-rollback.conf"
cp "$backup" /etc/nginx/sites-available/bnbu-staging-hk.conf
if ! nginx -t; then
  cp "$base/backups/nginx-before-rollback.conf" /etc/nginx/sites-available/bnbu-staging-hk.conf
  exit 1
fi
systemctl reload nginx
cd "$base/current"
docker compose stop backend portal
echo 'Business ingress restored to previous 503 site; persistent data retained.'
