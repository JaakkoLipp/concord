# Concord: system architecture

Status: draft for review, layer 2. Read [product-brief.md](product-brief.md) first.

We target **Stoat 0.15.5**, the version Stoat's self-hosted repo supports, published September 2026. The later 0.15.6 and 0.15.7 only dual-write events for testing Stoat's new gateway and change an anti-spam URL, and Stoat advises self-hosters against them. Facts about Stoat below were verified against its source. Where behaviour differs between versions it is called out. Estimates are labelled as estimates.

## 1. Decisions

| Decision | Choice |
|---|---|
| Backend | Stoat self-hosted, unmodified, every image pinned to 0.15.5. Gaps go upstream as pull requests or get dropped. |
| Fallback backend | Our own Rust service, only if the decision gate in section 10 says so. |
| Media | LiveKit, using Stoat's patched image. Stock LiveKit lacks the mute webhooks Stoat relies on. |
| Client | Svelte 5 and SvelteKit. One web app serves both the website and the chat client from one origin. |
| Desktop | Electron shell loading the hosted client. Windows via an NSIS installer, Linux via Flatpak. |
| Native client | Rust, committed as the milestone after launch. |
| Hosting | `concord.jaalip.com` on one Hetzner Cloud VPS in Helsinki, Docker Compose, Caddy in front. The same VPS is the development backend until M3 turns it into production. |
| Registration | Invite-only, enforced by our website server and a Caddy rule, not by Stoat's own invite-only mode. Only server admins create invites. Only global admins create servers. |
| Notifications | Web push through Stoat's push daemon to the installed web app on phones, plus browser and desktop notifications. |
| License | AGPL-3.0. |

## 2. System overview

```
            concord.jaalip.com  (one origin, Caddy on 443)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  /, /invite, /register, /download ...   website pages (SSR)  ┐        │
  │  /app, /login, /account ...             chat client (SPA)    ├ apps/web│
  │  /api   → api (delta)      /ws → events (bonfire)                     │
  │  /autumn → files           /january → embed + image proxy             │
  │  /livekit → LiveKit signalling      /ingress → voice-ingress          │
  └──────────────────────────────────────────────────────────────────────┘
  LiveKit media: 50000-50100/udp, 7881/tcp.  TURN: 443/tcp (TLS) and 3478/udp on turn.concord.jaalip.com, a second IP
  Datastores: MongoDB, Valkey, RabbitMQ, Silo (S3)      Electron loads https://concord.jaalip.com/app
```

**One origin for everything.** Stoat's email links point at `hosts.app` followed by `/login/verify/<token>`, `/login/reset/<token>` and `/delete/<token>`. Serving the website and client on that same origin means those links, the client and the API share one domain. That removes cross-origin and cookie questions entirely.

**We own the Caddyfile.** Stoat's Caddyfile is a single bind-mounted file that sends every unmatched path to Stoat's own web client. Our `deploy/Caddyfile` replaces it through our compose file, so routing changes are reviewed in this repo. Routing changes as milestones land:

| Phase | Website routes | `/app` | Stoat's own web client |
|---|---|---|---|
| M3 to M5 | Stoat's client | Our client | Serves `/`, so its email links work |
| M6 onward | Our website | Our client | Moves to `ref.concord.jaalip.com`, for reference and debugging |

In development, the SvelteKit dev server on Jaakko's machine serves the client on `localhost` and proxies these same paths to the VPS. See [dev-environment.md](dev-environment.md).

## 3. Repository layout

```
concord/
  apps/
    web/        SvelteKit with adapter-node.
                (site) route group: server-rendered pages that never need a session.
                (app) route group: the chat client with ssr = false. Owns login and every page that needs a session.
    desktop/    Electron shell: main process, preload bridge, packaging.
  packages/
    stoat/      Generated OpenAPI types, REST client, WebSocket connection, event decoding.
                Holds nearly all Stoat-specific code.
    domain/     Our entity types, normalised store, permission calculator, optimistic updates.
    ui/         Design tokens and components shared by site and client.
  tools/seed/   Builds the development dataset through the API. See dev-environment.md.
  deploy/       Our compose file, Caddyfile, LiveKit config, account and reset scripts, backup and upgrade scripts.
  spikes/       Throwaway experiments, starting with the M0 screen-share test page.
  docs/
```

**Why one SvelteKit app instead of separate website and client apps.** The registration, verify and reset flows share code with the client, and they must live on the `hosts.app` origin anyway. SvelteKit sets rendering per route group, so website pages ship almost no JavaScript while the client is a pure single-page app. Route-level code splitting keeps each side's bundle separate. The cost is that website and client deploy together, which is fine with one operator.

## 4. Stoat integration

### 4.1 Authentication and accounts

