# Concord: milestones

Status: draft for review, roadmap level. Each milestone gets its own detailed plan before work starts.
Read with [product-brief.md](product-brief.md) and [architecture.md](architecture.md).

Every milestone ends with a demo on Jaakko's real devices. A milestone is done when its acceptance criteria pass and the device test list is signed off, not when the code merges.

**Devices referred to below**: Jaakko's Windows PC, Jaakko's Linux machine, one phone, and at least two other people on their own home connections.

**Development runs against the VPS.** The client is built and served on Jaakko's machine against the Stoat stack at `concord.jaalip.com`, which runs from M0 for development only. M3 turns it into production for other people.

## Overview

| Milestone | Outcome | Depends on | Specs written before it starts |
|---|---|---|---|
| M0 | Stoat stack on the VPS for development, seed data, recorded fixtures, encoder measurements, decision gate part A | Nothing | [dev-environment.md](dev-environment.md) |
| M1 | Read-only client with the final layout | M0 | [client.md](client.md) |
| M2 | Full text chat, DMs and friends, in three parts: M2a messaging, M2b social, M2c administration | M1 | client.md, one plan per part |
| M3 | VPS to production, media validated on real networks, decision gate part B | M2 | [vps-runbook.md](vps-runbook.md), ops spec |
| M4 | Voice and 1080p60 screen share in the browser | M3 | client.md voice section |
| M4.1 | UI alignment fixes from Jaakko's review | M4 | none |
| M4.2 | Motion and polish: a written motion spec and a pass over the UI | M4.1 | client.md section 9, motion |
| M4.4 | Concord's own layer beside Stoat: sessions, permissions, storage, live events | M4 | architecture section 11 |
| M4.5 | Discord-style menus, GIFs, quick voice controls, server tags | M4.4 | m4.5 plan |
| M4.6 | Moderation, voice and text: moving people between calls, server mute and deafen, permissions that work, timeouts, slow mode, bulk delete, the audit log, reports | M4.5 | m4.6 plan |
| M5 | Desktop apps for Windows and Linux | M4 | desktop spec |
| M6 | Website: invites, registration, account management, downloads | M3 | website spec |
| M7 | Polish, Finnish locale, PWA with web push, closed beta | M2 to M6 | none new |
| M8 | Launch to the whole community | M7 | none new |
| M9 | Native Linux client | M8 | native client spec |

M4 and M6 can run in parallel after M3. M4.4 and M4.5 were added on 2026-10-15 at Jaakko's request, before M5. The desktop, website, ops and native-client specs are written just before their milestones, so they reflect what the client work has taught us.

## Decision gate

Section 10 of the architecture document lists five criteria for switching to our own backend. Building the client before inviting anyone splits the gate in two:

- **Part A, end of M0**: registration mechanism, product must-haves, and how painful the stack is to run. Criteria 1, 2 and a first look at 3.
- **Part B, end of M3**: 1080p60 on real networks, TURN, voice reliability, and operating the stack on the VPS. Criteria 3, 4 and 5.

The cost of this order: part B comes after M1 and M2 are built. If part B fails, the client's UI, domain store and most voice code carry over, and the Stoat adapter is replaced. M0's encoder measurements reduce that risk early, because encoder choice and sharer CPU don't depend on the network.

## M0: Development stack

Detailed in [dev-environment.md](dev-environment.md).

**Scope**:

- Stoat 0.15.5 on the VPS behind Caddy, with Mailpit catching email, and the client's dev server on Jaakko's machine proxying to it.
- First admin account, server-creation restriction, invite permission removed from members.
- A seed script that builds a realistic dataset through the API.
- A recorder that captures real REST responses and WebSocket events as test fixtures.
- The screen-share test page, used against the VPS's LiveKit to measure encoders and sharer CPU at 1080p60 in Chrome, Firefox and a bare Electron shell, on Windows and Linux.

**Acceptance criteria**:

