# Concord: handoff for the next session (M4, voice and screen share in the browser)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**M3 is done apart from what it handed to M4.** Production runs at `https://concord.jaalip.com`.
- **Who is on it**: Jaakko's two accounts and the community server. Registration is closed.
- **TURN over TLS** works on a floating IP.
- **Backups** run nightly to the VPS disk.
- **No email.** People get one-time password links instead.
- **The main domain** leads to our client at `/app`. Stoat's own client is at `ref.concord.jaalip.com`.

Read `docs/m3-results.md`'s summary first.

**This session's job is M4: voice and screen share in our client.**
1. **Set up the dev stack first** (milestones.md, "Carried in from M3"). Production has real people and no seeded personas, so agents need their own stack before any voice work.
2. **Then write the voice spec and the plan**:
   - client.md section 10 is only an outline, so turn it into the full voice section,
   - write `docs/m4-plan.md`,
   - stop for Jaakko's sign-off.
3. **Reference**: Jaakko attached a reference for the voice channel in the sidebar, `docs/reference/discord-voice-channel.png`. It shows participants listed under the channel, a call timer, a speaking ring, and the voice icon turning green when active. `discord-voice-settings.png` was already there.

## How to work

- **Plan first.** Write the plan: ordered tasks, each with a done-check, then Jaakko's tasks and the decisions needed. Stop for sign-off. Recommend rather than list options. Keep documents short and plain.
- **Check before acting.** M3's probes found, among others:
  - LiveKit's UDP TURN URL uses the main IP, not the floating one,
  - a reboot made Docker send from the floating IP, which broke voice,
  - Stoat skips email verification when no SMTP server is set.

  Probe first, in the scratchpad, and list any side effects.
- **The VPSes may be managed freely, with sudo.** Never install system software on Jaakko's WSL machine.
- **Production holds real people.**
  - Never run the seed, `reset-data.sh` or throwaway-server checks against it. The seed and `reset-data.sh` refuse any stack without `.allow-wipe`.
  - Deploys to `/app` and Caddy changes are fine, with a check afterwards: `tools/live/src/routes.ts`.
- **Commit and push at the end of each finished task**, after `pnpm verify`, run right before the commit. CI runs it on GitHub (`JaakkoLipp/concord`, private).
- **Testing stays light**: unit tests for the risky core, no new fixture scenarios unless a bug needs one, scripted live checks in `tools/live/src/`.
- **Before handing over**, have a Sonnet subagent review the session's whole diff. Use Sonnet subagents (`model: "sonnet"`) for research and review, including a challenger review of the plan before sign-off. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- **Private addresses**:
  - Jaakko's admin email is private. It must never appear in file contents or commit messages; `pnpm verify` fails on personal mail addresses. Commit author metadata is fine, by Jaakko's choice.
  - Jaakko types emails on the VPS directly, with `account-link.sh`.

## Read first

1. `docs/milestones.md`: M4, and "Carried in from M3".
2. `docs/client.md` section 10, the voice outline, and section 7's Stoat quirks.
3. `docs/architecture.md` sections 5.1 to 5.4, voice and TURN, and 10, the decision gate.
4. `docs/m0-results.md`: "Voice join" and section 3, the encoder runs.
5. `docs/m3-results.md`: the summary, the provisional decision gate and task 3, TURN.

## The dev stack, M4's first task