- **Auth header**: `x-session-token`. Sessions never expire on their own. They end on logout, revoke, or a password reset that removes sessions. The account page therefore lists sessions with revoke buttons.
- **Session names**: login takes a `friendly_name`, such as "Concord Desktop, Windows" or "Concord Web, Firefox".
- **Login result** is one of three cases: `Success` with a token, `MFA` with a five-minute ticket and allowed methods, or `Disabled`. The second step reposts the ticket with a TOTP or recovery code.
- **Onboarding**: before a user picks a username, every user route returns 401. The client calls `GET /onboard/hello` first so it never mistakes onboarding for a dead session.
- **TOTP enrolment** needs a fresh password-validated ticket for each protected step. Enabling TOTP does not create recovery codes, so the flow must generate them explicitly and make the user save them.
- **Rate limit**: auth routes share one bucket of 15 requests per 10 seconds, keyed by session when signed in and by client IP otherwise. Failed logins lock the account for 1 minute after three tries, rising to an hour.
- **Email**: required in practice, because password reset only works with SMTP configured. Hetzner blocks outbound ports 25 and 465, so Stoat sends through an EU transactional relay on 587. Email text comes from templates compiled into Stoat and cannot be customised.
- **Session storage**: the client keeps the token in IndexedDB, in both the browser and the desktop app, so there is one code path. Electron's encrypted storage would add little, because on Linux it silently falls back to a fixed key when no keyring is available.

### 4.2 Invite-only registration

Stoat's own invite-only mode checks a separate collection of registration codes that no API can create, and it never rejects a code once used. So we leave Stoat's mode off and enforce invites ourselves:

1. Caddy refuses `POST /api/auth/account/create` from the public internet.
2. The invite page at `/invite/<code>` looks up the code with `GET /api/invites/<code>` and shows the server's name and icon. It accepts only invites to servers on our allowlist, which starts as the one community server. Group DM invites and invites to any other server are rejected. Without the allowlist, any member could create a server and mint working registration links.
3. The registration form posts to our website server. It re-checks the invite, then calls Stoat's account-create endpoint directly over the internal Docker network, forwarding the user's IP in `X-Forwarded-For` so Stoat's rate limiting still sees real clients.
4. The form action stores the invite code in a short-lived cookie that the client can read.
5. The verification email links to `/login/verify/<token>`, a client page. It verifies, signs in with the returned ticket, runs onboarding, and joins the server with `POST /api/invites/<code>`. If the cookie is gone, the user is asked to paste the invite link again.

Admins invite people by creating ordinary server invites, revocable as on Discord. Our website keeps no database.

**Registration starts closed.** The website server has a registration switch in its configuration, off by default, and Jaakko decides when to turn it on. While it is off, `/register` and the invite page say registration is closed, and existing users can still log in and join through invites. Until then Jaakko creates accounts by hand over the internal network, as [vps-runbook.md](vps-runbook.md) describes. The Caddy rule in step 1 stays on either way.

**Since M3, production sends no email.**
- Production has no SMTP server, so Stoat creates accounts already verified.
- Jaakko's `deploy/account-link.sh` writes a one-time password token into the account and prints a `/app/welcome/<token>` link. Jaakko sends that link to the person directly. It can carry an invite.
- The same script resets a forgotten password. Stoat's own "Forgot password" fails without SMTP.
- The email-link steps 4 and 5 above need real email, which M6 adds:
  - Cloudflare Email Sending through a small bridge, because its SMTP uses port 465, which Hetzner blocks,
  - or our own sender, once Hetzner unblocks port 25.

  Until then, the invite page at `/app/invite/<code>` serves existing accounts (m3-results.md).

**Closed-beta invitations, since M4.8.** Jaakko's direction, 2026-10-17: instead of Jaakko making each account by hand, admins and moderators invite people by email from the app (Beta invitations, under Mentions in the DM sidebar), through the layer (section 11). An invite is approved at once for the two gate holders and waits for an admin otherwise. The invitee opens `/app/beta/<token>` signed out, chooses a password, and the layer runs step 3 above in their words: it claims the invitation atomically, calls Stoat's account-create over the internal network, and stores the link only as a hash. Single use; an answer from Stoat that leaves the outcome unclear fails the row to `failed` rather than risk a reset. Production sends no mail, so the account is created verified and the person logs straight in; they still get an ordinary server invite to join the server. Moderators are the server-creator list; it is the same gate the settings sidebar already shows.

Every member can ask: the Invite to beta view, under Mentions in the DM sidebar, makes a request that an admin approves in Administration (admin only, below it). **Server invites go the same way**: a member asks for an invite link to a server they are in, an admin approves it, and moderators who may invite there skip the queue. The layer never calls Stoat for this, since it has no privileged token. The approving person's own client makes the Stoat invite and sends its code, so only someone allowed to invite in that server can approve. Stoat can't limit an invite's uses, so "one link, one person" is a rule for the people sending it, and an admin revokes a stray invite in server settings.

