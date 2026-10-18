#!/usr/bin/env bash
# Hourly snapshot of message history (m4.7-plan.md task 10), run as root by concord-cron at five past each hour.
# The nightly backup (backup.sh) keeps 7 days of everything; this keeps 48 hours of what a wipe can destroy, so a restore
# (restore-history.sh) loses at most the last hour:
#   tag history: plain dumps of the messages, channels, servers, attachments and attachment_hashes collections, so restic
#                compresses and deduplicates them between hours, plus the object storage, which restic copies
#                incrementally, so only new files cost anything.
# The outcome goes to the system log under the tag "concord", and to /var/backups/concord/last-history for status.sh.
set -euo pipefail
STOAT=/home/jaakko/stoat
export RESTIC_REPOSITORY=/var/backups/concord/restic
export RESTIC_PASSWORD_FILE=/root/.config/concord/restic-password
DUMPS=/var/backups/concord/history
STATUS=/var/backups/concord/last-history
# Stoat's database, and what a history restore needs from it.
DB=revolt
COLLECTIONS=(messages channels servers attachments attachment_hashes)
log() { logger -t concord "history: $*"; echo "$*"; }
trap 'log "FAILED at line $LINENO"; echo "failed $(date -u +%FT%TZ)" > "$STATUS"' ERR

used=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$used" -le 90 ] || { log "not snapshotting: the disk is ${used}% full"; false; }
# The nightly backup makes the repository and its password; without them there is nothing to add to.
[ -d "$RESTIC_REPOSITORY" ] && [ -s "$RESTIC_PASSWORD_FILE" ] || { log "no restic repository yet: run backup.sh first"; false; }

mkdir -p "$DUMPS"
chmod 700 "$DUMPS"
cd "$STOAT"
for c in "${COLLECTIONS[@]}"; do
  # Into a temporary file first, so a failed dump never replaces the last good one.
  concord/dc exec -T database mongodump --quiet --db "$DB" --collection "$c" --archive > "$DUMPS/$c.archive.tmp"
  mv "$DUMPS/$c.archive.tmp" "$DUMPS/$c.archive"
done
# --retry-lock: the nightly backup's prune holds the lock for a while.
restic backup --quiet --retry-lock 15m --tag history "$DUMPS" data/minio
# Forgetting is cheap; the nightly backup's prune frees the space.
restic forget --quiet --retry-lock 15m --tag history --keep-hourly 48

echo "ok $(date -u +%FT%TZ)" > "$STATUS"
log "ok"
