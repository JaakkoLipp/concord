#!/usr/bin/env bash
# Weekly LiveKit restart, so TURN picks up Caddy's renewed certificate (concord-cron, Mondays at 05:00).
# It drops calls in progress, hence the hour. With TURN off there's nothing to pick up, so it does nothing.
# If the certificate is missing it doesn't restart: LiveKit would refuse to start and take voice down.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(sed -n 's/^TURN=//p' concord/host.env)" = on ] || exit 0
domain="$(sed -n 's/^STOAT_DOMAIN=//p' .env)"
cert="data/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/turn.$domain/turn.$domain.crt"
if ! sudo -n test -s "$cert"; then
  logger -t concord "restart-livekit: $cert missing, LiveKit not restarted"
  exit 1
fi
concord/dc restart livekit
logger -t concord "restart-livekit: LiveKit restarted"