**Only server admins create invites.** New Stoat servers give every member the invite permission. Our server-creation flow removes it from the default role straight away, then creates an Admin role, first in rank, with every permission (m2c-plan.md decision 4). The permission editors warn when Everyone, or a role without Manage server, is given it back. The allowlist above stays even so, because group DM invites are not covered by server permissions.

Two Stoat behaviours an owner should know (m2c-plan.md): leaving a server you own deletes it, and a new private channel's name briefly reaches every member's client while it is being made private (decision 8).

**Only global admins create servers.** Stoat's `restrict_server_creation` setting takes a list of user IDs. An empty list lets everyone create servers, so bootstrap order matters: create the first admin account, add its ID to the list, restart the API, and only then let anyone else register. The client reads the list from `GET /` and hides "Create server" from everyone else. Group DMs are not affected.

**Existing emails**: account creation reports success even when the email already exists. Stoat resends verification for a pending account, or sends a password reset for a verified one. The page always says "check your email" and never confirms whether an account exists.

**Real client IP**: the SvelteKit server reads the client IP from Caddy's `X-Forwarded-For`, configured through adapter-node's address-header settings. Caddy discards any `X-Forwarded-For` sent by clients.

### 4.3 Realtime connection

- **Endpoint**: `wss://concord.jaalip.com/ws?version=1&format=json`, plus the `ready` fields. The client's first frame is `Authenticate` with the session token, which keeps the token out of URLs and logs. The server sends `Authenticated`, then `Ready`.
- **Keepalive**: the client sends `Ping` every 20 seconds and reconnects if no `Pong` arrives within 10 seconds.
- **No resume.** Neither Stoat's Rust events server nor its in-progress Elixir replacement has sequence numbers or replay. Every reconnect is a cold start:
  1. Request `Ready` with an explicit field list that includes channel unreads. Any field list makes every field opt-in, so the list must be complete.
  2. Replace servers, channels, own memberships, emojis, unreads and voice states from `Ready`. Do not merge.
  3. Fetch members for each server.
  4. Fetch synced settings through the settings endpoint. Stoat's `Ready` option for settings is broken.
  5. For each open channel, fetch messages after the newest one we hold. If the gap exceeds one page of 100, drop the window and reload at the bottom.
  6. Clear typing indicators.
- **Ready is partial.** It carries your own memberships, DM and group recipients, voice participants, and the users you have relationships with. It does not carry every server member. The member list comes from `GET /servers/<id>/members`, which returns all members with their user objects. That is about 200 rows for us.
- **Presence**: online and offline changes reach every server member live. Status text, Idle, Focus and Busy changes reach friends, DM and group partners, and sockets subscribed to a shared server, as verified on 0.15.5 in [m0-results.md](m0-results.md) and [m2b-plan.md](m2b-plan.md). On 0.15.5 the client keeps every server it is in subscribed with `Subscribe`, up to Stoat's 5 per socket, which brings live status changes from every member. It re-sends them every 10 minutes, because a subscription lasts 15, and after every relationship event, which works around a Stoat bug described in client.md section 7. On versions without it, the client re-polls the member list on focus and every two minutes while visible.
- **Idle is our job.** Stoat has no automatic idle. The client sets presence itself, and presence is per account, so the most recently active device wins.
- **Permissions as BigInt**: permissions are 64-bit masks, and JavaScript's bitwise operators work on 32 bits. The adapter parses permission fields as BigInt.
- **Edits versus pins**: `MessageUpdate` carries both edits and pin toggles. It counts as an edit only when `edited` is present.
- **Late embeds**: link embeds arrive after the message, as `MessageAppend`. The message list keeps scroll anchored when they render.
- **Unreads**: a channel is unread when its last message ID is newer than the user's acknowledged ID. Stoat sends no event for last-message changes, so the client bumps them from incoming messages. Mentions are a list of message IDs. Server-rail pills and mention badges are derived client-side, which matches Discord's model.
- **Version capability table.** The adapter reads Stoat's version from `GET /` and switches behaviour where versions differ. One known case: `Subscribe` delivers member status changes on 0.15.5, does nothing on later versions, and would get the socket closed by the Elixir gateway. The table switches it on for 0.15.5 only.

### 4.4 Messages and markdown

Stoat's server only extracts tokens from message text. Rendering is the client's job.

**Base syntax**: CommonMark with GitHub-style tables, strikethrough and autolinks, with single newlines rendered as line breaks.

**Stoat's extensions**, which we must match so mentions, emoji and other clients stay compatible:

| Syntax | Meaning |
|---|---|
| `<@id>`, `<%id>`, `<#id>` | User, role and channel mentions |
| `:ULID:` | Custom emoji |
| `@everyone`, `@online` | Mass mentions, which are message flags |
| `\|\|text\|\|` | Spoiler |
| `<t:unix>` with styles `t`, `T`, `R`, `D`, `F` | Localised timestamps |
| `$$…$$` | Math |
| Fenced code with a language | Highlighted code |

