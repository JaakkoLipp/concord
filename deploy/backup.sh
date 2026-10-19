#!/usr/bin/env bash
# Nightly backup with restic (m3-plan.md task 4), run as root by concord-cron at 03:30.
# The repository and its password file are the paths below. Keep a copy of the password off the server too:
# without it the backups can't be read.
#
# Two snapshots a night, taken back to back because crond deletes stored files on its own schedule:
#   tag db:    a MongoDB dump, made by restic itself, so a failed dump is never saved
#   tag files: object storage, Caddy's data (certificates), the server-only configuration and a copy of the
#              layer's store (layer-copy.sh), never its live files
# The files in deploy/ are in git and not backed up.
# There is no email in M3, so the outcome goes to the system log under the tag "concord"; status.sh shows it.
set -euo pipefail
STOAT=/home/jaakko/stoat
export RESTIC_REPOSITORY=/var/backups/concord/restic
export RESTIC_PASSWORD_FILE=/root/.config/concord/restic-password
STATUS=/var/backups/concord/last-backup
log() { logger -t concord "backup: $*"; echo "$*"; }
trap 'log "FAILED at line $LINENO"; echo "failed $(date -u +%FT%TZ)" > "$STATUS"' ERR

used=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$used" -le 85 ] || log "WARNING: the disk is ${used}% full"
[ "$used" -le 92 ] || { log "not backing up: the disk is ${used}% full"; false; }

mkdir -p /var/backups/concord /root/.config/concord
chmod 700 /var/backups/concord /root/.config/concord
if [ ! -d "$RESTIC_REPOSITORY" ]; then
  # Only a brand-new repository gets a new password. An existing one without its password must stop here:
  # writing a new password would not open it, and would hide that the real one is gone.
  [ -s "$RESTIC_PASSWORD_FILE" ] || { (umask 077; head -c 32 /dev/urandom | base64 > "$RESTIC_PASSWORD_FILE"); log "made a new repository password"; }
  restic init
fi
[ -s "$RESTIC_PASSWORD_FILE" ] || { log "the repository password file is missing or empty"; false; }

cd "$STOAT"
restic backup --quiet --tag db --stdin-filename mongodb.archive.gz \
  --stdin-from-command -- concord/dc exec -T database mongodump --quiet --archive --gzip
files=(data/minio data/caddy-data secrets.env Revolt.toml .env .env.web concord/host.env concord/livekit.env)
# Concord's own layer: a consistent copy of its store. A failure is logged and flagged in the status, and the rest
# still runs. The previous copy, if any, is saved instead.
layer=ok
if ! concord/layer-copy.sh >/dev/null; then
  layer=FAILED
  log "WARNING: the layer's store wasn't copied"
fi
[ -e concord/data/layer-backup.db ] && files+=(concord/data/layer-backup.db)
# Only a stack with a floating IP has this; a missing path would fail every night.
[ -e /etc/netplan/60-floating-ip.yaml ] && files+=(/etc/netplan/60-floating-ip.yaml)
restic backup --quiet --tag files "${files[@]}"

# Only the nightly tags: history-snapshot.sh keeps its own 48 hourly ones. The prune frees what both forgot.
restic forget --quiet --retry-lock 15m --prune --tag db --tag files --keep-daily 7 --keep-weekly 4 --keep-monthly 6
# Weekly, the structure and a sample of the data: reading every pack grows with the hourly snapshots' files.
[ "$(date +%u)" != 7 ] || restic check --quiet --read-data-subset=5%

size=$(du -sh "$RESTIC_REPOSITORY" | cut -f1)
# A failed layer copy still saves everything else, but the status says so from its first word.
[ "$layer" = ok ] && outcome=ok || outcome=warn
echo "$outcome $(date -u +%FT%TZ) repository $size, layer copy $layer" > "$STATUS"
log "ok, repository $size, layer copy $layer"
