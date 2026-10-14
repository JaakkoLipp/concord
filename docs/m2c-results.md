# M2c results: administration and notifications

Results for [m2c-plan.md](m2c-plan.md), recorded against the seeded Stoat 0.15.5 stack at `https://concord.jaalip.com/app`.

## Task 1: foundations, 2026-10-14

**What is deployed**:
- **REST buckets**, as client.md section 4.4 now describes: every server's routes share one known bucket of 5, other buckets are learned from their first answer, a slot is reserved in the same step as the check, and a 429 is retried for up to 60 s.
- **Backend**: every admin route the plan needs, for servers, roles, channels, overrides, invites, members, bans and emoji.
- **Mapping**: a member leaving carries Stoat's reason, `EmojiUpdate` renames an emoji, and servers carry their system-message channels.
- **Rank rules** in `packages/domain/src/ranks.ts`: your rank, which roles and members you may act on, which overrides you may write, the role list that keeps roles you can't assign, role moves, and merging a waiting order with roles created or deleted meanwhile.
- **Joining**: when a `ServerCreate` brings no member record of your own, the session fetches it, so a joined server's channels show without a reload.
- **Losing a server**: a kick, a ban or a deletion by someone else shows a notice. Leaving shows none. The open conversation already goes to the Friends screen when its channel goes.

**Unit tests**:
- `packages/stoat/src/rest.test.ts`, 5 tests against a fake Stoat with fixed windows, on fake timers: a burst of 12 server edits with no 429, two servers apart, a learned channel bucket, a 429 retried and then given up, other errors at once.
- `packages/domain/src/ranks.test.ts`, 7 tests: the owner, members without roles, equals, kept roles, override writes, moves and merges.
- `packages/stoat/src/admin.test.ts`, 2 tests: the leave reason, system-message channels and their removal, and emoji renames.

**Found while building**: the first version still overran the bucket. A request checked for room, then reserved its slot after an `await`, so a burst started in one step all saw an empty bucket. The slot is now taken in the same step as the check. A finished request also freed its slot before its answer's count was read, letting one more through.

**Live check**: `node tools/live/src/removal.ts`, with `tuuli` in a browser and `dev-admin` over the API on a fresh `m2c-check` server. `tools/live/src/servers.ts` gives the M2c checks their throwaway servers and sweeps leftovers at both ends.

| Check | Result |
|---|---|
| `tuuli` joins over the API, until the server is in her rail | 32 ms. Its channel shows when opened, without a reload. |
| A kick, until she is on the Friends screen with "You were removed from …" | 52 ms |
| A ban, until "You were banned from …" | 23 ms |
| Six role renames fired at once through the client's REST layer, after six role creations | All six landed, none failed, in 12.6 s: the bucket's waits, not errors |
| A deletion, until "… was deleted." | 31 ms |
| Console errors or failed requests | None |

**Not yet**: the question before closing the tab while admin writes wait comes with task 2, where the first admin writes are.

## Task 2: create a server, the server menu and Overview, 2026-10-14

**What is deployed**:
- **"+" on the rail**, only for accounts in `restrict_server_creation`: a dialog with the name and an optional icon. Creating runs the bootstrap and opens the server.
- **The bootstrap** (`packages/domain/src/admin.svelte.ts`): Everyone loses `InviteOthers`, then an Admin role with every permission is made, first in rank. A server with no roles whose Everyone can still invite shows its owner "Setup didn't finish" with Retry, which skips the steps already done.
- **The server menu**, from the server name atop the sidebar and by right-clicking the server's icon: Server settings, if any section is open to you, and Leave server, not for the owner, asking first. Later tasks add to it.
- **Server settings** at `/app/server-settings/<server>/<section>`, in the frame now shared with user settings. Overview has the icon, banner, name, description and the four system-message channels, with the save bar and the question before leaving unsaved changes. A system channel that no longer exists shows as Off. The owner gets Delete server, confirmed by typing the name.
- **The server's banner** now shows atop its channel sidebar, as on Discord. Members never saw it before.
- **Admin writes** are counted while they wait for the rate limit, and closing the tab meanwhile asks first.

**Live check**: `node tools/live/src/admin.ts`, with `dev-admin` and `tuuli` in browsers, `onni` over the API, and `dev` in a third browser:

| Check | Result |
|---|---|
| Create a server with an icon through "+" | Everyone can't invite. One role, Admin, rank 0, with every permission. The icon is set. No setup banner. |
| A server made over the API without the bootstrap | Shows "Setup didn't finish"; Retry removes `InviteOthers` from Everyone and makes Admin |
| Overview: new name, description, icon, banner and a join channel, until `tuuli` sees the name, icon and banner | 1594 ms, including the two image uploads. All five saved. |
| `onni` joins, until the join line shows in `tuuli`'s `#General` | 29 ms |
| `tuuli` leaves through the server menu | Back on the Friends screen, with no notice |
| Delete server through settings, until `tuuli` reads "… was deleted." | 58 ms |
| `dev`, a plain member | No "+", and the seeded server's menu offers only Leave server |
| Console errors or failed requests | None |