**Renderer**: a small purpose-built parser into Svelte components, never raw HTML from message content. The client specification defines the exact subset, with test fixtures taken from Stoat's own renderer. Math rendering and syntax highlighting load lazily the first time they are needed. This replaces Stoat's remark, rehype, KaTeX and highlight.js stack with something a fraction of the size.

**History**: pages of up to 100 with `before`, `after` and `nearby`, with users and members included. Message IDs are time-sortable ULIDs.

**Message list**: a bounded window of at most about 200 messages in the DOM, trimmed on the far side as the user scrolls, with "jump to present". Off-screen messages use `content-visibility: auto`. This avoids full virtualisation, which is fragile with variable-height, bottom-anchored content.

### 4.5 Mapping the Discord reference to Stoat

The reference is [discord-reference.webp](reference/discord-reference.webp).

| Reference element | Approach |
|---|---|
| Categories, channel order, unread pills, mention badges | Supported directly. |
| Role colours, hoisted role groups with counts | Supported. Colours may be gradients. Group online members by highest hoisted role, then Online, then Offline. |
| Custom status with emoji | Status is text only. We treat a leading emoji in the text as the status emoji. |
| Presence dots | Supported, with the polling caveat above. |
| Replies, reactions, pins, edits, embeds, attachments | Supported. Embeds include special cases for YouTube, Twitch, Spotify and others. |
| "APP" chip | From the bot flag. |
| Server tag chips such as "SLOP" | Not in Stoat. Approximated with role icons. |
| Rich activity such as "Factorio" | Not in Stoat. Dropped. |
| Thread preview cards | Not in Stoat. Dropped. |
| Stickers | Not in Stoat. GIF search works through Stoat's GIF proxy, which needs a gifbox.me API key. |
| Muted channels, server order, folders | Stored in Stoat's synced settings, which accept any key. We reuse Stoat's `ordering` and `notifications` keys and keep our own settings under a `concord:` prefix. |
| Search | Per channel only. Server-wide search is a gap. See section 9. |

**Permissions**: the client includes a permission calculator so it can hide what a user cannot do, such as the composer, channel settings and voice buttons. The server stays authoritative.

## 5. Voice and screen sharing

### 5.1 How joining works

1. The client reads LiveKit node names from `GET /`, then calls `POST /api/channels/<id>/join_call` with a node. It gets a LiveKit URL and a token valid for 10 seconds, so it must connect immediately. Joining while already in another voice channel fails unless the request asks Stoat to disconnect the old session.
2. The LiveKit room is the channel ID. Participants are identified by Stoat user ID.
3. Stoat's voice-ingress service receives LiveKit webhooks and turns them into WebSocket events: join, leave, and per-user flags for publishing, camera and screen share. Voice channel occupancy also arrives in `Ready`, so the channel list can show who is in voice without joining.
4. A "voice" channel is a text channel with voice settings, so every voice channel also has a text chat. We show it the way Discord shows a voice channel's chat.

### 5.2 Getting to 1080p60

Stoat enforces one thing on video: when a track is published, its declared width times height must not exceed a configured area. Otherwise the user is disconnected. Nothing checks framerate or bitrate. So 60 fps is purely a client choice.

**Server configuration**, in both the `default` and `new_user` tiers, because new accounts get the second tier for 72 hours:

```toml
video_resolution = [2560, 1440]
video_aspect_ratio = [0.3, 10]
```

The headroom over 1920x1080 lets ultrawide monitors share at 1080p height without being kicked.

**Client publishing**, to be confirmed by measurements: encoders and sharer CPU in M0, network behaviour and TURN in M3, both against the VPS's LiveKit.

- **Capture**: our own `getDisplayMedia` call, up to 1920x1080 at 60 fps, clamped so the area never exceeds the server limit.
- **Encoding**: about 12 Mbps at 60 fps, high priority. Content hint `motion` for games and `detail` for text-heavy shares.
- **Codec**: H.264, so Windows can use hardware encoders. M0 compares it with VP8, VP9 and AV1 on Jaakko's hardware.
- **Backup codec off, if M0 allows.** LiveKit adds a VP8 backup by default. When any viewer can't decode the primary codec, every viewer falls back to VP8. If every target browser decodes H.264, the backup only costs sharer CPU. Linux Firefox depends on the OpenH264 plugin, so M0 tests it as a viewer. If it fails, the backup stays on.
- **Layers**: with H.264 or VP8, simulcast layers at 720p30 and 360p15 under the full layer. VP9 and AV1 use layered SVC encoding instead, where simulcast settings do not apply. Dynacast and adaptive streaming are off by default in LiveKit, and we turn both on. Viewers on weaker connections or in small tiles then get a lower layer automatically.
- **Firefox**: LiveKit publishes from Firefox without simulcast, so Firefox sharers send a single layer. The UI recommends the desktop app or a Chromium browser for sharing.
- **Degradation preference**: keep framerate for games, keep resolution for text.
- **Quality menu**: 1080p60, 1080p30, 720p30, and "text" at source resolution and 5 fps.

