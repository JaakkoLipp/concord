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

## 2. Email through Mailpit, for development

Appended at the end. Replaced by a real EU relay on port 587 with STARTTLS before other people register.
Stoat always sends credentials, so Mailpit is configured to accept any login without TLS.

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

An empty list lets everyone create servers, so the section goes in before any account exists, with a placeholder ID that matches nobody. After the first admin account exists, the placeholder is replaced with its ID. Restart `api` after each edit; `GET /api/` then shows the list under `features.limits.global`.

```toml
[features.limits.global]
restrict_server_creation = ["01M4QN0N72VJ1PDFQN171DMN2J"]
```

`01M4QN0N72VJ1PDFQN171DMN2J` is Jaakko's account (`jaakko#0485`), created 2026-10-12. Before it existed the value was `["00000000000000000000000000"]`. Wiping the database changes the ID, so this must be redone after any reset.
