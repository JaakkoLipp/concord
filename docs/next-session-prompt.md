# Concord: handoff for the next session

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**On production** at `https://concord.jaalip.com/app`:
- **M4**, voice: the call view, camera, 1080p60 screen share, DM calls with ringing, and voice settings with RNNoise and push-to-talk. What's left of M4 needs people and devices (below). `docs/m4-results.md`.
- **M4.1 and M4.2**, alignment and motion: `docs/m4.1-results.md` and `docs/m4.2-results.md`. Motion rules are in client.md section 9, enforced by `tools/lint/motion.ts`.
- **M4.4, Concord's own layer**, 2026-10-15: `docs/m4.4-results.md` and architecture section 11.
  - It lives in `concord-web`, under `/app/api/v1/`.
  - It provides the session check, the permission check, the server-creator and admin gates, limits, and a SQLite store at `~/stoat/concord/data/`.
  - The store is in the nightly backup through `layer-copy.sh`.
  - `ADMIN_USER_IDS` on production holds Jaakko's admin account.
- **M4.5**, 2026-10-15: `docs/m4.5-results.md`. Built:
  - message, link and image menus with Mark unread,
  - Mark as read for a server, and unread counts in the tab's title,
  - quick voice controls and shortcuts,
  - per-user and per-stream volume,
  - streams that start unwatched,
  - a voice channel user limit,
  - sounds through the chosen speaker,
  - Speak gained mid-call,
  - the January pull request text,
  - server tags, the layer's first feature.

  - favourite GIFs without search, Jaakko's choice for task 7: a star on GIFs in chat, and a GIF button in the composer.

**This session's job:**
1. **Jaakko's review** of M4.4 and M4.5 on production, and of M4.1 and M4.2 if not given yet.
2. **Then the next milestone** in `docs/milestones.md`, planned first, or the admin panel's plan if Jaakko wants it sooner (below).

## How to work

- **Plan first.** Ordered tasks, each with a done-check, then Jaakko's part and the decisions. Stop for sign-off. Recommend rather than list. Keep documents short and plain.
- **The dev stack is local**: `~/stoat` in WSL on Docker Desktop at `http://localhost`, seeded with personas. The tools default to it (`tools/target.ts`).
  - Production is reached only through `pnpm deploy:web`, `pnpm deploy:stack:prod` and `pnpm live:prod <check>`.
  - Ask Jaakko for servers only for what localhost can't show.
  - Never install system software in WSL.
- **Production holds real people.**
  - The seed and the persona checks refuse any stack but the local one.
  - Deploys to `/app` are fine. `deploy:web` runs `routes.ts` afterwards.
- **Commit and push at the end of each finished task**, after `pnpm verify`, run right before the commit.
- **Testing stays light**: unit tests for the risky core, and scripted live checks in `tools/live/src/`.
  - M4 is covered by `voice`, `callview`, `dm-call`, `share` and `voice-restart`, M4.4 by `layer`, and M4.5 by `menus`, `server-read`, `voice-controls`, `voice-channel`, `tags` and `gifs`.
  - The call checks play `media.ts`'s speech-like fake microphone, which Chromium's audio processing still learns to filter within a minute or so, so keep each call check short. New ones share `calls.ts`.
- **The layer**: a new table is a new numbered file in `apps/web/src/lib/server/layer/migrations/`, imported by name in `migrations.ts`. A unit test fails if one is missing. Every endpoint goes through `endpoint()` in `http.ts`.
- **Sonnet subagents** (`model: "sonnet"`) do research, the challenger review of each plan, and the review of the session's diff before handing over. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- **Private addresses**: Jaakko's admin email must never appear in files or commit messages. `pnpm verify` fails on personal mail addresses.

## Docker Desktop quirks, all handled in `deploy/`

