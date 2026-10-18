# Changes to the generated Revolt.toml

Stoat's `generate_config.sh` writes `Revolt.toml` and renames it to `Revolt.toml.old` when rerun with `--overwrite`.
Reapply these changes after any regeneration. Secrets stay in `secrets.env` on the server and never appear here.

Generator run: `printf 'n\ny\n' | ./generate_config.sh concord.jaalip.com`, answering no to an external reverse proxy and yes to camera and screen sharing.

## 1. Screen-share headroom

In both `[features.limits.new_user]` and `[features.limits.default]`, replace the generated `[1920, 1080]`:

```toml
video_resolution = [2560, 1440]
```

`video_aspect_ratio = [0.3, 10]` is already the generator's default in both sections, so it needs no change. Check that it is still there after any regeneration.

## 2. Email

Stoat sends mail itself with lettre (m3-plan.md). `use_starttls = true` gives required STARTTLS. Never set `use_tls = false`: it turns encryption off altogether, STARTTLS included.

**Production, from M3**: no email (m3-plan.md task 2). An empty `host` makes Stoat create accounts already verified and send nothing. People get one-time password links from `concord/account-link.sh` instead. Stoat's own "Forgot password" fails with `OperationFailed`, and account deletion in Stoat's client happens at once, without a confirmation mail.

```toml
[api.smtp]
host = ""
username = ""
password = ""
from_address = "noreply@concord.jaalip.com"
```

Real email waits for M6: Cloudflare Email Sending through a small bridge, because its SMTP uses port 465 and Hetzner blocks it, or our own sender once Hetzner unblocks port 25. In that case use `use_starttls = true` on 587, as Stoat's lettre setup requires.

**Dev stack**: Mailpit, which `dev.compose.yml` adds when `.allow-wipe` exists. Stoat always sends credentials, so Mailpit accepts any login without TLS.

```toml
[api.smtp]
host = "mailpit"
port = 1025
username = "concord"
password = "concord"
from_address = "noreply@concord.jaalip.com"
use_tls = false
use_starttls = false
```

## 3. Server creation limited to global admins

An empty list lets everyone create servers, so the section goes in before any account exists, with the placeholder `"00000000000000000000000000"` that matches nobody. `reset-data.sh` puts the placeholder back before every wipe. After the first admin account exists, `concord/set-server-creators.sh <user id>` replaces it and restarts `api`. `GET /api/` then shows the list under `features.limits.global`.

```toml
[features.limits.global]
restrict_server_creation = ["<admin user ID>"]
```

On the dev stack the ID is the seeded `dev-admin`, set by the seed. On production it is Jaakko's account, set in M3 task 5. Wiping the database changes the ID, so this is redone after any reset.

## 4. Audit log kept a year

From M4.7 (m4.7-plan.md task 12, decision 12). Stoat keeps audit log entries 30 days by default; the history guard and the moderators read them, so keep a year. The value is a duration in Stoat's config format; check the generated file's existing `[api.audit_logs]` section, if any, for the unit it uses before editing.

```toml
[api.audit_logs]
expires_after = "365d"
```

Apply with `concord/dc restart api`. Not yet applied anywhere.
