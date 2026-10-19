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
| M4.3 | Discord feature gaps: whole-server search, spoiler attachments, display switches, status expiry, image cropper, category mute, votes, streamer mode, who reacted, and small extras | M4.8 | m4.3 plan |
| M4.4 | Concord's own layer beside Stoat: sessions, permissions, storage, live events | M4 | architecture section 11 |
| M4.5 | Discord-style menus, GIFs, quick voice controls, server tags | M4.4 | m4.5 plan |
| M4.6 | UI motion and design parity with Discord, from a measured spec | M4.5 | [discord-ui-motion-spec.md](design/discord-ui-motion-spec.md) |
| M4.7 | Moderation, voice and text: moving people between calls, server mute and deafen, permissions that work, timeouts, slow mode, bulk delete, the audit log, reports | M4.5 | m4.7 plan |
| M4.8 | Everyday usability: quick switcher and shortcuts, opening at the first unread, a mentions inbox, My Account in the app, server folders, drafts that survive a reload, message sounds, an offline banner, appearance settings, notes, search filters | M4.5 | m4.8 plan |
| M4.9 | A Supporter global role beside moderator and admin: custom CSS on the profile card, and server creation | M4.8, the account runner | m4.9 plan |
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

## M4.3: Discord feature gaps

Added on 2026-10-18 at Jaakko's request, from [discord-gap-research.md](discord-gap-research.md), and approved the same day. It takes the number left free between M4.2 and M4.4. **Plan only for now**: `m4.3-plan.md` is written now, and building starts once M4.6, M4.7 and M4.8 are all done. It runs before M4.9 and M5. Testing stays light: unit tests for risky core logic, `pnpm verify` before every commit, Jaakko on production.

**Scope**, the research's top 10 in its order:
1. **Search the whole server.** Fan out over the channels a member can read, with a cap, and say which channels were searched. Add `has:` (link, image, file, video), `mentions:` and `in:`, and oldest/relevance sort. Content filters scan pages within a bound and say when coverage is incomplete. A server-wide search in Stoat stays the upstream fix.
2. **Phone calls in the background: a probe, not a fix.** On Android and iPhone, with the installed app, check whether a call survives a locked screen and switching apps. The result goes into M7's scope. No fix is promised before it.
3. **Display switches** in Appearance:
   - link and image previews, and reactions, on or off,
   - spoiler reveal (on click, on hover in channels I moderate, always).
4. **Custom status "clear after"**: 30 minutes, 1 hour, 4 hours, today, or never. The expiry lives in a `concord:` key, and any client that sees it passed clears the status. It is late when every device was closed.
5. **Spoiler attachments**: a spoiler toggle per attachment in the composer, stored by a filename prefix like Discord's (`SPOILER_`). Concord blurs them until clicked.
6. **A cropper for avatars, banners and server icons**: drag and zoom before upload, cropped in the browser, no new dependency.
7. **Categories: mute and mark as read**, from the category's menu, applied to every channel in it. New channels added later follow the category's mute through a `concord:` key.
8. **A vote helper**: a composer action that posts a question with numbered options and seeds their reactions. Results show live under it. It is an informal vote: one reaction per option, no deadline, no secrecy, and the UI says so.
9. **Streamer mode**: a switch and a keybind. While on, it hides email, invite links and codes, and notification contents, and silences sounds.
10. **Who reacted**: clicking a reaction opens the full list, with a tab per emoji.

**Small extras**, each client only and about a day:
- **Role icons**: upload in the role editor, shown beside names in chat and the member list. Stoat has the field.
- **Transfer server ownership** in server settings, through M4.8's MFA ticket helper.
- **An unread badge on the installed app's icon** (Badging API), and a dot on the favicon.
- **Editable keybinds for every shortcut**, not only voice, in the existing Keybinds list.
- **Apply to every channel in a category**: in the channel permission editor, copy one override to the category's other channels, which stands in for category permissions.

