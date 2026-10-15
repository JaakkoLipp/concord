# Concord: development environment

Status: signed off 2026-10-12, layer 3. Covers M0. Sections 1, 9 and the appendix describe the local dev stack from M4. Read [architecture.md](architecture.md) and [milestones.md](milestones.md) first. Results go in [m0-results.md](m0-results.md).

## 1. Shape

**Since M4, the dev stack runs on Jaakko's machine** (m4-plan.md task 1). Production on the VPS holds real people, so agents never seed or test there.

```
Jaakko's machine (WSL, Docker Desktop)
  pnpm dev  (Vite, http://localhost:5173)  ──►  http://localhost: Caddy ──► api, events, autumn, january, gifbox, livekit
  tools/seed, tools/live  ─────────────────►   (same routes as production, plain HTTP)
  Mailpit on http://127.0.0.1:8025, Stoat's own client on http://ref.localhost
```

- **Where**: `~/stoat` in WSL, laid out like production's `~/stoat`, so `concord/dc` and every script in `deploy/` work the same. Commands that the tools sent over SSH run on this machine instead.
- **The tools' target** comes from `tools/target.ts`: the local stack unless `CONCORD_HOST` names another. Production is reached only through `pnpm deploy:web`, `pnpm deploy:stack:prod` and `pnpm live:prod <check>`.
- **Plain HTTP** is enough, because browsers treat `localhost` and `*.localhost` as secure contexts, so microphones, cameras and screen capture work.
- **Ports** are bound to `127.0.0.1` only. Docker Desktop publishes on the Windows host, so a wider binding would be reachable from the LAN.
- **What it can't show**: real networks, TURN, phones and other people. Production and the voice evening cover those.

From M0 to M3 the dev stack ran on the VPS that became production. Sections 2 and 8 describe that layout, which production still uses.

## 2. The VPS stack

- **Layout**: `~/stoat` is Stoat's self-hosted repo at commit `9af5e90`. Every compose command goes through `~/stoat/concord/dc`.
  - **Our files**: `pnpm deploy:stack` copies those from `deploy/` to `~/stoat/concord/` and applies them.
  - **Server-only files**, next to them and never committed:
    - `host.env`: the main IPv4 and IPv6, the floating IPv4, and `TURN=on|off`.
    - `livekit.env`: LiveKit's key and secret.
  - **What `dc` adds**: `host.env` always. `dev.compose.yml`, with Mailpit, while `.allow-wipe` exists. `turn.compose.yml` when TURN is on. No address or domain is committed.
- **Versions**: Stoat `v0.15.5` for every Stoat image, the self-hosted repo's support line, and MongoDB `7.0.43`. MongoDB 8 refuses to start on the VPS's kernel 7.0. The reasons, and the upgrade path to 8.0, are in `deploy/concord.compose.yml` and m0-results.md.
- **Configuration changes** to `Revolt.toml` are recorded in `deploy/revolt-changes.md`. After editing it, `dc restart api` picks the change up.
- **Every image is pinned.** Stoat's compose floats Caddy, RabbitMQ, Valkey, Silo and mc. Our compose file pins them to the versions first deployed, Silo and mc by digest.
- **Memory**: idle, the stack uses 1.6 GB of the 3.7 GB, and MongoDB's cache is capped at 0.5 GB.
  - **Main risk**: Autumn and January have hard-coded in-memory caches of up to 2 GiB and 512 MiB that ignore container limits.
  - **M0 adds a `mem_limit` to every service** in `concord.compose.yml`. Starting values: database 768 MB, autumn 640 MB, january and rabbit 384 MB, minio 256 MB, livekit 256 MB, redis 128 MB, the rest 128 to 192 MB.
  - **Valkey and RabbitMQ settings**: Valkey runs without persistence and with `maxmemory 64mb`, since it holds only presence, rate limits and voice state. RabbitMQ gets an absolute memory watermark of 192 MiB.
  - **Overcommit is deliberate**: the limits add up to more than the RAM. They stop one runaway service, they are not reservations.
  - **Restarts**: Stoat's compose file restarts every service on failure, so a service that hits its limit is killed and restarted rather than taking the box down.
  - **Tuning**: the limits are tuned with `dc stats` during M0. An OOM kill shows in `docker inspect -f '{{.State.OOMKilled}}'`. The MongoDB soak test is repeated at the 768 MB limit before that limit is adopted.