**Found by the live check**:
- **The setup banner hid while Retry was still running**, as soon as Everyone lost `InviteOthers`. It now stays until Retry ends.
- **The check itself drained `dev-admin`'s rate limit.** It polled `GET /servers/{id}` every 25 ms, and that shares the server's 5-per-10-s bucket with the browser's saves, so the first Overview save took 11.6 s. The check now polls every 2.5 s. This will matter in task 9, where the whole build shares one bucket.

## Task 3: channels and categories, 2026-10-14

**What is deployed**:
- **The server menu** gains Create channel and Create category, for those with `ManageChannel`.
- **Categories**: a "+" beside each title creates a channel in it. Right-clicking a title offers Create channel, Rename, Move up, Move down and Delete. Deleting leaves its channels at the top, in no category. Managers see empty categories.
- **Channels**: right-click, or the context-menu key, offers Edit channel, Move up, Move down, Move to category…, Delete channel, Copy link and Copy channel ID, each as permissions allow. A move past the edge of a category joins the next one, and steps over channels this account can't see, keeping them where they are.
- **Create channel** asks for Text or Voice, the name and the category. Text channel names are written as Discord writes them, lower case with dashes, and the dialog shows the result.
- **Channel settings** at `/app/channel-settings/<channel>/<section>`: Overview with the name and description, and Delete channel.
- **Order writes merge** (`packages/domain/src/latest.ts`): while one is on its way, newer orders replace each other and the newest goes next. A categories echo is ignored until 1.5 s after the last write, so the sidebar never jumps back.
- **A deleted or hidden channel that was open** now leads to the server's first channel, not the Friends screen. A server that is gone still leads to Friends.

**Unit tests**:
- `packages/domain/src/layout.test.ts`, 5 tests: stepping over hidden channels, crossing categories, moving to a category, category moves and deletion, and inputs left unchanged.
- `packages/domain/src/latest.test.ts`, 2 tests: five changes become two writes ending on the last, with the echo hold, and a failed write rejects only its own callers.

**Found by the live check, and fixed**:
1. **Stoat's window ends later than it says.** Writes waiting for the bucket went out exactly when `x-ratelimit-reset-after` said it reset, and got two 429s each time. A trace showed the window really ends about 0.8 s later. The REST layer now waits a second longer, and a trace of twelve paced writes had no 429.
2. **Every category dialog failed.** It closed itself before writing, and the server it wrote to was derived from the open dialog, so it was gone. It now reads both first.
3. **Deleting the open channel led to the Friends screen**, now the server's first channel, as above.

**Live check**: `node tools/live/src/channels.ts`, with `dev-admin` building and `tuuli` watching on a fresh check server:

| Check | Result |
|---|---|
| Four categories and ten channels in the seeded order, General moved and renamed to `yleinen`, `#tekniikka` described | 50 s in all, mostly waiting for the server bucket. `tuuli`'s sidebar matches. |
| Five quick Move up clicks on `#botti`, then five Move down | It travels into Yleinen and back. No jump back on either side, settled 7.7 s after the last click, both sidebars in the seeded order. |
| A move by keyboard alone: focus, Shift+F10, arrows, Enter | `tuuli` sees it |
| A channel created and deleted | No gap or stale entry on either side. The admin, who had it open, is on the server's first channel. |
| Console errors or failed requests | None |

`removal.ts` passed again after the redirect change.

## Task 4: roles, 2026-10-14

**What is deployed**:
- **Roles** in server settings, for `ManageRole` or `ManagePermissions`: roles strongest first with their colour and member count, then Everyone. Roles at or above your own show "Locked", with a note saying why. Each other role has a menu with Move up, Move down and Delete. "Create role" asks for a name and opens the new role.
- **The role editor**:
  - Display: the name, a colour from twelve presets (two of them gradients) or typed as any CSS colour or gradient the browser understands, and "Show members separately".
  - Permissions: grouped as Stoat's client groups them, each with a line of help, as Deny, Inherit or Allow. Everyone's are on and off.
  - Permissions you don't hold are disabled and say so. A locked role is read-only.
  - Saving writes only what changed. Giving `InviteOthers` to Everyone, or to a role without Manage server, shows the warning from decision 5.
- **Role order writes** merge as task 3's category writes do, and a `ServerRoleRanksUpdate` echo is ignored while one is pending.
- **Roles… on members**: the people menu, opened on a member or a message author in a server, offers Roles… for members ranked below you, with a checklist of the roles you may give. Saving keeps any role you can't touch.

**Unit tests**: none new. The rank rules, the merge and the merged writer were tested in tasks 1 and 3.

