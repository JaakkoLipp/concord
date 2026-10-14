# M3 results

Plan: [m3-plan.md](m3-plan.md). Written task by task. The decision gate verdict comes last, in task 9.

## Task 1: production configuration, 2026-10-14

**Changes**:
- **Addresses**: Caddy binds only the main IPv4 and IPv6, on 80 and 443 over TCP and 443 over UDP. LiveKit's media ports moved to the same addresses. Both read the addresses from the server-only `host.env`, and `ORIGIN` comes from Stoat's `STOAT_DOMAIN`.
- **LiveKit**: its config is in the repo, without keys. The keys are in the server-only `livekit.env`.
- **Mailpit**: it moved to `dev.compose.yml`, which `dc` adds only while `.allow-wipe` exists. The seed refuses any stack without that marker.
- **sysctl**: `ip_nonlocal_bind` is on for IPv4 and IPv6.
- **`create-account.sh`**: it makes a random, unseen password when none is given.
- **Personal mail check**: `pnpm verify` fails on a personal mail address in a tracked file. It reports the file and line, never the address.
- **`/app` 404**: unknown paths answered 500 because the root of the routes had no layout with `ssr = false`. SvelteKit tried to render its own error page on the server and couldn't. A root `+layout.ts` fixes it.
- **`pnpm deploy:stack`**: copies `deploy/` to the server in place and applies it.
  - Copying in place matters because compose bind-mounts single files. A file replaced by rename leaves the container reading the old one.

**Checks**:

| Check | Result |
|---|---|
| Stack restart | Clean. Only Caddy and LiveKit were recreated. |
| HTTP/3, `tools/live/src/h3.ts` | Served and advertised. A normal Chrome keeps reusing its open HTTP/2 connection, so the check forces QUIC. |
| `/app/nope` | 404 |
| Direct voice join through the test page | Connects. All four LiveKit webhooks reach voice-ingress. |
| Public account create | 403 |

**Observation: LiveKit restarts.** On the first join after LiveKit was recreated, voice-ingress answered `participant_joined` and `participant_left` with 500. LiveKit retried with backoff, and the next join was clean. The planned Monday 05:00 restart will cause the same thing. Task 3 checks whether a member who is in voice at restart time is left showing as in the channel.

## Task 3: floating IP, firewall and TURN

**Done on 2026-10-14**:
- **Floating IP**: the floating IPv4 is in `/etc/netplan/60-floating-ip.yaml`, server-only. Caddy answers port 80 on it through `floating.compose.yml`, ready for the TURN hostname's certificate.
- **Automatic reboots** for security updates at 05:30, through `52concord-auto-reboot`.
- **Weekly LiveKit restart**: `/etc/cron.d/concord` runs it on Mondays at 05:00. It does nothing while TURN is off, and it refuses to restart without the certificate.
- **TURN files ready**: `turn.compose.yml`, `livekit-turn.yml` and `tools/live/src/turn.ts`. The check fails as expected while TURN is off.

**Two reboot tests**:

1. **The first reboot broke voice.**
   - The floating IP is set statically and the main IP comes from DHCP, so the floating one is first on `eth0` after a boot.
   - Docker's outbound NAT takes the first address. Every container then sent from the floating IP.
   - LiveKit discovers its node IP over STUN, so it announced the floating IP. Its media ports are published only on the main IP, and joins stuck at "connecting".
   - The host's own traffic was fine, because its DHCP route names the main IP as source.
   - **Fix**: `com.docker.network.host_ipv4` on the stack's network pins outbound traffic to the main IPv4. Applying it needed a `dc down` and `dc up -d`.
2. **The second reboot was clean.** The floating IP was present, all 17 containers were up, LiveKit's node IP was the main IP, and voice connected.

**Seen at every boot**: `api`, `crond`, `pushd` and `voice-ingress` panic about seven times with "Failed to connect to RabbitMQ" and restart. Docker brings containers back without Compose's startup order. They settle by themselves in about 40 seconds. No repair is needed, but it is noted for decision gate criterion 3.

**TURN on, 2026-10-14**, once `turn.concord` was in DNS:
- Caddy obtained the certificate from Let's Encrypt over HTTP-01 on the floating IP, at the expected path.
- With `TURN=on`, LiveKit started TURN over TLS on 443 of the floating IP, and over UDP on 3478 of the main IP.