**Linux encoding**: Chromium's VA-API video encoder is off by default. Electron can enable it with a feature flag. Community reports suggest it works for H.264 on recent Intel and AMD drivers and is unreliable on NVIDIA. M0 measures it. The desktop app exposes it as a setting whose default follows those results. Cheap 1080p60 on every Linux machine remains the native client's job.

**Microphone audio**: echo cancellation and automatic gain control on, plus RNNoise noise suppression, as Stoat's client does.

**Screen-share audio**: all processing off. It must not re-broadcast the call itself. On Windows, Electron's loopback capture records all system audio, including other participants' voices. Chromium's `restrictOwnAudio` constraint, which Stoat uses, is meant to exclude the page's own output. The desktop milestone, M5, verifies it works with Electron's loopback. If it doesn't, screen-share audio is deferred. Linux needs Stoat's PipeWire virtual-microphone approach and may slip past the MVP.

### 5.3 Connectivity and TURN

Stoat's default LiveKit config has TURN disabled. Without it, members on networks that allow only web traffic on port 443 get signalling but no media. Most home and mobile connections are fine without TURN, because LiveKit also accepts media over TCP on 7881.

The VPS milestone, M3, enables LiveKit's built-in TURN on `turn.concord.jaalip.com`:

- **TURN over TLS on port 443.** This is the part that rescues locked-down networks. LiveKit's sample config says the TLS port must be 443 unless a load balancer terminates TLS in front of it.
- **A second public IPv4.** Caddy already owns 443 on the main address. We attach a Hetzner floating IP, configure it persistently in the OS, point `turn.concord.jaalip.com` at it, and bind LiveKit's TURN listener to it. This costs a few euros a month and avoids running a TLS-sniffing proxy in front of Caddy.
- **TURN over UDP on 3478**, cheap to add alongside. It goes on the **main** IP, with relay ports 30000 to 30100. LiveKit hands clients `turn:<node IP>:3478`, and the node IP is the main IP. Only `turns:<domain>:443` uses the floating IP (m3-plan.md, checked in M3).
- **Outbound traffic stays on the main IP.** LiveKit learns its node IP from the address its traffic leaves from. After a reboot, Docker sent from the floating IP, which broke voice. `com.docker.network.host_ipv4` on the stack's network pins it (m3-results.md task 3).
- **Certificate**: Caddy also listens on port 80 of the floating IP, so it can answer the certificate challenge for `turn.concord.jaalip.com`. LiveKit mounts Caddy's certificate directory read-only. A weekly job at a quiet hour restarts it when the certificate has been renewed, about every two months. A restart drops calls in progress and leaves Stoat's voice state unreliable for a while (m4-results.md, task 9), which is why it runs at night and only when needed.

### 5.4 Known Stoat quirks

Two permission bugs to raise upstream:

- A user with neither Speak nor Video permission gets a LiveKit token with no source restriction.
- A permission change mid-call resets source restrictions.

Neither matters much in a trusted community, but both are worth fixing.

A third quirk affects our UI: Stoat uses one "screen sharing" flag for both screen video and screen audio. Stopping only the audio clears the flag while video continues. The client therefore trusts LiveKit's track list for what is actually being shared, and uses Stoat's flag only for the channel list.

## 6. Desktop shell

**Electron loads `https://concord.jaalip.com/app`** instead of bundling the client, the same model Stoat's own desktop app uses. UI fixes ship on the next web deploy. Desktop releases are needed only when the shell changes.

- **Offline start**: a native offline screen with retry.
- **Safety**: context isolation, sandboxed renderer, no Node APIs in the page, navigation locked to our origin, and external links opened in the system browser.
- **Version skew**: the preload bridge exposes a version and a capability list. The client feature-detects rather than assuming.

| Capability | Mechanism |
|---|---|
| Screen and window picker | `setDisplayMediaRequestHandler` with our own picker. Wayland uses the system portal picker. |
| Push-to-talk | Electron's global shortcuts see only key presses, not releases. We use a native key hook on Windows and X11, and the GlobalShortcuts portal on Wayland where the compositor supports it. Otherwise push-to-talk works only while the window is focused. |
| Screen-share audio | Windows loopback with the call's own audio excluded, as in section 5.2. Linux through a PipeWire virtual microphone. |
| Linux hardware encoding | Chromium VA-API encoder feature flag, as a setting. |
| Tray, notifications, badge, start on login, single instance | Standard Electron APIs. |
| Invite deep links | `concord://invite/<code>` forwarded to the client. The Flatpak and desktop app ID is `com.jaalip.Concord`. |

**Packaging**:

