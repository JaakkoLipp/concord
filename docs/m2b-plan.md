# M2b plan: social

Status: signed off by Jaakko on 2026-10-13, with all eight recommendations accepted. Jaakko can't do M2a's device check yet, so it moves to M2b's acceptance. Implements the M2b section of [milestones.md](milestones.md) from [client.md](client.md) section 7. Results go in `docs/m2b-results.md`.

The working agreement from M2a still applies:
- Every task ends deployed at `https://concord.jaalip.com/app`, with a scripted live check in `tools/live/src/`, and is reviewed there.
- Each finished task is committed and pushed after `pnpm verify`.
- Unit tests cover the risky core only: the store's event rules, the idle state machine and the write queue. There are no new fixture scenarios.

## Checked while planning

Five probes ran against the dev stack, using throwaway accounts, with sockets recording every event. Sonnet agents read Stoat's 0.15.5 server source and Stoat's own web client, and a Sonnet challenger reviewed the draft. The findings that shape the design:

| Question | Answer |
|---|---|
| Does a socket keep receiving updates after a friend request, accept or block reaches it? | **Only partly.** A bug in Stoat's socket handler means that after any `UserRelationship` event, that socket stops receiving **its own user's** updates, and it never receives the new friend's. Existing friends still arrive, and opening a DM or creating a group doesn't trigger it. Re-fetching the user doesn't help. **Sending `Subscribe` for a shared server repairs the socket**, whether it was sent before the event or after it. Without a fix, one incoming friend request would break status sync between your own devices. |
| Who receives status, name, avatar and pronoun changes? | Your own devices, friends, DM and group partners, and every socket subscribed to a shared server, including non-friends. `status` always arrives whole, text and presence together. client.md says status reaches friends and DM partners only, which is wrong for subscribers. |
| Do bio and banner edits arrive live? | **Not their content.** Setting them sends a `UserUpdate` with empty `data`. Removing them sends only `clear: ["ProfileContent"]` or `["ProfileBackground"]`. The client must re-fetch `GET /users/{id}/profile`. |
| What does Invisible look like? | Subscribers get a live `presence: "Invisible"`, but no `online: false`. A `GET` shows `online: false`, and leaks the status text. Going back to Online doesn't re-send `online: true`, not even to the user's own devices. |
| Do synced settings change live? | **Yes.** M2a assumed not. `POST /sync/settings/set` sends `UserSettingsUpdate`, `{"update": {key: [timestamp, value]}}`, to every one of the user's sessions, the writer's own included. A probe confirmed it reaches every socket, including one hit by the socket bug above. The last write wins, even one with an older timestamp. |
| Is there any server-side idle? | None. No other client does auto-idle, Stoat's included. |
| Closing a DM? | `DELETE /channels/{dm}` sets `active: false` **for both people**, and both receive the change. A new message doesn't send `active: true`, and re-opening the DM returns it still inactive. |
| Groups | Creating or adding needs the person to be your friend (`NotFriends`). The configured group size is 100, and creation takes at most 49 invitees. Any member can rename, change the description and icon, and add their own friends. Only the owner can remove members or hand over ownership. A handover sends a `ChannelUpdate` and a system message. If the owner leaves, Stoat picks an arbitrary member as owner and sends **only** the system message. The last member leaving deletes the group. |
| Blocking | Blocking removes any friendship, and unblocking leaves no relationship. **A blocked member can still post in a shared group**, and you receive it. A blocked user's profile returns 403. Sending into a DM with someone who blocked you fails with `MissingPermission`. |
| Friend requests | Only `name#1234` works. A bare name gives `InvalidProperty`. Other errors: `AlreadyFriends`, `AlreadySentRequest`, `Blocked`, `BlockedByOther` and `NotFound`. **Outgoing pending requests are capped**: `GET /api/` reports 5 for accounts younger than 72 hours and 10 after that, so every new member hits the lower limit at M3. That error and the group-size errors weren't triggered live. |
| Text limits | All counted in characters (code points), not bytes, tested with `ä` and emoji: display name 2–32 characters with no zero-width space, pronouns 1–24 (pronouns exist on 0.15.5), status text 128, bio 2000. |
| Uploads | Avatars up to 4 MB, banners 6 MB, group icons 2.5 MB (tag `icons`), images only. |
| Rate limits | `PATCH /users/@me` allows 2 per 10 s, confirmed again. Username changes share that bucket. Friend, block and DM routes allow 20 per 10 s. Group edits and member changes allow 15 per 10 s per channel. |
| Profiles of non-friends | `GET /users/{id}/profile` and `/mutual` work for anyone sharing a server or a channel. |