- **What**: a CX23 at `dev.concord.jaalip.com`, about €5.49 a month. Jaakko creates the server and the DNS record.
- **Setup**: run `deploy/server-setup.sh`, clone the self-hosted repo at `9af5e90`, run `generate_config.sh` for the dev host, and use our `deploy/` files with `.allow-wipe`. Its `host.env` has no floating IP and `TURN=off`.
- **Seed**: `pnpm seed --reset` builds the personas.
- **Keys**: the LiveKit key id in `deploy/livekit.yml`, `2c2e5918ca20`, must also be used on the dev stack, with its own secret.
- **Tool defaults**: `CONCORD_BACKEND`, `CONCORD_SSH` and `CONCORD_APP` should default to the dev stack. `pnpm deploy:web` should target production explicitly, with a `deploy:web:dev` beside it.
- **Domain-specific files**: `deploy/livekit-turn.yml` names `turn.concord.jaalip.com`. The client's CSP names `wss://concord.jaalip.com` (`apps/web/svelte.config.js`). Check that a dev build on another host still connects.
- **Done when**: the seed runs, and `m2c.ts`, `invite.ts` and `welcome.ts` pass against the dev stack.

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Deploy the client to `/app` | `pnpm deploy:web`, production until the defaults change |
| Copy `deploy/` to the server and apply it | `pnpm deploy:stack`, then `concord/dc restart <service>` if LiveKit's or Stoat's config changed |
| Dev server with proxy to the backend | `pnpm dev`, then open `http://localhost:5173/app` |
| A persona's login, dev stack only | `pnpm seed password dev` |
| A person's password link, on the server | `~/stoat/concord/account-link.sh <email> [invite-code]` |
| Server health, on the server | `sudo ~/stoat/concord/status.sh` |
| Live checks | `tools/live/src/*.ts`:<br>• `routes.ts` and `h3.ts`: production-safe.<br>• `turn.ts <persona>` on the dev stack. On production it runs with `TURN_EMAIL`/`TURN_PASSWORD`; the dev stack has no TURN.<br>• `invite.ts`, `welcome.ts` and the `m2*.ts` checks: dev stack only. |

## What M4 inherits

- **Voice join**:
  - `POST /channels/{id}/join_call` returns a LiveKit token valid for about 10 seconds. Connect at once, to `wss://<origin>/livekit`, never to the absolute URL Stoat returns.
  - No data tracks: voice-ingress disconnects anyone who publishes one.
  - The screen-share flag covers both video and audio (architecture 5.4).
- **TURN**: the ICE servers come from LiveKit's join response. In production they are `turns:turn.concord.jaalip.com:443` and `turn:<main IP>:3478`. Chrome reports the relayed candidate as `prflx`, so read `relayProtocol`.
- **Rate limits**: every server-admin route shares 5 requests per 10 s. `join_call` has its own bucket, not yet measured.
- **The test page** at `/spike/` is the M0 and M3 screen-share bench. It records codec, encoder, layers and per-second stats.
- **LiveKit restarts** on Mondays at 05:00. After a restart, voice-ingress answered the first join's webhooks with 500, then recovered. Watch for members left showing in a channel.

## Review items carried over

From M3's diff review, in m3-results.md:
- Test IPv6 before adding the AAAA record. Docker's IPv6 forwarding may make every IPv6 client one address to Stoat's rate limits, and the IPv6 firewall is untested.
- Make the seed guard assert that `CONCORD_SSH` and `CONCORD_BACKEND` name the same host, once two stacks exist.
- Remove `/spike/` from production after the voice evening.
- `docs/reference/` is git-ignored: the reference screenshots exist only on Jaakko's machine.

## Open with Jaakko

1. **The dev stack**: a CX23 and the `dev.concord` DNS record.
2. **M0 encoder runs**: Chrome on Windows, runs 1 to 4, on the test page with Jaakko's two production accounts. They pick the codec for M4's publishing settings.
3. **M4's voice evening**: five or more people, which also covers M3's voice, screen-share and forced-relay runs. The forced relay needs UDP 3478 closed in the Hetzner firewall for a moment. The results complete decision gate part B.
4. **The restore drill**: a temporary CX23 and a `drill.concord` record, from vps-runbook.md section 7. The IPv6 firewall check runs from it.
5. **M2's device checks** on production, with Jaakko's two accounts and a tester. M2 is signed off when they pass.
6. **Before the 21st**: delete `~/stoat/data-dev-2026-10-14/` on the VPS, the dev data kept for rolling back the swap. Save the restic password in a password manager, if not done.
7. **Product calls carried over**:
   - private channels only by the owner (m2c-results.md, finding 5),
   - the items in m2c-plan.md decision 7,
   - real email in M6.
