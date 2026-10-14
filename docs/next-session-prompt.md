# Concord: handoff for the next session (M2c, administration and notifications)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**This session's job is M2c: server administration and notifications.** Start by writing `docs/m2c-plan.md`, then stop for Jaakko's sign-off before writing code. The scope is in `docs/milestones.md`:
- server management for admins: create a server, channels, categories, roles, per-channel permission overrides, custom emoji upload, invites, kicks and bans,
- removing the invite permission from regular members when a server is created,
- browser notifications while the client is open.

The plan must include the screen-by-screen spec for server settings.

## How to work

- **Plan first.** Write the plan: ordered tasks, each with a done-check on the live client, then Jaakko's tasks and the decisions needed. Stop for sign-off. Recommend rather than list options. Keep documents short and plain.
- **Check Stoat's behaviour live while planning.** M2b's probes found a Stoat socket bug and several wrong assumptions before any code was written. Write probes in the scratchpad, not the repo. Use throwaway accounts or `tuuli` and `onni`, and list any side effects in the plan.
- **Testing stays light**, by Jaakko's choice:
  - Unit tests cover the risky core.
  - Add no new fixture scenarios unless a bug needs one.
  - Every task ends deployed at `https://concord.jaalip.com/app`, with a scripted live check in `tools/live/src/`, and that is where review happens.
- **Commit and push at the end of each finished task**, after `pnpm verify`. CI runs it on GitHub (`JaakkoLipp/concord`, private).
- **After sign-off, run the tasks through** without stopping between them. Give a short status at each commit, and stop only for decisions. Jaakko can't do device checks right now: collect them for later instead of stopping. In shell chains, use `set -o pipefail`, so a failing `pnpm verify | tail` stops the deploy.
- **Before handing over**:
  - Have a Sonnet subagent review the milestone's whole code diff for correctness. In M2a it found ten real bugs and in M2b fourteen, after every live check had passed.
  - Test what happens after each feature is used, not just the feature itself.
- **Watch for these traps**, which caught M2b more than once:
  - A Svelte `$effect` that calls a session method reading the store re-runs whenever that data changes. Wrap such calls in `untrack`.
  - Live checks that match text must use text unique to the run.
- Use Sonnet subagents (`model: "sonnet"`) for research and review, including a challenger review of the plan before sign-off. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- Never install system software on Jaakko's WSL machine. The VPS may be managed freely, with sudo.
- Jaakko's admin email is private. It must never appear in file contents or commit messages. Commit author metadata is fine, by Jaakko's choice.

## Read first

1. `docs/milestones.md`, the M2c section, and `docs/client.md`: section 7 for server and invite controls, and section 8 for notifications.
2. `docs/m2b-plan.md` and `docs/m2b-results.md`: what M2b built, how each task was checked, and the review's findings.
3. `docs/architecture.md` section 4.2: the server-creation bootstrap, which removes `InviteOthers` from members.

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Deploy the client to `/app` | `pnpm deploy:web`. It waits until the server answers. |
| Dev server with proxy to the VPS | `pnpm dev`, then open `http://localhost:5173/app` |
| A persona's login | `pnpm seed password dev`. `totp` also prints its current code. |
| Reseed from scratch | `pnpm seed --reset`, about 5 minutes. It also removes the throwaway `m2b…` accounts and puts `#botti` back. |
| Live screenshot | `node tools/live/src/shot.ts dev out.png <channel>` |
| Live checks | `tools/live/src/*.ts`. M2b's acceptance check is `m2b.ts`. `people.ts` gives API sessions for any persona, `tuuli` and `onni` included. |

## What M2c builds on

- **Building blocks** in `@concord/ui`: Dialog, Menu, Tabs and TextField. The web app also has an app-wide confirm dialog (`lib/view/confirm.svelte.ts`) and context menu (`lib/view/contextmenu.svelte.ts`, with `use:menuOn` for right-click and long press).
- **Settings overlay**: `/app/settings/<section>`, with only Profile today. Server settings are meant to join it, or to follow the same layout at their own route.
- **Synced settings change live**: Stoat sends `UserSettingsUpdate` to all of the account's sessions. Notification levels (`notifications`) already parse in `session.svelte.ts`.
- **Presence**:
  - `concord:status` holds the status chosen in the menu, and Focus means "only mentions".
  - Notifications must follow it, as Stoat's client does: none while Busy, mentions only while Focus.
- **Permissions**: the calculator lives in `packages/domain/src/permissions.ts`. Uploads take an Autumn tag: `icons`, `banners` and `emojis` are already supported by `upload(…, tag)`.
- **Every server stays subscribed** (M2b decision 1). New servers are picked up from `ServerCreate`.

## Open with Jaakko

1. **Device checks**, collected in m2b-results.md under "What is left for Jaakko": M2a's and M2b's, including idle across two real devices.
2. **M0 encoder runs**: Chrome on Windows is next (m0-results section 3). They matter before M3.
