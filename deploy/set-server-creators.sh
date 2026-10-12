#!/usr/bin/env bash
# Set restrict_server_creation in Revolt.toml to the given user IDs, then restart api.
# Usage on the server: ~/stoat/concord/set-server-creators.sh <user-id> [<user-id> ...]
# With no IDs it writes the placeholder that matches nobody. An empty list would let everyone create servers.
set -euo pipefail
cd "$(dirname "$0")/.."
ids=("$@")
[ ${#ids[@]} -gt 0 ] || ids=(00000000000000000000000000)
for id in "${ids[@]}"; do
  [[ "$id" =~ ^[0-9A-HJKMNP-TV-Z]{26}$ ]] || { echo "not a user ID: $id" >&2; exit 1; }
done
list="$(printf '"%s", ' "${ids[@]}")"; list="[${list%, }]"
grep -q '^restrict_server_creation = ' Revolt.toml || { echo "restrict_server_creation missing from Revolt.toml" >&2; exit 1; }
sed -i "s/^restrict_server_creation = .*/restrict_server_creation = $list/" Revolt.toml
concord/dc restart api >/dev/null
for _ in $(seq 60); do
  concord/dc exec -T caddy wget -qO /dev/null http://api:14702/ 2>/dev/null && break
  sleep 1
done
grep '^restrict_server_creation = ' Revolt.toml
