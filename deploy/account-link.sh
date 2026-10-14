#!/usr/bin/env bash
# Make a one-time link that lets a person set their password (m3-plan.md task 2). There is no email in M3: Jaakko
# sends the link directly. Creates the account first if it doesn't exist, with a random password nobody sees.
# For an existing account it gives a fresh link, which is how a forgotten password is reset.
#
# Usage on the server: ~/stoat/concord/account-link.sh email@example.com [invite-code]
#                      ~/stoat/concord/account-link.sh --reset email@example.com
# Prints <app>/app/welcome/<token>[?invite=<code>], with <app> from Revolt.toml's [hosts] app. The link works once, for 7 days.
# An existing account needs --reset, so a mistyped address can't quietly become a takeover link for someone
# else's account; the matched username is printed. A reset ends the account's sessions. It doesn't remove TOTP.
#
# The token goes into the account's password_reset field, which Stoat's PATCH /auth/account/reset_password
# checks (its own upstream test sets the field the same way). A pending verification is marked verified: the
# link reaching the person is the proof that verification would give. Production has no SMTP server, so Stoat
# makes accounts verified anyway; the dev stack still has Mailpit.
set -euo pipefail
reset=no
[ "${1:-}" = --reset ] && { reset=yes; shift; }
email="${1:-}"
invite="${2:-}"
[[ "$email" == *@*.* ]] || { echo "usage: account-link.sh [--reset] email [invite-code]" >&2; exit 1; }
[[ -z "$invite" || "$invite" =~ ^[A-Za-z0-9]+$ ]] || { echo "not an invite code: $invite" >&2; exit 1; }
cd "$(dirname "$0")/.."
# The stack's own address, so the local stack's link is http://localhost/….
app="$(sed -n 's/^app = "\(.*\)"$/\1/p' Revolt.toml | head -n 1)"
[ -n "$app" ] || { echo "no [hosts] app in Revolt.toml" >&2; exit 1; }

mongo() { concord/dc exec -T -e EMAIL="$email" -e TOKEN="${token:-}" -e EXPIRY="${expiry:-}" database mongosh --quiet revolt --eval "$1"; }
# Stoat stores the address as typed; match it without regard to case.
find='db.accounts.countDocuments({ email: { $regex: "^" + process.env.EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" } })'

if [ "$(mongo "print($find)")" = 0 ]; then
  [ "$reset" = no ] || { echo "no account has that address; nothing to reset" >&2; exit 1; }
  out="$(concord/create-account.sh "$email")"
  grep -q 'HTTP 204' <<<"$out" || { echo "creating the account failed: $out" >&2; exit 1; }
  echo "created a new account" >&2
else
  [ "$reset" = yes ] || { echo "an account with that address exists: run with --reset to give it a new password link" >&2; exit 1; }
  who="$(mongo '
    const a = db.accounts.findOne({ email: { $regex: "^" + process.env.EMAIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" } });
    const u = a && db.users.findOne({ _id: a._id });
    print(u ? u.username + "#" + u.discriminator : "(no username yet)");
  ')"
  echo "resetting the password of $who" >&2
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

echo "$app/app/welcome/$token${invite:+?invite=$invite}"