- **Windows**: electron-builder producing an NSIS installer, with electron-updater pulling from GitHub Releases. Chosen over Electron Forge because the updater works with any static host.
- **Linux**: a flatpak-builder manifest on the Electron base app. It ships first as a `.flatpak` bundle on GitHub Releases for testers, then goes to Flathub so updates arrive through `flatpak update`. Because the UI loads remotely, Flathub review time stays off the critical path.

## 7. Website

The website is the `(site)` route group of `apps/web`. Its pages are server-rendered with minimal JavaScript and never hold a session. Login has one owner: the client.

| Route | Group | Purpose |
|---|---|---|
| `/` | site | Landing page with login and download links. |
| `/invite/<code>` | site | Invite preview, then a link to registration or login. |
| `/register` | site | Registration form. Its server action creates the account as in section 4.2. |
| `/login/reset/<token>` | site | New password form for Stoat's reset email. |
| `/delete/<token>` | site | Confirmation for Stoat's account deletion email. |
| `/download` | site | Windows installer, Flatpak bundle and Flathub link, browser link. |
| `/channel/<id>/<message>` | site | Redirect into the client. Stoat builds notification links in this shape. |
| `/login`, `/login/verify/<token>` | app | Login with MFA, email verification, onboarding and joining via invite. |
| `/account` | app | A standalone page for email, password, TOTP, recovery codes, sessions and account deletion. The same screens appear in the client's settings. |
| `/app/...` | app | The chat client. |

Account management stays reachable on the website without installing anything, as the brief requires. It lives in the client route group because it needs a session.

## 8. Hosting and operations

- **VPS**: the current server has 2 shared vCPU, 3.7 GB RAM and 4 GB swap, in Helsinki. It runs Ubuntu 26.04. Idle, the stack uses 1.6 GB. The estimate for production is 4 vCPU and 8 GB, and the M3 voice session decides whether more is needed. If so, the VPS is resized rather than moving the stack to Jaakko's home server. Stoat's own guidance asks for 2 GB minimum, third-party guides suggest 4 GB with voice, and LiveKit needs CPU headroom for several 1080p60 streams. Each viewer of a 1080p60 share pulls roughly 6 to 10 Mbps, well within Hetzner's included traffic at our scale.
- **Addresses**: a main IPv4 and IPv6, plus one floating IPv4 for TURN.
- **Exact steps** for addresses, ports, files and backups live in [vps-runbook.md](vps-runbook.md). This section states the rules.
- **Port bindings**:
  - Caddy binds the main IPv4 and IPv6 on 80 and 443 over TCP, and 443 over UDP for HTTP/3. It also binds port 80 on the floating IP for certificate challenges.
  - LiveKit binds 7881 over TCP and 50000 to 50100 over UDP on the main address. TURN binds 443 over TCP on the floating IP, and 3478 plus relay ports 30000 to 30100 over UDP on the main address.
  - The Hetzner Cloud firewall opens the union of these ports, since its inbound rules don't filter by destination address. Docker's per-IP bindings keep each service on its own address. The firewall matters, because ports Docker publishes bypass ufw.
  - No address is committed: they live in the server-only `concord/host.env`, which the `dc` wrapper reads.
- **Our deployment files never use names Stoat's generator touches.** When rerun with overwrite, Stoat's generator renames `compose.override.yml`, `livekit.yml`, `Revolt.toml` and `.env.web`. So our compose file is `deploy/concord.compose.yml`. It replaces Stoat's Caddyfile and LiveKit config with our versions from `deploy/`, adds our web app, and rebinds ports. The LiveKit API key and secret stay out of git in a server-only environment file. A wrapper script runs every compose command with both files, so nobody forgets the second `-f`. Our edits to `Revolt.toml` are kept as a documented diff in `deploy/`, without secrets, and the upgrade script reapplies it.
- **Version pinning**: our compose file sets every Stoat image tag explicitly. MongoDB is pinned to 7.0.43, because MongoDB 8 refuses to start on the VPS's kernel 7.0. 7.0 is supported until August 2027. The reasons and the path to 8.0 are in `deploy/concord.compose.yml`. Upgrades are a reviewed pull request here, applied by a script that backs up first and reruns the adapter's contract tests.
- **Backups**: run nightly with restic. Since M3 they go to the VPS's own disk, and a Hetzner Storage Box is to be added as a second repository. They cover a MongoDB dump, the object storage data, `secrets.env`, `Revolt.toml`, the LiveKit keys file, `.env.web` and Caddy's data directory. `secrets.env` holds the file encryption key, and losing it makes every attachment unreadable. The restore drill moved from M3 to M4.
- **Monitoring**: an external uptime check on the API and WebSocket, plus disk and memory alerts, in M8. Until then backups and the disk are logged under `concord` and shown by `deploy/status.sh`.

## 9. Gaps and upstream candidates

