#!/usr/bin/env bash
# Wipe all Stoat data on the development stack: accounts, servers, messages, files and queues.
# Called by `pnpm seed --reset` (docs/dev-environment.md section 5). Never run it on production:
# it refuses unless ~/stoat/concord/.allow-wipe exists, and M3 cleanup deletes that file.
# Keeps secrets.env (file encryption key), Revolt.toml, livekit.yml and Caddy's data (certificates).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f concord/.allow-wipe ] || { echo "refusing: concord/.allow-wipe does not exist" >&2; exit 1; }

# Edit Revolt.toml in place, keeping the file: the containers bind-mount it, and sed -i's new file would leave them
# reading the old one. Docker Desktop, which runs the local stack, can't even restart them after it.
edit_toml() { local t; t="$(sed "$1" Revolt.toml)"; printf '%s\n' "$t" > Revolt.toml; }
edit_toml 's/^restrict_server_creation = .*/restrict_server_creation = ["00000000000000000000000000"]/'
grep -q '^restrict_server_creation = \["00000000000000000000000000"\]$' Revolt.toml \
  || { echo "could not reset restrict_server_creation; not wiping" >&2; exit 1; }

concord/dc down --remove-orphans
# The data belongs to the containers' users. On the VPS sudo removes it; on the local stack, where sudo would ask
# for a password, a container does (deploy/local.compose.yml).
if sudo -n true 2>/dev/null; then
  sudo rm -rf data/db data/rabbit data/minio
else
  docker run --rm -v "$PWD/data:/data" --entrypoint rm docker.io/caddy:2.11.7 -rf /data/db /data/rabbit /data/minio
fi
concord/dc up -d
# Not `up --wait`: the one-shot createbuckets container exits by design, which --wait reports as a failure.
for _ in $(seq 90); do
  concord/dc exec -T caddy wget -qO /dev/null http://api:14702/ 2>/dev/null && break
  sleep 2
done
concord/dc exec -T caddy wget -qO /dev/null http://api:14702/ || { echo "api did not come up" >&2; exit 1; }
echo "wiped and restarted"