- One command starts the stack, and one command reseeds it from scratch.
- Stoat's own web client works against the development stack: an account created with `create-account.sh` and verified through Mailpit can log in with TOTP, chat and join voice.
- A non-admin account cannot create a server or an invite.
- Fixtures for login, `Ready`, message history, member list and a set of live events are recorded and committed.
- Encoder results are written to `docs/m0-results.md`: which encoder each browser and Electron uses, achieved framerate, and sharer CPU at 1080p60.
- Decision gate part A is recorded in the same file.

## M1: Read-only client

**Scope**:

- Monorepo, tooling, continuous integration, design tokens, and the layout from the reference screenshots.
- `packages/stoat`: generated types, REST client, WebSocket with keepalive and cold-start reconnect, version capability table.
- `packages/domain`: normalised store and permission calculator.
- Login with TOTP and onboarding.
- Server rail, categories and channel list with unread markers, DM list, message history with the bounded window and jump to present, markdown rendering, embeds and attachments as read-only, member list grouped by hoisted role, profile popout and DM profile panel, user dock.
- Contract tests replaying the M0 fixtures, so a Stoat upgrade that changes the protocol fails CI.

**Acceptance criteria**:

- Side by side with the reference screenshots, layout, spacing, colours and density read as the same class of product. Jaakko signs this off explicitly.
- Killing the network for a minute and restoring it brings the client back with correct state and no duplicate or missing messages.
- Performance budgets from the product brief are measured and reported, even if not yet all met.

**Device tests**: Windows Chrome and Firefox, Linux Chrome and Firefox, phone browser layout sanity check.

## M2: Text chat

Split into three parts on 2026-10-12. Each gets its own plan, signed off before work starts, and its own working session. Each ends deployed at `/app` for review on the live client.

### M2a: Messaging

**Scope**: the composer, starting with the two-day editor spike from client.md section 6.3. Then: send with optimistic updates, replies, mentions with autocomplete, reactions, edit, delete, pins, attachment upload with progress, the emoji picker with custom emoji, favourites and frequently used, the typing indicator, unread and mention tracking with acknowledgement, and per-channel search.

**Acceptance criteria**:

- Two accounts on two machines see each other's messages, edits, deletes, reactions and typing within a second.
- Unread and mention markers stay correct across two devices for the same account.
- Every messaging feature in the product brief's MVP list works.

### M2b: Social

**Scope**: DMs and group DMs, the friends list with online, all, pending and blocked tabs, status and presence with automatic idle, and profile editing: avatar, banner, display name, bio and custom status.

**Acceptance criteria**:

- Friend requests, DMs and groups work end to end between two accounts.
- Automatic idle follows client.md section 7 across two devices for the same account.
- A profile edit shows in the other account's popout without a reload.

### M2c: Server administration and notifications

**Scope**: server management for admins: create a server, channels, categories, roles, per-channel permission overrides, custom emoji upload, invites, kicks and bans. Creating a server removes the invite permission from regular members immediately. Also browser notifications while the client is open. The screen-by-screen spec for server settings comes with this part's plan.

**Acceptance criteria**:

- An admin builds a server like the seeded one from scratch in the client.
- A non-admin can't create a server or an invite, and sees no controls for either.
- Notifications follow the mute and "mentions only" settings, and never fire for the focused channel.

**Device tests for M2 as a whole**: a scripted 30-minute chat session across two machines against the development stack. A session with friends follows at M3. Since the M3 swap there's no development stack with seeded data. M2's device checks run on production with Jaakko's two accounts and a tester, and M2 is signed off when they pass (m3-plan.md decision 1).

## M3: VPS deployment and media validation

Detailed in [vps-runbook.md](vps-runbook.md).

**Scope**: wiping the development data, the email relay, the registration gate, TURN on a floating IP, backups with a restore drill, and our client deployed at `/app` for friends to try text chat. Friends' accounts are created by hand. Registration stays closed.

**Acceptance criteria**:

