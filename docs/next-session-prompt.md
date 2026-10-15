# Concord: handoff for the next session (M4.4 and M4.5)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**M4 is built and on production** at `https://concord.jaalip.com/app`: voice, the call view, camera, 1080p60 screen share, DM calls with ringing, voice settings with RNNoise and push-to-talk. What's left of M4 needs people and devices (below). Read `docs/m4-results.md` first.

**M4.1 and M4.2 are built and on production** (2026-10-15):
- **M4.1, alignment**: `docs/m4.1-results.md`. It includes the follow-up from Jaakko's Discord screenshot: the voice panel and user dock in one panel, level with the composer, and "is typing" above the composer.
- **M4.2, motion**: `docs/m4.2-results.md`. The rules are in client.md section 9, Motion: Discord's style, slight. `tools/lint/motion.ts` in `pnpm verify` enforces them, and `tools/live/src/motion.ts` checks them live. New UI follows them: animate only transform, opacity and colours, timings from tokens, `leave` and `enter` from `@concord/ui`, and hover colours behind `@media (hover: hover)`.

**This session's job, in order:**
1. **Jaakko's review of M4.1 and M4.2** on production, if not given yet: the feel with reduced motion on and off, and one Chrome performance recording on the reference machine.
2. **M4.4, Concord's own layer**: `docs/architecture.md` section 11 and `docs/m4.4-plan.md`. The design is approved and was revised after a challenger review. The plan awaits sign-off.
3. **M4.5, menus, GIFs, quick voice controls, server tags**: `docs/m4.5-plan.md`, awaiting sign-off. Tasks 1 to 9 don't need M4.4, and task 10, server tags, does. Its new menus and pickers use M4.2's `Menu`, `Popover` and motion helpers.

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
- **Testing stays light**: unit tests for the risky core, and scripted live checks in `tools/live/src/`, of which `voice`, `callview`, `dm-call`, `share` and `voice-restart` cover M4. They play `media.ts`'s speech-like fake microphone, because Chromium's own beep is filtered away within seconds.
- **Sonnet subagents** (`model: "sonnet"`) do research, the challenger review of each plan, and the review of the session's diff before handing over. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- **Private addresses**: Jaakko's admin email must never appear in files or commit messages. `pnpm verify` fails on personal mail addresses.

## Docker Desktop quirks, all handled in `deploy/`

- Containers never get the end of stdin, so `create-account.sh` mounts its body as a file.
- A single-file bind mount follows the file it first saw, so scripts edit `Revolt.toml` in place, never with `sed -i`.
- After a long cut, its UDP forwarding can rewrite ports and leave a call with no audio. This is not expected on production. Jaakko's Wi-Fi switch there decides it.
- If voice-ingress answers LiveKit's webhooks with 500 and nobody shows in a call, restart the local LiveKit: `~/stoat/concord/dc restart livekit`. It happened during M4.2 after a reloaded page rejoined a call (m4.2-results.md). It isn't understood, so watch for it at the voice evening.
- Locally `[hosts] january` must be `http://january:14705`, or link previews never arrive.

## Open with Jaakko

**Sign-offs**: M4.4 and M4.5. **Reviews**: M4.1 and M4.2 on production.

**Decisions pending, each with a recommendation in its plan:**
- Restart LiveKit only when the TURN certificate is renewed. It's in the repo and not yet on production. A restart leaves Stoat's voice state wrong: m4-results.md task 9.
- Try `use_send_side_bwe` locally, so screen-share viewers don't stick at 360p.
- Rename noise suppression "Off" to "Browser default".
- The browser tab icon is white on transparent, as asked, and may be faint on light tab bars.

**Jaakko's tasks for M4:**
1. Encoder runs 1 to 4 on Windows Chrome, on `/spike/`.
2. A real-microphone check on production.
3. A Wi-Fi switch during a call.
4. The voice evening: five or more people for 30 minutes, a game share from Windows Chrome, a Firefox sharer and viewer, and a forced-relay run with UDP 3478 closed briefly. It completes decision gate part B.
5. The restore drill.

**Also from Jaakko:**
- a GIPHY developer key for M4.5, typed into `host.env` on the VPS,
- later, an admin user ID in `host.env` for the admin panel.

**Carried from M3:**
- M2's device checks with a tester.
- Before the 21st, delete `~/stoat/data-dev-2026-10-14/` on the VPS.
- Save the restic password in a password manager.
- Remove `/spike/` from production after the voice evening.

**Other sessions:**
- The admin-panel session's draft plan should move onto Concord's own layer: `/app/api/v1/admin/*`, with no direct database reads.
- An end-to-end encryption session for DMs was told about the layer.

**Upstream candidates** (architecture section 9):
- January's Discord user agent for Instagram embed fixers,
- voice-ingress's state after LiveKit restarts,
- voice moderation acting on the moderator instead of the target.

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
