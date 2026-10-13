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

## Task 5: autocomplete, 2026-10-13

**What is deployed**:
- `@` suggests members, or recipients in DMs and groups, and roles when the user has `MentionRoles`.
- `#` suggests channels the user can see.
- `:` suggests emoji from two characters on: custom emoji first, then Unicode by shortcode and name.
- Matches at the start of a name rank first, then at the start of a word, then anywhere. Eight suggestions at most.
- While the list is open, arrows move, Enter or Tab picks, and Escape closes it until the caret leaves that word. These keys take precedence over the composer's own, such as Enter to send and Up to edit.
- A pick replaces the typed word with a token and a space.
- The editor keeps focus throughout, so phones keep their keyboard open.

**Unit tests**: query detection. A trigger must start a word, so `email@host` and `klo 12:3` don't open the list, and `:` needs two characters.

**Live check**: `node tools/live/src/autocomplete.ts`, with `dev` in #botti, `aino` in #pelit and `lauri` in #botti:

| Check | Result |
|---|---|
| `@ai` | Aino Virtanen first, then other names containing "ai" |
| `#yle`, Tab | `#yleinen` |
| `:sau`, Enter | `:sauna:` |
| Escape | The list closes |
| Tokens in the composer | `@Aino Virtanen`, `#yleinen`, `:sauna:` as pills and an image |
| `aino`'s sidebar after the send | "botti, unread, 1 mention", within 30 ms |
| The sent message, as `lauri` sees it | The same three pills |
| `@Mod` as `lauri` or `dev`, who lack `MentionRoles` | No roles offered |
| `@Mod` as `aino`, a moderator | Moderaattori, in the role's colour |
| Console errors or failed requests | None |

## Task 6: attachments, 2026-10-13

**What is deployed**:
- Files come from the plus button, from paste (such as a screenshot) or from drag and drop onto the conversation, which shows a drop overlay.
- Tiles above the composer show an image preview or a file icon, the name, the size and a remove button.
- The limits come from `GET /api/`: 5 files per message, each at most 20 MB. Anything over is refused before uploading, with a notice.
- On send, the message appears at once as pending, with the images dimmed and a progress bar per file. The files then upload over XHR to the same-origin `/autumn/attachments`, and the message sends with their IDs.
- A failed upload marks the message failed. Retry uploads only the files that didn't finish.
- A message can be files without text.
- Everything is gated on `UploadFiles`.
- Toasts moved from the bottom of the window to the top, under the header, because they covered the composer.

**Unit test**: two files, one failing to upload. The retry uploads only that one, and the message is sent once, with both IDs.

**Live check**: `node tools/live/src/attachments.ts`, `dev` sending in #botti while `aino` watches:

| Check | Result |
|---|---|
| A 21 MB file | Refused: "iso.bin is larger than 20 MB, the most one file can be." No tile, no upload |
| Six images at once | Five tiles. "You can attach up to 5 files to one message." |
| An image and a PDF through the button, one image by paste, one by drop | Four tiles |
| Send | The pending message shows four uploads. `aino` has the message 239 ms after Enter |
| What `aino` sees | Three images from `/autumn/attachments/` and the PDF's file card |
| Left behind for `dev` | No pending message, no tiles |
| Console errors or failed requests | None |

**Not checked by script**: sending from a phone, which is in Jaakko's device check.

## Task 7: typing indicator, 2026-10-13

**What is deployed**:
- Stoat's own client's timing: `BeginTyping` at most every 2.5 s while the draft has text, and `EndTyping` 1 s after the last edit. `EndTyping` is also sent on send and when the draft is emptied.
- Switching drafts or clearing after a send doesn't count as typing.
- The line under the composer reads "Aino is typing…", "Aino and Ville are typing…", "Aino, Ville and Eetu are typing…", or "Several people are typing…", with animated dots that respect reduced motion.
- Entries expire after 10 seconds, re-checked every second, so a lost stop event can't leave the line stuck.