- Containers never get the end of stdin, so `create-account.sh` mounts its body as a file.
- A single-file bind mount follows the file it first saw, so scripts edit `Revolt.toml` in place, never with `sed -i`.
- After a long cut, its UDP forwarding can rewrite ports and leave a call with no audio. This is not expected on production. Jaakko's Wi-Fi switch there decides it.
- If voice-ingress answers LiveKit's webhooks with 500 and nobody shows in a call, restart the local LiveKit: `~/stoat/concord/dc restart livekit`. It happened during M4.2 after a reloaded page rejoined a call (m4.2-results.md). It isn't understood, so watch for it at the voice evening.
- Locally `[hosts] january` must be `http://january:14705`, or link previews never arrive.

## Open with Jaakko

**Reviews on production**:
- M4.4: the settings sidebar shows "Can create servers · System admin".
- M4.5: right-click menus, Mark unread, the dock's chevrons and the keybinds in voice settings, Watch stream, the user limit, server tags in server settings and profile settings, and favourite GIFs.
- M4.1 and M4.2 if not reviewed yet: the feel with reduced motion on and off, and one Chrome performance recording including the emoji picker's first open.

**Decisions:**
- **The admin panel**: Jaakko wants it to do, as a GUI in the web client, what they do over SSH during the beta, with its scope kept small. Some of those tasks need root or Docker, which the layer must never have: changing server creators restarts `api`, restarting LiveKit, and creating accounts by email. The recommendation is a small root-side runner on the VPS that does only a fixed list of actions the panel requests. Its plan, in another session's worktree (`.claude/worktrees/concord-admin-panel-9b4095/docs/admin-panel-plan.md`, uncommitted), predates the layer and reads MongoDB directly; it should move onto `/app/api/v1/admin/*` and the layer's admin gate.
- **The browser tab icon** is white on transparent, as asked, and may be faint on light tab bars.

**Mute and deafen keybinds** are in Voice and video settings, Ctrl+Shift+M and Ctrl+Shift+D by default, so a combination a browser keeps for itself can be changed (m4.5-results.md, follow-up).

**Jaakko's tasks for M4:**
1. Encoder runs 1 to 4 on Windows Chrome, on `/spike/`.
2. A real-microphone check on production.
3. A Wi-Fi switch during a call.
4. The voice evening: five or more people for 30 minutes, a game share from Windows Chrome, a Firefox sharer and viewer, and a forced-relay run with UDP 3478 closed briefly. It completes decision gate part B.
5. The restore drill, now with the layer's store (vps-runbook.md section 7).

**Carried from M3:**
- M2's device checks with a tester.
- Before the 21st, delete `~/stoat/data-dev-2026-10-14/` on the VPS.
- Save the restic password in a password manager.
- Remove `/spike/` from production after the voice evening.

**Other sessions**: an end-to-end encryption session for DMs was told about the layer.

**Upstream candidates** (architecture section 9):
- January and the Instagram embed fixers: the pull request text and its tested pattern are in m4.5-results.md task 9, for Jaakko to file.
- voice-ingress's state after LiveKit restarts.
- Voice moderation acting on the moderator instead of the target.

**Known, not fixed**: a screen-share viewer whose downlink was squeezed can stay at 360p for minutes. Send-side estimation didn't help (m4.5-results.md task 1).

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Client to the local stack, to production | `pnpm deploy:web:dev`, `pnpm deploy:web` |
| `deploy/` to the local stack, to production | `pnpm deploy:stack`, `pnpm deploy:stack:prod` |
| Test page to the local stack | `pnpm deploy:spike:dev` |
| Start or stop the local stack | `~/stoat/concord/dc up -d`, `~/stoat/concord/dc stop` |
| Reseed from scratch | `pnpm seed --reset`, then `pnpm seed account tuuli` and `pnpm seed account onni` |
| A persona's login | `pnpm seed password dev` |
| Live checks | `node tools/live/src/<check>.ts`, and `pnpm live:prod tools/live/src/routes.ts` for production |
