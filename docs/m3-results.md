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