- **Size**: the VPS has 2 vCPU and 3.7 GB, below the 4 vCPU and 8 GB that architecture section 8 estimates. It fits for development. The M3 voice session decides whether it needs more. It does if available memory stays under 500 MB through an evening, swap-in is sustained, or LiveKit uses more than one core. Then the VPS is resized. Moving the stack to Jaakko's home server was considered and rejected.

## 3. Client dev server

Vite proxies every Stoat prefix to the VPS without rewriting paths, because Caddy already strips them:

```ts
// apps/web/vite.config.ts
const backend = process.env.CONCORD_BACKEND ?? 'https://concord.jaalip.com';
const rule = (ws = false) => ({ target: backend, changeOrigin: true, ws });
const key = (p: string) => `^/${p}(?:[/?]|$)`; // anchored, so Vite's own HMR socket at / is never proxied
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      [key('api')]: rule(), [key('autumn')]: rule(), [key('january')]: rule(), [key('gifbox')]: rule(),
      [key('ws')]: rule(true), [key('livekit')]: rule(true),
    },
  },
});
```

- **Relative paths only.** The client uses the constants `/api`, `/ws`, `/autumn`, `/january`, `/gifbox` and `/livekit` on its own origin, in development and production alike.
  - It ignores the absolute URLs that `GET /api/` returns: `ws`, `app`, `features.autumn.url`, `features.january.url` and the LiveKit `public_url`.
  - It also ignores the LiveKit `url` in the `join_call` response.
  - In development, it warns if one of those URLs has a different path from the constant.
  - Why: Stoat allows any origin, so a client that followed the absolute URLs would quietly work cross-origin in development and hide same-origin and CSP bugs.
- **Still read from `GET /api/`**: the version and build, the limits including `restrict_server_creation`, the feature flags, the LiveKit node names, and the VAPID key.
- **Reserved paths**: `/api`, `/ws`, `/autumn`, `/january`, `/gifbox`, `/livekit`, `/ingress` and `/spike` belong to Caddy in production. SvelteKit must never use them as routes. `/invite/<code>` is Caddy's redirect to `/app/invite/<code>`, our invite page. Every other path on the main domain redirects to `/app`; Stoat's own client is at `ref.<domain>`.
- **WebSocket**: connect to `/ws?version=1&format=json`, never `/ws/`, because Caddy's route is an exact path. Authenticate with a first frame, `{"type":"Authenticate","token":…}`, rather than the `token` query parameter. That keeps tokens out of URLs, logs and recorded fixtures.
- **`Ready` fields** are repeated query keys, `ready=users&ready=servers&…`, not a comma list. Requesting synced settings this way never works, because of a Stoat bug, which is why the client fetches them separately.
- **No cookies.** The session token is the `x-session-token` header. Files from Autumn need no authentication, so a plain `<img src>` works.

## 4. Accounts and email

Public sign-up is blocked by Caddy, so accounts are created on the VPS over the internal network. Email goes to Mailpit, which only the server itself can reach.

The same script is how real people get accounts after M3: Jaakko creates each one by hand until they decide to open registration, as architecture section 4.2 describes.

1. Open the Mailpit tunnel: `ssh -N -L 8025:127.0.0.1:8025 jaakko@concord.jaalip.com`, then browse to `http://127.0.0.1:8025`.
2. Create the account: `~/stoat/concord/create-account.sh <email> <password>` on the VPS. Success is HTTP 204.
3. Verify by opening the `/login/verify/<token>` link from the mail.
   - Scripts call `POST /api/auth/account/verify/{token}` instead. It returns a ticket, and `POST /api/auth/session/login` with `mfa_ticket` set to that ticket signs in without a password.
