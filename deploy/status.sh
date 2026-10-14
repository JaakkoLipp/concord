#!/usr/bin/env bash
# One look at the server's health, since M3 has no alerting (m3-plan.md decision 9).
# Usage: sudo ~/stoat/concord/status.sh
set -uo pipefail
cd "$(dirname "$0")/.."
echo "== last backup:   $(cat /var/backups/concord/last-backup 2>/dev/null || echo 'never')"
echo "== disk:          $(df -h --output=pcent,avail / | tail -1 | awk '{print $1 " used, " $2 " free"}')"
echo "== memory:        $(free -h | awk '/^Mem/ {print $7 " available of " $2}')"
echo "== TURN:          $(sed -n 's/^TURN=//p' concord/host.env)"
echo "== containers not up:"
docker ps -a --filter label=com.docker.compose.project=stoat --format '{{.Names}} {{.Status}}' | grep -v -E ' Up |createbuckets' || echo "   none"
echo "== recent concord log entries:"
journalctl -t concord --since -7d --no-pager -o short-iso | tail -8
