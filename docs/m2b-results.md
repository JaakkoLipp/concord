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

## Task 4: DMs and groups, 2026-10-13

**What is deployed**:
- **New conversations**: a "+" beside "Direct messages" opens a friend picker with search. One friend opens or reuses the DM, and several make a group with an optional name. Stoat needs a name, so an unnamed group takes its members' names, up to 32 characters. At most 49 friends can be invited at creation, and Stoat's group size, 100, caps the total.
- **Close DM**:
  - An × on the DM row's hover, or "Close DM" in its menu, hides the DM for this account only, per decision 3.
  - The DM comes back when a newer message arrives, or when it is opened again.
  - The list is kept in `concord:closedDms` and syncs live to other devices.
  - Stoat's shared `active` flag is ignored.
- **The group panel**:
  - lists members with the owner first and marked with a crown,
  - has Add members, Edit group (name, description and icon, with the 2.5 MB icon limit checked first) and Leave group,
  - gives the owner "Make group owner" and "Remove from group" in each member's menu, both asking first.
- **Ownership**: when an owner leaves, Stoat picks the new owner and says so only in a system message. The client takes the owner from that message.
- **Members**: members the account hasn't met, from a new group or DM or a join, are fetched.
- **Leaving**: leaving a group clears its messages and unread state. A conversation that disappears while open goes to the Friends screen. A load for a channel that is gone no longer fires.
- **Wording**: group system lines now say "the group", not "the channel" or "the server", and a group's history starts with "Welcome to Saunaporukka" without the `#`.

**Unit tests**, 3 more in `social.test.ts`:
- a DM shows despite Stoat's `active: false`, hides when closed here, and returns on a newer message,
- the owner comes from the ownership message,
- leaving a group forgets its unread state.

**Live check**: `node tools/live/src/groups.ts`, with `tuuli` and `onni` in two browsers and `aino` over the API. Times run until the other browser shows the change:

| Check | Result |
|---|---|
| `tuuli` creates "Testiryhmä" with `onni` and `aino` through the picker | 60 ms |
| `tuuli`, the owner, removes `aino` | 61 ms, with the line "tuuli removed Aino Virtanen from the group." |
| Add members puts her back | 64 ms |
| Edit group: rename to "Saunaporukka" and upload an icon | 119 ms, with the new name and icon in `onni`'s sidebar and the rename line |
| Make group owner `onni` | 62 ms, the crown moves |
| `onni` leaves as owner | 61 ms. Stoat made `tuuli` owner, and `tuuli`'s panel shows it from the system message. `onni` lands on the Friends screen. |
| `tuuli` closes the DM with `onni` | Gone for `tuuli`, still there for `onni` after a reload |
| `onni` writes in it | Back in `tuuli`'s list after 24 ms |
| Console errors or failed requests | None. The first run had a 403 after leaving, which the `untrack` fix removed. |

## Task 5: status menu and the write queue, 2026-10-14

**What is deployed**:
- **The status menu**: clicking yourself in the dock opens it, with Online, Idle, Do not disturb, Focus and Invisible, each with a dot and a line of help.
  - A choice writes `concord:status` first, then the presence, so another device never mistakes it for an automatic change.
  - The menu shows the saved choice, so Invisible stays checked after a reload, which Stoat's own data can't show.
- **Custom status**: "Set a custom status" opens a dialog with a Unicode emoji from the picker, then up to 128 characters, counted as Stoat counts them, in code points. "Clear status" removes it.
- **Status changes show at once** on this device and are corrected if Stoat refuses.
- **The write queue**: every `PATCH /users/@me` goes through it.
  - Changes merge while they wait, and the newest wins. A removal and a later value cancel each other.
  - It writes at most once every 5 s, and after a 429 it keeps the change for the next turn.
  - Profile saves (task 7) and automatic idle (task 6) will use it too.
- **The emoji picker** can mount inside a dialog, because a modal dialog makes the rest of the page inert. It gained a Unicode-only mode for the status.

**Unit tests**: `packages/domain/src/selfqueue.test.ts`, 4 tests:
- merging,
- a burst of five becoming two writes,
- a status change joining a waiting profile save,
- the retry after a 429, with other errors rejected.

**Live check**: `node tools/live/src/status.ts`, with `dev` on two devices (A and B) and `aino`, who has a DM with `dev`:

| Check | Result |
|---|---|
| A picks Do not disturb, until B's dock shows it | 325 ms. The REST layer waited out one 429, left from the previous run's clean-up in `dev`'s bucket. `aino`'s DM row shows it too. |
| Five quick picks, ending on Online | 2 requests, ending Online on B and for `aino` |
| A custom status "🔥 Testaan tilaa", with the emoji from the picker, until `aino` sees it | 35 ms |
| Invisible | `aino` sees `dev` offline. After a reload, A's menu still has Invisible checked. |
| Console errors or failed requests | Only that one 429, retried by the REST layer |

## Task 6: automatic idle, 2026-10-14

