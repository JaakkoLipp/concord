# M0 results

Measurements and verifications for M0, recorded as they happen. Decision gate part A goes at the end once M0 is complete.

## 1. Stack on the VPS, 2026-10-11 and 12

**Versions**: Stoat images `v0.15.7` at the time of this section. The stack moved to `v0.15.5` later the same day, as section 2 records. Self-hosted commit `9af5e90`, MongoDB `7.0.43`, Mailpit `v1.31.5`. `GET /api/` reports `revolt: 0.15.7`.

### MongoDB on kernel 7.0

The VPS runs Ubuntu 26.04 with kernel `7.0.0-38-generic`. Stoat's `mongo:8` resolved to 8.3.11 and refused to start: "Linux kernel versions 6.19 and newer has a known incompatibility" (SERVER-121912).

- **Cause**: kernel 6.19 changed rseq behaviour, which breaks TCMalloc's per-CPU caches. MongoDB 8.0.0 to 8.0.20 crash after about 60 seconds, with possible corruption.
- **The kernel is already fixed.** Ubuntu's `7.0.0-38.38` changelog imports upstream Linux 7.0.13 and 7.0.14, which contain the rseq fixes.
- **MongoDB still refuses it.** 8.0.21 and later and 8.3.x block startup on kernels from 6.19. The releases that exempt fixed kernels (8.0.30+, 8.3.9+) compare the version string, and Ubuntu's `7.0.0-N` never reads as 7.0.14. The real fix (SERVER-131779: 8.0.35, 8.3.14, 9.0.4) is not on Docker Hub yet.
- **Tags tried on this host**: 7.0.43 and 8.2.12 start, while 8.0.32, 8.3.1 and 8.3.11 refuse. 8.2 is end of life.
- **Fix**: pin `mongo:7.0.43`. MongoDB's compatibility matrix in SERVER-125742 lists 7.0 as fully supported on every kernel, and 7.0 is supported until August 2027. There is no environment workaround and no kernel change. The unofficial `GLIBC_TUNABLES=glibc.pthread.rseq=1` workaround was rejected.
- **Soak test**: 4 minutes with 4 parallel writers at 200% CPU, about 553,000 documents, a 1.5 GB container limit and a 0.5 GB WiredTiger cache. No errors, no fatal log lines, no restarts, no OOM kill. mongod resident memory was 529 MB.
- **Later**: move to 8.0 once `mongo:8.0.35` is published. Set featureCompatibilityVersion 7.0, bump the tag, then set 8.0. Never downgrade after 8.0 has run.

### Stack checks

| Check | Result |
|---|---|
| All 17 services up, MongoDB healthy | Pass. `createbuckets` exits 0 by design. |
| Published ports | Only 22, 80 and 443 over TCP, 7881 over TCP, and 50000 to 50100 over UDP. MongoDB, Valkey, RabbitMQ and Silo are unpublished. Mailpit is on `127.0.0.1:8025` only. |
| HTTP/3 | Not published: Stoat's compose maps 443 over TCP only. Our M3 port rebinding adds 443 over UDP. |
| Memory, idle | 1.6 GB used, 2.2 GB available. mongod 147 MB, Silo 133 MB, RabbitMQ 117 MB, Caddy 51 MB, Stoat web 47 MB, LiveKit 44 MB, API 39 MB. |

### Registration gate

Public `POST /api/auth/account/create` with an empty JSON body. A 403 means our Caddy rule caught it. A 422 means it reached Stoat's create handler, which would be a bypass. The same request sent internally to `api:14702` returns 422, which confirms the test.

| Variant | Result |
|---|---|
| Plain, trailing slash, doubled slashes in three positions | 403 |
| Upper-case `/API/` and `/AUTH/.../CREATE` | 403 |
| Percent-encoded letters and an encoded slash | 403 |
| `./` and `../` segments, query string | 403 |
| HTTP/1.1 instead of HTTP/2 | 403 |
| `;x=1` and `%20` suffixes | 404 from Stoat: not routed to create |

No variant reached the create handler.

### Admin bootstrap