| Check | Result |
|---|---|
| Certificate on `<floating IP>:443` | `CN = turn.concord.jaalip.com`, Let's Encrypt, valid to January 2027 |
| `tools/live/src/turn.ts`, relay only, `turns:` server only | Connected through `turns:turn.concord.jaalip.com:443?transport=tcp` with `relayProtocol: tls`. 5.2 MB of video in 12 s. |
| `restart-livekit.sh`, run by hand | Certificate found, LiveKit restarted, logged under `concord` |
| Direct voice join after the restart | Connected over UDP, without the relay |
| Firewall, before | **No Hetzner Cloud firewall yet.** A throwaway container on port 9999 answered from outside on the main and the floating IP. Docker-published ports bypass ufw, so only the cloud firewall can stop them. |
| Firewall, after Jaakko created "concord" | The same container times out from outside on the main and the floating IPv4. SSH, `routes.ts`, `h3.ts`, `turn.ts` and a direct UDP voice join all still pass. IPv6 couldn't be tested from WSL and is checked from the drill machine in task 6. |

Hetzner's form takes a port range as the first port in "Port" and the last in "Port range", not as `30000-30100` in one box.

## Task 7: invites, first part, 2026-10-14

Built before the wipe, so it could be checked with personas on the dev stack.

**Changes**:
- **Invite page**: our client has one at `/app/invite/<code>`.
  - Signed out, it previews the server: icon, name, who invited you, member count and channel. It offers "Log in to join" and says accounts are by invitation.
  - Signed in, it offers Join, or Open for a member.
  - Group invites work the same way.
  - Bad or revoked codes say so, and a ban says so.
- **Return after login**: any page reached signed out now goes through `/app/login?next=…` and returns there afterwards. `next` only accepts paths under `/app/`.
- **Redirect**: Caddy sends `/invite/<code>` to `/app/invite/<code>` with a 302, so links copied from our client work as they are.

**Bug found while checking**: right after Join, the page opened before our own member record had arrived, so the channel looked empty. The session fetches that record after `ServerCreate` (the M2c fix). The page now waits for it, up to five seconds, before opening the server.

**Check**: `tools/live/src/invite.ts` makes a throwaway server as `dev-admin`. As `tuuli`, it walks through:
- the link signed out,
- the preview,
- login and return,
- Join,
- the channel usable at once,
- Open on a second visit,
- a bad code.

All pass.

**Second part, the front door, 2026-10-14**:
- **Stoat's client moved to `ref.concord.jaalip.com`**: a Caddy site in `ref.caddy` proxies the same `web` container. Caddy's certificate came on the second attempt, a few seconds later.
- **The main domain leads to our client**: everything outside our routes, `/` included, redirects to `/app` with a 302. A plain `redir` would run before Caddy's routes, so it sits in a final `route` block.
- **Cross-origin checks**:
  - The API answers preflights with `Access-Control-Allow-Origin: https://ref.concord.jaalip.com`, and Autumn uploads allow any origin.
  - A persona logged in to Stoat's client at `ref.`, and its socket connected to `wss://concord.jaalip.com/ws`.
  - Voice uses websockets, which CORS doesn't cover. The tester evening uses Stoat's client there for voice.
  - The one 404 is Stoat's own `ishere.jpg`, which is missing from its build.
- **`tools/live/src/routes.ts`** checks every public path's answer and the 403 on public account creation. All pass.
- **Possible leftover**: browsers that ran Stoat's client at the root may still hold its service worker. `/app` has worked alongside it throughout M1 and M2, so nothing is done about it unless it shows up.

## Task 2: accounts without email, 2026-10-14

Jaakko can't use an outside mail provider, so M3 sends no email.

**What we found first**:
- **Outbound mail ports**: from the VPS, ports 25 and 465 are blocked, as Hetzner Cloud does by default. 587 and 443 are open.
- **Stoat with no mail server**: when `[api.smtp] host` is empty, Stoat creates accounts already verified and sends no mail. Its "Forgot password" fails with `OperationFailed`, because it stores the reset token only after sending.
- **Reset tokens**: `PATCH /auth/account/reset_password` looks up the token in the account's `password_reset` field. Stoat's own upstream test writes that field directly, and so does our script.
  - **Probed on the dev stack**: a written token set the password (204), and using it again got 401.
  - The expiry is stored as an ISO-8601 string, compared as text.
- **Cloudflare**: researched as an alternative. Email Sending is in public beta since April 2026 and needs Workers Paid, about $5 a month. Its SMTP is on port 465 only, which Hetzner blocks, so it would need a bridge to Cloudflare's HTTPS API. Left for M6.

