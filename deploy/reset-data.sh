#!/usr/bin/env bash
# Wipe all Stoat data on the development stack: accounts, servers, messages, files and queues.
# Called by `pnpm seed --reset` (docs/dev-environment.md section 5). Never run it on production:
# it refuses unless ~/stoat/concord/.allow-wipe exists, and M3 cleanup deletes that file.
# Keeps secrets.env (file encryption key), Revolt.toml, livekit.yml and Caddy's data (certificates).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f concord/.allow-wipe ] || { echo "refusing: concord/.allow-wipe does not exist" >&2; exit 1; }

sed -i 's/^restrict_server_creation = .*/restrict_server_creation = ["00000000000000000000000000"]/' Revolt.toml
grep -q '^restrict_server_creation = \["00000000000000000000000000"\]$' Revolt.toml \
  || { echo "could not reset restrict_server_creation; not wiping" >&2; exit 1; }

concord/dc down --remove-orphans
sudo rm -rf data/db data/rabbit data/minio
concord/dc up -d
# Not `up --wait`: the one-shot createbuckets container exits by design, which --wait reports as a failure.
for _ in $(seq 90); do
  concord/dc exec -T caddy wget -qO /dev/null http://api:14702/ 2>/dev/null && break
  sleep 2
done
concord/dc exec -T caddy wget -qO /dev/null http://api:14702/ || { echo "api did not come up" >&2; exit 1; }
echo "wiped and restarted"
