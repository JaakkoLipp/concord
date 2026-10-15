# M3 runbook: deploy to the VPS and validate the media path

Goal: put Stoat and our client on `concord.jaalip.com`, prove the media path on real networks, and make part B of the go or no-go call in section 10 of [architecture.md](architecture.md). The development stack from [dev-environment.md](dev-environment.md) already runs on this VPS, so M3 mostly turns it into production.

**Already done in M0, October 2026**, with results in [m0-results.md](m0-results.md):

- **Section 1**: the VPS at 2 vCPU and 3.7 GB, ufw instead of the cloud firewall, Docker.
- **Section 2**: Stoat at 0.15.5 with our compose file, the Caddyfile with the registration block, Mailpit for mail, and the admin bootstrap.
- **Section 3**: the registration gate, tested on every path variant.
- **Section 5**: step 5, the presence check.

**Done in M3, October 2026**, with results in [m3-results.md](m3-results.md) and the plan in [m3-plan.md](m3-plan.md):

- **Section 1**: the floating IP, the Hetzner Cloud firewall, automatic reboots for security updates at 05:30, and outbound traffic pinned to the main IP. fail2ban and unattended upgrades were already running.
- **Section 2**:
  - Caddy binds only the main addresses, with HTTP/3, and the addresses live in the server-only `concord/host.env`.
  - The `/app` route, with the main domain redirecting to it and Stoat's own client moved to `ref.<domain>`.
  - **No email relay.** Production runs without SMTP, and people get one-time password links from `account-link.sh` (section 3).
- **Section 4**: TURN, with the layout corrected below.
- **Section 7**: nightly restic backups, to the VPS's own disk for now.
- **The swap to production**: the dev data was moved aside rather than wiped. Then Jaakko's account was bootstrapped and the community server created in our client.

**Carried into M4**:
- section 5's voice session and section 6's screen-share runs, merged into M4's voice evening,
- section 7's restore drill,
- the Storage Box as a second backup repository.

**Carried into M6**: real email, with Cloudflare Email Sending through a bridge or our own sender once Hetzner unblocks port 25.

Estimated effort: two to four evenings, plus one group voice session.

## Before you start

You need to decide or buy these. Nothing else in M3 can start without the first three.

| Item | Notes |
|---|---|
| DNS access for `jaalip.com` | The app is served at `concord.jaalip.com`, TURN at `turn.concord.jaalip.com`, and later Stoat's reference client at `ref.concord.jaalip.com`. Email is sent from an address on `concord.jaalip.com`, so its SPF, DKIM and DMARC records go there. |
| Hetzner Cloud account | Project in Helsinki. |
| Transactional email relay | EU-based, SMTP on port 587, free tier is enough. Needs SPF, DKIM and DMARC records on the domain. |
| Hetzner Storage Box | Smallest size, for backups. |
| Testers | At least three people for the voice session, ideally one on a restrictive network such as a workplace or school. |

## 1. Provision

1. Create a VPS in Helsinki, latest Ubuntu LTS, SSH key only. The current one has 2 vCPU and 3.7 GB, with base setup from `deploy/server-setup.sh`. Resize to 4 vCPU and 8 GB if the voice session in section 5 shows memory or CPU pressure.
2. Attach a floating IPv4 for TURN. Configure it persistently in the OS network config, following Hetzner's floating IP guide. Reboot once and confirm the address is still present. Docker cannot bind a port to an address that is missing at boot, and voice would be down.
3. Create a Hetzner Cloud firewall that opens TCP 22, 80, 443 and 7881, UDP 443, 3478, 30000 to 30100 and 50000 to 50100, and ICMP. Inbound rules can't be limited per destination address, so Docker's bindings enforce the per-address split. The form takes a range's first port in "Port" and its last in "Port range".
4. DNS records:
   - `concord.jaalip.com`: A and AAAA to the main addresses.
   - `turn.concord.jaalip.com`: A to the floating IP.
   - SPF, DKIM and DMARC for the email relay.
5. Install Docker Engine with the Compose plugin, unattended security upgrades, and fail2ban or equivalent for SSH.

## 2. Deploy Stoat at 0.15.5

1. Clone `stoatchat/self-hosted` at commit `9af5e90` from 7 October 2026. The repo has no release tags, so we pin a commit. Its compose file still pins Stoat 0.15.5.
2. Run `generate_config.sh` with `concord.jaalip.com`:
   - Answer yes to enabling camera and screen sharing.
   - Answer no to using your own reverse proxy, so the bundled Caddy is used.
3. Copy this repo's `deploy/` directory to the server. The production compose file, `deploy/concord.compose.yml`:
   - Sets every Stoat image tag to `v0.15.5`, the version the self-hosted repo supports. Stoat advises self-hosters against 0.15.6 and 0.15.7.
   - Pins MongoDB to `7.0.43`, because MongoDB 8 refuses to start on Ubuntu 26.04's kernel 7.0.
   - Mounts `deploy/Caddyfile` over Stoat's Caddyfile. At M3 that is Stoat's Caddyfile plus the additions in this runbook and a `/app` route to our client.
   - Rebinds Caddy's ports to the main IPv4 and IPv6, on 80 and 443 over TCP and 443 over UDP. It uses Compose's `!override` tag to replace Stoat's port list. Caddy also gets port 80 on the floating IP.