**Left out, from the research**:
- threads, forums and native polls: Stoat has none;
- webhooks: cut in M4.7;
- AutoMod, scheduled events, onboarding and connections: each needs the layer and is large;
- video backgrounds, picture-in-picture and phone screen share: large or platform-bound;
- Discord's underline and subtext markdown: it would change how `__text__` renders in existing messages;
- accessibility: in-app reduced motion, GIF autoplay, animated emoji (deferred to M7's accessibility pass).

**Acceptance criteria**:
- A search typed once finds a message in any channel of the server the member can read, and the panel names the channels it covered.
- Each switch in item 3 changes what a reload shows.
- A status set to clear after 30 minutes is gone on the next client to open after that.
- A spoiler image, a cropped avatar, a muted category, a vote, streamer mode and the who-reacted list each work on production, as Jaakko checks.
- The background-call probe's results for both phones are written down.

**Device tests**: an Android phone and an iPhone for item 2, and a second device for the status expiry.

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

## M4.6: UI motion and design parity

Added on 2026-10-16 at Jaakko's request. The spec is [design/discord-ui-motion-spec.md](design/discord-ui-motion-spec.md): Discord's animations, popups, layout and colours, measured frame by frame from a recording. Its section 9 is the acceptance checklist. A Sonnet agent audited the client against sections 2, 4.1 to 4.16 and 9 on 2026-10-16. Plan: [m4.6-plan.md](m4.6-plan.md), approved by Jaakko on 2026-10-16 with all 13 decisions, with the audit re-checked against the code. The sub-tasks below cover only what it found partial or missing.

**A guide, not a copy.** Jaakko, 2026-10-16: Concord should feel like Discord while keeping its own identity. So:
- the spec's behaviour, timings, layout and motion are the target,
- its colours are not. Colours stay Concord's tokens, and the spec's values are only a check that nothing feels off.

Where the spec's motion and M4.2's rules (client.md section 9) differ, the spec wins, and sub-task 1 changes the rules and their lint to match.

**Decided**, 2026-10-16:
1. **Concord's cyan `--accent` stays** for everything the spec draws in Discord's brand colour: links, the mention highlight, the spinner, toggles and the voice stage's tint.
2. **Text keeps its contrast**: `--text-muted` for muted channels, and `--text-secondary` for timestamps and channel names. The spec's `#46464a` on black is about 2.2:1, below the AA contrast that M4.2 kept.
3. **Settings becomes a modal over the app**, for user, server and channel settings alike. The shell stays mounted under the settings routes, which is a routing change.

**Sub-tasks**, in dependency order. Each names its spec section, the change, the files, and its acceptance line from spec section 9.

*a. Design tokens and rules*

1. **Tokens and motion rules** (spec 1, 2, 5.3).
   - Change:
     - map each spec token to the existing one (table below), keeping Concord's colour values,
     - add what the behaviour needs to the same file: durations of 60, 130, 300, 550 and 1800 ms, the spec's curves, the scrollbar thumb and width, and the settings nav states, in Concord's palette,
     - split `--popout-w` (400 px) into the 300 px profile popout and a 456 px side panel width.
   - Rules: amend client.md section 9 and its lint, so that:
     - hover changes are instant,
     - the settings accordion may animate `grid-template-rows`,
     - the scroll may be a spring, and durations may reach 550 ms with the spinner's 1.8 s loop,
     - settings close with a fade and scale.

     The pill keeps M4.2's `clip-path`, which already passes, and adds the slide.
   - Files: `packages/ui/src/tokens.css`, `packages/ui/src/base.css`, `docs/client.md` section 9, `tools/lint/motion.ts`, `tools/live/src/motion.ts`.
   - Accept: in place of section 9's colour line, no colour in a component is hard-coded. Every colour is a token, and the motion lint passes with the new rules.
2. **Reduced motion** (spec 5.3). Every duration in the spec becomes 0 ms under `prefers-reduced-motion: reduce`, fades included. The spring scroll jumps. The spinner keeps turning. This replaces M4.2's rule that fades stay and loops stop.
   - Files: `packages/ui/src/tokens.css`, `packages/ui/src/motion.ts`, `docs/client.md` section 9, `tools/live/src/motion.ts`.
   - Accept: section 9 has no line for it. From spec 5.3: with reduced motion on, `motion.ts` records no animation longer than 0 ms except the spinner, and settings scroll in one jump.

*b. Instant hover*

3. **Remove hover transitions** (spec 1). Background and colour transitions on hover go from:
   - buttons (`Button` and `IconButton`, which carry the message action bar, dock, settings X and header icons),
   - server rail tiles,
   - call controls,
   - the GIF star.

   Press scale and toggle knobs stay; they aren't hover.
   - Files: `packages/ui/src/Button.svelte`, `packages/ui/src/IconButton.svelte`, `apps/web/src/lib/shell/ServerRail.svelte`, `apps/web/src/lib/call/CallView.svelte`, `apps/web/src/lib/conversation/GifStar.svelte`.
   - Accept: "No CSS transition on channel, message, member or settings nav hover. Verify with a 30 fps screen recording: the change is complete in one frame." Widened to these elements, per spec section 1.

*c. Shared helpers*

4. **Tooltip manager** (spec 4.3, 5.1).
   - Show at once, with no 400 ms delay, and fade in over 100 ms.
   - Crossfade between targets, with one element per tooltip instead of one shared element.
   - Add the 5 px caret, 8 by 12 px padding, weight 600 and the floating background.
   - Placement per call site: channel icons and the gear above, the rail to the right, the side panel's close below.
   - Files: `packages/ui/src/tooltip.ts` and its callers.
   - Accept: "Tooltips have zero show delay, fade in ~100 ms, crossfade between targets, correct side per element (channel icons top, rail right, gear top, panel close bottom)."
5. **Spring scroll** (spec 4.13). A critically damped spring at about 12.75 rad/s. It keeps its velocity when a new target comes mid-scroll and stops on wheel or touch. No `scrollIntoView` smooth scrolling.
   - Files: a new helper in `packages/ui/src/motion.ts`.
   - Accept: "Sub-item click scrolls with a fixed ~550 ms spring (distance does not change the duration) and retargets without a jump."

*d. Components*

6. **Rail pill and rail tooltips** (spec 4.4, 4.3).
   - The pill: selected 40 px, not 38. It slides in from the left as it grows, over 200 ms, and shrinks in 100 ms, not 150 ms both ways. It brightens as it grows.
   - Server tooltips go to the right of the icon: the name at 16 px bold, then "Muted" when the server is muted.
   - Files: `apps/web/src/lib/shell/ServerRail.svelte`.
   - Accept: "Pill grows to 20px on hover in ~200 ms with slide-in from the left, 40px when selected, shrinks in ~100 ms." Plus the tooltip line.
7. **Channel row actions** (spec 4.1).
   - Hover and selected rows show "Invite to channel" and "Edit channel", and "Open chat" on voice channels, each with a tooltip above.
   - Hover text goes to `--text-strong`.
   - Files: `apps/web/src/lib/shell/ChannelSidebar.svelte`.
   - Accept: the tooltip line ("channel icons top"), and "No CSS transition on channel … hover".
8. **Message action bar** (spec 4.2).
   - The floating surface `--surface-1` and 32 px height. Three recent reactions and a divider before the icons, from the quick reactions M4.5 built.
   - Files: `apps/web/src/lib/conversation/ActionBar.svelte`, `apps/web/src/lib/conversation/MessageItem.svelte`.
   - Accept: "No CSS transition on … message … hover", with the bar on the same surface as tooltips and popouts.
9. **Scrollbars** (spec 4.6).
   - 8 px, rounded, visible only while the pointer is over that scroller, in Concord's thumb colour.
   - Chromium ignores `::-webkit-scrollbar` wherever `scrollbar-width` or `scrollbar-color` is set, so `base.css` uses one approach per engine.
   - Files: `packages/ui/src/base.css`.
   - Accept: "Scrollbars are 8px, rounded, … visible only while hovering their scroller", in Concord's thumb colour rather than `#585862`.
10. **Image loading** (spec 4.8).
    - A flat average colour from the existing thumbhash, then the image fades in over 200 ms, and embed images too.
    - Avatars start as a black circle and fade in.
    - Files: `apps/web/src/lib/conversation/Attachment.svelte`, `apps/web/src/lib/conversation/Embed.svelte`, `apps/web/src/lib/view/media.ts`, `packages/ui/src/Avatar.svelte`.
    - Accept: "Images show an average-color box first, then fade in over ~200 ms."
11. **Channel skeletons** (spec 4.7).
    - A static message skeleton while a channel loads, with varied bar widths and no shimmer.
    - Member list group headers render first.
    - Content swaps in without a fade.
    - Files: `apps/web/src/lib/conversation/MessageList.svelte`, `apps/web/src/lib/shell/MemberList.svelte`, a new skeleton component.
    - Accept: "Text channel switch shows a static skeleton, then swaps in without a fade. Voice channel switch is instant."
12. **Voice stage and side chat** (spec 4.9, 4.7).
    - The stage: the spec's dark-to-light gradient with a glow at the bottom, in Concord's accent instead of blue-violet, rounded inside black, with the participant count in its header.
    - The empty state: emoji, bar and a 24 px title, with a "Join voice" button.
    - The side chat opens with the stage. It's 456 px wide, after an 8 px gap, with a chat icon in its header, and its close tooltip "Close" sits below.
    - Files: `apps/web/src/lib/call/CallView.svelte`, `apps/web/src/lib/call/VoiceChat.svelte`, `apps/web/src/lib/shell/Shell.svelte`, `apps/web/src/lib/view/shell.svelte.ts`.
    - Accept: "Voice channel switch is instant", and the tooltip line ("panel close bottom").
13. **User panel** (spec 4.10).
    - On hover, the status line slides up and out, and the username slides in from below, over 130 ms. Leaving reverses it.
    - Icon buttons get the selected-row background instantly.
    - The panel uses the subtle border and 8 px radius.
    - Files: `apps/web/src/lib/shell/UserDock.svelte`, `apps/web/src/lib/shell/Shell.svelte`.
    - Accept: "User panel subtext slides up to reveal the username in ~130 ms."
14. **Profile popout** (spec 4.16).
    - 300 px wide, 12 px left of the member list, opening at full opacity at once.
    - Clicking another member re-anchors it at once, instead of closing and reopening. The clicked row keeps its hover background.
    - Banner 105 px, name 20 px. The banner's round buttons, role chips with "+N", and a "Message @user" input.
    - Files: `packages/ui/src/Popover.svelte`, `apps/web/src/lib/people/ProfileCard.svelte`, `apps/web/src/lib/people/UserPopout.svelte`, `apps/web/src/lib/shell/MemberList.svelte`.
    - Accept: "Profile popout is 300px wide, opens instantly to the left of the member list, aligned with the clicked row, and re-anchors instantly when another member is clicked."
15. **Spinner** (spec 4.14). The wandering cubes in Concord's accent, in place of "Loading…" text: app start, emoji picker, and loading settings pages.
    - Files: a new `packages/ui/src/Spinner.svelte`, `apps/web/src/routes/(app)/app/+layout.svelte`, `apps/web/src/lib/emoji/EmojiPicker.svelte`.
    - Accept: "Wandering-cubes spinner matches the keyframes in 4.14."
16. **Settings as a modal** (spec 4.11), per decision 3.
    - Inset 40 to 48 px over a 72 % backdrop, with the modal radius and border.
    - Open: the backdrop fades in over 100 ms, then the modal fades and scales from 0.97 over 150 ms after 60 ms. Close mirrors it in 150 ms.
    - A 48 px header row holds the title and X.
    - Files: `apps/web/src/lib/settings/SettingsFrame.svelte`, `apps/web/src/routes/(app)/app/+layout.svelte`, `apps/web/src/routes/(app)/app/channels/+layout.svelte`, and the settings, server-settings and channel-settings routes.
    - Accept: "Settings opens as an inset modal (about 40-48px from window edges) over a ~72% black backdrop. Backdrop ~100 ms, modal fade + scale 0.97 to 1 in ~150 ms after a ~60 ms delay. Close mirrors it in ~150 ms."
17. **Settings sidebar** (spec 4.12, using 5).
    - Layout: a profile block, a search box, grouped navigation with labels, a red "Log out", and the version. Items 36 px.
    - Accordion: the selected item lists its page's sections, and the old group collapses as the new one opens over 300 ms.
    - The active bar slides to the clicked section over 150 ms at the click, even when the page can't scroll.
    - Scroll-spy for wheel scrolling.
    - A page swap resets the scroll position.
    - Files: `apps/web/src/lib/settings/SettingsFrame.svelte`, `apps/web/src/lib/settings/Settings.svelte`, and the section components.
    - Accept: "Settings page swap is instant and resets scroll. The sidebar accordion collapses the old group and expands the new one together in ~300 ms ease-out cubic." And "Active sub-item bar moves at click time and slides in ~150 ms. It moves even when the content cannot scroll further."
18. **Settings content patterns** (spec 4.15).
    - A centred 700 px column.
    - 20 px section headings.
    - One shared toggle, replacing three copies, with the accent for on.
    - An info banner.
    - Files: `apps/web/src/lib/settings/*`, `apps/web/src/lib/notify/NotificationsSection.svelte`, `apps/web/src/lib/admin/PermissionList.svelte`, `packages/ui/src/Button.svelte`, a new `packages/ui/src/Toggle.svelte`.
    - Accept: section 9's colour line becomes: the settings pages use only tokens, and look alike, with one toggle and one button style.

**Token mapping**, spec to existing, in `packages/ui/src/tokens.css`. Values stay Concord's, as decided. "Close" means within a few units, so nothing to change:

| Spec | Existing | Change |
|---|---|---|
| `--bg-app` | `--surface-0` #000 | none |
| `--bg-floating` | `--surface-1` #0a0a0c | none. Tooltips and the action bar move onto it from `--surface-5` and `--surface-2` |
| `--bg-input` | `--surface-2` #101013 | none |
| `--bg-rail-button` | `--surface-3` #131313 | none |
| `--bg-row-hover` | `--hover-overlay`, white 6 % | none. #0f0f0f on black against the spec's #121212 |
| `--bg-row-selected` | `--surface-5` #242426 | none |
| `--bg-settings-nav-hover` | `--hover-overlay` | none |
| `--bg-settings-nav-selected` | `--surface-5` #242426 | none |
| `--border-subtle` | `--border-subtle` #1e1e20 | none |
| `--border-header` | `--border-subtle` | none, 2 units off |
| `--border-floating` | `--border-default` #26262a | none |
| `--border-modal` | `--border-subtle` | none. The settings modal uses it |
| `--divider-settings` | `--border-faint` #18181a | none. Settings starts using it |
| `--text-strong` | `--text-strong` #dcdcdf | none, inside the measured range |
| `--text-default` | `--text-muted` #81828a | none |
| `--text-muted-channel` | `--text-muted` #81828a | none, decided for contrast |
| `--text-timestamp` | `--text-secondary` #96979e | none, decided for contrast |
| `--text-link` | `--link`, the accent | none, decided |
| `--brand` | `--accent` #1fb6d1 | none, decided |
| `--brand-spinner` | `--accent` | none |
| `--backdrop` | `--scrim` .73 | none |
| `--scrollbar-thumb` | none, `--surface-5` today | new token, a lighter grey from Concord's palette, so the thumb shows on hover |
| `--scrollbar-width` | none | new token, 8 px |
| `--radius-row` | `--radius-md` 8 px | none |
| `--radius-floating` | `--radius-md` and `--radius-lg` | menus, popovers and the dock move to `--radius-md` |
| `--radius-modal` | none, dialogs use `--radius-lg` | new token, 10 px |
| `--radius-server-icon` | `--radius-lg` 12 px | none |
| `--font` | `--font-sans` Figtree | none, an open font as section 8 asks |

**Deferred**: what Concord doesn't have.
- **The "more active threads" popout and the hover-intent helper** (spec 4.5, 5.2): Stoat has no threads, so it waits for a backend of our own. The helper has no other user yet.
- **Server folders and their tooltip** (spec 3, 4.3): M4.8 creates the folders, and the tooltip comes with them.
- **The Appearance page's theme swatches** (spec 4.15): cut with M4.8's light theme.
- **"Forward" in the action bar** (spec 4.2): Stoat has no forwarding.
- **Activity cards and the "now playing" subtext** (spec 4.10, 4.16): Stoat has no activities. The user panel slides between the custom status and the username instead.
- **Nameplates** (spec 3) and the settings "NEW" badge (spec 2): no such features.
- **The "Server Boost" page** (spec 4.14): no boosts. The spinner is used elsewhere.

**Acceptance criteria**: every line of spec section 9 passes, checked with a 30 fps recording and the live motion check, with two exceptions:
- the threads popout, deferred above,
- the colour line, since colours are Concord's own. Instead, no component hard-codes a colour.

## M4.7: Moderation, voice and text

Added on 2026-10-15 at Jaakko's request, as M4.6, and renumbered M4.7 on 2026-10-16. Plan: [m4.7-plan.md](m4.7-plan.md), awaiting sign-off.

**Scope**:
- **Voice**: following a move, dragging people between voice channels and "Move to", and server mute and deafen in the participant menu, enforced by Concord clients until Stoat is fixed.
- **Permissions that work**: every permission in the role editor has a visible effect, or a reason shown when it's missing, and members can set their own server nickname and avatar.
- **Text**: timeouts, slow mode, deleting a banned user's recent messages, reasons, other people's nicknames and avatars, deleting many messages at once, and the audit log.
- **Reports**, through Concord's own layer, to a server's moderators or the app's admins.
- **Protecting history**: hourly snapshots of messages and files with a restore tool, dangerous permissions hard to hand out by accident, and a guard bot that strips the roles of anyone mass-deleting and alerts the owner.
- **Upstream**: a fix for Stoat's voice moderation bug.

**Acceptance criteria**:
- A moderator drags someone into another voice channel, and their call follows without a click.
- A server mute silences the target within seconds, and they can't undo it.
- Those without a permission see none of its actions, or a reason why not, never a blank screen or a misleading error.
- Every moderation action shows in the audit log with its reason.
- A reported message reaches the right moderators, with its text kept as evidence.
- A deleted channel, and messages deleted in bulk, can be restored with their files, losing at most the last hour.
- A moderator deleting others' messages en masse over the API loses their roles before the 30th, and the owner is told.

## M4.8: Everyday usability

Added on 2026-10-16 at Jaakko's request, from a Sonnet audit of the client against Discord's everyday features. A plan, `m4.8-plan.md`, is written before work starts. Moderation is M4.7. M5, M6 and M7 already cover the desktop apps, registration and the email-link account page, the Finnish translation, PWA install, mobile push and the accessibility pass.

**Scope**, most valuable first:
- **Moving around fast**: a quick switcher on Ctrl+K, which also wires up the DM list's dead "Find or start a conversation" box. Keyboard shortcuts as on Discord:
  - Alt+Up and Down through channels, Alt+Shift+Up and Down through unread ones,
  - Ctrl+Alt+Up and Down through servers,
  - Esc to mark a channel read,
  - Ctrl+/ for the list of shortcuts.
- **Not losing your place**: a channel opens at the first unread message, with a "N new messages" bar. A mentions inbox gathers unread mentions across servers.
- **My Account in the app**: password, email, TOTP, and the list of sessions with logging out others. Stoat has every route. M6's standalone page then serves only what email links open.
- **The server list**: reordering by drag, written to Stoat's `ordering`, and server folders in a synced `concord:` setting.
- **Not losing work**: drafts survive a reload, and collapsed categories stay collapsed.
- **Notifications**: message and mention sounds, and ignoring @everyone and role mentions per server.
- **Knowing when you're offline**: a banner while the connection is down or reconnecting.
- **Appearance**: a compact message layout and the font size. The light theme is cut, decided 2026-10-16.
- **Private notes** on people, in a synced `concord:` setting.
- **Search**: before and after dates, "from someone" as a filter on the results, and a member list filter.
- **Smaller polish**:
  - zoom in the image viewer,
  - a warning before a masked link opens somewhere else,
  - Stoat's NSFW flag on channels, with a confirmation before entering,
  - recording voice messages, uploaded as audio files.

**Not in Stoat, so not here**:
- **Server-wide search**: Stoat searches one channel at a time. It's the likeliest upstream pull request, and decision gate criterion 2.
- **No route or field in Stoat at all**: threads, forum and stage channels, polls, stickers, forwarding, edit history, and invite expiry and use limits.
- **The soundboard and activities.**

**Acceptance criteria**:
- Every shortcut above works, and Ctrl+/ lists them.
- A channel with unread messages opens at the first of them.
- A member changes their password and logs out another session without leaving the app.
- Server order and folders, drafts and collapsed categories survive a reload, and the server order and folders sync to a second device.
- Losing the connection shows the banner within 2 s, and it clears on reconnect.

## M4.9: Supporter role

Added on 2026-10-18 at Jaakko's request. **Plan only**: nothing is built until `m4.9-plan.md` is written, challenger-reviewed and signed off. Runs after M4.3. A Nitro-like perk tier, under Concord's own name, with no payment: admins grant it by hand.

**What exists**: the layer knows two global roles, admin (`ADMIN_USER_IDS`) and moderator (a layer list), both managed from Administration through the host-side account runner (`deploy/account-runner.py`). Server creation is Stoat's `restrict_server_creation` list, which the layer reads as the server-creator gate. Changing it restarts `api`.

**Scope**:
- **The role.** A third global role, *Supporter* (name to be decided), stored in the layer and granted or removed by admins in Administration, with an audit line for each change. Supporters show a small mark on their profile card and member row.
- **Server creation.** A supporter is added to `restrict_server_creation` by the runner, with a per-supporter cap on servers they own, checked by the layer before Create server is offered. Removing the role stops new servers and leaves existing ones alone. The plan decides whether to batch runner changes so `api` restarts at most once a few minutes.
- **Custom CSS on the profile card.** A supporter writes CSS for their own card in Profile settings, with a live preview. Other Concord clients render it on the popout and the DM profile panel. Rules, since the CSS runs in other people's browsers:
  - **Scoped**: it applies only inside the card, rendered in a shadow root with `contain: strict` and `overflow: hidden`, so nothing escapes the card's box.
  - **Sanitised in the layer**, with a CSS parser:
    - **properties** come from an allowlist: colours, gradients, borders, radius, shadows, fonts, spacing, transforms, filters within limits, and keyframe animations;
    - **removed**: `position: fixed` and `sticky`, `@import`, `@font-face` from outside Autumn, `url()` that isn't an Autumn file, `expression`, behaviours and anything that loads from another host;
    - **capped**: the size is limited to about 8 KB.
  - **Viewer controls**: a setting to show plain cards everywhere. Reduced motion stops custom animations, and streamer mode shows plain cards.
  - **Stays readable**: the name, roles and buttons keep Concord's own layout. CSS styles the card's surfaces through named parts (`::part(banner)`, `::part(body)` and so on), not the app's markup.
  - **Other clients** (Stoat's own) see the ordinary profile.
- **Extras the plan may add**: an animated avatar and banner (GIF or WebP) for supporters, a profile theme colour pair, and more favourite GIF slots. Each is checked against Stoat's own limits first.

**Decisions for the plan**: the role's name and mark; the server cap; whether supporters may also create more than one invite-on-request without review; whether custom CSS reaches the member list row or only the card; and whether it is free for everyone during the beta.

**Acceptance criteria**:
- An admin grants the role, and the person can create a server within the cap. Removing the role takes it away again.
- A supporter's custom card shows on another member's client, and planted CSS cannot escape the card, load another host, cover the app or hide its controls. The plan lists the cases to try.
- "Show plain cards" and reduced motion both work.

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

**Scope**: Finnish translation, PWA install and mobile layout pass, swipe navigation on phones (below), web push notifications to the installed app, keyboard navigation and focus states everywhere, empty and error states, the performance budgets, settings screens, an accessibility pass, a final visual polish pass against the reference, and a two-week beta with about 20 members.

**Swipe navigation**, added 2026-10-18 at Jaakko's request, as on Discord's phone app (client.md section 3):
- **Panels follow the finger.** In a conversation, a swipe right drags the server rail and channel list in from the left, and a swipe left drags the member list in from the right. Each tracks the finger 1:1 and settles open or shut by distance and flick velocity, with the spec's spring.
- **Back by swipe.** From a conversation, an edge swipe right returns to the channel list. Settings pages, threads and the profile sheet close the same way. The browser's own back-swipe still works.
- **Rules.** Horizontal intent is decided in the first few pixels, so vertical scrolling never jitters. Swipes don't start inside the composer, a code block, an image being zoomed or a horizontally scrolling row. Reduced motion snaps instead of springing. Every panel stays reachable by button.

**Acceptance criteria**:

- All performance budgets met.
- On an Android phone and an iPhone, with the app installed, swipe navigation opens and closes both panels and goes back from a conversation. It follows the finger at 60 fps with no accidental opens while scrolling.
- A mention or DM reaches an Android phone and an iPhone with the app installed to the home screen, and tapping it opens the right message.
- No open bugs rated severe after the beta's last week.
- Beta testers say they would move their chat over. We ask them directly.

## M8: Launch

**Scope**: invite the whole community, monitoring and alerting tuned, operations runbook for upgrades, backups and incidents, a feedback channel.

**Acceptance criteria**: the success criteria in the product brief, checked after one month.

## M9: Native Linux client

**Scope**: a Rust desktop client reusing the protocol knowledge in `packages/stoat` and the domain model, the LiveKit Rust SDK with VA-API or NVENC encoding, and the same visual design. Planned in detail after launch, once the web client's design is settled.

**Acceptance criteria, initial**: a 1080p60 share from Linux at under one CPU core, and idle memory well below the Electron app.
