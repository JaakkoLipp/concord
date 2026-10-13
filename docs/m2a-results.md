# M2a results: messaging

Results for [m2a-plan.md](m2a-plan.md), recorded against the seeded Stoat 0.15.5 stack at `https://concord.jaalip.com/app`.

## Task 1: editor spike, 2026-10-12

**What is deployed**:
- The composer runs on CodeMirror 6 (`@codemirror/state` 6.7.6, `view` 6.43.14 and `commands` 6.11.1), loaded lazily.
- Sending is off. Send shows the serialised text and its byte count in a box above the composer.
- The composer opens with a sample draft containing a user mention, a custom emoji, a role mention, a channel link and Finnish text. "Reset sample" restores it.

**Bundle cost**: the editor chunk is **87 KB gzipped**, 74 KB with brotli and 271 KB raw. Only the composer's dynamic import loads it, and the import starts when the composer mounts, alongside the history fetch.

`tools/live/src/perf.ts` on the live client:

| Measure | M1 | Now |
|---|---|---|
| JavaScript for the first screen, brotli transfer | 69 KB | about 71 KB, plus the 74 KB editor arriving after it. perf.ts reports 145 KB in total because it counts everything loaded until the network is idle. |
| Cold start to the last message rendered, cold HTTP cache | 240 ms | 260 ms |
| Same, warm cache | 187 ms | 170 ms |
| Channel switch, cached | 94 ms | 88 ms |

The editor costs nothing measurable at start-up, so its load timing stays as it is.

**Scripted check**: `tools/live/src/composer.ts`, in headless Chromium against the live client, in desktop and phone modes. Both passed. The script was removed in task 4, because task 2 removed the spike's readout it checked.

| Check | Desktop, 1600 px | Phone, 390 px with touch |
|---|---|---|
| Tokens drawn as pills and an emoji image, with names from the store | Yes | Yes |
| Typing Finnish text, then undo | Yes | Yes |
| The caret steps over a token in one key press, and Backspace deletes it whole | Yes | Yes |
| Serialised text is Stoat syntax, `<@ID>` etc., and the byte count matches | Yes, 171 bytes | Same |
| Enter | Sends | Adds a line. The send button sends and keeps the editor focused. |
| Console errors or failed requests | None | None |

Headless Chromium can't test IMEs, Android keyboards or Firefox. Those checks are Jaakko's, in the plan's checklist.

**Verdict, 2026-10-12**: Jaakko tested on an iPhone, and everything worked. CodeMirror stays. An Android phone with Gboard hasn't been tried yet.

## Task 2: send, optimistic updates, acks and drafts, 2026-10-12

**Unit tests**: `packages/domain/src/sending.test.ts`, 7 tests. They cover:
- reconciliation with the send response first and with the socket echo first,
- a lost response followed by a retry that gets 409,
- the backend's reason on other failures,
- settling from a history fetch,
- the read floor against older unread state,
- the ack throttle with its trailing ack.

**Live check**: `node tools/live/src/send.ts`, with `dev` and `aino` in three browser contexts:

| Check | Result |
|---|---|
| `dev` sends in #botti through the composer, until `aino` sees it | **102 ms** |
| Copies for the sender, and messages left pending | 1 and 0 |
| `aino` posts. `dev`'s second device shows #botti unread, then clears once the first device reads it | Cleared **823 ms** after the message arrived |
| Send while offline | Fails with "Not sent. Couldn't reach the server." plus Retry and Delete |
| Retry once back online | Exactly one copy for each side |
| #tekniikka, stuck unread by the planning probe, after `dev` opens it | Read at Stoat |

**Also checked**: a regular member in #säännöt sees "You don't have permission to send messages in this channel." in place of the editor.

**Found on the way**: replaying the recorded events twice re-added a mention that had already been read. The store now ignores mentions at or before the read point.

## Task 3: actions, replies, edit, delete and pin, 2026-10-12

**Unit tests**: two more in `sending.test.ts`:
- a failed edit reverts and a failed delete returns to its place,
- a failed edit doesn't undo a newer edit made elsewhere.

