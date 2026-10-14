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

## Task 3: floating IP, firewall and TURN, in progress

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

**Waiting for**:
- the `turn.concord` DNS record, for the certificate,
- the Hetzner firewall, for the firewall check.

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

**Still to do, once `ref.concord` is in DNS**: `/` redirects to `/app`, Stoat's client moves to `ref.concord.jaalip.com`, and Stoat's mail links redirect there.