**Side effects**: 17 throwaway accounts (`m2b…`) joined and left the seeded server, and one more never joined. That left 34 join and leave lines in `#botti`, so `#botti` shows unread for every persona. The accounts still exist, with relationships only among themselves. `pnpm seed --reset` removes them.

## Decisions for Jaakko

1. **Keep every server subscribed, not only the open one.** Recommended.
   - Today the client sends `Subscribe` only for the server on screen. It will instead subscribe to every server in `Ready`, on the Friends page and in DMs too.
   - **When it re-sends**:
     - every 10 minutes,
     - when the window becomes visible or focused, because a sleeping laptop or frozen tab can let it lapse,
     - **after every `UserRelationship` event**, which repairs the socket,
     - when a server is joined or left.
   - Stoat allows 5 subscribed servers per socket. Beyond that, the open server comes first, then the most recently opened.
   - This is the fix for Stoat's socket bug. Since everyone shares the community server, your own devices, new friends and every member's status all stay live. The cost is more status events, which is negligible at 200 people.
   - **The gaps**:
     - A new friend who shares no server shows a stale status until the next reconnect. That can't happen in our setup.
     - `Subscribe` exists only on 0.15.5. A Stoat upgrade would bring the bug back, so the results file says so.
2. **Two synced-settings keys drive presence**, and reach every device live through `UserSettingsUpdate`. Recommended.
   - **`concord:status`** is the status you chose: Online, Idle, Focus, Busy or Invisible. Automatic idle only acts while it is Online. The status menu shows it, so Invisible survives a reload, which Stoat's own data can't do.
   - **`concord:active`** is when any of your devices last had input. A device writes it at most every 4 minutes while you're using it, and at once when you come back. It is what lets an idle desktop know you're on your phone.
3. **"Close DM" hides it for you only**, and is stored in synced settings under `concord:closedDms`. Recommended.
   - Stoat's own close would close the DM on the other person's side too.
   - The key stores the newest message ID at the time of closing. A closed DM comes back when a newer message arrives, or when you open it again.
   - The client ignores Stoat's shared `active` flag.
   - It can move to M7 if you'd rather keep M2b smaller.
4. **Confirmations**, as on Discord:
   - **Ask first** for: remove friend, block, leave group, remove someone from a group, and hand over ownership.
   - **No confirmation** for: accept, ignore, cancel request and unblock.