4. Onboard with `POST /api/onboard/complete {username}`. The username is 2 to 32 characters: letters, digits, `_`, `.` and `-`.

Pitfalls, from Stoat's source:

- **Calling create twice for the same email** resends verification or sends a password reset.
- **Email normalisation**: Stoat removes dots and anything after `+` from the local part, so `a.b@` and `a+x@` count as `ab@` and `a@`.
- **Blocked domains**: `example.com` is on Stoat's blocklist.

## 5. Seed script

`tools/seed/` is a Node script in TypeScript with no dependencies, using `fetch`, `node:crypto` and `node:zlib`. Node runs the TypeScript directly. It runs on Jaakko's machine and uses one multiplexed SSH connection for four things:

- running `create-account.sh`, since public sign-up is blocked,
- reading verification mail from Mailpit's API with `curl` on the VPS, so no tunnel is needed,
- running `set-server-creators.sh`, which edits `restrict_server_creation` and restarts `api`,
- running `reset-data.sh`. Without `--reset` the seed refuses to run against a database that already has accounts.

`CONCORD_SSH` overrides the SSH destination. The IDs from the last run are saved in the gitignored `tools/seed/.state.json`, which `seed hold`, `seed check` and the recorder read.

**Bootstrap**, run first after every reset:

1. Create the `dev-admin` persona.
2. Write its ID into `restrict_server_creation` and restart `api`.
3. Create the server.
4. Clear `InviteOthers` from the default permissions, using BigInt.
5. Create the Admin role.
6. Make one invite that every persona joins through.

**Dataset**:

- About 25 personas:
  - the admin, 2 moderators, a bot account, one with TOTP enabled, and a plain `dev` login,
  - a mix of Finnish and English names.
- One server with 4 categories, about 8 text and 2 voice channels, and 6 coloured roles. One role has a gradient, and some roles are hoisted.
- About 30 custom emoji.
- About 700 messages. They cover:
  - replies, mentions, reactions, edits, pins and one deleted message,
  - image attachments in odd sizes, such as 40×40 and 3000×500,
  - link embeds to stable public URLs, which arrive later as `MessageAppend`,
  - a 2000-character message,
  - two messages that between them use every markdown construct in architecture section 4.4.
- Friendships, DMs and one group DM.
- Some acknowledgements, so some channels show unread and mention markers.

**Constraints that shape it**:

- **Rate limits**, all per 10 seconds:

  | Area | Limit | Scope |
  |---|---|---|
  | Sending messages | 10 | per session and channel |
  | Server edits | 5 | per server |
  | Profile edits | 2 | per user |
  | Auth | 15 | per IP before login |

  - Each persona's profile is set in one `PATCH /users/@me`.
  - Server setup is paced from the `X-RateLimit-*` headers.
  - Messages are sent in parallel across personas and channels.
- **The new-user tier** applies for 72 hours and allows only 5 pending outgoing friend requests. The script therefore sends and accepts requests in pairs. DMs need a friendship first.
- **Timestamps can't be backdated.** Message IDs are generated by the server, so all seeded history is "today". Day dividers and older-looking history come from the recorder's time rebasing, described in section 6.
- **Determinism**: a seeded random generator fixes content and order. IDs, tokens and times differ on every run. A full reseed is estimated at 10 to 15 minutes.
- **Images**: the script generates its images as PNGs: identicons for avatars, gradients for banners, shapes for emoji, and varied attachments. ffmpeg makes one video and one audio file. Avatars, banners and emoji must be raster images, because SVG is rejected.
- **Credentials**: each persona's password is `HMAC(SEED_SECRET, handle)`, with `SEED_SECRET` in the gitignored file `tools/seed/.seed-secret`. Persona emails are `<handle>@seed.concord.test`. Whether Stoat accepts that domain is unverified, so the script tries one account first. The fallback is `<handle>@concord.jaalip.com`, which works. Fixed passwords would publish working logins for a public server, so they are never used.
- **Presence**: a persona is online only while it has an open socket. `seed hold` keeps about 15 sockets open for screenshots and demos.