1. `restrict_server_creation = ["00000000000000000000000000"]` set before any account existed, and `api` restarted. A plain `restart` picked up the edited file.
2. Jaakko's account was created with `deploy/create-account.sh`, which returned 204. Stoat's mailer authenticated against Mailpit and the verification mail arrived. Verified through Mailpit's API, then logged in and onboarded as `jaakko#0485`, ID `01M4QN0N72VJ1PDFQN171DMN2J`.
3. The ID was put in `restrict_server_creation` and `api` restarted. `GET /api/` lists it under `features.limits.global`.
4. Community server "Concord" created, ID `01M4QN2BD8KAVXFYWRDPQZJ0G7`, with one channel, General.
5. Default permissions were `77014766592`, with `InviteOthers` (bit 25) set. They are now `76981212160`.
6. Admin role `01M4QN2BMAMZZ53V6X3VP6N5GV` allows `InviteOthers` only. The owner has every permission anyway.

### Live checks with a second account

`test-b#7406`, a non-admin member, joined through an invite created by the admin in General.

| Check | Result |
|---|---|
| Non-admin creates a server | 403 `CantCreateServers` |
| Non-admin creates an invite | 403 `MissingPermission: InviteOthers` |
| `GET /invites/{code}` fields | `type, code, server_id, server_name, channel_id, channel_name, user_name, member_count`. `user_name` is the creator's username, but there is no creator ID. |
| `Ready` size, one server, one channel, default fields | 804 bytes, 447 gzipped. This is a baseline only: re-measure after seeding. |
| Default `Ready` fields | `users, servers, channels, members, emojis, voice_states, policy_changes`. No unreads unless asked for. |

**Presence fan-out on 0.15.7**, with fresh sockets on both sides and each PATCH confirmed as 200:

| Change by A | B is a server member, not a friend | B is a friend |
|---|---|---|
| Connects or disconnects | B gets `online: true` or `false` live | Same |
| Status text and Busy | Nothing. `GET /users/{A}` returns the new status. | B gets the `UserUpdate` live |
| Status change after B's socket was opened before the friendship formed | not applicable | Nothing until B reconnects. B did receive both `UserRelationship` events. |

So status text, idle and busy reach friends only. The client must poll non-friends, and reconnect, or re-fetch the friend's user, when a friendship is accepted.

`user_edit` allows 2 PATCHes per 10 seconds per user. A third returns 429 with `retry_after` in milliseconds.

### Memory limits, 2026-10-12

Every service now has a `mem_limit`, as dev-environment section 2 describes. Valkey runs with no persistence and `maxmemory 64mb`, and RabbitMQ's watermark is an absolute 192 MiB. All services came back up under their limits.

| Service | Idle use / limit |
|---|---|
| database | 224 / 768 MiB |
| rabbit | 175 / 384 MiB |
| minio | 71 / 256 MiB |
| web | 64 / 128 MiB |
| api, events | 26 and 22 / 192 MiB |
| others | under 21 MiB each |

**MongoDB soak at the 768 MB limit**: a throwaway `mongo:7.0.43` container with `--memory 768m` and the 0.5 GB cache, written to for 4 minutes by 4 parallel `mongosh` writers in a separate container. 5.0 million documents, resident memory 538 MB, the cache held at its cap, no error or fatal log lines, no OOM kill. The limit is adopted.

A first attempt ran the writers inside the database container. It was OOM-killed because the four `mongosh` processes counted against the limit, so it says nothing about `mongod`.

### Public exposure, 2026-10-12

Unauthenticated requests through Caddy's `/api` route:

| Path | Result |
|---|---|
| `/api/metrics`, also with a trailing slash | 200, about 42 KB of Prometheus text: request counts and latencies per endpoint, method and status. Leaks activity, not data. |
| `/api/swagger/index.html`, `/api/openapi.json` | 200. `/api/swagger` redirects to the UI. |

As dev-environment section 8 requires, M0 blocks all three in Caddy. The client's types come from a copy of `openapi.json` fetched over the internal network and kept per Stoat version.

### State left on the VPS

- **Superseded by the first reseed on 2026-10-12.** The wipe deleted `jaakko#0485`, the first "Concord" server and `test-b`, so the IDs above no longer exist. The stale credentials in `~/concord-private/` were deleted.
- `~/stoat/concord/.allow-wipe` exists, so `reset-data.sh` may run. M3 cleanup deletes it.
- `Revolt.toml.before-admin` is the pre-bootstrap backup in `~/stoat`.

