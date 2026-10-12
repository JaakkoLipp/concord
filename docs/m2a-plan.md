# M2a plan: messaging

Status: signed off by Jaakko on 2026-10-12, with all six recommendations accepted. Implements the M2a section of [milestones.md](milestones.md) from [client.md](client.md) sections 4, 6 and 13. Results go in `docs/m2a-results.md`.

The working agreement from M1 still applies:
- Every task ends deployed at `https://concord.jaalip.com/app`, where Jaakko reviews it.
- Each finished task is committed and pushed after `pnpm verify`.
- Unit tests cover the risky core only: composer serialisation and byte counting, optimistic reconciliation, acks and permission gating. There are no new fixture scenarios.

## Checked while planning

A probe against the dev stack, as `aino`, settled what the docs left open:

| Question | Answer |
|---|---|
| Does Stoat echo the `Idempotency-Key` header as the message's `nonce`? | **Yes.** Optimistic sends can reconcile on it. |
| What happens if a send is retried with the same key? | **409**, with an HTML body. A retry that gets 409 was already sent, so it is not marked as failed. Task 2 says how it then reconciles. |
| Does sending acknowledge your own message? | **No.** The client must ack after its own send, or the channel shows unread on the user's other devices. |
| Does deleting the newest message reset the channel's `last_message_id`? | **No.** It still points at the deleted message, so the channel stays unread until someone acks it. Acking a deleted ID works. |
| How fast does an ack apply? | **A few seconds late.** `GET /sync/unreads` showed the old state right after the 204, then the new state. A reconnect within those seconds must not undo a local ack. |
| Which Unicode reactions are allowed? | **3968 emoji**, from `unicode_emoji.txt` in Stoat's source. The file is identical at the v0.15.5 tag and on `main`. Stoat strips U+FE0F before checking, so `❤` and `❤️` are both accepted, but as two separate reaction keys. The client reuses whichever key a message already has. |
| How does Stoat's own client time typing and acks? | Typing: `BeginTyping` at most every 2.5 s and `EndTyping` 1 s after the last keystroke. Acks: sent when the channel is at the bottom and the window has focus, throttled to about one every 1.5 s. |
| Does `@everyone` exist on 0.15.5? | No. The schema has no everyone or online mention, so autocomplete offers members, roles and channels only. |
| Pins and settings writes? | Already in the M0 fixtures. Pin and unpin are `POST` and `DELETE …/pin`, and `search` with `pinned: true` lists pins. Settings accept our own keys, such as `concord:recorder`, as strings, through `set?timestamp=`. |

**Side effect**: the probe sent one message to `#tekniikka` and then deleted it. That channel now shows unread for every persona except `aino` until they open it, as described above. The ack probe also cleared `aino`'s seeded mention there. Task 2's acks clear the marker, and `pnpm seed --reset` restores the seeded state if a check needs it.

**Also missing from the code today**:
- `root()` drops the message limits, so they need adding: length, attachments, replies and reactions.
- The transport has no multipart upload with progress.
- Nothing handles a settings-changed event, because Stoat sends none.
- There is no toast component.

## Decisions for Jaakko

1. **The editor: use CodeMirror 6, not our own `contenteditable`.** Recommended.
   - **The risk**: client.md section 6.3 calls the inline editor the most fragile part of a chat client. The research agrees, and the worst traps are on Android:
     - Gboard composes whole words, so key events don't say which key was pressed.
     - Caret bugs appear around non-editable tokens.
     - Native undo breaks once code edits the text.
   - **Why CodeMirror 6**: Stoat's own web client uses it for exactly this composer. It keeps the text in Stoat's syntax (`<@ID>`, `<#ID>`, `<%ID>`, `:ID:`), and it draws tokens as atomic widgets. That makes serialising trivial, and the byte count is simply the length of the text in bytes. It brings years of IME, Android and undo fixes that a two-day spike can't reproduce.
   - **The cost**: an estimated 90 to 100 KB gzipped, measured during the spike. It loads just after the message list renders, so cold start stays fast. Initial JavaScript is 77 KB today, against a budget of 250 KB.
   - **If accepted**: client.md section 6.3 and the dependency table are updated in task 1.
   - **The fallback** is unchanged: a `textarea` with the same autocomplete.
