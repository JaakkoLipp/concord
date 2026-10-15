#!/usr/bin/env bash
# Create a Stoat account over the internal Docker network, bypassing Caddy's registration block.
# Usage on the server: ~/stoat/concord/create-account.sh email@example.com ['password']
# Without a password it uses a random one that is never shown. Production has no email, so people get their
# password from a link instead: use account-link.sh, which calls this. Success is HTTP 204; anything else exits 1.
set -euo pipefail
email="$1"
password="${2:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')}"
cd "$(dirname "$0")/.."
network="$(concord/dc ps -q api | xargs docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')"
# The body goes in as a mounted file in a private folder, so the password stays off curl's and docker's command lines.
# Not on stdin: Docker Desktop, which runs the local stack, never passes on its end, and curl waits forever.
dir="$(mktemp -d)"; trap 'rm -rf "$dir"' EXIT
EMAIL="$email" PASSWORD="$password" python3 -c 'import json,os; print(json.dumps({"email": os.environ["EMAIL"], "password": os.environ["PASSWORD"]}))' > "$dir/body"
chmod 644 "$dir/body"
out="$(docker run --rm --network "$network" -v "$dir/body:/body:ro" curlimages/curl:8.16.0 \
  -sS -w '\nHTTP %{http_code}\n' -X POST http://api:14702/auth/account/create \
  -H 'Content-Type: application/json' -H 'X-Forwarded-For: 127.0.0.1' \
  --data-binary @/body)"
echo "$out"
grep -q '^HTTP 204$' <<<"$out"