5. **Blocked users' messages** collapse to "Blocked message — Show" in channels and groups, as on Discord. Recommended. The probe shows a blocked member can still post in a shared group, so without this, blocking doesn't hide them.
6. **Custom status has no "clear after" timer.** Stoat has none, and a timer would only work while a device is open. Recommended to leave out.
7. **No image cropper in the profile editor.** Avatars and banners are shown centred and cropped to fit, as they already are. A cropper can come with M7's polish.
8. **Left for later**:

   | Item | When |
   |---|---|
   | Private notes (client.md's `concord:notes`) | M7 |
   | "In voice" on friends, and counting time in a call as activity for idle | M4 |
   | Username and email changes | M6's account management, since they need the password |
   | Group permission editing | Not planned. Stoat's group defaults stay. |

## Agent tasks, in order

| # | Task | Done when |
|---|---|---|
| 1 | **Live presence and profiles**: `Subscribe` per decision 1. The store rules below, each with a unit test. `UserSettingsUpdate` is applied live, so emoji favourites now sync live too, replacing the re-fetch on focus. `upload` takes an Autumn tag. client.md section 7, the m2a-plan note on settings, and the architecture's presence notes are corrected to the probe findings. | `presence.ts`, extended, with `dev` in the browser: after a friend request reaches `dev`, a status change from `dev`'s second device still shows. So does a new friend's status, and a non-friend member's bio change in an open popout. |
| 2 | **Friends screen**, at `@me`, with the first new `@concord/ui` pieces: Tabs and TextField. Tabs for Online, All, Pending and Blocked, each with a search box. Pending lists incoming and outgoing separately. "Add friend" takes `name#1234`. Errors are in plain words, with the request limit read from `GET /api/`; anything unexpected shows Stoat's error type. Rows show the avatar, presence, status text and actions: message, accept, ignore, cancel and unblock, plus a menu with remove and block. Every action is optimistic and reverts with a toast. An incoming-request count badges the Friends link and the home button. Your own `name#1234` is shown with a copy button. A DM's composer explains each state: not a friend, blocked by you, or not accepting messages from you. | Using `tuuli` and `onni`, a request, accept, remove, block and unblock each show on the other side within a second. The composer follows each state. A sixth outgoing request from `tuuli`, a new account, shows the limit message. |
| 3 | **People actions everywhere**, adding Menu (context menu with keyboard support) and Dialog to `@concord/ui`. The popout and the DM profile panel gain Message, Add friend, Accept, Ignore and Pending buttons, plus a menu: remove friend, block or unblock, copy username and copy ID. On yourself the popout shows "Edit profile". The same menu opens on right-click or long-press of a member, a message author and a DM row. Blocked users' messages collapse per decision 5, and dialogs follow decision 4. | From a server member's popout: add friend, accepted on the other side, then Message opens the DM. A block collapses that person's messages in `#botti` and in a shared group. |
| 4 | **DMs and groups**: a "+" on the DM list opens a friend picker. One person opens or reuses the DM. Two or more create a group with an optional name, capped by `GET /api/`'s group size. Close DM per decision 3. A group gets a side panel: members with the owner marked, plus add members, rename, description and icon (`icons` tag) in a small group-settings dialog. The owner gets remove member and "Make owner", and everyone gets Leave. When an owner leaves, the new owner is taken from the `channel_ownership_changed` system message, since no `ChannelUpdate` comes. A user who joins a group is fetched if unknown. Leaving a group clears its messages and unread state. | With `tuuli` and `onni`: create a group, add a third account, rename, change the icon, remove someone, hand over ownership, and leave as owner. Each step shows on the other side within a second, with the right system line and owner. A closed DM stays closed for the person who closed it, stays open for the partner, and comes back on a new message. |
| 5 | **Status menu and the write queue**: the user dock's popover offers Online, Idle, Focus (only mentions), Busy and Invisible, each with a short description, plus a custom status with an emoji from the picker, text up to 128 characters, and Clear. A choice writes `concord:status` first, then the presence. **The queue** carries every `PATCH /users/@me`: status changes coalesce to the latest and merge into a waiting profile save rather than replacing it. It sends at most once every 5 s, and on 429 it waits for `retry_after`. | Two devices of `dev` plus a friend: the first choice in a burst shows on the other device and to the friend within a second. Five quick clicks make at most two requests and end on the last choice. Invisible survives a reload in the menu. |
| 6 | **Automatic idle**, by the rules below, with unit tests on fake timers. | `idle.ts`, using Playwright's clock: <br>- a device left alone for 10 minutes goes Idle, and input restores Online, <br>- a second device in use keeps the first from going Idle, and once it stops being used, the account goes Idle 10 to 14 minutes later, <br>- a chosen Busy is never touched, <br>- three tabs going away together send one request, <br>- after a simulated sleep, becoming visible counts as being back. <br>Jaakko repeats the two-device case on real devices. |
| 7 | **Settings and the profile editor**: a settings overlay at `/app/settings/<section>`, opened from the dock's gear. It has a Profile section and a Log out button, and server settings join it in M2c. The editor covers display name, avatar, banner, bio, pronouns and status text, with a live preview of the popout. It saves in one `PATCH /users/@me` through the queue, with `remove` for cleared fields. Limits are checked before saving, and uploads use the `avatars` and `backgrounds` tags. Leaving with unsaved changes asks first. | `dev` changes all six fields. `aino`, a friend, and `lotta`, a server member but not a friend, each see every change in their open popout without a reload. Clearing a field clears it for them too. |
| 8 | **Acceptance check and review**: `tools/live/src/m2b.ts` runs the milestone's three criteria between two browsers and measures the delays. A Sonnet review covers the whole M2b diff, and its findings are fixed. Results go in `m2b-results.md`, and the handoff for M2c is written. | The numbers are in the results, each under a second, and the review findings are fixed or answered. |

Live checks use two extra accounts, `tuuli` and `onni`, made once with `pnpm seed account`. Each script resets their relationships at the start and cleans up at the end, so `dev`'s seeded friends, DMs and group stay as they are. Each account stays under 72 hours old for task 2's limit check, or a new one is made.

### Store rules for task 1

Each rule has a unit test:
- A `UserUpdate` replaces `status` whole, and applies every `clear` field: `Avatar`, `StatusText`, `StatusPresence`, `DisplayName`, `Pronouns`, `ProfileContent` and `ProfileBackground`. An empty string still counts as a value.
- The adapter turns a `UserUpdate` with empty `data`, or one that clears a profile field, into a `profileChanged` event. That marks the user's cached profile stale, and an open popout or panel re-fetches it.
- A live presence other than Invisible marks the user online, your own included, because Stoat doesn't re-send `online: true` after Invisible. A user with no presence at all is Online.
- Status text isn't shown for an offline or Invisible user, because `GET` leaks it.
- A `UserRelationship` event replaces the user's presence and status along with the relationship. A block arrives with `online: false` and no status, and the old ones must not survive. The friends, pending and blocked lists derive from the relationship.
- A DM shows unless `concord:closedDms` holds it with no newer message.
- A `UserSettingsUpdate` echo of your own write never overrides a newer local value that is still waiting to be written. This covers quick status clicks and emoji favourites.

### Automatic idle

This replaces the idle paragraph in client.md section 7.
- **Input** is a key, pointer, touch, wheel or focus event. A window becoming visible, or a page being restored, also counts, so a laptop waking from sleep doesn't flash Idle. Input time is shared between tabs of one browser through `localStorage`.
- **One writer per browser**: of all its tabs, only the one holding a Web Lock runs the rules below. If that tab closes, another takes over.
- **Last active** is the newest of this browser's last input and `concord:active`. When `concord:active` arrives live, the device records its own clock at arrival rather than the value written, so clock skew between a phone and a computer can't move the deadline. The written value is used only at start-up.
- **Going Idle**: when last active is 10 minutes old, the chosen status is Online, and your live presence is Online, the device sets Idle. When the phone or another device writes `concord:active`, the deadline moves, so nothing fights and nothing flickers.
- **Coming back**: on input, if your presence is Idle and the chosen status is Online, the device restores Online and writes `concord:active`. This holds whoever set the Idle, including a device that has since closed.
- **A chosen status always wins**: picking Idle, Busy, Focus or Invisible stops all automatic changes until you pick Online again. Busy or Focus set from another Stoat client is also left alone, because the live presence isn't Online.
- **Known limits**:
  - A phone browser freezes hidden tabs. If the phone is the only device open, nothing sets Idle until its socket closes, and then you show offline.
  - A window that is visible but unused shows Idle after 10 minutes. M4 counts time in a voice call as activity.

## Jaakko's tasks

1. Sign off this plan and the eight decisions.
2. Review each task on the live client.
3. **After task 6**: use the phone while the computer sits untouched. The account should stay Online. Then leave both alone and check it goes Idle within about 15 minutes. Also check that a chosen Busy survives.
4. **Acceptance**, after task 8:
   - a friend request, a DM and a group with a second account or person,
   - idle across two devices,
   - a profile edit seen in the other account's popout.
5. **Still open**:
   - M2a's device check, listed in m2a-results.md. Report what it finds, and it is fixed alongside M2b.
   - M0's encoder runs, with Chrome on Windows next, before M3.

## Progress

- **Task 1**, 2026-10-13: done and deployed. The live check passed, as recorded in [m2b-results.md](m2b-results.md).
- **Task 2**, 2026-10-13: done and deployed. The live check passed. Menu and Dialog were built here rather than in task 3.
- **Task 3**, 2026-10-13: done and deployed. The live check passed.
- **Task 4**, 2026-10-13: done and deployed. The live check passed.
- **Task 5**, 2026-10-14: done and deployed. The live check passed.
- **Task 6**, 2026-10-14: done and deployed. The live check passed four runs in a row, after fixing a race it found. Jaakko's device check is next for this task.
- **Task 7**, 2026-10-14: done and deployed. The live check passed, after two fixes it found.
