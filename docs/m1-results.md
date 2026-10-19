# M1 results: read-only client

Results for [m1-plan.md](m1-plan.md), recorded on 2026-10-12 against the seeded Stoat 0.15.5 stack. The client is live at `https://concord.jaalip.com/app`. Log in with any seeded persona: `node tools/seed/src/main.ts password dev` prints the `dev` login.

## 1. State of the tasks

| # | Task | State |
|---|---|---|
| 1 | Scaffold and deploy pipeline | Done. SvelteKit 2.70 with adapter-node, `/app` served by `concord-web` (Node 24.21) behind Caddy. CI passes on GitHub Actions. |
| 2 | Design system | Done: tokens, Figtree, Lucide, button, icon button, avatar with presence cut-out, presence shapes, badge, tooltip, popover. The black base still needs Jaakko's call. |
| 3 | Stoat adapter and store | Done. Permission calculator and event handlers have unit tests against the recorded 0.15.5 traffic. |
| 4 | Login | Done. Email and password, then TOTP or a recovery code, then onboarding. Checked live as `totp`. |
| 5 | Layout and navigation | Done, screenshots below. Narrow layouts work at 1000 and 390 px. |
| 6 | Message list and markdown | Done. 18 parser tests. Paging, trimming and "jump to present" checked live. |
| 7 | Members and profiles | Done. A non-friend's status change shows live through `Subscribe`. |
| 8 | Reconnect check | Passed, section 4. |
| 9 | Performance report | Section 5. |

`pnpm verify` runs typecheck, ESLint, the no-literals check, 44 unit and contract tests, svelte-check and the build. The live checks are in `tools/live/src/`: `login.ts`, `shot.ts`, `review.ts`, `presence.ts`, `reconnect.ts` and `perf.ts`.

## 2. Side by side with the reference

The live screenshots match the reference's pixel size: 125% scaling, CSS viewports of 1189 × 1006 and 1442 × 1278. The reference images are in `docs/reference/`, which is gitignored, so their links work only on Jaakko's machine.

| Reference | Live client |
|---|---|
| [discord-reference.webp](reference/discord-reference.webp) | [server-view.png](m1-results/server-view.png) |
| [discord-dm-and-profile-panel.webp](reference/discord-dm-and-profile-panel.webp) | [dm-view.png](m1-results/dm-view.png) |
| [discord-profile-popout.png](reference/discord-profile-popout.png) | [popout.png](m1-results/popout.png) |

More live screenshots:
- **Markdown, embeds and code**: [tekniikka.png](m1-results/tekniikka.png).
- **Images and video**: [media.png](m1-results/media.png).
- **At 1000 px**, the member list hidden: [narrow-1000.png](m1-results/narrow-1000.png).
- **A 390 px phone**: [phone-390.png](m1-results/phone-390.png), with the sidebar open in [phone-390-sidebar.png](m1-results/phone-390-sidebar.png) and the member list in [phone-390-members.png](m1-results/phone-390-members.png).

**What already differs from the reference**, for Jaakko's review:
- The rail's home button is a speech bubble on `--surface-3`. It turns cyan on hover and when selected.
- Unicode emoji are Twemoji, and icons are Lucide outlines, so they read lighter than Discord's glyphs.
- The member list has no activity line ("Factorio") and no badges, because Stoat has neither.
- In DMs and groups, Stoat counts every message as a mention, so DM badges grow quickly: the seeded group shows 23.
- The composer is drawn at its real size but disabled, with a "read-only" note.

## 3. Live member presence

`tools/live/src/presence.ts`: `dev` keeps the server open while `lotta`, who isn't `dev`'s friend, comes online and sets a Busy status with text over the API.

Lotta moved from Offline to Online in the member list, with her status text and a busy dot, without a reload. `Subscribe` works as m0-results.md predicted. The member list also refetches on reconnect and on window focus, at most once a minute.

## 4. Reconnect check

`tools/live/src/reconnect.ts`, three runs. The ID, duplicate, edit and delete checks passed in all three. The content comparison was broken in the first two runs, because it read raw markdown and then hidden rows, and it passed once fixed in the third: `dev` has `#yleinen` open, and the browser goes offline for 60 seconds. Meanwhile `aino` posts three messages, edits one and deletes one over the API.

| Check | Result |
|---|---|
| Recovery after the network returns | 226 to 319 ms. The browser's `online` event triggers an immediate reconnect. |
| Visible message IDs equal `GET` history | Yes, 100 of 100 |
| Duplicates | 0 |
| The offline edit shows | Yes |
| The offline delete is gone | Yes |
| Contents match | Yes |

While offline, Chromium logs each failed socket attempt as an error. That's expected backoff, not a bug.

## 5. Performance against the product brief

Measured by `tools/live/src/perf.ts` from WSL to the VPS, in headless Chromium without a GPU, so frame rates are a lower bound.

| Measure | Budget | Measured |
|---|---|---|
| Initial JavaScript, gzipped | under 250 KB | **77 KB**: 20 files, 213 KB uncompressed. Brotli transfer is 69 KB. highlight.js and KaTeX load only when a code block or formula appears. |
| Cold start to usable channel, warm cache | under 2 s | **187 ms** to the last message rendered, 240 ms with a cold HTTP cache |
| Channel switch, history cached | under 100 ms | **94 ms**, and 142 ms on the first visit, which fetches history |
| Scrolling | 60 fps with 1,000 messages | **60 fps** average over 240 scroll steps through yleinen's history, while pages load. The worst frame was 50 ms, when a page of 100 arrived. The DOM never holds more than 200 messages, so 1,000 loaded messages means walking through five pages. |
| Idle memory, Electron, one server | under 300 MB | Not measurable before M5. The browser tab's JS heap is **17 MB** after the scroll walk. |

The cold start is fast partly because the VPS is close to Jaakko. It should be measured again on a phone over mobile data.

## 6. Stoat behaviour found during M1

- **Pins post system messages**: `message_pinned` and `message_unpinned`. These make a channel unread after the seed has read it, which is why the seed now acknowledges up to each channel's real last message.
- **Unpinning** is a `MessageUpdate` that clears `Pinned`, not one that sets `pinned: false`.
- **System message authors** are the all-zero ULID.
- **Embed images** are external URLs. The client loads them through January's `/january/proxy?url=…` on our origin, so the CSP stays same-origin.
- **The CSP** needs `data:` in `font-src`, because Vite inlines KaTeX's smallest fonts.

## 7. Open with Jaakko

1. Look at the live client and decide whether the black base needs lifting.
2. Sign off the side-by-side comparison in section 2. This is the M1 acceptance criterion, after tasks 5 and 7.
3. Device tests: Windows Chrome and Firefox, Linux Chrome and Firefox, and a phone, at `https://concord.jaalip.com/app`.