2. **Replies**: one reply per message, with the mention toggle on by default, as on Discord. Stoat allows five.
3. **Delete** asks for confirmation. Shift+click deletes at once, as on Discord.
4. **Emoji favourites and frequently used** are stored in synced settings under `concord:emoji`. The last write wins. Because Stoat sends no event when settings change, other devices pick up changes on reload and when the window regains focus, not live.
5. **When the client acks**:
   - when the open channel shows the newest message at the bottom, and the window is visible and focused,
   - after the user's own message is confirmed,
   - on "jump to present",
   - on Escape, but only when there is no reply or edit to cancel first.

   It sends at most one ack per channel every 2 seconds, always for the channel's latest `last_message_id`. A trailing ack catches the end of a burst.
6. **Drafts**: each channel keeps its unsent text and reply while the tab is open, so switching channels loses nothing. Drafts and failed messages are not kept across a reload.

## Agent tasks, in order

| # | Task | Done when |
|---|---|---|
| 1 | **Editor spike, one day**: the composer on CodeMirror 6, loaded lazily. It covers the Stoat-syntax document and atomic widgets for user, role and channel mentions and custom emoji. It also covers Enter to send with an IME guard (`isComposing`), Shift+Enter for a new line, plain-text paste, undo, and a byte counter near 2000. On touch screens, a send button sends and Enter adds a new line, as on Discord's phone app. Sending stays off: send shows the serialised text in a temporary readout. The composer opens with a sample draft containing a real mention, a channel link, a custom emoji and Finnish text, plus a button to reset it, so tokens can be tested before autocomplete exists. Measure the bundle cost. | Jaakko tries the checklist in "Jaakko's tasks" on Windows Chrome and Firefox and on the phone, then decides between CodeMirror and the fallback. The bundle cost is in the results. |
| 2 | **Send, optimistic updates, acks, unreads and drafts**: `sendMessage` and `ack` on `Backend`, and the message limits in `NodeInfo`. Details are below the table. | `dev` and `aino` on two machines see each other's messages within a second. With one account in two browsers, reading on one clears the marker and the mention badge on the other. A send during a network drop ends up exactly once. `#tekniikka` is no longer stuck unread. |
| 3 | **Hover action bar, replies, edit, delete and pin**: the bar has react, reply and edit (for your own messages), plus a menu with pin, copy link, copy ID and delete. Replies use a bar above the composer with the mention toggle. Edit happens inline: Up arrow edits your last message, Enter saves, and Escape cancels. Saving an empty edit offers to delete. Edits and deletes are optimistic and revert with a toast on failure. A failed delete puts the message back where it was. Pending messages have no action bar, and failed ones offer only retry and discard. If the message being replied to is deleted, the reply bar closes and says so. Actions are hidden without the permission: `ManageMessages` for pinning and for deleting others' messages. In DMs that means only your own messages, as Stoat's DM defaults give no `ManageMessages`. | All of it works live and shows on the other persona within a second. A plain member sees no pin action, and a moderator does. |
| 4 | **Emoji picker and reactions**: the picker has search, favourites, frequently used, one section per server for custom emoji, and Unicode categories from `emojibase-data`, loaded lazily. A footer previews the hovered emoji. Favourites and usage are saved through a new `setSettings` on `Backend`. For reactions it offers only the vendored allowlist. Clicking a reaction chip toggles it. An add button sits after the chips, and hovering a chip shows who reacted. Adding needs `React`. A message holds at most 20 distinct reactions. Ctrl+E inserts an emoji into the composer. | Reactions show both ways within a second. Favourites survive a reload and appear on a second device. |
| 5 | **Autocomplete**: `@` for members and roles, with roles only when the user has `MentionRoles`. `#` for channels, and `:` for emoji from two characters on. It is keyboard driven: arrows move, Tab or Enter picks, Escape closes. Picking inserts a token. | A mention shows as a pill in the composer and in the sent message. The mentioned persona gets a mention badge. |
| 6 | **Attachments**: the plus button, drag and drop, and paste. Up to 5 files, each up to the limit from `GET /api/`, which is 20 MB. Oversized files are refused before upload. Tiles above the composer show progress and a remove button. Uploads go over XHR to the same-origin `/autumn/attachments`, so the CSP needs no change. Sending waits for uploads. The pending message shows local previews. Gated on `UploadFiles`. | Images and a PDF are sent from the desktop and from the phone. An oversized file is refused with a message. |
| 7 | **Typing indicator**: `BeginTyping` and `EndTyping` frames on Stoat's timing, with `EndTyping` also sent on send and when the box is cleared. The line below the composer reads "Aino is typing…", "Aino and Ville are typing…", or "Several people are typing…". A timer expires stale entries, so a lost stop event can't leave the line stuck. | The other persona sees it start and stop within a second. The frame shapes come from recorder code, not captured traffic, so this check is also their verification. |
| 8 | **Pins and search**: the header's pin button opens a panel of pinned messages. The search field searches the channel, newest first. Both panels open beside the conversation, and clicking a result jumps to the message. | Searching "sauna" in `#yleinen` finds the seeded messages, and a click jumps there and highlights the message. The pins panel lists the seeded pins. |
| 9 | **Two-machine check**: `tools/live/src/m2a.ts` runs two browsers as `dev` and `aino`. It measures delivery time for a message, an edit, a delete, a reaction and typing, then checks unread sync with one account in two browsers. | The numbers are in `m2a-results.md`, each under a second. |