**Unit test**: the start throttle, the stop after a pause, and the stop on send, with fake timers.

**Live check**: `node tools/live/src/typing.ts`. This is also the first check of the frame shapes against Stoat, which the fixtures only had from recorder code. They work:

| Check | Result |
|---|---|
| `dev` types, until `aino` sees "Dev is typing…" | 30 ms |
| `dev` pauses, until the line clears | 1042 ms, the 1 s stop delay plus delivery |
| `dev` sends, until the line clears | 2 ms |
| `aino` and `lauri` type at once, as `dev` sees it | "Aino Virtanen and Lauri Nieminen are typing…" |
| Both clear their drafts, until the line clears | 29 ms |
| Console errors or failed requests | None |

## Task 8: pins and search, 2026-10-13

**What is deployed**:
- The header's pin button opens "Pinned messages" in the side column. Enter in the search box opens the channel's results there instead, newest first, 50 at a time with "Load more".
- Results show the author, a short date and the message. Jump goes to the message through the URL, centred and highlighted.
- Results read newer copies from the store, so edits show. Unpinned or deleted messages drop out while the panel is open.
- Closing the panel brings back the member list or the DM profile.
- DMs and groups gained the optional message parameter in their route, `/app/channels/@me/<channel>/<message>`, as server channels have. Jumping and "Copy message link" now work the same everywhere.

**Fixed on the way**: the header's search box was cleared whenever the channel object changed, such as on every new message, not only on switching channels.

**Live check**: `node tools/live/src/find.ts`, as `dev`:

| Check | Result |
|---|---|
| Search "sauna" in #yleinen | "8 results" in 53 ms, matching Stoat's own count |
| Jump on the fifth result | The URL gains the message ID, and the message is visible and highlighted |
| The pins panel in #yleinen | The 3 seeded pins |
| Close | The member list returns |
| Search in the group DM for "oikeesti", a word from its history | 3 results, as Stoat's API returns. Jump lands on the message through the new DM route |
| Console errors or failed requests | None |

## Task 9: the acceptance check, 2026-10-13

`node tools/live/src/m2a.ts`: `dev` and `aino` in #botti, in two browsers, five runs. Times run from the action in one browser to the change appearing in the other, on a monotonic clock. A first run used the wall clock, which jumped by 2.3 s under WSL and gave one negative time.

| Event | Median | Worst of 5 |
|---|---|---|
| Message | 57 ms | 102 ms |
| Edit | 41 ms | 53 ms |
| Delete | 63 ms | 502 ms |
| Reaction | 49 ms | 202 ms |
| Typing starts | 16 ms | 42 ms |
| Typing stops, on clearing the draft | 17 ms | 29 ms |

**One account on two devices**, with `dev` in #pelit and #offtopic while `aino` mentions `dev` in #botti:

| Check | Result |
|---|---|
| Device one shows "botti, unread, 1 mention" | 45 ms |
| Device two shows the same | 48 ms |
| Device one opens #botti, until device two's marker and badge clear | 140 ms |

No console errors or failed requests in any of the three browsers.

**Found and fixed**: `@dev` sometimes picked "Ylläpito", whose username is `dev_admin`, instead of "Dev". Both matched at the start, and ties fell back to the order members happened to load in. Ties now break on an exact match, then a display-name match before a username match, then the alphabet. `rank.test.ts` covers it.

## What is left for Jaakko

1. **Device check**:
   - With one other person, or two of your own machines, try messages, edits, deletes, reactions and typing both ways.
   - Check unread markers with one account on two devices.
2. **On the phone**:
   - send a photo,
   - reply,
   - react through the picker,
   - long-press an emoji in the picker to favourite it.

   An Android phone with Gboard is still untested if one is at hand.
3. **Still open from M0**: the Windows Chrome encoder runs, before M3.