## 2. Seed, fixtures and checks, 2026-10-12

**Moved to Stoat 0.15.5 the same day**, as Jaakko decided. The stack was wiped and reseeded, the fixtures re-recorded and `seed check` re-run. Every result below is from 0.15.5, and all of them matched the earlier 0.15.7 run except the `Subscribe` finding, which is new. The OpenAPI schemas of the two versions are identical apart from the version number.

### Seed

`pnpm seed --reset` builds the dataset in dev-environment section 5 from an empty database: 24 personas plus the `kello` bot, one server with 4 categories, 8 text and 2 voice channels, 6 roles, 30 custom emoji, 669 messages, friendships, 5 DMs and a group. A run takes about 3.5 minutes after a wipe of about 1 minute. It ran clean twice in a row.

- **Email domain**: Stoat accepts `<handle>@seed.concord.test`, so the fallback domain isn't needed.
- **Wipe**: `dc up --wait` reports a failure because the one-shot `createbuckets` container exits by design. `reset-data.sh` polls the API instead.
- **Mention permission**: sending `<%role>` needs `MentionRoles`, which the default role lacks. Only moderators mention roles in the seed. The moderator role has `MentionRoles` and `MentionEveryone`.
- **Unreads in DMs and groups**: every unread DM or group message is listed under `mentions` in `GET /sync/unreads`. The client can show DM badges from that list directly.

### Message length limit

Stoat's 2000 limit counts **UTF-8 bytes, not characters**. 2000 ASCII characters and 1000 × `ä` (2000 bytes) are accepted. 2001 ASCII characters and 1001 × `ä` are refused with 422 `PayloadTooLarge`. The composer's counter must count bytes, which matters for Finnish text.

### MFA

- **No clock tolerance**: Stoat accepts only the code for its own current 30-second window, plus the code current when the ticket was created. A client near a window edge with a slightly skewed clock gets `InvalidToken`. Three wrong codes delete the ticket. Tickets last 5 minutes.
- **Tickets**: once TOTP is enabled, `PUT /auth/mfa/ticket` with a password is refused with `DisallowedMFAMethod`. It needs a TOTP or recovery code.
- **Recovery codes**: `PATCH /auth/mfa/recovery` returns them as a bare array. The scrubber treats that route's whole response as secret.

### Fixtures

`pnpm --filter @concord/stoat record` recorded 9 scenarios into `packages/stoat/fixtures/0.15.5/`, 101 files: login, MFA, onboarding, error shapes, `Ready`, synced settings and unreads, members and profiles, history, and live events. The events scenario covers the message lifecycle, reactions, pins, embeds, typing, presence, channels, server, roles, members, emoji, relationships and acks. The scrubber's pattern pass is clean, and `pnpm test` runs 7 contract tests against them. Voice fixtures wait for the screen-share test page.

### Invite response

With a server icon and banner set, `GET /invites/{code}` returns `server_icon`, `server_banner` and `user_avatar` as full file objects with size, dimensions and a thumbhash. They are absent while unset. The invite page can show the icon without a second request.

### `Ready` size on the seeded dataset

Measured for `dev`, who has 16 relationships and DMs, one server and 30 emoji:

| Fields | Raw | Gzipped |
|---|---|---|
| Default | 19.0 KB | 4.8 KB |
| The client's list, with `channel_unreads` | 21.6 KB | 5.5 KB |

`Ready` carries 17 users and 1 member, not the server's 25 members, as architecture section 4.3 expects. It stays small at our scale.

### Presence fan-out

Actor `lotta` changed status. Observers had fresh sockets: a friend, a server member who is not a friend, and a former friend who still shares a DM.

| Change | Friend | Server member, not friend | DM partner, not friend |
|---|---|---|---|
| Idle, Focus, Busy | live `UserUpdate` | nothing | live `UserUpdate` |
| Status text | live | nothing | live |
| Connect and disconnect | live | live | live |