4. Add `deploy/dc`, a wrapper that runs `docker compose -f compose.yml -f concord.compose.yml` with any arguments. Use it for every command from here on.
5. Edit the generated `Revolt.toml`, and record each change as a diff without secrets in `deploy/revolt-changes.md`:
   - In both `[features.limits.new_user]` and `[features.limits.default]`, set `video_resolution = [2560, 1440]` and `video_aspect_ratio = [0.3, 10]`.
   - Keep `[api.registration] invite_only = false`. Our Caddy rule in step 4 of this section gates registration instead.
   - Fill in `[api.smtp]` with the relay's host, username, password and `from_address`, `port = 587` and `use_starttls = true`. Leave `use_tls` unset, because setting it to false disables STARTTLS.
6. Start the stack with `deploy/dc up -d` and confirm Stoat's web client loads at `https://concord.jaalip.com`.
7. **Bootstrap admins before anyone else registers**, as in M0:
   1. Create Jaakko's account with the script from section 3 and verify it.
   2. Add its user ID to `restrict_server_creation` under `[features.limits.global]` in `Revolt.toml`, and record the change.
   3. Restart the API container, then confirm a second test account gets an error when creating a server.
   4. Create the community server and remove the invite permission from its default role.

Stoat's generator renames `Revolt.toml`, `livekit.yml`, `compose.override.yml` and `.env.web` when rerun with overwrite. Our compose file, Caddyfile and LiveKit config use other names under `deploy/`, so a rerun cannot drop them. A rerun does reset `Revolt.toml`, so its edits must be reapplied from `deploy/revolt-changes.md`. Never rerun the generator without reading the architecture's operations section first.

## 3. Gate registration

