#!/usr/bin/env bash
# Bring back a channel's deleted messages and files from the hourly history snapshot (m4.7-plan.md task 10).
# Run as root on the VPS, over SSH, by an admin (architecture section 11.3: the one bulk write to Stoat's database):
#   sudo ~/stoat/concord/restore-history.sh --channel <channel ID> --at <time, such as 2026-10-18T14:30> [--dry-run]
# For a drill without restic: --from <folder>, a copy made by `history-snapshot.sh --to <folder>`, in place of --at.
# Works for a deleted channel and for messages deleted in bulk from one that still exists. It:
#   1. picks the newest history snapshot taken before --at,
#   2. restores its dumps into a temporary database beside Stoat's, `concord_restore`,
#   3. with --dry-run, reports how many messages and files it would bring back, and stops,
#   4. otherwise takes a dump of the live database first, into restic under the tag pre-restore,
#   5. inserts only the documents whose IDs are missing (restore-history.js), so running it twice is harmless: the channel,
#      its messages and their file records, and puts a deleted channel back in its server's list and category,
#   6. copies the files' stored objects back through the storage's own API, from a temporary copy of the snapshot's,
#      never into its data folder,
#   7. restarts nothing. Clients see the channel after reconnecting; its unread markers start fresh.
set -euo pipefail
STOAT="${STOAT:-/home/jaakko/stoat}"
HERE="$(cd "$(dirname "$0")" && pwd)"
export RESTIC_REPOSITORY=/var/backups/concord/restic
export RESTIC_PASSWORD_FILE=/root/.config/concord/restic-password
DUMPS=/var/backups/concord/history
COLLECTIONS=(messages channels servers attachments attachment_hashes)
log() { logger -t concord "restore-history: $*" 2>/dev/null || true; echo "$*"; }

channel="" at="" dry=false from=""
while [ $# -gt 0 ]; do
  case "$1" in
    --channel) channel="$2"; shift 2 ;;
    --at) at="$2"; shift 2 ;;
    --from) from="$(cd "$2" && pwd)"; shift 2 ;;
    --dry-run) dry=true; shift ;;
    *) echo "usage: $0 --channel <id> (--at <time> | --from <folder>) [--dry-run]" >&2; exit 64 ;;
  esac
done
[[ "$channel" =~ ^[0-9A-HJKMNP-TV-Z]{26}$ ]] || { echo "--channel must be a channel ID" >&2; exit 64; }
if [ -z "$from" ]; then
  when="$(date -u -d "$at" +%s 2>/dev/null)" || { echo "--at must be a time, such as 2026-10-18T14:30" >&2; exit 64; }
  [ "$(id -u)" = 0 ] || { echo "run as root: the snapshots and the database need it" >&2; exit 1; }
fi

cd "$STOAT"
work="$(mktemp -d /var/tmp/concord-restore.XXXXXX)"
store=""
cleanup() {
  concord/dc exec -T database mongosh --quiet --eval "db.getSiblingDB('concord_restore').dropDatabase()" >/dev/null 2>&1 || true
  [ -n "$store" ] && docker rm -f "$store" >/dev/null 2>&1
  rm -rf "$work"
}
trap cleanup EXIT

# 1. The newest history snapshot before --at, and where its dumps and object storage land.
if [ -n "$from" ]; then
  dumps="$from/history"
  objects="$from/minio"
  log "channel $channel from the copy in $from$($dry && echo ', dry run')"
else
  snapshot="$(restic snapshots --tag history --json | python3 -c '
import datetime, json, re, sys
when = int(sys.argv[1])
best = None
for s in json.load(sys.stdin):
    # restic writes nanoseconds, which fromisoformat refuses: whole seconds are enough here.
    t = datetime.datetime.fromisoformat(re.sub(r"[.][0-9]+", "", s["time"]).replace("Z", "+00:00")).timestamp()
    if t <= when and (best is None or t > best[0]):
        best = (t, s["short_id"], s["time"][:19])
print(f"{best[1]} {best[2]}" if best else "")
' "$when")"
  [ -n "$snapshot" ] || { log "no history snapshot before $at (they go back 48 hours)"; exit 1; }
  id="${snapshot%% *}"
  log "channel $channel from snapshot $snapshot$($dry && echo ', dry run')"
  restic restore --quiet "$id" --target "$work" --include "$DUMPS"
  dumps="$work$DUMPS"
  objects="$work$STOAT/data/minio"