- A direct account-create call from the internet is refused, and the internal path works.
- Voice with at least four people on different home and mobile networks for 30 minutes without dropouts, using Stoat's own client.
- The test page achieves 1080p60 from Windows to viewers on other networks, and steps down layers on a throttled viewer.
- A forced-relay test with UDP 3478 closed shows media relayed over TLS on 443.
- A restore from backup onto a fresh machine brings back accounts, messages, attachments and avatars.
- Decision gate part B is recorded in `docs/m3-results.md`.

**Status, 2026-10-14**:

| Criterion | Status |
|---|---|
| 1, account creation refused from the internet | Met |
| 2, voice with four people | Carried into M4's voice evening |
| 3, 1080p60 on real networks | Carried into M4's voice evening |
| 4, relay over TLS | Met by script; the firewall version repeats on the evening |
| 5, restore drill | Carried into M4 |
| 6, decision gate part B | Provisional |

- The plan changed with Jaakko: no email in M3, because people get one-time password links. The dev data was swapped out rather than wiped. Backups go to the VPS disk until a Storage Box is added.
- The invite page and the move of Stoat's client to `ref.` came forward from M6.

## M4: Voice and screen share in the browser

**Scope**: join and leave, voice occupancy in the channel list and DM list, DM calls with ringing, mute and deafen, speaking indicators, per-user volume, voice settings with device selection, volumes, microphone test, input sensitivity, noise suppression and echo cancellation, screen share with quality presets and our 1080p60 publishing settings, viewer layer selection, camera, connection-quality indicator, reconnect on network change.

**Acceptance criteria**:

- A 1080p60 share from Windows Chrome reaches a viewer at 1080p60 when bandwidth allows, confirmed in the client's stats overlay.
- Throttling the sharer's upload makes the stream step down layers instead of freezing.
- A voice call survives switching Wi-Fi networks.

**Device tests**: a real voice evening with at least five people, including one screen share of a game. Include one Firefox sharer and one Firefox viewer.

**Carried in from M3**:
- **First task**: a separate dev stack, a CX23 at `dev.concord.jaalip.com` with a fresh seed (m3-plan.md decision 6).
- **The voice evening also covers M3's criteria 2 to 4**: 30 minutes of voice with four or more people on different networks, the screen-share runs on the test page, and a forced relay with UDP 3478 closed. Its results complete decision gate part B.
- **The restore drill** from vps-runbook.md section 7.

## M4.1: UI alignment fixes

Added on 2026-10-15 from Jaakko's screenshots. Plan: [m4.1-plan.md](m4.1-plan.md). Results: [m4.1-results.md](m4.1-results.md). Small CSS fixes, deployed and checked by screenshot:
- The composer's placeholder text isn't vertically centred in its box.
- The user dock and the composer don't line up: their heights and bottom edges differ.
- The typing indicator ("… is typing") is too tight against the composer and looks awkward.
- Menu items, such as the server menu's, get a check that their text is aligned.

## M4.2: Motion and polish

Added on 2026-10-15 at Jaakko's request, after M4.1. Plan: [m4.2-plan.md](m4.2-plan.md). Results: [m4.2-results.md](m4.2-results.md).

**Scope**:
- **A motion spec in client.md section 9**, drafted by a Sonnet agent from two reads, neither installed:
  - Emil Kowalski's motion skill (nexu-io/open-design, Apache-2.0),
  - the motion foundations of Apple's Human Interface Guidelines.

  It covers transform and opacity only, durations as tokens, one easing language, a frequency rule (the more often it fires, the less it moves), and a reduced-motion fallback for everything.
- **A pass over the UI**: menus, popovers and dialogs opening and closing, hover and press states, messages arriving, the voice panel, joins and leaves in a call, and toasts.

**Acceptance criteria**: Jaakko signs off the feel on production. With reduced motion on, nothing moves but fades. No animation drops a frame in Chrome's performance panel on the reference machine.

## M4.4: Concord's own layer

Added on 2026-10-15 at Jaakko's request. Designed in architecture section 11, planned in [m4.4-plan.md](m4.4-plan.md). **Built and on production, 2026-10-15**: [m4.4-results.md](m4.4-results.md).