**Reset**: `deploy/reset-data.sh` on the VPS.

- **Guard**: it runs only if `~/stoat/concord/.allow-wipe` exists.
- **Steps**:
  1. Put the placeholder ID back into `restrict_server_creation`.
  2. Run `dc down -v`.
  3. Delete `data/db`, `data/rabbit` and `data/minio`.
  4. Start the stack again.
- **Never touched**: it never deletes `secrets.env`, which holds the file encryption key, `Revolt.toml`, `livekit.yml` or Caddy's data, to avoid Let's Encrypt rate limits.

**Wiping the database deletes Jaakko's own account** and the community server created on 2026-10-12. The seed cannot recreate that account, because its email must never appear in this repo. The recommendation is to treat both as throwaway: `dev-admin` is the admin during development, and Jaakko's real account is created by hand at M3 cleanup.

## 6. Fixture recorder

The tap is a recording wrapper around the transport in `packages/stoat`. The replay transport implements the same interface, so tests replay exactly what the code saw. A recording proxy such as mitmproxy would need installing, and Caddy logs carry no bodies.

- **Recording**: `pnpm --filter @concord/stoat record` drives scripted scenarios against the seeded stack with two sockets:
  - an actor that performs the actions,
  - an observer that records the events the actions cause.
- **Raw captures** go to a gitignored `.raw/`. An offline scrubber writes the committed files:

  ```
  packages/stoat/fixtures/0.15.5/manifest.json      # Stoat version and build, scrub rules version, seed hash
    <scenario>/NNN.rest.<METHOD>-<route>.json        # request and response, with rate-limit headers
    <scenario>/ws.jsonl                              # observer frames in order, with step markers
  ```

- **Scrubbing** removes:
  - session tokens, MFA tickets, TOTP secrets and recovery codes,
  - LiveKit tokens,
  - emails, IP addresses and invite codes.

  A value seen in a secret field is replaced everywhere it appears. A final pattern pass for emails, IPv4 addresses and JWTs fails the recording if anything remains.
- **Normalisation**: every ULID maps to a stable fake ULID that keeps order and relative time. An optional `--spread-days` flag spreads message times over several days. Contract tests compare structure and types, not values.
- **Scenarios**:
  - Login, the MFA flow with TOTP and a recovery code, and onboarding.
  - `GET /`, plus the 401, 403, 404, 409 and 429 error shapes.
  - `Ready`, both with default fields and with our field list.
  - Unreads and synced settings.
  - The member list, profile, mutuals and invite lookup.
  - History, with these traps from Stoat's source:
    - the default page size is 50,
    - `after=` alone returns the newest messages after the anchor unless `sort=Oldest` is set,
    - `nearby=` returns newer messages ascending, then older messages descending,
    - `include_users=true` turns the array into `{messages, users, members}`.
  - Live events:
    - messages, with `nonce`, edits, pins, appends and deletes,
    - reactions and typing,
    - presence,
    - channel, server, role, member and emoji changes,
    - relationships and acknowledgements.
  - Voice events need a real participant, so they are recorded once the screen-share test page can join. Until then, any hand-written voice fixture is marked `"synthetic": true`.
- **Upgrades**: record into a new version directory. A missing or retyped field fails the tests. A new field only warns. Keep the old version's fixtures so the adapter is tested against both.

## 7. Screen-share test page

A throwaway page in `spikes/m0-screenshare/`, built by an agent from this section.

**Hosting**: Caddy serves it as static files at `https://concord.jaalip.com/spike/`, so every device gets a secure context. This needs a `handle_path /spike/*` block in `deploy/Caddyfile` and a read-only mount of the page's directory, both added in M0. The page stays there through M3.