- Stoat fans status changes out to users with a relationship or a shared DM, not to fellow server members. The member list must keep polling, as architecture section 4.3 says.
- **`Subscribe` works on 0.15.5.** After the non-friend member's socket sent `{"type":"Subscribe","server_id":…}`, it received the actor's status change live. In Stoat's 0.15.5 source, each socket keeps up to 5 subscribed servers, and each expires 15 minutes after its last `Subscribe`. Stoat's own client re-sends it while a server is open. Later versions ignore it, and Stoat's coming Elixir gateway would close the socket. The client could switch it on through the capability table for 0.15.5 only, as m1-plan.md proposes.
- **DMs need a friendship.** Opening a DM with a non-friend is refused with 403 `MissingPermission: SendMessage`. After unfriending, the DM still exists, but sending into it is refused with the same error.

### Voice join

- **Voice channels** on 0.15.5 are `TextChannel`s with a `voice` object, `{}` when no user limit is set, not a separate channel type.
- `GET /api/` lists one LiveKit node, `worldwide`, at `wss://concord.jaalip.com/livekit`.
- `join_call` returns a LiveKit token that is valid for 10 seconds. It allows publishing microphone, camera, screen share and screen-share audio, but not data (`canPublishData: false`). voice-ingress also disconnects anyone who publishes a data track, so the client must never use LiveKit data tracks.

### Backend version

Stoat's release notes say 0.15.6 "dual-writes events to both redis and amqp. It is not recommended for self-hosters", and 0.15.7 is an "internal release, not needed for self-hosted". The self-hosted repo pins 0.15.5. On this stack the extra AMQP events go to a topic exchange with no bound queue, so RabbitMQ drops them: no queue grows, and RabbitMQ stayed at 113 MiB during seeding. Between 0.15.5 and 0.15.7 there are only two functional commits: the dual write, and a new URL for the shield anti-spam service, which we don't configure. Nothing in our docs depends on them. 0.15.5 carries all six security fixes.

**Decision, 2026-10-12**: moved to 0.15.5, the version Stoat supports for self-hosters, before M1 builds on the fixtures.

## 3. Encoder runs: checklist for Jaakko

The test page is at `https://concord.jaalip.com/spike/`. The sharer logs in as `dev` and the viewer as `aino`, on a second device or browser. They must be different personas: joining as the same persona disconnects the other session. Print each login with `node tools/seed/src/main.ts password dev` and `… password aino` from the repo root in WSL. Both join **Pelaamo**, and the sharer shares a screen with a game or fast video playing for two minutes. Watch the sharer's CPU in Task Manager or `top` during the run. When done, press **Copy results** on the sharer and paste the text into a file under `docs/m0-runs/`, one file per run. The page records the settings, the encoder, the quality limit and the per-second statistics.

Defaults for every run unless the row says otherwise: 1080p60, 8 Mbps, layers on, content hint motion, maintain framerate, relay off.

| # | Sharer | How to start it | Codec | Note down |
|---|---|---|---|---|
| 1 | Windows, Chrome | Normal Chrome | H.264 | Sharer CPU %, the encoder name shown on the tile |
| 2 | Windows, Chrome | Normal Chrome | VP8 | Same |
| 3 | Windows, Chrome | Normal Chrome | VP9 | Same |
| 4 | Windows, Chrome | Normal Chrome | AV1 | Same |
| 5 | Linux, Chrome | Normal Chrome | H.264 | Same, plus X11 or Wayland |
| 6 | Linux, Chrome | Normal Chrome | VP8 | Same |
| 7 | Linux, Chrome | `google-chrome --enable-features=VaapiVideoEncoder --ignore-gpu-blocklist` | H.264 | Whether the encoder name changes to a hardware one |
| 8 | Windows or Linux, Firefox | Normal Firefox | H.264 | Same. Expect one layer. |
| 9 | Windows, Electron shell | Unzip `concord-m0-win32-x64.zip`, run `concord-m0.exe` | Best of runs 1 to 4 | Same, plus the codec list under the buttons |
| 10 | Linux, Electron shell | Unpack `concord-m0-linux-x64.tar.gz`, run `./concord-m0`. Then again with `CONCORD_VAAPI=1 ./concord-m0` | Same | Same |
| 11 | Viewer: Linux Firefox | Any sharer on H.264 | H.264 | Whether the picture appears at all |

The Electron builds are in `spikes/m0-electron/dist/` on the WSL machine. From Windows, open `\\wsl.localhost\Ubuntu\home\jaakko\concord\spikes\m0-electron\dist`.