**Scope**: the shared core of a small layer beside Stoat, inside `concord-web`, for what Stoat has no place for. It covers checking the Stoat session, permissions and our own gates, a SQLite store with migrations, the client side of it, backups and docs. Clients poll for now, and a live event stream comes when a feature needs it. No user-facing feature: server tags in M4.5 and the admin panel are its first users.

**Acceptance criteria**:
- An endpoint refuses a missing, bad or expired session, a caller without the Stoat permission it needs, and one outside our gates. Unit tests and a live check show each.
- A Stoat outage gives 503, and nobody is signed out by it.
- The store survives a `concord-web` redeploy and a rollback, is in the nightly backup, and a restore brings it back.

## M4.5: Menus, GIFs and quick voice controls

Added on 2026-10-15 at Jaakko's request, from Discord screenshots. Small, client-only work on what M2 and M4 built. Plan: [m4.5-plan.md](m4.5-plan.md), signed off on 2026-10-15. **Tasks 1 to 6 and 8 to 10 built and on production the same day**: [m4.5-results.md](m4.5-results.md). Task 7 became favourite GIFs without search, at Jaakko's choice, built the same day.

**Scope**:
- **Message menu on right-click**, as Discord's:
  - a row of quick reactions from frequently used emoji, and "Add reaction" with the picker,
  - Edit, Reply, Pin, Copy text, Copy link, Copy ID and Delete, each shown only when allowed,
  - Mark unread, if Stoat accepts an acknowledgement that moves backwards (probed first).
- **Menus on links and images**: Open link, Copy link, Copy image, Save image.
- **Quick audio menus in the user dock**, from the chevrons next to the microphone and headphones buttons:
  - input or output device, and input or output volume,
  - a link to Voice and video settings.
- **Per-user volume everywhere a person appears in a call**:
  - in the member list and the DM header as well as the call tile and the sidebar,
  - shown on the participant while not 100 %.

  The slider, the 200 % limit in Chromium and saving per device exist since M4.
- **GIFs through GIPHY**:
  - a GIF tab in the emoji picker, with search and trending,
  - "Powered by GIPHY" as GIPHY's terms require.

  Searches go through our own server, so the API key stays off the client. Images load through Stoat's January proxy, so GIPHY never sees members' addresses. A GIF is sent as a link and renders as Stoat's embed.
- **Click to watch a stream**, as Discord does: a screen share shows as a tile with "Watch stream" and is downloaded only once clicked. With five or more people and 1080p60 shares, this keeps the VPS's upload and viewers' bandwidth down.

- **More, added the same day**:
  - "Mark as read" in the server icon's menu, and the unread count in the tab's title,
  - Ctrl+Shift+M and Ctrl+Shift+D for mute and deafen, and a noise suppression toggle in the voice panel,
  - a volume for a stream's audio,
  - a voice channel's user limit in its settings,
  - **server tags**, as Discord's, with enabling a tag gated like creating servers. Stoat has no place for them, so they need a small store of our own in `concord-web` (m4.5-plan.md decision 5),
  - M4's leftovers: sounds through the chosen speaker, Speak gained mid-call, the LiveKit restart only on a new certificate, and send-side bandwidth estimation if it helps.
- **Link previews from "embed fixer" sites** such as kkinstagram and ddinstagram: they serve the video only to crawlers they recognise. Stoat's January poses as Discord only for a built-in list (twitter, the fx and vx fixers, x, reddit, klipy), so Instagram fixers show no preview. Recommended: a one-line pull request upstream to extend that list, since we don't patch Stoat. Fixers already on the list, such as fxtwitter, work now.

**Fixed already, 2026-10-15**: GIF links (KLIPY, Tenor, Giphy) play as GIFs, and a site's own video, such as Streamable's, plays in its link preview. Both came through Stoat but weren't rendered.

**Not in Stoat, so left out**: threads (decision gate criterion 2), forwarding, server-side bookmarks and reminders, and apps. Bookmarks or reminders could be kept in our own synced settings later if missed.

**Needs from Jaakko**: a GIPHY API key, from a free GIPHY developer account.