**What it does**:

1. Logs in with email, password and TOTP.
2. Joins a voice channel. It reads the LiveKit node from `GET /api/` and calls `join_call` for that node, asking Stoat to disconnect any earlier voice session. It then connects to `origin + /livekit` at once, because the token lasts 10 seconds.
3. Uses an exact, pinned `livekit-client` version, which goes into the results.
4. Publishes a screen share from its own `getDisplayMedia` call. Declared dimensions are clamped to the server's area limit of 2560×1440. The settings are chosen in the page:

   | Setting | Options |
   |---|---|
   | Capture | 1080p60, 1080p30, 720p60, 1440p60 |
   | Codec | H.264, VP8, VP9, AV1 |
   | Bitrate | 4, 6, 8, 10 Mbps |
   | Layers | H.264 and VP8: off, or simulcast at 720p30 and 360p15. VP9 and AV1: layered SVC. |
   | Content hint | motion or detail |
   | Degradation | maintain framerate, balanced, maintain resolution |
   | Force TURN relay | on or off, used in M3 |

   The backup codec is always off. Dynacast and adaptive streaming are always on.
5. Shows other participants' shares.
6. Shows live statistics every second:
   - **Sender**: resolution, framerate, bitrate, encoder implementation, what limits quality, and connection type.
   - **Viewer**: resolution, framerate, bitrate, dropped frames, decoder and active layer.

**M0 runs**: encoder and sharer CPU, against the VPS's LiveKit. Each run lasts two minutes while a game or fast video plays.

| Sharer | Browser | Codec | Notes |
|---|---|---|---|
| Windows | Chrome | H.264 | Expect a hardware encoder. |
| Windows | Chrome | VP8, VP9, then AV1 | Compare CPU and quality. VP9 and AV1 use layered SVC. |
| Linux | Chrome | H.264, VP8 | Default flags. Software encoding expected. |
| Linux | Chrome | H.264 | With `--enable-features=VaapiVideoEncoder --ignore-gpu-blocklist`. Check whether the encoder becomes hardware. |
| Windows or Linux | Firefox | H.264 | Expect a single layer, no simulcast. |
| Windows, then Linux | Minimal Electron shell | Best codec | A bare Electron app that loads the page and picks the first screen. Record the codecs it offers and the encoder it uses. This is the run that counts, because the product ships in Electron. |
| Any | Linux Firefox as viewer | H.264 | Linux Firefox decodes H.264 only through the OpenH264 plugin. If the viewer gets no picture, the backup codec stays on. |

Linux runs need a real Linux desktop, not WSL. Runs that depend on networks, forced TURN relay and layer switching on a throttled viewer, belong to M3 in [vps-runbook.md](vps-runbook.md).

Results go in m0-results.md, per run: resolution and framerate achieved, bitrate, encoder, sharer CPU and viewer experience.

## 8. Developing on the future production machine

- **Data**: `reset-data.sh` is destructive and refuses to run without `.allow-wipe`. Nobody runs it by hand. It is called by `pnpm seed --reset`.
- **Phones**: the dev server on Jaakko's machine isn't reachable from a phone over HTTPS. Until M3, phone checks use a production build of the client deployed at `/app` on the VPS. That requires an `/app` route and our web service in the compose file, called `concord-web` because Stoat's client is already `web`. This is the same setup M3 needs.
- **People**: Caddy blocks sign-up, and seeded personas have secret passwords, so only Jaakko and the agents can log in.
- **Email**: all mail lands in Mailpit, so no real person may be given an account before M3.
- **Fixtures**: recorded only from seeded data.
- **Exposure**: Stoat's Swagger page, `openapi.json` and `/metrics` were reachable through Caddy's `/api` route, as m0-results.md records. Caddy blocks all three. `openapi.json` is fetched over the internal network and kept in `packages/stoat/api/0.15.5/`.