| Gap | Plan |
|---|---|
| Server-wide search | MVP ships per-channel search. Fanning out across channels from the client is possible but heavy on rate limits. An upstream pull request is better. |
| Threads, rich activity, server tags | Out of scope. Threads are the most likely future trigger for the decision gate. |
| Live status for non-friends | Polling for now. Possibly an upstream pull request to restore server fan-out of status changes. |
| Voice permission quirks | Upstream pull request. |
| Email templates not customisable | Accept. |

## 10. Decision gate

There is an explicit go or no-go on Stoat in two parts. Part A comes at the end of M0, on the VPS stack used for development, and covers criteria 1, 2 and a first look at 3. Part B comes at the end of M3, on the VPS, and covers 3, 4 and 5. Jaakko accepted these criteria in October 2026.

**We switch to our own Rust backend** (axum, Postgres, LiveKit) if any of these turns out true:

1. Invite-only registration cannot be done with a proxy rule and an internal account-create call, and would need writes to Stoat's database or Stoat patches. M0 tested the Caddy rule and the internal call on the VPS. M3 confirms it with the real email relay.
2. Server-wide search, threads or live rich presence become MVP must-haves.
3. Operating the stack is painful: setup or upgrades need repeated manual repair, locally or on the VPS, or memory and CPU don't fit the planned VPS.
4. 1080p60 needs server changes that upstream won't accept.
5. Voice reliability problems trace back to Stoat's voice-ingress or token handling rather than to LiveKit or the network.

**Switching cost**, a rough estimate: four to six weeks of backend work. Most Stoat-specific client code sits in `packages/stoat`, and the UI, domain store and LiveKit voice code would stay. The email link paths, markdown dialect, permission model and voice join flow also follow Stoat's conventions. A replacement backend would either keep those conventions or the client would adapt in a few places.

## 11. Concord's own layer

Approved by Jaakko on 2026-10-15, built in M4.4, revised after a Sonnet challenger review the same day. Stoat has no place for some things Concord wants, such as server tags, and no admin API. Instead of each feature growing its own server code, one small layer of our own holds them.

### 11.1 Shape

- **Beside Stoat, not in front of it.** Clients keep talking to Stoat directly for chat, voice and everything else. The layer answers only for what Stoat can't do, so it adds no latency to chat and can't take chat down.
- **It lives in `concord-web`**, the SvelteKit server that already serves `/app` on the VPS. Its endpoints are SvelteKit `+server.ts` routes under `/app/api/v1/`, with the pages still client-rendered. Caddy already sends `/app/*` there.
  - M6 changes that: it adds server-rendered pages outside `/app` (section 7), new Caddy routes and per-page SSR. M6's registration code runs in the same process, with its own rate limits.
- **It reaches Stoat over the stack's internal network** (`http://api:14702`), never through the public hostname.
- **One instance only.** Nothing in it is built to run twice.

### 11.2 The shared core

Every feature uses these, and none brings its own:

| Part | What it does |
|---|---|
| **Who you are** | The client sends its Stoat session token in the `X-Session-Token` header, never a cookie, so there is no cross-site request risk. The layer checks it with Stoat's `GET /users/@me`. Good answers are cached for 60 s and bad ones for 10 s, by a hash of the token, in a bounded cache. A per-address limit applies before any Stoat call, so random tokens can't make it call Stoat at will. |
| **Stoat failing** | Stoat down or slow gives 503, never 401. The client signs out only on the layer's own 401, so a Stoat blip never logs anyone out. |
| **What you may do** | Stoat's own permissions, worked out by `packages/domain`'s calculator from the server, the caller's member record and the roles. These are fetched with the caller's token, so they share the caller's 5-per-10-s bucket for that server. So permission answers are cached for 30 s, a write costs at most two Stoat calls, and reads never cost any. Our own gates are the server-creator list in `GET /api/` and `ADMIN_USER_IDS`, passed into the container's environment from the server-only `host.env`. |
| **Storage** | One SQLite file through Node's built-in `node:sqlite`, so no new dependency, in WAL mode with a busy timeout. Numbered SQL migrations in the repo run at start, after copying the file aside. The layer refuses to start against a database newer than its build knows, so a rollback can't damage data. |
| **Updates** | Clients fetch what they show when they open, every 60 s and when the window regains focus. A live event stream comes later, when a feature needs sub-second updates. |
| **Limits** | Per-user rate limits in memory, generous for reads and tight for writes. Errors are `{type}` as Stoat's are. |
| **Input** | IDs must have the ULID shape before they go into any URL to Stoat, so a crafted ID can't reach another internal route. Text is normalised and limited by visible characters. The layer never fetches a URL a client supplied. Bodies stay under the 1 MB `BODY_SIZE_LIMIT`. |
| **Logs** | Writes and refusals are logged without tokens, emails or message content. |

### 11.3 Rules