**Acceptance criteria**:
- Right-clicking a message, a link, an image, a person or a voice participant opens the matching menu, by mouse and by the keyboard's context-menu key.
- A GIF found in the picker arrives as an animated embed for another member, and no request from the client goes to GIPHY.
- A per-user volume set from the member list holds in the call and after a reload.

## M4.6: Moderation, voice and text

Added on 2026-10-15 at Jaakko's request. Plan: [m4.6-plan.md](m4.6-plan.md), awaiting sign-off.

**Scope**:
- **Voice**: following a move, dragging people between voice channels and "Move to", and server mute and deafen in the participant menu, enforced by Concord clients until Stoat is fixed.
- **Permissions that work**: every permission in the role editor has a visible effect, or a reason shown when it's missing, and members can set their own server nickname and avatar.
- **Text**: timeouts, slow mode, deleting a banned user's recent messages, reasons, other people's nicknames and avatars, deleting many messages at once, and the audit log.
- **Reports**, through Concord's own layer, to a server's moderators or the app's admins.
- **Upstream**: a fix for Stoat's voice moderation bug.

**Acceptance criteria**:
- A moderator drags someone into another voice channel, and their call follows without a click.
- A server mute silences the target within seconds, and they can't undo it.
- Those without a permission see none of its actions, or a reason why not, never a blank screen or a misleading error.
- Every moderation action shows in the audit log with its reason.
- A reported message reaches the right moderators, with its text kept as evidence.

## M5: Desktop apps

**Scope**: Electron shell loading the hosted client, screen and window picker, push-to-talk on Windows, X11 and Wayland where supported, screen-share audio on Windows without re-broadcasting the call, Linux hardware encoding setting, tray and notifications, deep links, Windows installer with auto-update and a Flatpak bundle published on GitHub Releases, then Flathub submission. The M6 downloads page links to these releases.

**Acceptance criteria**:

- Fresh install on Windows and on Linux through Flatpak, log in, join voice, share a window, use push-to-talk while a game has focus.
- Idle memory within the product brief's budget, measured.
- An auto-update on Windows from one shell version to the next.

**Device tests**: Windows PC, Linux machine on Wayland and on X11 if available.

## M6: Website

**Scope**: landing, invite page with the server allowlist, registration through our server behind the Caddy rule and a switch that Jaakko turns on when they decide to open it, Stoat's email link targets, the standalone account page for email, password, TOTP, recovery codes, sessions and deletion, downloads page, the notification-link redirect, and the routing switch that moves Stoat's own client to `ref.concord.jaalip.com`.

**Acceptance criteria**:

- A new person opens an invite link on a phone, registers, verifies email, sets a username, and lands in the server in under three minutes.
- Direct calls to Stoat's account-create endpoint from outside the server are still refused, and invites to servers outside the allowlist are rejected.
- Password reset and TOTP recovery both work without an admin.

**Device tests**: two people who have never seen the app go through the invite flow unassisted.

## M7: Polish and closed beta

**Scope**: Finnish translation, PWA install and mobile layout pass, web push notifications to the installed app, keyboard navigation and focus states everywhere, empty and error states, the performance budgets, settings screens, an accessibility pass, a final visual polish pass against the reference, and a two-week beta with about 20 members.

**Acceptance criteria**:

- All performance budgets met.
- A mention or DM reaches an Android phone and an iPhone with the app installed to the home screen, and tapping it opens the right message.
- No open bugs rated severe after the beta's last week.
- Beta testers say they would move their chat over. We ask them directly.

## M8: Launch

**Scope**: invite the whole community, monitoring and alerting tuned, operations runbook for upgrades, backups and incidents, a feedback channel.

**Acceptance criteria**: the success criteria in the product brief, checked after one month.

## M9: Native Linux client

**Scope**: a Rust desktop client reusing the protocol knowledge in `packages/stoat` and the domain model, the LiveKit Rust SDK with VA-API or NVENC encoding, and the same visual design. Planned in detail after launch, once the web client's design is settled.

**Acceptance criteria, initial**: a 1080p60 share from Linux at under one CPU core, and idle memory well below the Electron app.
