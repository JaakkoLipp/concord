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

**Production**: Scaleway Transactional Email, written by `concord/set-smtp.sh`, which asks for the project ID and secret key. The values below are placeholders.

```toml
[api.smtp]
host = "smtp.tem.scaleway.com"
port = 587
username = "<Scaleway project ID>"
password = "<Scaleway secret key>"
from_address = "noreply@concord.jaalip.com"
use_starttls = true
```

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
