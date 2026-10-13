# Concord: handoff for the next session (M2b, social)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**This session's job is M2b, social.** Start by writing `docs/m2b-plan.md`, then stop for Jaakko's sign-off before writing code. The scope is in `docs/milestones.md`: DMs and group DMs, the friends list (online, all, pending, blocked), status and presence with automatic idle, and profile editing.

## How to work

- **Plan first.** Write the plan: ordered tasks, each with a done-check on the live client, then Jaakko's tasks and the decisions needed. Stop for sign-off. Recommend rather than list options. Keep documents short and plain.
- **Check Stoat's behaviour live while planning.** M2a's plan settled its open questions with a small API probe against the dev stack, which caught several wrong assumptions. Write any probe in the scratchpad, not the repo.
- **Testing stays light**, by Jaakko's choice. Unit tests cover the risky core. Add no new fixture scenarios unless a bug needs one. Every task ends deployed at `https://concord.jaalip.com/app`, with a scripted live check in `tools/live/src/`, and that is where review happens.
- **Commit and push at the end of each finished task**, after `pnpm verify`. CI runs it on GitHub (`JaakkoLipp/concord`, private).
- Use Sonnet subagents (`model: "sonnet"`) for research and review, including a challenger review of the plan before sign-off. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- Never install system software on Jaakko's WSL machine. The VPS may be managed freely, with sudo.
- Jaakko's admin email is private. It must never appear in file contents or commit messages. Commit author metadata is fine, by Jaakko's choice.

## Read first

1. `docs/milestones.md`, the M2b section, and `docs/client.md` section 7 (social, profiles and presence).
2. `docs/m2a-plan.md` and `docs/m2a-results.md`: what M2a built and how each task was checked.
3. `docs/m0-results.md` section 2: presence fan-out, `Subscribe`, and "DMs need a friendship".

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Deploy the client to `/app` | `pnpm deploy:web`. It waits until the server answers. |
| Dev server with proxy to the VPS | `pnpm dev`, then open `http://localhost:5173/app` |
| A persona's login | `pnpm seed password dev`. `totp` also prints its current code. |
| Reseed from scratch | `pnpm seed --reset`, about 5 minutes |
| Live screenshot | `node tools/live/src/shot.ts dev out.png <channel>` |
| Live checks | `tools/live/src/*.ts`. M2a's acceptance check is `m2a.ts`. |

## What M2b builds on

- **Messaging works everywhere**, including DMs and groups:
  - the composer, with drafts, replies, autocomplete, attachments and typing,
  - the action bar, reactions, the emoji picker, pins and search,
  - unread and acks.
- **Send gating**: `sendBlock` in `apps/web/src/lib/view/channels.ts` already says why a DM can't be sent to: not a friend, or blocked. M2b's friend actions should make those states change live.
- **Session and store**: write actions live in `packages/domain/src/session.svelte.ts`, behind the `Backend` interface. Optimistic changes revert and rethrow, and the UI shows a toast (`lib/view/toast.svelte.ts`).
- **Stoat facts that matter here**, from m0-results:
  - Status changes reach friends and DM partners live, but other server members only through `Subscribe`.
  - A friendship formed after a socket opened brings no live status until the friend's user is fetched again.
  - `PATCH /users/@me` allows 2 per 10 seconds.
  - Opening a DM with a non-friend is refused.
- **DM routes** take an optional message: `/app/channels/@me/<channel>/<message>`.

## Open with Jaakko

1. **M2a acceptance**: Jaakko's device check is listed at the end of m2a-results.md. Fix anything it finds before or alongside M2b.
2. **M0 encoder runs**: Chrome on Windows is next (m0-results section 3). They matter before M3.
