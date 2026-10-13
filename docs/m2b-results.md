# M2b results: social

Results for [m2b-plan.md](m2b-plan.md), recorded against the seeded Stoat 0.15.5 stack at `https://concord.jaalip.com/app`.

## Task 1: live presence and profiles, 2026-10-13

**What is deployed**:
- **Subscriptions**: the socket keeps every server the user is in subscribed, up to Stoat's 5, with the open server sent last. It re-sends them:
  - on `Ready`,
  - every 10 minutes,
  - when the window becomes visible or focused, at most once a minute,
  - 200 ms after the last of a burst of `UserRelationship` events, which repairs Stoat's socket bug.

  Joining or leaving a server updates the list.
- **Status**: a `UserUpdate` replaces `status` whole, so a presence-only status drops old text. Every clear field applies, and an empty string is kept as a value. A visible presence marks the user online, which also covers leaving Invisible.
- **Relationships**: a `UserRelationship` event replaces presence and status, so a block no longer leaves a stale status behind.
- **Profiles**:
  - A `UserUpdate` with empty data, or one clearing the bio or banner, becomes a `profileChanged` event. The session fetches that profile again, 300 ms later, if it has shown it.
  - Opening a popout shows the cached profile and fetches it fresh.
- **Settings**: `UserSettingsUpdate` is applied live. Emoji favourites, notification levels and server order follow other devices at once, and a local change still waiting to be saved isn't overwritten by an echo. The re-fetch on focus is gone.
- **Status text** is hidden for offline and Invisible users, except your own, because Stoat's `GET` still returns it.
- **Uploads** take an Autumn tag, for the avatar, banner and group icon uploads to come.
- client.md section 7 and architecture section 4.3 now describe what the probes showed.

**Unit tests**:
- `packages/stoat/src/social.test.ts`, 9 tests on probe-shaped frames:
  - whole-status replacement,
  - empty strings,
  - clears,
  - presence after Invisible,
  - your own user,
  - the profile-change signal,
  - relationship replacement,
  - unknown users,
  - the settings event.
- `packages/stoat/src/socket.test.ts`, 5 tests on fake timers:
  - every server on `Ready` with the open one last,
  - the cap of 5,
  - one re-send per burst of relationship events,
  - renewal, joins and leaves,
  - nothing sent without the capability.

**Live check**: `node tools/live/src/presence.ts`, with `dev` in the browser and the others over the API. The new helper `tools/live/src/people.ts` gives the M2b checks API sessions, the extra accounts `tuuli` and `onni` included. Times run from just before the action to the change on screen:

| Check | Result |
|---|---|
| `lotta`, not a friend, sets Busy with text, shown in the member list | 24 ms |
| `tuuli` sends `dev` a friend request, then `dev`'s second device sets a status. `dev` is on a DM page, where only the every-server subscription repairs the socket. Shown in the dock | 33 ms |
| `onni` becomes a friend while the socket is open, then sets a status. Shown in the member list | 29 ms |
| `lotta` changes her bio with her popout open | 425 ms, the 300 ms debounce plus the fetch |
| Console errors or failed requests | None |

Everything the check changes is put back. The relationships it makes with `tuuli` and `onni` are removed.

## Task 2: friends screen, 2026-10-13

**What is deployed**:
- **The Friends screen** at `@me` has tabs for Online, All, Pending and Blocked, each with a search box. Pending lists incoming and outgoing separately, and its tab carries the incoming count.
- **Rows** show the avatar, the name with `name#1234` on hover, and the status text or presence. Their actions:
  - friends: message, plus a menu with Remove friend and Block,
  - incoming: accept and ignore,
  - outgoing: cancel,
  - blocked: unblock.

  Clicking a friend opens the DM.
- **"Add friend"**:
  - checks the `name#1234` form before sending, and puts Stoat's refusals into plain words,
  - reads the request limit from `GET /api/`: 5 for accounts under 72 hours old, then 10,
  - shows your own `name#1234` with a copy button.
- **Actions**: every relationship action is optimistic, reverts if Stoat refuses, and shows a toast. Removing and blocking ask first, per decision 4, through one app-wide confirm dialog.
- **Badges**: the Friends link and the home button count incoming requests.
- **The DM composer** now tells apart "You've blocked this person", "This person isn't accepting messages from you" and "You can only message friends".
- **New in `@concord/ui`**: TextField, Tabs, Menu and Dialog. Menu and Dialog came forward from task 3, because the friends rows need them.

**Live check**: `node tools/live/src/friends.ts`, with `tuuli` and `onni` in two browsers on the Friends screen. Times run from the click to the other browser showing it:

| Check | Result |
|---|---|
| `tuuli` sends a request through Add friend, until `onni`'s Pending tab lists it | 56 ms. The notice "Friend request sent to onni#8093." shows, and the Pending tab badge reads 1. |
| `onni` accepts, until `tuuli`'s All tab lists `onni` | 45 ms |
| `tuuli` clicks Message | The DM opens with the composer enabled |
| `onni` removes `tuuli` through the menu and the dialog, until `tuuli`'s composer says "You can only message friends." | 57 ms |
| `onni` blocks `tuuli` through the menu and the dialog, until the composer says "This person isn't accepting messages from you." | 89 ms |
| `onni` unblocks from the Blocked tab, until the composer goes back to "not a friend" | 61 ms. The Blocked tab is empty again. |
| `tuuli`, a new account with 5 requests waiting, sends a sixth | "You can have 5 friend requests waiting at once. Cancel one, or wait for an answer." |
| Console errors or failed requests | Only the expected 400 from that refused sixth request |

The check removes every relationship it made.

## Task 3: people actions everywhere, 2026-10-13

**What is deployed**:
- **Profile cards**: the popout and the DM profile panel show the main action as a button:
  - Message for a friend, not shown in the DM's own panel,
  - Add friend,
  - Accept and Ignore,
  - a disabled "Friend request sent",
  - Unblock.

  A menu holds the rest: remove friend, block, copy username and copy user ID.
- **One context menu** opens on right-click, or a long press on touch screens, on a member, a message author's avatar or name, a DM row and a friends row. It offers Profile, the friend actions, Block or Unblock, and the copy items. iOS sends no `contextmenu` event, so a 500 ms long press opens it there. On Android, where both fire, the menu opens once.
- **Blocked users' messages** collapse into one line per run, "2 blocked messages — Show", in channels, DMs and groups. Show and Hide toggle each run.
- **Adding a friend** from a profile uses Stoat's request by ID, optimistically, so the card switches to "Friend request sent" at once.

**Live check**: `node tools/live/src/people-actions.ts`, with `tuuli` in `#botti` and `onni` on the Friends screen:

| Check | Result |
|---|---|
| `tuuli` clicks Add friend in `onni`'s popout, until `onni`'s Pending tab lists it | 277 ms. The popout says "Friend request sent". |
| `onni` accepts, until the popout's button turns into Message | 64 ms |
| Message | Opens the DM |
| Right-click on `onni` in the member list | Profile, Message, Remove friend, Block, Copy username, Copy user ID |
| Block from `onni`'s message author menu, through the dialog | `#botti` shows "2 blocked messages — Show" and hides them. Show brings them back. |
| A group the two share | "1 blocked message — Show" |
| Console errors or failed requests | One 404, when the cleanup left the group while `tuuli`'s page still showed it. That case belongs to task 4, which fixes it. |