1. In `deploy/Caddyfile`, refuse `POST /api/auth/account/create` with a 403 before the `/api` route.
2. Add `deploy/create-account.sh`. It runs `curl` in a temporary container on the stack's Docker network and posts email and password straight to the API container, with an `X-Forwarded-For` header.
3. Test from your own machine: a direct account-create call to `https://concord.jaalip.com/api/auth/account/create` must get 403.
4. Test the script: it must create an account, and the verification email must arrive and not be marked as spam. Click the link in the received mail itself, not in a preview. Two upstream bugs affect this:
   - **Wrapped links** (self-hosted issue #274): Stoat's plain-text mail is quoted-printable, and a mail client that doesn't decode it shows a broken link.
   - **EHLO** (issue #223): the API greets the relay with its container ID, and strict relays reject that with "550 Invalid EHLO domain". Choose a relay that accepts it, or use port 465 with implicit TLS.

This is the same path our website will use in M6. M0 tested the Caddy rule and the script on this VPS, with every path variant. M3 repeated the outside test. **Step 4's email test didn't happen**: production runs without SMTP since M3, and the relay and its spam check move to M6 (m3-plan.md task 2).

**Adding people by hand**, until Jaakko opens registration in M6:
1. In our client, make an invite to the server.
2. On the VPS, run `~/stoat/concord/account-link.sh <email> <invite-code>`. Jaakko types the email there directly, so it never reaches the chat or the repo. The script:
   - creates the account, with a random password nobody sees,
   - prints a one-time link to `/app/welcome/<token>`, valid for 7 days.
3. Send the person the link. They choose a password, log in, pick a username, and land on the invite.
4. A forgotten password: run `account-link.sh --reset <email>`, which prints the account it matched, and send the new link.
   - A reset ends the account's sessions.
   - A reset doesn't remove two-factor login. Someone who lost their authenticator needs their recovery codes.

The address must be the person's own and distinct: Stoat treats `+` and dotted variants as the same email.

## 4. Enable TURN

1. Add a Caddy site block for `turn.concord.jaalip.com` so Caddy obtains its certificate over port 80 of the floating IP. The block can just return 404.
2. Write `deploy/livekit.yml`: the generated `livekit.yml` without its `keys` section, plus the TURN section below. The API key and secret move to a server-only environment file that LiveKit reads as `LIVEKIT_KEYS`, so the repo copy holds no secret. The certificate paths follow Caddy's storage layout, under the directory mounted at `/certs`:

   ```yaml
   turn:
     enabled: true
     domain: turn.concord.jaalip.com
     tls_port: 443
     udp_port: 3478
     relay_range_start: 30000
     relay_range_end: 30100
     cert_file: /certs/turn.concord.jaalip.com.crt
     key_file: /certs/turn.concord.jaalip.com.key
   ```

3. In `deploy/concord.compose.yml`:
   - Mount `deploy/livekit.yml` over LiveKit's config, and pass the keys environment file to LiveKit.
   - Mount Caddy's certificate directory for Let's Encrypt read-only at `/certs`. Mount the directory, not single files, because renewals replace the files.
   - Publish LiveKit's 443 over TCP on the floating IP, and 3478 over UDP plus the relay ports 30000 to 30100 over UDP on the **main** IP. LiveKit hands clients `turn:<node IP>:3478`, and its node IP is the main IP. Only `turns:<domain>:443` uses the floating IP (m3-plan.md).
4. Add a cron job that checks at 05:00 every Monday and restarts LiveKit only when the certificate was renewed since it started. A restart drops calls in progress, hence the hour.
5. Verify in step 6 with the test page.

## 5. Smoke test with Stoat's own client

1. Create accounts for three or more testers with the script from section 3.
2. Enable TOTP on one account, log out, and log back in with a code and then with a recovery code.
3. Create a server with categories, text and voice channels, a hoisted role with a colour, and a custom emoji.
4. Hold a voice call with at least four people on different networks for 30 minutes. Note any dropouts, echo or one-way audio.
5. **Presence check**, done in M0, recorded in m0-results.md. Repeat only after a Stoat upgrade. On 0.15.5: with accounts A and B in the same server but not friends, change A's status text and presence. Note whether B sees it live without reloading. Repeat after making them friends. This decides how often our member list must poll.

Stoat's own client tops out at 1080p30 for screen share, so the 60 fps measurements happen in section 6.

## 6. Screen-share network runs

The test page and the M0 encoder runs are specified in section 7 of [dev-environment.md](dev-environment.md). M3 adds the runs that need TURN and real networks:

| Sharer | Viewers | Codec | Notes |
|---|---|---|---|
| Windows, best M0 setup | Two people on other home networks | Best codec | Record the framerate and resolution each viewer achieves. |
| Any | Any | Best codec | Forced relay with UDP 3478 temporarily closed in the firewall. Stats must show relay over TLS. |
| Any | One viewer on a phone or a throttled connection | Best codec | The viewer must step down layers instead of freezing. |

## 7. Operations checks

1. Record memory and CPU per container at idle and during the voice session, using `deploy/dc stats`.
2. Set up nightly backups with restic, done in M3 by `deploy/backup.sh` to the VPS's own disk. The Storage Box is to be added as a second repository. They cover a MongoDB dump, the object storage data, `secrets.env`, `Revolt.toml`, `livekit.yml`, the LiveKit keys file, `.env.web` and Caddy's data directory. `secrets.env` is critical, because it holds the key that decrypts every stored file. Take the dump and the object-storage copy back to back, because `crond` deletes files from storage on its own schedule.
3. **Restore drill**: restore last night's backup onto a fresh small VPS or a local machine and start the stack. Log in to an existing account and check that its message history is intact, an image attachment opens, and avatars render. Delete the drill machine afterwards.
   - **Concord's own layer** (architecture section 11.5): put the snapshot's `concord/data/layer-backup.db` in place as `concord/data/layer.db`, with no `-wal` or `-shm` beside it, owned by uid 1000, before `dc up -d`. `/app/api/v1/health` then answers 200, and the settings sidebar shows Jaakko's gates.
4. **Concord's own layer** (architecture section 11.5):
   - **Its data** is `~/stoat/concord/data/`, made by `pnpm deploy:stack`, owned by uid 1000 and never touched by deploys.
   - **Backups**: the nightly backup runs `concord/layer-copy.sh` first, a consistent copy in `layer-backup.db`, and saves that, never the live files. `last-backup` ends in `layer copy ok` or `layer copy FAILED`. A failure doesn't stop the rest, so the previous copy is saved instead.
   - **Health**: `curl -s https://concord.jaalip.com/app/api/v1/health`. A layer that couldn't start answers 503 `LayerUnavailable`, and `dc logs concord-web` says why on its `layer: NOT STARTED` line, while the client is still served.
   - **Rolling back past a migration**: each migration first copies the file to `layer.db.before-vN`. An older build refuses a newer file, so stop `concord-web`, replace `layer.db` with that copy and delete `layer.db-wal` and `layer.db-shm`, then deploy the older build. Rows written since the migration are lost.
   - **The admin list** is `ADMIN_USER_IDS=` in `host.env`: user IDs, separated by commas. Apply a change with `concord/dc up -d concord-web`.
5. **Upgrade drill**, if Stoat releases a new version during M3:
   1. Take a MongoDB dump. Migrations run automatically at startup and there is no downgrade, so rolling back means restoring this dump.
   2. Read the release notes and the self-hosted repo's notices. Diff its `compose.yml`, `Caddyfile` and `generate_config.sh` against our pinned commit, and carry new configuration keys over by hand.
   3. Bump the pinned tags in our compose file, restart, and smoke test.
6. Note every manual repair you had to do. This feeds decision gate criterion 3.

## 8. Results and decision

Write `docs/m3-results.md` with:

- Self-hosted commit, Stoat image tags and LiveKit client version.
- Registration gate test result.
- The screen-share table filled in: per run, resolution and framerate achieved, bitrate, encoder, sharer CPU and viewer experience.
- TURN relay result, including the relay protocol shown.
- Resource usage table.
- Time spent and manual repairs.
- A verdict against each of the five decision-gate criteria, and the go or no-go.

On go, voice work in M4 and the website in M6 start. On no-go, the next step is a backend specification for our own Rust service.