**Live check**: `node tools/live/src/actions.ts`, in #botti with `dev`, `aino` (a moderator) and `lauri` (a plain member). Times are from the action to the other persona's screen:

| Check | Result |
|---|---|
| `dev` edits with Up arrow, Enter saves | `aino` sees it in 30 ms, with the "(edited)" marker |
| Reply to `aino` with the mention on | The bar says "Replying to Aino Virtanen, Mention on". `aino` sees the reply preview, and the message is highlighted as a mention |
| Delete through the dialog | The dialog shows. Gone for `aino` in 27 ms |
| Shift+click delete | No dialog. Gone in 34 ms |
| Pin as the moderator | The pin system message shows for `dev` in 38 ms. Unpinned afterwards |
| A plain member's menu | No pin action |
| Console errors or failed requests | None |

**Details**:
- On touch screens, tapping a message shows its action bar.
- A reply is sent with Stoat's `fail_if_not_exists: false`. If the replied-to message is deleted before sending, the message goes out without the reply instead of failing.
- The reply bar also closes with a notice when that message is deleted.

## Task 4: emoji picker and reactions, 2026-10-13

**What is deployed**:
- One picker for the whole app:
  - search,
  - favourites,
  - frequently used,
  - a section per server for custom emoji,
  - the Unicode categories, with a side bar to jump between sections,
  - a preview footer.
- Emoji data comes from `emojibase-data` 15.0.0. That matches the Twemoji 15.0 images exactly: all 1870 picker emoji have an image. Version 15.3.2 was tried first, but it includes Emoji 15.1 sequences that Twemoji lacks.
- Shortcodes are GitHub's, such as `:thumbsup:`. The emoji list and the shortcodes are about 100 KB gzipped, loaded on the first open.
- How the picker works:
  - Shift+click picks without closing.
  - Right-click, or a long press on touch screens, toggles a favourite.
  - Arrow keys move through the grid.
  - Enter in the search box picks the first result.
- Reactions:
  - Clicking a reaction chip toggles your reaction.
  - An add button follows the chips while hovering.
  - The action bar gained a react button.
  - Adding is gated on `React`.
- Ctrl+E or the composer's smiley opens the picker, which inserts at the caret: Unicode as itself, custom emoji as a `:ID:` token.
- Favourites and use counts are saved to `concord:emoji` two seconds after the last change. Other devices read them on cold start and on window focus.

**Reaction spelling**: emojibase writes some emoji with U+FE0F, such as `👍️`. Stoat accepts that, but stores it as a different key from the plain `👍`. A reaction from another client would then show as a second chip. Reactions are now sent in the spelling of Stoat's own allowlist, vendored as `packages/stoat/data/unicode_emoji-0.15.5.txt`, or as the key already on the message.

**Fixed on the way**:
- Twemoji names one ZWJ sequence without its U+FE0F: eye in speech bubble. `twemojiName` handles it, with a test.
- Stoat's allowlist has 290 Emoji 15.1 emoji without a Twemoji image. The picker doesn't offer them, but a reaction chip with one shows the native emoji instead of a broken image.

**Unit tests**:
- the reaction revert,
- the allowlist's spelling, including `👍️` and `👍` giving one form,
- reaction keys reusing the message's existing spelling,
- Twemoji file names.

**Live check**: `node tools/live/src/reactions.ts`, in #botti with `dev`, `aino`, `lauri` and a second `dev` session:

| Check | Result |
|---|---|
| `aino` reacts 👍 through the picker search, until `dev` sees it | 30 ms |
| `aino` reacts with the custom `:sauna:` | 286 ms |
| `dev` toggles the 👍 chip on, then off, until `aino` sees it | 687 ms and 197 ms |
| `lauri` sees both chips live | Yes |
| Ctrl+E, search "grinning", Enter, send | 😀 arrives as a Twemoji image |
| Right-click favourites `:sauna:` | The Favourites section appears at once |
| A second `dev` session opens the picker | `:sauna:` is in its Favourites |
| Console errors or failed requests | None |

**Not checked**: every seeded member has `React`, because the seeded server's default role grants it. Hiding the controls without `React` follows the same permission gating as pinning, which task 3 checked.