### Task 2 in detail

This is the riskiest code in M2a, and its unit tests cover every rule below.

**Pending messages**:
- They live in the store, keyed by their idempotency key, apart from the message windows. A window reload, `Ready` or a reconnect leaves them alone. They show dimmed after the newest message.
- Sending while scrolled up, or after a jump, first jumps to the present.
- A pending message and the real one are keyed the same, so the swap doesn't move the scroll position.

**Reconciliation**:
- A real message whose `nonce` matches a pending one replaces it. It can arrive from the send response, the socket echo or any history fetch, in any order.
- Matching on history fetches covers an echo missed while offline.

**Failures**:
- A network error or timeout marks the message as failed and safe to retry. Stoat may have stored it already, so the retry reuses the key.
- On a retry, 409 means "already sent". The client then fetches the newest page, which reconciles it.
- Any other error marks it failed with Stoat's reason, such as a missing permission or a message that is too long.

**Acks**:
- They follow decision 5, and only ever for real message IDs.
- The store keeps a local floor per channel. `ack` events, `Ready` and `GET /sync/unreads` can raise it but never lower it, so Stoat's delay in applying acks can't bring back a marker.
- The "new messages" divider is set once when a channel opens. It doesn't vanish when that open acks the channel.
- client.md section 4.3 is updated to this throttle, which replaces "debounced".

**The composer** is enabled only with `SendMessage`. Otherwise it says why:
- no permission,
- a DM with someone who isn't a friend, which Stoat refuses, or
- a timeout.

## Jaakko's tasks

1. Sign off this plan and the six decisions.
2. **After task 1, about 15 minutes**: try the editor on Windows Chrome, Windows Firefox and the phone. Checklist:
   - type Finnish text with ä and ö,
   - paste text,
   - undo and redo,
   - in the sample draft, move the caret across the mention with the arrow keys and delete it,
   - on the phone, type with the keyboard's word suggestions on, add a new line, and press the send button.

   Then choose CodeMirror or the textarea fallback.
3. Review each task on the live client.
4. **Acceptance**: with one other person, or two of your own machines, check messages, edits, deletes, reactions and typing both ways, and unread markers with one account on two devices. The scripted 30-minute session is for M2 as a whole, after M2c.
5. **Still open from M0**: the encoder runs, Chrome on Windows next (rows 1 to 4 in m0-results.md section 3). They matter before M3, not for M2a.

## Progress

- **Task 1**, 2026-10-12: the CodeMirror composer is deployed, waiting for Jaakko's device check. Results are in [m2a-results.md](m2a-results.md).
