#!/usr/bin/env bash
# Make a one-time link that lets a person set their password (m3-plan.md task 2). There is no email in M3: Jaakko
# sends the link himself. Creates the account first if it doesn't exist, with a random password nobody sees.
# For an existing account it gives a fresh link, which is how a forgotten password is reset.
#
# Usage on the server: ~/stoat/concord/account-link.sh email@example.com [invite-code]
# Prints https://<domain>/app/welcome/<token>[?invite=<code>]. The link works once, for 7 days.
#
# The token goes into the account's password_reset field, which Stoat's PATCH /auth/account/reset_password
# checks (its own upstream test sets the field the same way). A pending verification is marked verified: the
# link reaching the person is the proof that verification would give. Production has no SMTP server, so Stoat
# makes accounts verified anyway; the dev stack still has Mailpit.
set -euo pipefail
email="$1"
invite="${2:-}"
[[ "$email" == *@*.* ]] || { echo "usage: account-link.sh email [invite-code]" >&2; exit 1; }
[[ -z "$invite" || "$invite" =~ ^[A-Za-z0-9]+$ ]] || { echo "not an invite code: $invite" >&2; exit 1; }
cd "$(dirname "$0")/.."
domain="$(sed -n 's/^STOAT_DOMAIN=//p' .env)"

mongo() { concord/dc exec -T -e EMAIL="$email" -e TOKEN="${token:-}" -e EXPIRY="${expiry:-}" database mongosh --quiet revolt --eval "$1"; }
# Stoat stores the address as typed; match it without regard to case.
find='db.accounts.countDocuments({ email: { $regex: "^" + process.env.EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" } })'

if [ "$(mongo "print($find)")" = 0 ]; then
  out="$(concord/create-account.sh "$email")"
  grep -q 'HTTP 204' <<<"$out" || { echo "creating the account failed: $out" >&2; exit 1; }
  echo "created the account" >&2
fi

# 32 characters from the same alphabet as Stoat's own tokens (nanoid).
token="$(python3 -c 'import secrets, string; a = string.ascii_letters + string.digits + "_-"; print("".join(secrets.choice(a) for _ in range(32)))')"
expiry="$(date -u -d '+7 days' +%Y-%m-%dT%H:%M:%S.000Z)"
updated="$(mongo '
  const q = { email: { $regex: "^" + process.env.EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" } };
  const set = { password_reset: { token: process.env.TOKEN, expiry: process.env.EXPIRY } };
  const a = db.accounts.findOne(q);
  if (a && a.verification && a.verification.status === "Pending") set.verification = { status: "Verified" };
  print(db.accounts.updateOne(q, { $set: set }).modifiedCount);
')"
[ "$updated" = 1 ] || { echo "could not set the link on the account (matched: $updated)" >&2; exit 1; }

echo "https://$domain/app/welcome/$token${invite:+?invite=$invite}"