**What is deployed**: the rules now in client.md section 7, "Idle detection":
- **The tracker**: `packages/domain/src/idle.ts`, a plain class that Session wires to the store, the write queue and synced settings.
- **The web layer**: `apps/web/src/lib/session/idle.ts` feeds it input, at most once a second. It shares that input between tabs through `localStorage` and starts the tracker only in the tab holding the `concord:idle` Web Lock.

**Found by the live check, and fixed**: B's return was sometimes undone at once.
- **What happened**:
  - B came back and wrote both the Online presence and `concord:active`.
  - When the presence event reached A first, A, still away, set Idle again.
- **The fix**:
  - The activity notice is now written first.
  - Another device turning Idle into Online counts as activity in itself, whatever arrives first.
  - A unit test reproduces it.

**Unit tests**: `packages/domain/src/idle.test.ts`, 8 tests on fake timers:
- Idle after 10 minutes alone, once, and Online on input,
- another device in use keeping this one Online, then Idle 10 minutes after it stops,
- Online restored whoever set Idle,
- a chosen Busy, a chosen Idle, and a Focus from another client all left alone,
- `concord:active` at most every 4 minutes,
- a written time from the future capped,
- the race above,
- nothing done before the tracker starts.

**Live check**: `node tools/live/src/idle.ts`, with `tuuli` and Playwright's fake clock. Each browser context has its own clock, as two devices would. It passed four runs in a row:

| Check | Result |
|---|---|
| Device A alone for 10.5 minutes | Idle. A mouse move brings it back Online. |
| A untouched for 12 minutes while B is used at minute 6 | Still Online |
| 5 minutes more, with B unused | A goes Idle, and B shows Idle |
| Input on B | Online on both |
| Do not disturb chosen, then 15 minutes | Still Do not disturb |
| Three tabs in one browser away together | One `PATCH` |
| Hidden, 11 minutes, then visible | Idle, then Online on becoming visible |
| Console errors or failed requests | One aborted request, a write cut off when the script closed device A |

**For Jaakko**: the same on two real devices, per the plan's "Jaakko's tasks", item 3.

## Task 7: settings and the profile editor, 2026-10-14

**What is deployed**:
- **Settings** open at `/app/settings/profile` from the dock's gear, or from "Edit profile" on your own popout. They cover the whole window, with the sections on the left, Profile for now and Log out, and close with Escape or the × button. Server settings join them in M2c.
- **The profile editor** covers display name, pronouns, avatar, banner, custom status and About me, with a live preview of the popout.
  - Limits are checked as you type, in characters as Stoat counts them: name 2–32 on one line, pronouns 24, status 128, About me 2000. Images must be images within Stoat's limits, 4 MB for avatars and 6 MB for banners.
  - Saving uploads the images, to `avatars` and `backgrounds`, then sends one `PATCH /users/@me` through the write queue, with `remove` for cleared fields.
  - A bar offers Reset and Save while there are changes.
  - Leaving with unsaved changes asks first, and closing the tab gets the browser's own question.
- **Profile changes reach other people live**: an open popout or panel fetches the profile again after any update to that user but a bare online flag.

**Found by the live check, and fixed**:
1. **Bio and banner didn't update** for the others when the same save changed other fields. The task 1 rule was wrong for that case:
   - Stoat's `UserUpdate` then carries the other fields and says nothing about the profile, so "empty data" isn't a reliable signal.
   - The new rule is above, and client.md is corrected.
2. **A burst of profile fetches hit the rate limit**:
   - The editor's load effect re-ran whenever the profile or your own user changed, the same tracking mistake task 1 fixed in the popout.
   - Fixed with `untrack`, in the DM panel too.
   - `loadProfile` now shares one request per user while one is in flight, so no caller can start a burst again.

**Also changed**: the seed's per-persona profile became `seededProfile`. A live check uses it to put `dev` back exactly as seeded, even after a failed run.

**Live check**: `node tools/live/src/profile.ts`, with `dev` editing, `aino` (a friend, `dev`'s profile panel open in their DM) and `lotta` (a server member, not a friend, `dev`'s popout open):

| Check | Result |
|---|---|
| All six fields changed and saved, until both see every change without a reload | 477 ms |
| All cleared and saved, until both see them gone, with the default avatar and no banner | 440 ms |
| Close with an unsaved change | "Leave without saving?" Cancel keeps the editor open. |
| Console errors or failed requests | None |

`dev`'s seeded profile is put back at the start and the end.

## Task 8: acceptance and review, 2026-10-14

### Acceptance

The milestone's three criteria:

