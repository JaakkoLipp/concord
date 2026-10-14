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
