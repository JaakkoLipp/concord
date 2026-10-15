#!/usr/bin/env bash
# LiveKit restart, so TURN picks up Caddy's renewed certificate. Checked weekly (concord-cron, Mondays at 05:00, as
# root: Caddy's certificate files are root's), but it restarts only when the certificate is newer than the running
# LiveKit, about every two months. A restart drops calls, and Stoat's voice-ingress then fails webhooks for a while,
# which can leave people listed in a channel they left (m4-results.md, task 9). With TURN off it does nothing.
# If the certificate is missing it doesn't restart: LiveKit would refuse to start and take voice down.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(sed -n 's/^TURN=//p' concord/host.env)" = on ] || exit 0
domain="$(sed -n 's/^STOAT_DOMAIN=//p' .env)"
cert="data/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/turn.$domain/turn.$domain.crt"
if ! test -s "$cert"; then
  logger -t concord "restart-livekit: $cert missing, LiveKit not restarted"
  exit 1
fi
started="$(docker inspect -f '{{.State.StartedAt}}' "$(concord/dc ps -q livekit)")"
if [ "$(stat -c %Y "$cert")" -le "$(date -d "$started" +%s)" ]; then
  logger -t concord "restart-livekit: certificate unchanged since LiveKit started, not restarted"
  exit 0
fi
concord/dc restart livekit
logger -t concord "restart-livekit: certificate renewed, LiveKit restarted"