1. **Friend requests, DMs and groups end to end between two accounts**: `node tools/live/src/m2b.ts 5`. `tuuli` and `onni` are in two browsers, and `aino` is a third group member over the API. Five runs, with times from the action until the other browser shows it:

   | Step | Median | Worst of 5 |
   |---|---|---|
   | Friend request through Add friend, until onni's Pending tab lists it | 56 ms | 57 ms |
   | Accept, until tuuli's All tab lists onni | 44 ms | 62 ms |
   | tuuli clicks Message, until the DM appears in onni's list | 40 ms | 40 ms |
   | A DM message, tuuli to onni | 79 ms | 91 ms |
   | The reply, onni to tuuli | 84 ms | 98 ms |
   | A group created through the picker, until onni's list shows it | 58 ms | 59 ms |
   | A group message | 81 ms | 83 ms |

   After the first run, `onni` reloads: the friend, the DM, the group and its history are all still there. The only failed request in all five runs was a 403 ack. The script had left the group over the API while `tuuli`'s page still read it, and the client no longer retries acks for a channel it has left.
2. **Automatic idle across two devices**: `node tools/live/src/idle.ts`, as recorded under task 6. It passed again after the review fixes. Jaakko's check on two real devices is still to do.
3. **A profile edit shows in the other account's popout without a reload**: `node tools/live/src/profile.ts`, as recorded under task 7. Changes took 477 ms and clears 440 ms, both for a friend and for a server member who isn't a friend.

**Found by the acceptance check, and fixed**: after a friendship formed on an open socket, the new friend's DM composer said "You can only message friends".
- **The cause**: the user a `Message` event carries comes from Stoat's socket cache, which the relationship bug corrupts. A probe confirmed that the friend arrives marked `User`, the value meant for oneself, and the store took that relationship.
- **The fix**: the store now keeps a known user's relationship. An unknown author marked `User` who isn't this account counts as having none.
- Two unit tests cover it, and client.md section 7 notes it.

### Code review

A Sonnet review of the whole M2b diff found 14 issues, none high. Each was checked against the code.

| # | Finding | Outcome |
|---|---|---|
| 1 | After a reconnect, a relationship that ended while disconnected stayed: a ghost pending request, or a wrong DM composer | Fixed: `Ready` lists every relationship, so anyone it doesn't list now has none. A probe confirmed `Ready` lists `BlockedOther` too. Unit test, plus a live step in `friends.ts`: a request cancelled while `tuuli` was offline disappears after the reconnect. |
| 2 | Group settings and the custom-status dialog reset what was being typed when a message arrived or your own user changed | Fixed: they fill only when opened |
| 3 | With Add friend open, no tab could be reached by keyboard | Fixed: the first tab takes focus when none is selected |
| 4 | A partly failed Add members left already-added friends chosen but unlisted | Fixed: the choice keeps only those still offered |
| 5 | A failed profile refresh blanked a cached bio and banner | Fixed: the cached profile is kept |
| 6 | A failed settings fetch on a reconnect reset the chosen status, so idle could override a manual Idle | Fixed: a failed fetch changes nothing |
| 7 | An account in no server has no repair for Stoat's socket bug | Documented in client.md. Everyone is in the community server. |
| 8 | Settings opened from a link could close to the previous site | Fixed: Close goes back only when settings were opened from the app |
| 9 | After sign-out, the write queue could retry a write after another account signed in | Fixed: clearing closes the queue and rejects what waits. The unit test signs out while a write is on its way and Stoat then answers 429. |
| 10 | A failed status choice stayed chosen | Fixed: it reverts, here and in settings |
| 11 | An Idle set by another client is restored to Online by the next input | As planned: the rule restores Online whoever set Idle. Busy, Focus and Invisible from other clients are left alone. |
| 12 | The default group name could cut an emoji in half | Fixed: names are measured in code points, as Stoat counts |
| 13 | A jump or search hit inside a collapsed blocked run showed nothing | Fixed: the run opens. Mentions from blocked users still raise badges, as before. |
| 14 | After a long-press menu on a touch laptop, a mouse right-click on the same element did nothing | Fixed: the press is forgotten shortly after |

**One more change after the review: live profile refetches cost less.**
- Every server is subscribed, so refetching every cached profile on every status change would cost real load at M3. Each refetch was two requests in the shared 20-per-10 s users bucket, multiplied across 200 tabs.
- Now only profiles on screen are fetched again live, and only `GET /profile`. The popout and the DM panel register the user they show.
- `profile.ts` passed again: 427 ms for the changes and 408 ms for the clears.

After the fixes, every M2b live check ran again on the deployed client and passed: `presence`, `friends`, `people-actions`, `groups`, `status`, `profile`, `idle` and `m2b` with 5 runs.

### What is left for Jaakko

1. **The device checks**, from M2a and M2b:
   - M2a: messages, edits, deletes, reactions and typing both ways, and unread markers with one account on two devices. On the phone: a photo, a reply, a reaction and an emoji favourite.
   - M2b:
     - idle across two real devices: use the phone while the computer sits untouched, then leave both,
     - a friend request, a DM and a group with a second person,
     - a profile edit seen in their popout.
   - An Android phone with Gboard is still untested.
2. **M0's encoder runs**, with Chrome on Windows next, before M3.
