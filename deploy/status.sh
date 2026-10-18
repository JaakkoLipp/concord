#!/usr/bin/env bash
# One look at the server's health, since M3 has no alerting (m3-plan.md decision 9).
# Usage: sudo ~/stoat/concord/status.sh
set -uo pipefail
cd "$(dirname "$0")/.."
last="$(cat /var/backups/concord/last-backup 2>/dev/null || echo 'never')"
stamp="$(awk '{print $2}' <<<"$last")"
age=""
if [ -n "$stamp" ] && when="$(date -d "$stamp" +%s 2>/dev/null)"; then
  hours=$(( ($(date +%s) - when) / 3600 ))
  [ "$hours" -lt 36 ] || age="  <- OLD: ${hours} h ago, is the 03:30 job running?"
fi
echo "== last backup:   ${last}${age}"
# The hourly history snapshot (history-snapshot.sh, m4.7-plan.md task 10).
hist="$(cat /var/backups/concord/last-history 2>/dev/null || echo 'never')"
hstamp="$(awk '{print $2}' <<<"$hist")"
hage=""
if [ -n "$hstamp" ] && hwhen="$(date -d "$hstamp" +%s 2>/dev/null)"; then
  hmins=$(( ($(date +%s) - hwhen) / 60 ))
  [ "$hmins" -lt 130 ] || hage="  <- OLD: ${hmins} min ago, is the hourly job running?"
fi
echo "== last history:  ${hist}${hage}"
echo "== disk:          $(df -h --output=pcent,avail / | tail -1 | awk '{print $1 " used, " $2 " free"}')"
echo "== memory:        $(free -h | awk '/^Mem/ {print $7 " available of " $2}')"
echo "== TURN:          $(sed -n 's/^TURN=//p' concord/host.env)"
echo "== containers not up or not healthy:"
if ! states="$(docker ps -a --filter label=com.docker.compose.project=stoat --format '{{.Names}} {{.Status}}')"; then
  echo "   docker ps failed"
else
  # createbuckets is a one-shot job that exits by design.
  grep -v createbuckets <<<"$states" | grep -E 'unhealthy|Restarting|Exited|Created|Dead|Paused' || echo "   none"
fi
echo "== recent concord log entries:"
journalctl -t concord --since -7d --no-pager -o short-iso | tail -8