fi

# 2. Its dumps, into a temporary database beside Stoat's.
concord/dc exec -T database mongosh --quiet --eval "db.getSiblingDB('concord_restore').dropDatabase()" >/dev/null
for c in "${COLLECTIONS[@]}"; do
  [ -s "$dumps/$c.archive" ] || continue
  concord/dc exec -T database mongorestore --quiet --archive --nsFrom 'revolt.*' --nsTo 'concord_restore.*' < "$dumps/$c.archive"
done

# The script as one --eval, after its two settings: mongosh reads stdin as an interactive shell, line by line, which
# breaks the script (found in the drill). The channel ID is checked above, so it can't break out of the string.
run_js() {
  concord/dc exec -T database mongosh --quiet --eval "const CHANNEL = '$channel'; const DRY = $1;
$(cat "$HERE/restore-history.js")"
}

# 3. A dry run reports and stops.
if $dry; then
  result="$(run_js true)"
  grep -v '^FILE ' <<<"$result"
  echo "files to copy back: $(grep '^FILE ' <<<"$result" | sort -u | grep -c . || true)"
  exit 0
fi

# 4. The live database, first.
if [ -n "$from" ]; then
  concord/dc exec -T database mongodump --quiet --archive --gzip > "$from/pre-restore.archive.gz"
  log "took a dump of the live database ($from/pre-restore.archive.gz)"
else
  restic backup --quiet --retry-lock 15m --tag pre-restore --stdin-filename mongodb.archive.gz \
    --stdin-from-command -- concord/dc exec -T database mongodump --quiet --archive --gzip
  log "took a dump of the live database (restic tag pre-restore)"
fi

# 5. The documents.
result="$(run_js false)"
summary="$(grep -v '^FILE ' <<<"$result")"
log "restored: $summary"
mapfile -t files < <(grep '^FILE ' <<<"$result" | cut -d' ' -f2- | sort -u)

# 6. The files' objects, through the storage's API: the snapshot's copy of each, served by a temporary storage container
#    on the stack's network, then copied to the live one by Stoat's own mc image, only where it is missing.
if [ "${#files[@]}" -gt 0 ]; then
  if [ -z "$from" ]; then
    includes=()
    for f in "${files[@]}"; do includes+=(--include "$STOAT/data/minio/${f% *}/${f#* }"); done
    restic restore --quiet "$id" --target "$work" "${includes[@]}"
  fi
  live="$(concord/dc ps -q minio)"
  network="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$live")"
  image="$(docker inspect -f '{{.Config.Image}}' "$live")"
  mc="$(docker inspect -f '{{.Config.Image}}' "$(concord/dc ps -aq createbuckets)")"
  user="$(docker exec "$live" printenv MINIO_ROOT_USER)"
  pass="$(docker exec "$live" printenv MINIO_ROOT_PASSWORD)"
  temp="$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)"
  store="concord-restore-store-$$"
  docker run -d --name "$store" --network "$network" -e MINIO_ROOT_USER=restore -e MINIO_ROOT_PASSWORD="$temp" \
    -v "$objects:/data" "$image" server /data >/dev/null
  sleep 3
  printf '%s\n' "${files[@]}" | docker run --rm -i --network "$network" --entrypoint sh \
    -e SRC="http://$store:9000" -e TEMP="$temp" -e DST="http://minio:9000" -e USER="$user" -e PASS="$pass" "$mc" -c '
      mc alias set src "$SRC" restore "$TEMP" >/dev/null && mc alias set dst "$DST" "$USER" "$PASS" >/dev/null || exit 1
      copied=0 missing=0
      while read -r bucket key; do
        mc stat "dst/$bucket/$key" >/dev/null 2>&1 && continue
        if mc cp --quiet "src/$bucket/$key" "dst/$bucket/$key" >/dev/null 2>&1; then copied=$((copied + 1)); else missing=$((missing + 1)); fi
      done
      echo "objects copied: $copied, not in the snapshot: $missing"'
fi
log "done. Members see the channel after reconnecting."