**Changed from the plan**: the plan's check had a moderator keep a higher role on a member while changing her other roles. That can't happen. A member who holds a role above yours outranks you, so Stoat refuses any change to her roles, and the menu no longer offers Roles… for her. Keeping roles you can't touch now only guards against rank ties, which Stoat can produce after deletions. The check covers both halves instead.

**Found by the live check, and fixed**:
- **The permission switches' checkbox sat under its own track.** Clicking the label worked, but a click on the switch itself could miss. The checkbox is now on top.
- **The check read the API too early.** The UI shows each new order at once, while the writes wait for the bucket behind the role creations, so the API caught up a few seconds later. The client was right. The check now polls until the API agrees.

**Live check**: `node tools/live/src/roles.ts`, with `dev-admin` and `onni` in browsers and `tuuli` online over a socket, on a fresh check server:

| Check | Result |
|---|---|
| The five seeded roles other than Admin, created with colours, the gradient, hoisting and Moderaattori's permissions | 24.6 s, mostly the bucket. Names, colours, hoisting, order and permissions all match the seed. |
| Four quick Move clicks on Vakio, up twice and down twice | Back in the seeded order, in the UI and then the API |
| `tuuli` given Pelaajat, from the request leaving until `onni`'s member list shows her under Pelaajat | 25 ms |
| `onni`, given Testimod (role management but not `MentionEveryone`), ranked below Botit | Admin, Moderaattori, Botit and Testimod locked. `MentionEveryone` disabled and Manage roles enabled in Vakio's editor. |
| `onni` changes `tuuli`'s roles from Pelaajat to Vakio | Saved as Vakio |
| `tuuli` given Moderaattori | `onni`'s menu on her no longer offers Roles… |
| Everyone given Create invites | The warning shows. Reset leaves it unsaved. |
| Console errors or failed requests | Two 429s on the member list, each when the check reloaded the page right after a burst of saves. A fresh page doesn't know that this session's bucket is already spent, so it gets one 429 and retries it. |

## Task 5: channel permission overrides, 2026-10-14

**What is deployed**:
- **Permissions in channel settings**, for `ManagePermissions` in that channel:
  - Everyone, then each role with an override, then "Add a role" for roles below yours.
  - Each permission that means something in a channel is Deny, Inherit or Allow. Server-only ones, such as kicking or managing roles, are left out.
  - Everyone's entry says in one line what members end up with: hidden, read but not send, or read and send.
  - Roles at or above yours are read-only. Permissions you don't hold are disabled.
  - The invite warning shows here too.
  - "Remove override" writes it empty, since Stoat has no delete, and an empty override counts as none.
- **Private channels**: Create channel has "Private channel", for those with `ManagePermissions`, with the roles to let in. The channel is created, hidden from Everyone, then shown to those roles. The dialog says its name briefly reaches every member's client (decision 8).
- **Edit channel** opens Permissions for someone who can manage permissions but not the channel itself.

**Found by the live check, and fixed**:
1. **A Stoat socket bug: a private channel never appeared for a member given a role that shows it.**
   - **What a probe showed**: a member's socket that saw the channel created and then hidden loses track of it. Stoat even forwards it the next override change. A role that shows it then sends no `ChannelCreate`, though a second grant does. A `GET` confirms she can see it.
   - **The fix**: after a change to your own roles, a held role's permissions or Everyone's, the session fetches, half a second later, each channel of that server it doesn't have. A channel still hidden answers 403 and is skipped. client.md section 7 describes it.
2. **Removing all of a member's roles broke the member list.** Stoat sends `clear: ["Roles"]`, and the store deleted the list instead of emptying it. Every client showing that member then threw on each render. This dates from M1, but kicks and role changes make it common now. The mapper turns the clear into an empty list. Unit test in `admin.test.ts`.

**Live check**: `node tools/live/src/overrides.ts`, with `dev-admin`, `tuuli` and `onni` in browsers on a fresh check server. Timings run from the request leaving:

| Check | Result |
|---|---|
| Everyone denied Send messages in `#säännöt` | The summary reads "Members can read but not send." `tuuli`'s composer says she can't send after 27 ms. |
| Moderaattori allowed to send there | Saved, as the API shows |
| A private channel for Admin only, through Create channel, moved between General and `#säännöt` | `tuuli` never sees it |
| `tuuli` given Admin, until the channel is in her sidebar | 546 ms, the 500 ms wait included |
| The role taken away, until it is gone | 22 ms |
| `onni`, who manages channels but can't see it, moves `#säännöt` up past it | `onni` sees "säännöt, General". The server has "säännöt, General, salainen": the private channel kept its category and its place after General. |
| Moderaattori's override removed, then the page reloaded | Not listed |
| Console errors or failed requests | One 403 for `tuuli`: the re-check fetching the private channel after her role was taken away, as designed |
