# Concord: handoff for the next session (M3, VPS to production and media validation)

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience on the live client and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

**All of M2's agent work is done**: M2a messaging, M2b social and M2c administration and notifications are built and deployed at `https://concord.jaalip.com/app`. Each part's acceptance check passed, and each had a Sonnet review of its whole diff. M2 is signed off once Jaakko's device checks pass. They were deferred by agreement, so M3 can start meanwhile.

**This session's job is M3: the VPS to production, and the media path validated on real networks.** It is mostly operations, following [docs/vps-runbook.md](vps-runbook.md). Start by writing `docs/m3-plan.md` from the runbook, then stop for Jaakko's sign-off. Several M3 steps need Jaakko: DNS, a Hetzner floating IP, an email relay, a Storage Box, and testers on other networks. The plan should put those first and say exactly what to buy or set up.

## How to work

- **Plan first.** Write the plan: ordered tasks, each with a done-check, then Jaakko's tasks and the decisions needed. Stop for sign-off. Recommend rather than list options. Keep documents short and plain.
- **Check before acting.** M2's probes kept finding that Stoat behaves differently from what the docs say: two socket bugs, a rate-limit window that ends later than it reports, and `@everyone` existing after all. Probe first, in the scratchpad, and list any side effects.
- **The VPS may be managed freely, with sudo.** Never install system software on Jaakko's WSL machine.
- **M3 wipes the development data** (dev-environment.md section 8). Do that only once Jaakko says so, and keep the seed working for a fresh dev stack if one is needed later.
- **Commit and push at the end of each finished task**, after `pnpm verify`. CI runs it on GitHub (`JaakkoLipp/concord`, private). Run verify right before each commit, not earlier: M2c task 7 went in without it and failed lint in CI.
- **Testing stays light**: unit tests for the risky core, no new fixture scenarios unless a bug needs one, scripted live checks in `tools/live/src/`.
- **Before handing over**, have a Sonnet subagent review the session's whole diff. Use Sonnet subagents (`model: "sonnet"`) for research and review, including a challenger review of the plan before sign-off. Keep synthesis and final writing in the main session. Never run scripts or build tools inside downloaded clones.
- Jaakko's admin email is private. It must never appear in file contents or commit messages. Commit author metadata is fine, by Jaakko's choice.

## Read first

1. `docs/milestones.md`, the M3 section, and `docs/vps-runbook.md`, which already says what M0 did and what M3 still needs.
2. `docs/architecture.md` sections 4.2 (registration), 5.3 (TURN) and 10 (decision gate part B).
3. `docs/m2c-results.md`, "What is left for Jaakko", and m2b-results.md's list, for the device checks still open.
4. `docs/dev-environment.md` section 8, the cleanup before production.

## Commands (WSL, from the repo root)

| Task | Command |
|---|---|
| Everything CI checks | `pnpm verify` |
| Deploy the client to `/app` | `pnpm deploy:web`. It waits until the server answers. |
| Dev server with proxy to the VPS | `pnpm dev`, then open `http://localhost:5173/app` |
| A persona's login | `pnpm seed password dev`. `totp` also prints its current code. The admin persona is `dev-admin`. |
| Reseed from scratch | `pnpm seed --reset`, about 5 minutes |
| Live checks | `tools/live/src/*.ts`. The milestone checks are `m2a.ts`, `m2b.ts` and `m2c.ts`, plus `notify.ts`. `people.ts` gives API sessions for any persona, `tuuli` and `onni` included, and `servers.ts` makes and sweeps throwaway `m2c-check` servers. |

## What M3 inherits from M2c

- **Only `dev-admin` can create servers** on the dev stack (`restrict_server_creation`). After the wipe, Jaakko's real account takes that place: runbook section 2, step 7.
- **Creating a server runs the bootstrap** in the client: Everyone loses `InviteOthers`, and an Admin role with every permission is first. The community server should be created through the client, so it gets this.
- **Invite links are `https://concord.jaalip.com/invite/<code>`**, which Stoat's own client serves until M6.
- **Known Stoat 0.15.5 bugs the client works around**, in client.md section 7: the relationship socket bug (M2b), and channels hidden right after creation (M2c). A Stoat upgrade must re-check both.
- **Rate limits**: every server-admin route shares 5 requests per 10 s. Building a whole server takes about two minutes, mostly waiting.

## Open with Jaakko

1. **Device checks**, collected in m2c-results.md and m2b-results.md: M2a's, M2b's including idle across two real devices, and M2c's desktop notifications in Chrome and Firefox on Windows and Linux. Also M2's own device test from milestones.md: a scripted 30-minute chat session across two machines against the dev stack, which can be run now. M2 is signed off once these pass.
2. **M0 encoder runs**: Chrome on Windows is next (m0-results section 3). They matter for decision gate part B.
3. **Left for later from M2c**: unknown `/app` paths answer HTTP 500 instead of 404, which predates M2c, and the items in m2c-plan.md decision 7.
4. **A product call to revisit**: private channels can only be made by the server's owner (m2c-results.md, review finding 5). Anyone else would hide the channel from themselves, because Stoat only lets them grant roles below their own.
