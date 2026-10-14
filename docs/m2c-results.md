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