**M3 cleanup**, done on 2026-10-14 as an in-place swap rather than a wipe (m3-results.md task 5). The dev data is kept for a week in `~/stoat/data-dev-2026-10-14/`. The steps as first planned:

1. Run `reset-data.sh` one last time, without seeding.
2. Delete `.allow-wipe`.
3. Switch SMTP to the real relay and remove Mailpit.
4. Create Jaakko's account by hand and bootstrap it as in vps-runbook.md.

## 9. Daily commands

On the local stack, from the repo root in WSL:

| Task | Command |
|---|---|
| Start the stack | `~/stoat/concord/dc up -d` |
| Check the version | `curl -s http://localhost/api/ \| jq -r .revolt` |
| Stop, keeping data | `~/stoat/concord/dc stop` |
| Mailpit | `http://127.0.0.1:8025` |
| Apply `deploy/` | `pnpm deploy:stack` |
| Deploy the client and the test page | `pnpm deploy:web:dev`, `pnpm deploy:spike:dev` |
| One test account | `pnpm seed account <handle>` |
| A persona's login | `pnpm seed password <handle>` |
| M0 verifications | `pnpm seed check` |
| Reseed from scratch | `pnpm seed --reset` |
| Client | `pnpm dev` |
| Record fixtures, then test | `pnpm --filter @concord/stoat record && pnpm test` |
| Memory | `~/stoat/concord/dc stats --no-stream` |
| Concord's own layer | `curl -s http://localhost/app/api/v1/health`, then `node tools/live/src/layer.ts` |
| The layer's store | `~/stoat/concord/data/layer.db`. `pnpm dev` keeps its own in `apps/web/.data/` and reaches Stoat through `http://localhost/api` |
| A copy of the store, as the backup takes it | `~/stoat/concord/layer-copy.sh` |

`ADMIN_USER_IDS` in the local `host.env` holds the `dev-admin` persona's ID, so the layer's admin gate can be tried locally. After a `pnpm seed --reset`, put the new ID there and run `~/stoat/concord/dc up -d concord-web`.

## Appendix: setting up the local stack

Done once on 2026-10-14. Nothing is installed in WSL itself: Docker Desktop's WSL integration, which Jaakko turned on, is the only requirement.

1. **Stoat's files**: clone `stoatchat/self-hosted` at `9af5e90` into a scratch folder and copy `compose.yml` and `Caddyfile` to `~/stoat`. Nothing in the clone is run, including `generate_config.sh`.
2. **Config**, written by hand as `generate_config.sh` would for `localhost`, with `http://` and `ws://`:
   - `.env` with `STOAT_DOMAIN=localhost`, `.env.web` with `HOSTNAME=http://localhost`, and `stoat.json`,
   - `secrets.env` with fresh VAPID, file and LiveKit secrets, the LiveKit key id being `2c2e5918ca20` as in `deploy/livekit.yml`,
   - `Revolt.toml` with the hosts, both video tiers at 2560 × 1440, Mailpit as SMTP, and the `restrict_server_creation` placeholder. `january` is `http://january:14705`: the API fetches link previews from it inside Docker, where `localhost` is the API's own container. Our client uses the relative `/january` path anyway.
3. **Our files**: `deploy/` copied to `~/stoat/concord/`, with:
   - `host.env` holding `MAIN_IPV4=127.0.0.1`, `MAIN_IPV6=::1`, `TURN=off` and `LOCAL=on`,
   - `livekit.env` holding the same key pair,
   - an empty `.allow-wipe`.
4. **Start**: `~/stoat/concord/dc up -d`, then `pnpm deploy:web:dev`, `pnpm deploy:spike:dev` and `pnpm seed --reset`.

**Docker Desktop quirks**, both handled in `deploy/`:
- It never passes on the end of a container's stdin, so `create-account.sh` mounts its request body as a file.
- A single-file bind mount follows the file it first saw. A file replaced by `sed -i` leaves containers unable to restart, so scripts edit `Revolt.toml` in place.
