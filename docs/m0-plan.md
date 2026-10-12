# M0 plan: development stack

Status: signed off 2026-10-12, layer 4. Implements [dev-environment.md](dev-environment.md) and the M0 section of [milestones.md](milestones.md). Results go in [m0-results.md](m0-results.md).

Already done: the stack runs on the VPS, the registration gate is tested, the admin bootstrap and the second-account checks are recorded, and the API exposure check found `/api/metrics`, Swagger and `openapi.json` public.

## Agent tasks, in order

Each task ends with a check that shows it is done. Nothing is committed until Jaakko asks.

| # | Task | Done when |
|---|---|---|
| 1 | **Close `/api/metrics`, `/api/swagger*` and `/api/openapi.json`** in `deploy/Caddyfile`, next to the sign-up block, with a 404. Match them case-insensitively, with repeated slashes allowed, in the same style as the sign-up rule. Save `openapi.json` from the internal network to `packages/stoat/api/0.15.7/`. | Every variant from the registration-gate table in m0-results gets 404 on all three paths. `/api/` still answers. |
| 2 | **Memory limits** in `concord.compose.yml`: a `mem_limit` per service, Valkey without persistence and with `maxmemory 64mb`, and RabbitMQ with a 192 MiB watermark, all as in dev-environment section 2. Repeat the MongoDB soak test at the 768 MB limit. | Every service is up after `dc up -d`. The soak passes with no OOM kill. `dc stats` is recorded in m0-results. |
| 3 | **Workspace scaffold**: root `package.json` with pnpm workspaces, strict TypeScript, Vitest, and empty `packages/stoat`, `packages/domain`, `packages/ui` and `apps/web`. Only what tasks 4 to 6 need. The SvelteKit app itself is M1. | `pnpm install` and `pnpm test` succeed on Jaakko's machine. |
| 4 | **`deploy/reset-data.sh`** with the `.allow-wipe` guard, as in dev-environment section 5. Create `~/stoat/concord/.allow-wipe` on the VPS. | Without `.allow-wipe` it refuses and changes nothing. Its first real run is task 5's first `--reset`. |
| 5 | **Seed script** in `tools/seed/`. Its first step creates one persona to check whether Stoat accepts the `seed.concord.test` domain, and falls back if not. Then come the bootstrap, the dataset, `seed account <handle>`, `seed password <handle>` for Jaakko's logins, and `seed hold`. | `pnpm seed --reset` builds everything from an empty database in under 15 minutes, twice in a row. A non-admin persona gets 403 when creating a server or an invite. |
| 6 | **Transport and recorder** in `packages/stoat`: the `Backend` transport interface, a minimal REST and WebSocket transport, the recording wrapper, the offline scrubber, the replay transport, and the scenarios in dev-environment section 6. | Fixtures for login, `Ready`, history, the member list and live events are written under `fixtures/0.15.7/`. The scrubber's pattern pass is clean. One contract test replays them under `pnpm test`. |
| 7 | **Screen-share test page** in `spikes/m0-screenshare/`, a small Vite build with `livekit-client` pinned exactly. Add the `handle_path /spike/*` block and a read-only mount for the built files. | `https://concord.jaalip.com/spike/` loads on a phone. Two browsers on Jaakko's machine join the same voice channel and each sees the other's share with live statistics. |
| 8 | **Bare Electron shell** in `spikes/m0-electron/`: loads `/spike/` and picks the first screen. Packaged as a portable Windows zip and a Linux folder, so Jaakko only downloads and runs it. | Both packages build. Jaakko's first run on Windows is the real check. |

## Verifications during M0

Recorded in m0-results.md as each one is done:

1. **Public exposure**: done. All three were public, and task 1 closes them.
2. **Presence** for Idle, Focus, and DM partners who are not friends. Run with seeded personas once task 5 works, using the same method as the earlier fan-out table.
3. **`Ready` size** on the seeded dataset, with default fields and with the client's field list, raw and gzipped.
4. **Invite icon**: whether `GET /invites/{code}` includes the server icon once the seeded server has one.

## Jaakko's tasks

Agents can't do these, because they need real devices or Jaakko's eyes:

1. **Stoat's own client** (acceptance criterion 2): at `https://concord.jaalip.com`, log in as the seeded `totp` persona, chat, and join voice. `node tools/seed/src/main.ts password totp` prints the email, the password and the current TOTP code.
2. **Encoder runs** from dev-environment section 7: Windows Chrome, Linux Chrome with and without the VA-API flags, Firefox, and the Electron shell on both systems. That needs a real Linux desktop, not WSL. Each run is two minutes of a game or fast video. The agent writes a run checklist with the exact settings into m0-results.md, and Jaakko pastes the page's statistics back.
3. **Decision gate part A**: the agent drafts it in m0-results.md from criteria 1 to 3, and Jaakko signs it off.

## Side effects to accept

- The first `--reset` deletes `jaakko#0485`, the "Concord" server and `test-b`, as dev-environment section 5 says. The agent then deletes the stale credentials in `~/concord-private/`, since those accounts no longer exist. `dev-admin` is the admin until M3 cleanup.
- Seeded personas have generated passwords. `tools/seed/.seed-secret` stays on Jaakko's machine and is gitignored.

## Order and parallel work

Tasks 1 to 4 are small and done first, in order. Task 7 depends only on the stack, so it runs in parallel with tasks 5 and 6, which lets Jaakko start encoder runs early. The presence and invite checks follow task 5, and the `Ready` size follows task 6.

## Progress, 2026-10-12

| # | Task | State |
|---|---|---|
| 1 | Close metrics and API docs | Done. All 30 path variants get 404. |
| 2 | Memory limits | Done. Soak passed at 768 MB. Floating images also pinned. |
| 3 | Workspace scaffold | Done. TypeScript 6.0.3, because svelte-check doesn't support 7 yet. |
| 4 | `reset-data.sh` | Done. The guard refuses without `.allow-wipe`. |
| 5 | Seed | Done. Two clean runs in a row, about 3.5 minutes each. |
| 6 | Transport and recorder | Done. 9 scenarios, 101 files, 9 contract tests passing, re-recorded on 0.15.5. Voice fixtures wait for the page. |
| 7 | Screen-share page | Built and served at `/spike/`, and `join_call` checked. The two-browser check is Jaakko's first run. |
| 8 | Electron shell | Both packages build. |

Verifications 1 to 4 are done and recorded, on 0.15.5 since the move. Jaakko's tasks remain open.
