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

**Scripted check**: `node tools/live/src/composer.ts out.png [desktop|phone]`, in headless Chromium against the live client. Both modes passed:

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
