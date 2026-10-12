# Concord: handoff for the next session

You are continuing Concord, a Discord-style chat client on a self-hosted, unmodified Stoat 0.15.5 backend, for a ~200-person community in Finland. Jaakko directs the product, reviews the experience and tests on real devices. Coding agents do most implementation. Jaakko's pronouns are not stated: use the name or they/them.

## How to work

- Planning is layered and reviewed. Layers 1 to 3 are signed off: product brief, architecture, milestones, `dev-environment.md` and `client.md`. Each milestone gets a plan, `docs/m<N>-plan.md`, that Jaakko signs off before implementation.
- Use Sonnet subagents (`model: "sonnet"`) for research and review. Keep synthesis and final writing in the main session. Run research agents read-only, and never run scripts or build tools inside downloaded clones.
- Don't commit unless asked. The repo is private on GitHub as `JaakkoLipp/concord`. Commit author metadata may carry Jaakko's Gmail by Jaakko's choice. File contents and commit messages must not.
- Never install system software on Jaakko's WSL machine. The VPS may be managed freely, with sudo.
- Jaakko's admin account email is private. It must never appear in the repo, docs, fixtures or commit messages.
- Keep documents short, plain and reviewable. Recommend rather than list options.

## Tooling on the WSL machine

- The `pnpm` on the PATH is the Windows install and fails on WSL paths. Use `npx -y pnpm@10.34.5 …` until Jaakko installs a Linux pnpm into nvm.
- Node 26 runs TypeScript directly. The repo uses `erasableSyntaxOnly`: no enums, no constructor parameter properties, relative imports end in `.ts`.
- Scripts reach the VPS as `jaakko@concord.jaalip.com`. `CONCORD_SSH` overrides it.

## Read first

1. `docs/m1-plan.md` and `docs/m1-results.md`: M1, the read-only client, is built and live at `https://concord.jaalip.com/app`. Testing is kept to the risky core, and the live deployment is the review surface.
2. `docs/m0-plan.md`: M0 tasks and their progress.
3. `docs/m0-results.md`: everything verified on the VPS, including the seed, fixtures, presence, `Ready` size, limits and the encoder-run checklist.
4. `docs/client.md`: the M1 and M2 spec.

## State

- **VPS stack**: healthy, Stoat `v0.15.5`, MongoDB `7.0.43`, every image pinned, memory limits on every service. Always run compose through `~/stoat/concord/dc`.
- **Data**: seeded with `pnpm seed --reset`, then the recorder and `seed check` ran, which added friendships, a DM, an extra account and status changes. Reseed before re-recording fixtures. `dev-admin` owns the server and is the only server creator. `pnpm seed password <handle>` prints any persona's login. `~/stoat/concord/.allow-wipe` exists.
- **Fixtures**: `packages/stoat/fixtures/0.15.5/`, 9 scenarios, contract tests pass. The OpenAPI schema is in `packages/stoat/api/0.15.5/`.
- **Test page**: `https://concord.jaalip.com/spike/`. Electron builds are in `spikes/m0-electron/dist/`.

## Open with Jaakko

1. **M1 sign-off**: the black-base call, the side-by-side comparison in m1-results section 2, and the device tests.
2. **M0 device tasks**: Stoat's client with TOTP and voice, the encoder runs, then decision gate part A.

## Next steps

1. Apply Jaakko's M1 review. Then write `docs/m2-plan.md` for text chat, including the server settings screens that client.md section 7 defers to it.
2. Record Jaakko's encoder results in m0-results.md, and voice fixtures once the test page has joined a call.
3. Draft decision gate part A at the end of m0-results.md for Jaakko's sign-off.

## Working on the client

- `pnpm verify` (or `node tools/verify.ts`) before every commit. `node tools/deploy/web.ts` deploys to `/app` and waits for it to answer.
- `node tools/live/src/shot.ts dev out.png <channel>` takes a live screenshot. `review.ts`, `presence.ts`, `reconnect.ts` and `perf.ts` are the M1 checks.
- CI runs `pnpm verify` on every push to GitHub.
