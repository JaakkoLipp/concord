#!/usr/bin/env bash
# Create a Stoat account over the internal Docker network, bypassing Caddy's registration block.
# Usage on the server: ~/stoat/concord/create-account.sh email@example.com 'password'
# The account still has to verify its email (see Mailpit while no real relay is configured).
set -euo pipefail
email="$1"; password="$2"
cd "$(dirname "$0")/.."
network="$(docker compose -f compose.yml -f concord/concord.compose.yml ps -q api | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
body="$(python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))' "$email" "$password")"
docker run --rm --network "$network" curlimages/curl:8.16.0 \
  -sS -w '\nHTTP %{http_code}\n' -X POST http://api:14702/auth/account/create \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 127.0.0.1' \
  --data "$body"