- **Store only what Stoat has no place for.** Never keep a copy of Stoat's data. Read it from Stoat when needed, cached for seconds, not stored. The one exception is a reported message's text, kept as evidence until 90 days after its report closes (m4.7-plan.md decision 3).
- **Membership is not re-checked on reads.** The caller's token can't prove other people's membership without running into Stoat's limits. So clients show a stored per-user fact, such as a tag, only for people their own member lists contain, and the layer removes stale rows when it next writes.
- **Write to Stoat only through its API**, as the caller. The exceptions are the few admin actions already done over SSH, such as writing a password link, and each needs the admin gate.
- **No direct database access.** Stoat's MongoDB has no login, and the same network holds Valkey, RabbitMQ and MinIO. The admin panel's lists come from a root cron job that writes a small snapshot, with no emails, into a read-only mount, as its status page does.
- **The one bulk write to Stoat's database** is `deploy/restore-history.sh` (m4.7-plan.md task 10), run as root over SSH by an admin, never by the layer. It has a dry run, takes a dump of the live database first, and inserts only missing documents, so it can run twice.
- **Check on the server, every call.** Hiding a button proves nothing.

**If `concord-web` is compromised**, an attacker gets:
- the layer's database,
- the session tokens passing through it,
- the stack's internal network, where Stoat's services trust each other.

That is why the layer stays small and reviewed, holds no Stoat data, and never mounts the Docker socket.

### 11.4 What uses it

| Feature | Milestone |
|---|---|
| Server tags | M4.5 |
| GIF search, keeping the GIPHY key on the server | M4.5 |
| Closed-beta invitations: `POST /beta/redeem` is its only public endpoint; requests, review and links are behind the session check | M4.8 (early) |
| Server invites on request: `/server-invites`, member requests, admin approval, no call to Stoat | M4.8 (early) |
| The admin view's people and roles: `/admin/users` and `/admin/actions`, through the account runner (section 11.5) | M4.8 (early) |
| The admin panel | Its own plan, moved onto this layer: `/app/api/v1/admin/*`, 404 for anyone not on the admin list, with the session check and gate from M4.4. Jaakko's direction, 2026-10-15: a view in the web client that does what they do over SSH during the beta, with its scope kept small |
| Bookmarks and reminders, if missed | Later |
| Registration, the invite allowlist and the account pages (section 7) | M6 |
| End-to-end encryption's key directory, if that work goes ahead | Its own plan |

### 11.5 Operations

- **Backups**: `backup.sh` first takes a `VACUUM INTO` copy in `concord/data/`, through `docker exec` and a one-off `node` process in `concord-web`, never an HTTP endpoint. A failure there is logged and flagged but doesn't stop the database dump. restic saves the copy, never the live file, its WAL or its shared memory.
- **The data folder** is a read-write mount next to the read-only build, writable by the container's user, so a deploy never touches the data.
- **The account runner** (`deploy/account-runner.py`) is what lets the admin view change accounts and the two global roles. The layer holds no root and no Docker, so it only asks: one small JSON file per request in `concord/spool/in`, the one folder it may write, and the runner on the host answers in `spool/out`, which the container mounts read-only. The runner is a systemd service on the VPS and a background process of the user on the local stack, started by `pnpm deploy:stack`. It checks every request again and trusts nothing but its shape:
  - **Fixed actions**: add or remove a moderator (Stoat's server-creator list, which restarts `api` for seconds), add or remove an admin (`ADMIN_USER_IDS` in `host.env`, which restarts `concord-web`), a one-time password link (like `account-link.sh --reset`, by user ID, shown once to the admin who asked) and suspend or unsuspend (the account is disabled and its sessions end).
  - **Rules, enforced in the runner**: only an admin may ask; the first admin in `ADMIN_USER_IDS` is the owner and can't be demoted, suspended or have their password reset by anyone else; nobody removes or suspends themself; an admin can't be suspended, or have their password reset by another admin who isn't the owner; the admin list is never empty.
  - **Handling files from a container that might be compromised**: requests are opened with `O_NOFOLLOW` and must be small regular files with an exact shape and a UUID name, or they are deleted unread. Nothing from a request reaches a shell; values go to MongoDB as environment variables. Answers go to a folder only the runner writes, so there are no links to plant.
  - **What a compromised `concord-web` can still do**: ask for any of these actions as an admin, such as making itself an admin or suspending people. It can't touch the owner, take the admin list to empty or run anything else. Every action is logged to the journal under the tag `concord`, with who asked and for whom.
  - **The user list**: the runner refreshes `spool/out/users.json` every 30 seconds and after each action: ID, name and whether disabled, with no emails. The layer adds the roles and serves it to admins only.
- **On the local dev stack** it runs the same way, with its own file.
- **If we ever leave Stoat** (section 10), this layer is the start of our own backend. Its endpoints and storage carry over, and only the session check and permission lookups change.
