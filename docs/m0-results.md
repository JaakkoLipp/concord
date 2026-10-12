# M0 results

Measurements and verifications for M0, recorded as they happen. Decision gate part A goes at the end once M0 is complete.

## 1. Stack on the VPS, 2026-10-11 and 12

**Versions**: Stoat images `v0.15.7`, self-hosted commit `9af5e90`, MongoDB `7.0.43`, Mailpit `v1.31.5`. `GET /api/` reports `revolt: 0.15.7`.

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

### State left on the VPS

- The admin password is in `~/concord-private/admin-password`, mode 600. Jaakko logs in, changes it, then deletes the file.
- The "Concord bootstrap (VPS)" session token is in `~/concord-private/bootstrap-session`. Revoke that session when seeding no longer needs it.
- `test-b` is a member of the server, and its credentials are in `~/concord-private/`. The invite created in General is still valid.
- `Revolt.toml.before-admin` is the pre-bootstrap backup in `~/stoat`.
