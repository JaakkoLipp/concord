# Concord: handoff for the next session

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews on the live client and tests on real devices. Coding agents do most implementation. The repository is public (AGPL-3.0-or-later) since 2026-10-19; personal to-dos, open decisions and operator details live in Jaakko's private ops notes, which the main session reads alongside this file.

**On production** at `https://concord.jaalip.com/app`, everything through M4.8:
- **M4** voice, **M4.1–M4.2** alignment and motion, **M4.4** Concord's own layer, **M4.5** menus, GIFs and quick voice controls: see their `docs/m4*-results.md`.
- **M4.6**, UI motion and design parity with `docs/design/discord-ui-motion-spec.md`: settings as an inset modal over the app, tooltips, the rail pill, the action bar, skeletons, the voice stage and stream view, the profile popout, the spinner. `docs/m4.6-results.md` task 19 lists the browser runs still owed and Jaakko's reviews.
- **M4.7**, moderation: moving people between calls, server mute and deafen, Discord-style menus, every permission saying why it's missing, timeouts, slow mode, bulk delete, the audit log, reports, permission guardrails, the upstream pull request text. Hourly history snapshots and the restore tool are live and drilled. The history guard bot is built and drilled locally, waiting for its bot account (`docs/m4.7-results.md` task 12).
- **M4.8**, everyday usability: shortcuts and the quick switcher, opening at the first unread, the mentions inbox, the offline banner, drafts, My Account with two-factor, server order and folders, message sounds, search filters, notes, image zoom, masked links, age-restricted channels, appearance, voice messages.
- **Built outside the plans** (2026-10-18, other sessions): closed-beta invitations and server invites on request through the layer, Administration (people, roles, password links, suspensions) through the host-side account runner (architecture section 11.5), dragging channels between categories, roles on the profile card, member feedback and bug reports.

**Planned next**, in `docs/milestones.md`:
- **M5, desktop apps for Windows and Wayland** (X11 out of scope): `docs/m5-plan.md`, challenger-reviewed, **awaiting Jaakko's sign-off and answers** (the app name, the machines, an unsigned beta, where releases live). Next to build.
- **M4.3, Discord feature gaps**: `docs/m4.3-plan.md`, plan only, from `docs/discord-gap-research.md`. Accessibility is out of its scope for now. Built after M5 is under way, once Jaakko signs it off.
- **M4.9, a Supporter role** with custom profile-card CSS and server creation: roadmap entry only.
- **M6** website, **M7** polish, PWA (with swipe navigation) and the closed beta, **M8** launch, **M9** native Linux client.

**The next session's job**: get M5 signed off and build it task by task; set up the guard bot on production once Jaakko has made its account; run the browser checks owed from M4.6–M4.8 on the local stack.

## How to work

- **Plan first.** Ordered tasks, each with a done-check, then Jaakko's part and the decisions. A Sonnet challenger reviews each plan. Stop for sign-off. Recommend rather than list. Keep documents short and plain.
- **Agents build, the main session steers.** One agent per milestone in its own git worktree, task by task, committing and pushing small commits to `main` after a rebase. The main session reviews, deploys and talks to Jaakko. If agents are interrupted, resume the same ones; a new Claude Code session can't, so brief fresh agents from the last reports.
- **Testing is light** (Jaakko, 2026-10-18): write the code; unit tests only for risky core logic (sync, data loss, permissions, privacy); live checks only where they guard data or privacy. `pnpm verify` runs before every commit. Jaakko reviews on production.
- **Review before deploying.** A Sonnet agent reads the diff since the last deploy for bugs that hurt real users; fix what blocks, then deploy. This has caught real bugs every time.
- **Deploying.** Jaakko prefers finished work on production quickly. Production `/app` is deployed from `main` only: `pnpm verify` on a clean checkout of the same commit (never piped, so a failure stops the deploy), then `pnpm deploy:web`, which runs `routes.ts`. A new layer migration applies on startup; check one that adds a constraint against production's data first. `pnpm deploy:stack:prod` changes the VPS: run it only for reviewed `deploy/` changes.
- **The dev stack is local**: `~/stoat` at `http://localhost`, seeded with personas, set up as `docs/dev-environment.md` describes. The tools default to it (`tools/target.ts`). Production is reached only through `deploy:web`, `deploy:stack:prod` and `live:prod`. The seed and persona checks refuse any stack but the local one.
- **Production holds real people.** Agents never seed, probe or test there.
- **The layer**: a new table is a new numbered file in `apps/web/src/lib/server/layer/migrations/`, imported by name in `migrations.ts`. Every endpoint goes through `endpoint()` in `http.ts`.
- **Synced settings** follow M4.8's six-step `concord:` recipe, with a hold against stale echoes and no writes before settings have loaded (commit c7034ac).
- **Design direction**: Concord should feel like Discord and keep its own identity. Take structure, timings and behaviour from Discord, never their colours or brand. Tokens only, `m.*` strings, the motion rules of client.md section 9.
- **The repo is public.** No personal addresses, IPs, hostnames beyond the public domain, firewall or backup details, or community data in files or commit messages. Operator details go to the private ops notes. `pnpm verify` fails on personal mail addresses; GitHub's secret scanning and push protection are on.
- **Never run scripts or build tools inside downloaded clones.**

## Local stack quirks, handled in `deploy/`

- Under Docker Desktop, containers never get the end of stdin (so `create-account.sh` mounts its body as a file), a single-file bind mount follows the file it first saw (so scripts edit `Revolt.toml` in place, never with `sed -i`), WSL's `/tmp` can't be mounted, and UDP forwarding can rewrite ports after a long cut. Native Docker Engine has none of these; the workarounds are harmless there.
- If voice-ingress answers LiveKit's webhooks with 500 and nobody shows in a call, `~/stoat/concord/dc restart livekit`. Not understood; watch for it at the voice evening.
- Locally `[hosts] january` must be `http://january:14705`, or link previews never arrive.
- After a rebase that touches a workspace package, restart Vite with `--force`. Under `vite dev` the reaction list's `?raw` import breaks reactions, so check reactions on a built preview.
- Running `voice.ts` straight after `layer.ts` gets 429s on `/me` from the layer's flood test.

## Open items

- **Upstream candidates** (architecture section 9): January and the Instagram embed fixers (m4.5-results.md task 9); voice-ingress's state after LiveKit restarts; voice moderation acting on the moderator (text in m4.7-results.md task 13, to be built and tested before filing).
- **Known, not fixed**: a screen-share viewer whose downlink was squeezed can stay at 360p for minutes (m4.5-results.md task 1).

## Commands (from the repo root)

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