**Built**:
- **`deploy/account-link.sh <email> [invite]`** on the server:
  - creates the account if needed, with a random password nobody sees,
  - writes a one-time token valid for 7 days,
  - marks a pending verification as verified, which matters only on the dev stack, where Mailpit is still configured,
  - prints `https://<domain>/app/welcome/<token>?invite=<code>`.

  It matches the email without regard to case. A new link cancels the previous one.
- **`/app/welcome/<token>`** in our client: choose a password, then log in, pick a username and continue to the invite.

**Check**: `tools/live/src/welcome.ts` makes a brand-new account with a link to a throwaway server. In the browser it then sets the password, catches a mismatch first, logs in, picks a username, lands on the invite, joins and sees the channel. A used link is refused. All pass. `invite.ts` still passes.

**Effect on the decision gate**: criterion 1, registration with real email, can't be confirmed in M3 and moves to M6. The Caddy rule and the internal account-create path are confirmed again here.

## Task 4: backups, 2026-10-14

**Setup**:
- **Where**: restic 0.18.1 from Ubuntu's packages, with the repository on the VPS's own disk at `/var/backups/concord/restic`, owned by root. A Storage Box becomes a second repository later. Until then, a backup doesn't survive losing the VPS.
- **When**: `backup.sh` runs nightly at 03:30 from `/etc/cron.d/concord`.
- **What**, two snapshots taken back to back:
  - `db`: restic runs `mongodump` itself, so a failed dump is never saved.
  - `files`: object storage, Caddy's data, `secrets.env`, `Revolt.toml`, `.env`, `.env.web`, `host.env`, `livekit.env` and the netplan file.
- **Retention**: 7 daily, 4 weekly and 6 monthly snapshots, with `restic check` on Sundays.
- **Outcome**: written to the system log under `concord`. `sudo ~/stoat/concord/status.sh` shows the last backup, disk, memory, TURN and any container that isn't up.

**Checks**:

| Check | Result |
|---|---|
| First run | Two snapshots, 171 KiB dump and 1.6 MiB of files. The repository is 3 MB and the run took 6 s. `restic check`: no errors. |
| Dump read back | `mongorestore --archive --gzip --dryRun` from `restic dump` completes |
| Forced failure: unreadable or empty password file | Exit 1, "FAILED" in the log, `status.sh` shows "failed" |

**Bug found by the forced failure**: the first version made a new password whenever the password file was empty. That would replace the real one and hide that it was gone. Now only a brand-new repository gets a password, and an existing one without its password stops the backup.

**For Jaakko**: keep the repository password in your password manager. Print it with:

```bash
ssh -t jaakko@concord.jaalip.com 'sudo cat /root/.config/concord/restic-password'
```

**At the wipe**: the snapshots of dev data are forgotten, so production's backups start clean.

## Task 5: the swap to production, 2026-10-14

Jaakko asked for an in-place swap rather than a wipe. Nothing was deleted:

1. **Stop and set aside**: `dc down`, then the dev data moved to `~/stoat/data-dev-2026-10-14/`: `data/db`, `data/minio` and `data/rabbit`, with `Revolt.toml.dev` and the `.allow-wipe` marker. That data was 47 accounts, one server and 831 messages.
2. **Production configuration** in `Revolt.toml`:
   - `[api.smtp] host = ""`, so there is no email and accounts are created verified,
   - `restrict_server_creation` set to the placeholder that matches nobody.
3. **Start**: `dc up -d --remove-orphans` on empty data folders. Mailpit is gone, because `.allow-wipe` is. 16 containers run, and the upload bucket was recreated.
4. **Backups restarted**: the four dev snapshots were forgotten and pruned. The first production backup holds the empty stack.

Caddy's data (certificates), `secrets.env`, `host.env`, `livekit.env` and the TURN setup are unchanged.

| Check | Result |
|---|---|
| `GET /api/` | 0.15.5, `restrict_server_creation` holds only the placeholder |
| Database | 0 accounts, 0 servers |
| `routes.ts` | All pass |
| `reset-data.sh` | Refuses: no `.allow-wipe` |
| `pnpm seed account …` | Refuses: not a dev stack |
| API log | Only Stoat's expected warnings, no SMTP and no captcha |

- **Rollback**, while the dev copy is kept: `dc down`, move the three folders and `Revolt.toml.dev` back, restore `.allow-wipe`, then `dc up -d`.
- **The dev copy is deleted after a week.** M4's dev stack gets a fresh seed instead, because the copy's files are encrypted with production's key in `secrets.env`.
- **Down time**: about two minutes, longer than planned because a `cp` into the root-owned folder failed midway. The stack stayed down and nothing was lost.
