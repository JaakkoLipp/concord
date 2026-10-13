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
