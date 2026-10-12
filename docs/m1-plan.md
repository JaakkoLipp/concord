# M1 plan: read-only client

Status: signed off 2026-10-12, then revised the same day to Jaakko's testing direction (fewer tests and fixtures, the live deployment as the review surface), layer 4. Implements the M1 section of [milestones.md](milestones.md) from [client.md](client.md). Results go in `docs/m1-results.md`.

**Read-only** means the client shows everything a member sees, but sends nothing except login, onboarding and `Subscribe`. Acknowledgements and automatic idle are M2, as the milestones say, so unread markers come from the server's state and are not cleared. The composer is drawn at its real size, disabled, so the layout can be judged against the reference.

**The live deployment is the review surface.** From task 1 on, every task ends deployed at `https://concord.jaalip.com/app` against the seeded stack, where Jaakko looks at it. Agents take review screenshots of the live client with Playwright.

**Testing is kept to the risky core**:
- unit tests for the permission calculator, store event handling and the markdown parser,
- the existing M0 contract tests,
- one scripted reconnect check against the live deployment.

There are no new fixture scenarios, no screenshot-diff suite and no gallery. CI runs `pnpm verify` on GitHub Actions in the private repository `JaakkoLipp/concord`.

## Agent tasks, in order

| # | Task | Done when |
|---|---|---|
| 1 | **Scaffold and deploy pipeline**: SvelteKit 2 and Svelte 5 in `apps/web` with adapter-node. The `(app)` route group sits under `/app` with `ssr = false`. Then: the Vite proxy from dev-environment section 3, ESLint with the two rules from client.md (no `{@html}` with user content, no string literals in components), the typed English message catalogue, and `svelte-check`. Deployment is a `concord-web` container, a Caddy route for `/app` with the CSP from client.md section 13, and `pnpm deploy:web`, which builds, copies and restarts. `pnpm verify` runs typecheck, lint, tests and the build, locally and in Actions. | `https://concord.jaalip.com/app` serves the app shell. `pnpm verify` passes locally and in CI. |
| 2 | **Design system**: `packages/ui/tokens.css` from client.md section 9, Figtree, Lucide, and the primitives the later tasks need: button, icon button, avatar with presence shapes, badge, tooltip and popover. | They appear in the login screen and shell in task 4, with keyboard focus rings. |
| 3 | **Stoat adapter and store**: types generated from `api/0.15.5/openapi.json`, then: `rest.ts` (auth header, queuing per rate-limit bucket, one retry on 429, error normalisation) and `socket.ts` (`Authenticate` frame, explicit `Ready` fields, `Ping` every 20 seconds, reconnect when no `Pong` arrives within 10, backoff). Also `capabilities.ts` with `Subscribe` on for 0.15.5, the mappers, the `Backend` interface, the normalised store with message windows, idempotent event handlers, the cold-start sequence, unread derivation, member grouping, and the permission calculator ported from Stoat. | Unit tests for the permission calculator and the event handlers pass, along with the existing contract tests. |
| 4 | **Login**: `/app/login` with email and password, then a TOTP or recovery code, plus onboarding for new accounts. The session lives in IndexedDB, and logout clears it and every cached store. | Jaakko logs in as `totp` on the live deployment. |
| 5 | **Layout and navigation**: the four-column grid, then: the rail (server icons, selection pill, unread and mention badges), the sidebar (categories, collapse, unread markers, muted channels), the DM list, the user dock spanning two columns, the chat header and the disabled composer. Also the narrow layouts below 1100 and 700 px. | Screenshots of the live client sit next to the reference screenshots in `m1-results.md`. |
| 6 | **Message list and markdown**: the bounded window of about 200, loading pages of 100, grouping within 7 minutes, day and "new messages" dividers, jump to present, the jump-to-message route, and scroll anchoring. Then attachments with reserved space and a thumbhash placeholder, video, file cards, embeds, read-only reactions, reply previews and the image viewer. The markdown parser and renderer cover architecture section 4.4, with Twemoji SVGs self-hosted, and code highlighting and math loaded lazily. | The seeded channels read correctly live, including the markdown showcase messages. Parser unit tests cover each construct. |
| 7 | **Members and profiles**: the member list grouped by hoisted role, then online and offline, kept live through `Subscribe` and re-fetched on reconnect and window focus. Also the profile popout and the DM profile panel with mutuals, member since and account age. | A status change by another persona shows live in the member list. |
| 8 | **Reconnect check**: a Playwright script against the live deployment takes the browser offline for 60 seconds while another persona posts, edits and deletes, then restores it. | The visible history matches `GET` history exactly, with no duplicates or gaps. |
| 9 | **Performance report**: initial JavaScript gzipped, cold start to a usable channel, channel switch, scrolling 1,000 messages and browser memory, against the product brief's budgets. | The numbers are in `m1-results.md`, met or not. |

## Jaakko's tasks

1. Look at the live client after each task. After task 2, decide whether the black base needs lifting.
2. Sign off the side-by-side comparison with the reference after task 5 and again after task 7. This is the M1 acceptance criterion.
3. Device tests: Windows Chrome and Firefox, Linux Chrome and Firefox, and a phone layout check.

## Decisions, 2026-10-12

1. **CI**: private GitHub repository `JaakkoLipp/concord`. Actions run `pnpm verify`.
2. **Playwright**: pinned to the Chromium build already in Jaakko's user cache, used for review screenshots and the reconnect check only.
3. **`Subscribe`**: on for 0.15.5 through the capability table. Sent when a server opens and every 10 minutes while it stays open. Later versions fall back to polling.
4. **Markdown**: no fixtures recorded from Stoat's client. The parser tests are hand-written cases, using Stoat's renderer as the reference.

## Carried over from M0

- M0's device tasks and decision gate part A are still open. M1 proceeds in parallel.

## Progress, 2026-10-12

All nine agent tasks are done and deployed; results, screenshots and measurements are in [m1-results.md](m1-results.md). Jaakko approved the look, kept the black base, and passed the device tests on 2026-10-12. M1 is done.
