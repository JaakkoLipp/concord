# Concord: client specification

Status: signed off 2026-10-12, layer 3. Covers M1 and M2 in detail. Section 10, voice for M4, signed off with m4-plan.md on 2026-10-14.
Read [architecture.md](architecture.md) first. This document says how the client is built. The architecture says why.

## 1. Scope

The client is the `(app)` route group of `apps/web`, plus the `stoat`, `domain` and `ui` packages. It runs:

- in desktop browsers at `concord.jaalip.com/app`,
- inside the Electron shell, which loads the same URL,
- on phones as an installed web app.

The website pages in the `(site)` group get their own spec before M6.

## 2. Technology and dependencies

Every runtime dependency must earn its place. The list below is the whole budget for M1 and M2. Adding to it needs a one-line justification in the pull request.

| Purpose | Choice | Loaded |
|---|---|---|
| Framework | Svelte 5 with runes, SvelteKit 2, TypeScript strict, Vite | Always |
| Styling | Svelte scoped CSS with design tokens as CSS custom properties. No CSS framework. | Always |
| Icons | Lucide through `@lucide/svelte`, deep imports per icon. ISC licence. | Per icon, tree-shaken |
| Font | Figtree through `@fontsource-variable/figtree`, self-hosted, variable weight. OFL. The Latin subset is about 20 KB. Latin Extended and italic load on first use. | Always |
| Stoat API types | `openapi-typescript`, generated at build time. Types only, no runtime code. | Build only |
| Unicode emoji data | `emojibase-data` 15.0, matching the Twemoji 15.0 images: names, GitHub shortcodes, keywords, categories. About 100 KB gzipped. | Lazily, on first picker or `:` autocomplete |
| Emoji images | Twemoji SVGs, served from our origin | Per emoji, cached |
| Composer editor | CodeMirror 6: `@codemirror/state`, `view` and `commands`. MIT. Chosen over our own editor on 2026-10-12 (m2a-plan.md decision 1). About 87 KB gzipped. | Lazily, when the composer first mounts |
| Code highlighting | highlight.js core with a short language list | Lazily, on first code block |
| Math | KaTeX | Lazily, on first `$$` block |
| TOTP setup QR code | `uqr` 0.1.3, MIT, a port of Project Nayuki’s generator with no dependencies, about 4 KB gzipped. Added in M4.8 (task 9, decision 1): authenticator apps scan the secret, and drawing a QR code by hand isn't worth our own code. | Lazily, on the two-factor setup step |
| Voice | `livekit-client`, about 144 KB gzipped, and `@sapphi-red/web-noise-suppressor` for RNNoise, MIT, about 220 KB of wasm and worklet | Lazily, on first voice join |

Not used: a component library, a state library, a date library, a virtual-list library, a markdown library, Storybook. The platform covers dates and plurals through `Intl`. The rest is ours, because it is small and central to the feel.

## 3. Package structure

```
packages/stoat/      Talks to Stoat. Nothing else imports Stoat types.
  api/               Generated OpenAPI types and a typed fetch wrapper.
  rest.ts            Auth header, Idempotency-Key, 429 handling, error normalisation.
  socket.ts          WebSocket: connect, Ready, Ping, backoff, cold-start reconnect.
  map/               Stoat objects to domain entities, one file per entity.
  capabilities.ts    Behaviour switches by Stoat version.
  fixtures/          Recorder and replay transport used by the contract tests.

packages/domain/     Framework-light core, written as .svelte.ts modules using runes.
  entities.ts        User, Member, Server, Role, Channel, Message, Emoji, VoiceState, ...
  store/             Normalised reactive maps and per-channel message windows.
  actions/           Commands the UI calls: send, edit, react, ack, join voice, ...
  permissions.ts     Port of Stoat's permission calculation, tested against its rules.
  presence.ts        Idle detection and status changes.

packages/ui/         Tokens and presentational components shared with the website.

apps/web/src/routes/(app)/   Screens that compose ui components with domain state.
```

**The domain package uses Svelte runes.** Fine-grained reactivity on normalised maps is the main performance tool for a chat UI, and runes give it without a state library. The native client will be Rust, so it reuses the protocol knowledge and fixtures, not this code.

**Dependency direction**: routes depend on `domain` and `ui`. `domain` depends on `stoat` only through an interface, `Backend`, so tests can swap in the replay transport. `ui` depends on nothing but tokens.

## 4. Data flow

### 4.1 Store

Entities live in maps keyed by ID: users, servers, roles by server, channels, members by server, emojis, unreads, voice states, relationships, typing, synced settings.

Each open channel has a **message window**: an ordered list of message IDs covering one contiguous stretch of history, plus flags for whether the window reaches the newest message and the oldest. Messages outside any window are dropped.

Derived views are `$derived` selectors: the ordered channel list per server, the grouped member list, server unread and mention badges, the DM list sorted by last activity.

### 4.2 Applying events

- Events are applied in arrival order. Every handler is an idempotent upsert, so a REST response and its matching WebSocket event can arrive in either order.
- On `Ready`, the store replaces everything `Ready` covers, then runs the cold-start steps from section 4.3 of the architecture document.
- Unknown event types are logged in development and ignored in production.

### 4.3 Optimistic updates

| Action | Optimistic behaviour | Reconciliation |
|---|---|---|
| Send message | Appears instantly, dimmed, with a client-generated ID used as `Idempotency-Key`. | Stoat echoes that key as the message's `nonce`. The echo replaces the pending message in place. On failure the message turns red with retry and delete. |
| Edit | Content changes instantly with an "edited" marker. | Reverted with a toast on failure. |
| React, unreact | Count changes instantly. | Reverted on failure. |
| Delete | Removed instantly. | Restored on failure. |
| Ack | Unread marker clears instantly. | At most one ack per channel every 2 seconds, plus a trailing ack for the newest message. Stoat applies acks a few seconds late, so older unread state fetched meanwhile never brings a marker back. |

### 4.4 Rate limits

Stoat exposes `X-RateLimit-Bucket`, `-Limit`, `-Remaining` and `-Reset-After`. Its windows are a fixed 10 seconds. The REST wrapper (m2c-plan.md task 1):
- knows up front that every `/servers/{id}/…` route shares one bucket of 5 per server, and learns every other bucket from its first answer, sending one request at a time until then,
- reserves a slot for each request as it checks the bucket, so a burst started together waits instead of overrunning it,
- takes a bucket as reset a second after `x-ratelimit-reset-after` says, since Stoat's window ends up to 0.8 s later than that,
- retries a 429 after its wait, for up to 60 seconds in all, and surfaces anything else at once.

Typing events are sent at most every 2.5 seconds, as Stoat's own client does.

## 5. Routes and layout

| Route | Screen |
|---|---|
| `/app` | Opens at Friends, the direct messages home. A settings URL reload still opens over the last visited channel. |
| `/app/channels/@me` | Friends: online, all, pending, blocked. |
| `/app/channels/@me/<channel>` | DM or group DM. |
| `/app/channels/@me/<channel>/<message>` | Same, jumped to a message. Added in M2a. |
| `/app/channels/<server>/<channel>` | Server channel. |
| `/app/channels/<server>/<channel>/<message>` | Same, jumped to a message. |
| `/login`, `/login/verify/<token>` | Login with MFA, email verification, onboarding. |
| `/account` | Standalone account and security page, also shown inside settings. |

**Until M6**, Caddy gives our app only `/app`, and every other path, including Stoat's email links, goes to Stoat's own client. Our login and account pages are therefore served at `/app/login` and `/app/account` until M6 moves them to the top-level paths above. Verification links open in Stoat's client until then.

Settings, profile popouts, the emoji picker and image viewers are overlays, not routes. Settings uses SvelteKit shallow routing over the mounted shell, so a call and the conversation stay as they were, and the browser's back button closes it. Its URLs, `/app/settings/<section>`, `/app/server-settings/<server>/<section>` and `/app/channel-settings/<channel>/<section>`, still work from a link or a reload: they open the last channel, or one in that server, and settings over it (`settings/modal.svelte.ts`).

**Desktop layout**: a CSS grid with four columns, sized from the design tokens in section 9: server rail, channel or DM sidebar, conversation, and member list or DM profile panel. The user dock sits at the bottom and spans the rail and sidebar columns, 336 px wide, as in the reference.

**Narrow layouts**:

- Below about 1100 px wide, the member list hides behind its header toggle.
- Below about 700 px, the client switches to a single column. The sidebar and member list become slide-over panels opened by swipe or button, as on Discord's phone app. This layout serves the installed phone app.

## 6. Conversation

### 6.1 Message list

- **Window**: at most about 200 messages in the DOM. Scrolling near either edge loads a page of 100 and trims the far side. "Jump to present" replaces the window with the newest page.
- **Grouping**: consecutive messages from the same author within 7 minutes form a group with one avatar and name. A reply, a day boundary or the "new messages" divider starts a new group.
- **Continuations** show their timestamp on hover in the avatar gutter.
- **Dividers**: a day divider, and a "new messages" divider at the user's last acknowledged message.
- **Hover action bar**: react, reply, edit if own, and a more menu with pin, copy link, copy ID and delete.
- **Scroll anchoring**: when the user is at the bottom, new content and late-loading media keep them pinned there. Otherwise, prepending history keeps the visible message in place. A `ResizeObserver` per message handles media that changes height.
- **No layout jumps**: image attachments reserve space from the width and height Stoat stores in file metadata. Embeds that arrive late through `MessageAppend` expand without moving the user's view when they are not at the bottom.
- **Off-screen work**: messages use `content-visibility: auto` with an intrinsic size estimate.

### 6.2 Markdown and rich content

- **Parser**: our own, producing a small syntax tree that Svelte components render. Content never goes through `innerHTML`.
- **Supported subset**: as listed in section 4.4 of the architecture document. Parser tests are hand-written cases for each construct, including edge cases such as nested spoilers and code containing mention syntax, with Stoat's renderer as the reference.
- **Mentions** render as pills with the member's display name and role colour. Unknown IDs render as a neutral "unknown user" pill and resolve when the user loads.
- **Links**: only `http` and `https` become links. They open in a new tab, or in the system browser on desktop.
- **Embeds**: rendered from Stoat's embed objects: website cards with title, description, site name and image, plus video, image and special cases such as YouTube. Media loads through Stoat's proxy.
- **Attachments**: images and video inline, with a full-screen viewer. Other files show as a download card.

### 6.3 Composer

- **Editor**: CodeMirror 6, as in Stoat's own client. The document is Stoat-syntax text: `<@ID>`, `<%ID>`, `<#ID>` and `:ID:`. These tokens are drawn as atomic widgets, so the caret steps over them, and Backspace deletes them whole. What the editor holds is what gets sent. Markdown is typed as text, and paste is plain text.
- **Risk**: inline editors are the most fragile part of a chat client. CodeMirror brings tested IME, Android and undo handling. Jaakko decided on 2026-10-12 to use it rather than our own `contenteditable`. A one-day spike checks it on real devices. If it fails, the fallback is a `textarea` with the same autocomplete, where mentions show as `@name` text and are mapped on send.
- **Autocomplete** popovers for `@` members and roles, `#` channels, and `:` emoji, keyboard driven.
- **Replies** show a bar above the composer with a toggle for mentioning the author.
- **Attachments**: drag and drop, paste, or the plus button. Up to Stoat's limit per message, with upload progress.
  - Size limits:

    | Upload | Limit |
    |---|---|
    | Attachment | 20 MB |
    | Avatar | 4 MB |
    | Banner and background | 6 MB |
    | Icon | 2.5 MB |

  - The composer reads the current limits from `GET /api/` and rejects oversized files before uploading.
  - Autumn stores width, height and a thumbhash for images. The message list uses them to reserve space and paint a placeholder.
- **Length**: Stoat limits a message to 2000 UTF-8 bytes, not characters, as verified in M0. Each `ä` or `ö` takes two bytes, and a mention token serialises to 29. The composer counts bytes of the serialised text and shows a counter near the limit.
- **Keys**: Enter sends, Shift+Enter adds a line, Up arrow edits the last own message, Escape cancels a reply or edit. Enter never sends while an IME is composing.
- **Touch screens**: a send button sends and Enter adds a line, as on Discord's phone app. Tapping send keeps the keyboard open.

### 6.4 Emoji picker

The picker has an emoji tab only. Stoat has no stickers, and the MVP has no GIF tab: Tenor's API may be retiring, and a GIF provider means another key and another privacy policy. Revisit after launch. The emoji tab has search, favourites, frequently used, then one section per server for custom emoji, then Unicode categories. A preview footer shows the hovered emoji's name. Favourites and usage counts are stored in synced settings under `concord:emoji`.

- **Custom emoji** are written `:ULID:` in message text, and as the bare ULID in reactions. A server holds up to 100, each up to 500 KB.
- **Unicode reactions** must be on Stoat's allowlist of 3968 entries, so the picker offers only allowlisted emoji when reacting.
- **Emoji images**: Twemoji SVGs are self-hosted on our origin. The client never loads from `static.stoat.chat`.
- **No third-party GIF calls.** The client never calls `api.gifbox.me`, because Stoat's own client sends session tokens there. If GIFs come later, they go through our own gifbox service.

### 6.5 Search

Search is per channel, through Stoat's message search, from the chat header's search field. Results open in a side panel, and a click jumps to the message. Server-wide search is a known gap, from architecture section 9.

## 7. Social, profiles and presence

**Friends screen**: tabs for online, all, pending and blocked friends, plus "Add friend" by `username#discriminator`. Every action is optimistic, with a revert on failure.

**Profile editing**, in settings, with a live preview of the popout:
- display name, avatar, banner, bio, pronouns and status text with a leading emoji,
- all saved in one `PATCH /users/@me`, because profile edits allow only 2 per 10 seconds,
- uploads limited as in section 6.3.

**Server settings**, for admins, built in M2c to the screen-by-screen spec in m2c-plan.md: overview (name, icon, banner, description, system-message channels), roles (colour, hoist, permissions, order), custom emoji, invites, members with roles, kick and ban, and bans. Channel settings hold a channel's overview and permission overrides.
- Channels and categories are created, renamed, deleted and ordered in the sidebar, with Move up, Move down and Move to category in their menus (m2c-plan.md decision 3). Drag ordering comes in M7.
- The permission editors use the calculator in `packages/domain` and the rank rules in `ranks.ts`. They warn when `InviteOthers` is granted to Everyone, or to a role without Manage server.
- Creating a server runs the bootstrap from architecture section 4.2: remove `InviteOthers` from the default permissions, then create an Admin role, first in rank, with every permission.


**Profiles**:

| Field | Source |
|---|---|
| Banner | `profile.background` |
| Bio | `profile.content`, up to 2000 characters |
| Pronouns | User-level |
| Badges | Bitfield on the user |
| Mutual friends and servers | `GET /users/{id}/mutual`, which returns IDs |
| Member since | `joined_at` on the member |
| Account age | The time component of the user's ULID |
| Private note | Our own synced-settings key, `concord:notes`. Stoat has no notes. |

Connections, profile accent colours, message requests and stickers don't exist in Stoat, so the popout and panel leave them out.

**Friends and DMs**:

- DMs are friends-only.
- "In voice" on a friend comes from `voice_states` for channels the user can see.

**Presence**: Stoat's states are Online, Idle, Focus, Busy and Invisible. Focus means "only receive mentions". The status menu offers all five, since other Stoat clients can set Focus anyway.

Behaviour verified on 0.15.5:

- **Online and offline** changes reach every server member live.
- **Status text, Idle, Focus and Busy** changes reach your own devices, friends, DM and group partners, and every socket subscribed to a shared server. On 0.15.5 the client keeps every server subscribed, so all members see them live. Elsewhere, other members see them when the member list re-polls, as section 4.3 of the architecture describes.
- **Name, avatar and pronouns** reach the same sockets. **Bio and banner** don't: setting them alone sends a `UserUpdate` with empty data, removing them sends only the clear, and an edit that also changes other fields carries only those. So the client fetches a profile again after any update but a bare online flag, but only while that profile is on screen, in a popout or the DM panel, and only `GET /profile`.
- **Invisible** reaches subscribers as `presence: "Invisible"`, with no `online: false`. Going back to Online doesn't re-send `online: true`, so any visible presence marks the user online.
- **Stoat's relationship bug**: after any `UserRelationship` event, a socket stops receiving its own user's updates and never receives the new friend's. Re-fetching the user doesn't help, and only a fresh socket or a `Subscribe` repairs it. The client re-sends `Subscribe` for every server after each relationship event, as m2b-plan.md decision 1 describes. A new friend who shares no server shows a stale status until the next reconnect, and an account in no server at all has no repair: its own updates stop after a relationship event until it reconnects.
- **Channel visibility after creation** (m2c-results.md task 5): when a channel is hidden from a member right after it is created, as a private channel is, Stoat's socket loses track of it. Giving her a role that shows it then sends no `ChannelCreate`, though a second grant does. So after any change to your own roles, to the permissions of a role you hold, or to Everyone's, the client fetches each channel in that server's list that it doesn't have. One that is still hidden answers 403 and is skipped.
- **Message authors**: the user a `Message` event carries comes from the same corrupted socket cache, so a new friend can arrive marked `User`, the value meant for oneself. The client never takes a relationship from a message.
- **Synced settings** change live: Stoat sends `UserSettingsUpdate` to all of the account's sessions, the writer's own included, and the last write wins.

**Server and invite controls**:

- "Create server" shows only when the user's ID is in `features.limits.global.restrict_server_creation` from `GET /api/`. The list doesn't cover group DMs.
- **Invites**:
  - Only members with `InviteOthers` see invite buttons.
  - Invites created before a permission change stay valid, so server settings list existing invites with a revoke button.
  - `GET /invites/{code}` returns the server's name, icon and banner, the channel, the member count, and the creator's username and avatar, but not the creator's ID. The icon, banner and avatar are full file objects, present only when set.
- **Superuser flag**: `user.privileged` is a platform superuser flag set only in the database. It doesn't bypass server-creation limits, and the client ignores it.

**Idle detection** (m2b-plan.md task 6, `packages/domain/src/idle.ts`):
- **Away** means no device of the account has been used for 10 minutes: no key, pointer, touch, wheel or focus input in any tab of this browser, and no `concord:active` from another device. Each device writes that synced setting at most every 4 minutes while in use, and at once when it comes back. Its arrival is timed on the receiving device's clock, so clock skew can't move the deadline.
- **Going Idle**: when away, the device sets Idle, but only while the status chosen in the menu (`concord:status`) is Online and the live presence is Online. A status the user picked, on this client or another Stoat client, is never overridden.
- **Coming back**: on input, if the presence is Idle and the chosen status is Online, the device restores Online, whoever set the Idle. Another device turning Idle into Online counts as activity too, since its notice may arrive after the presence change.
- **One writer per browser**: tabs share their input through `localStorage`, and only the tab holding a Web Lock acts.
- **Becoming visible** counts as input, so a laptop waking from sleep doesn't flash Idle.
- Every write goes through the `PATCH /users/@me` queue (2 per 10 s).
- **Known limits**:
  - A phone browser freezes hidden tabs. With only a phone open, nothing sets Idle until its socket closes.
  - A visible window that isn't used shows Idle after 10 minutes. M4 counts time in a call as activity.

## 8. Notifications

**While the client is open**, notifications come from WebSocket events: the browser's `Notification` API on the web, Electron's on desktop. Built in M2c (m2c-plan.md, "Notifications"; `packages/domain/src/notify.ts`):
- **Settings**: Stoat's `notifications` key in the shape its client writes, `{server, channel, server_mutes, channel_mutes}`, with levels all, mention and none, and mutes with an optional end. Every key is kept on writing, and an old `muted` level reads as a mute with no end.
- **Defaults**: server channels notify for mentions only, DMs and groups for everything.
- **A message notifies** unless it is your own, from someone you blocked, a system line, or flagged "don't notify" (flag 2). It also stays quiet while a focused window of this browser shows that channel, or while you are Busy. Otherwise the level decides, and Focus allows only mentions.
- **Mentions**: your ID, one of your roles, `@everyone` (flag 4) or `@online` (flag 8). A muted channel or server notifies only for your own ID: a user mention or a reply to you.
- **One tab per browser** notifies, the one holding the `concord:notify` Web Lock. Tabs share the channel they show while focused through `localStorage`.
- **Turned on per browser**, from a bar that asks once or the Notifications section of settings.

**Web push**, for the installed web app on phones, ships in M7:

- **Subscribing** is per session. The client sends `POST /push/subscribe {endpoint, p256dh, auth}`, using the VAPID public key from `GET /api/`.
- **What Stoat pushes**:
  - every DM and group message,
  - server messages that mention the user, one of their roles or `@everyone`, and replies that mention them, but not `@online`,
  - friend requests,
  - DM calls.
- **Limitations, verified in Stoat's source**:
  - **Mutes are never honoured.** A muted channel that mentions you still pushes. Our service worker can't drop a push silently, because browsers require a visible notification. So mutes on phones work only for plain server messages, which never push anyway.
  - **Any open WebSocket for the account suppresses message pushes**, so a desktop window that is open stops the phone getting pushes.
    - On phones, the client closes its socket after about 30 seconds in the background, unless it is in a voice call.
    - Desktop keeps its socket open. Closing it would show the user as offline rather than Idle, drop voice events, and stop desktop notifications.
    - So while a desktop client runs, the phone stays quiet. This is accepted for the beta, and testers are asked about it. If it bothers them, the push sidecar below can push while the desktop user is Idle.
  - **Payload format**: payloads use the legacy `aesgcm` encoding and carry the author's username with no title. Very long messages may exceed the push size limit.
  - **iOS will likely reject pushes silently**, because Stoat signs them without a `sub` claim. An iPhone test is a hard gate in M7.
- **Our own service worker** builds the title from the payload. It uses server, channel and DM names that the client mirrors into IndexedDB, because the service worker can't read the in-memory store. It sets `tag` per channel, so a burst collapses into one notification. A click focuses an existing window. Otherwise it opens `/channel/<id>/<message>`, which redirects into the client, because the payload carries no server ID.
- **Fallback, if the iPhone gate fails or the limitations hurt in the beta**: our own small push sidecar that consumes RabbitMQ's `revolt.notifications` queue and applies our mute rules. It could also push to a phone while the desktop is idle. That doesn't modify Stoat.

## 9. Design system

Tokens are CSS custom properties in `packages/ui/tokens.css`. Components use tokens only.

**How the values were measured**:

- **Scale**: all five reference screenshots were taken at 125% display scaling. Nineteen of twenty fixed-size controls land on an 8 px grid at that scale, so every value below is in CSS pixels.
- **Colours** are per-channel medians over flat regions. Values from the two WebP screenshots are low confidence for small, saturated elements.
- **Proposals**: values marked "proposal" could not be measured, or were deliberately changed from the reference for contrast or identity.

**Identity**: we take Discord's layout, density and surface structure. Our own parts are the font (Figtree), the icons (Lucide) and the accent: a cyan, with near-black text on it, never white.

```css
:root {
  /* Surfaces: the reference uses a black base, with close steps for raised elements, separated by 1 px lines */
  --surface-0: #000000;   /* rail, sidebar, conversation, member list, dock, modal */
  --surface-1: #0a0a0c;   /* embeds, popouts, emoji picker body */
  --surface-2: #101013;   /* composer, DM profile panel */
  --surface-3: #131313;   /* rail tiles, search button, add-reaction chip */
  --surface-4: #1b1b1e;   /* secondary and icon buttons */
  --surface-5: #242426;   /* selected row, chips */
  --surface-6: #2c2c2f;   /* hovered emoji cell */
  --hover-overlay: rgb(255 255 255 / 0.06);  /* proposal: 0.03 is invisible on black */
  --scrim: rgb(0 0 0 / 0.73);

  --border-faint: #18181a;  --border-subtle: #1e1e20;  --border-default: #26262a;
  --border-control: #686972;  /* proposal: the reference's control edges fail 3:1 */

  --text-strong: #dcdcdf;  --text-normal: #d4d5d8;  --text-secondary: #96979e;  --text-muted: #81828a;

  --accent: #1fb6d1;  --accent-hover: #4fcbe3;  --accent-active: #1599b3;  /* proposal */
  --on-accent: #021418;                          /* labels, toggle knob, radio dot on the accent */
  --accent-subtle: rgb(31 182 209 / 0.24);       /* own reaction; alpha measured */
  --accent-wash: rgb(31 182 209 / 0.12);         /* mention highlight, proposal */
  --link: var(--accent);

  --status-online: #3dbd7d;  --status-idle: #f5b942;  --status-busy: #f2555a;
  --status-focus: var(--accent);  --status-offline: #85858a;   /* proposals, each with its own shape */
  --danger: #f2555a;  --danger-fill: #d92f3a;  --on-danger: #ffffff;

  --radius-xs: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-xl: 1rem; --radius-modal: 0.625rem; --radius-full: 9999px;
  --space-1: 0.125rem; --space-2: 0.25rem; --space-3: 0.5rem; --space-4: 0.75rem; --space-5: 1rem;
  --space-6: 1.25rem; --space-7: 1.5rem; --space-8: 2rem; --space-9: 2.5rem; --space-10: 3rem;

  --font-sans: "Figtree Variable", system-ui, sans-serif;
  --text-xs: 0.75rem/1rem;  --text-sm: 0.875rem/1.25rem;  --text-md: 1rem/1.375rem;
  --text-lg: 1.25rem/1.5rem;  --text-xl: 1.5rem/1.875rem;
  /* weights: 400 body, 500 names and labels, 700 display names and chips */

  --rail-w: 72px; --sidebar-w: 264px; --members-w: 264px; --dm-panel-w: 304px;
  --header-h: 48px; --composer-h: 58px; --dock-h: 58px;
  --rail-icon: 40px; --rail-pitch: 48px; --row-channel: 32px; --row-dm: 42px; --row-member: 42px;
  --avatar-sm: 32px; --avatar-md: 40px; --avatar-panel: 80px; --avatar-popout: 120px;
  --profile-w: 300px; --side-panel-w: 456px; --preview-w: 400px;
  --picker-w: 500px; --picker-h: 486px; --settings-nav-w: 252px; --settings-col-w: 700px; --settings-col-wide-w: 940px;
  --control-h: 40px; --icon-sm: 16px; --icon-md: 20px; --icon-lg: 24px;

  --scrollbar-thumb: var(--border-control); --scrollbar-width: 8px;
  --video-backdrop: #000000; --video-foreground: #ffffff;
  --qr-light: #ffffff; --qr-dark: #000000;   /* a QR code scans only dark on light */
  --syntax-keyword: #c792ea; --syntax-string: #a5d6a7; --syntax-number: #f5b942;
  --syntax-title: #82aaff; --syntax-type: #4fcbe3; --syntax-meta: #f78c6c;

  --shadow-popover: 0 8px 32px rgb(0 0 0 / 0.28);  /* proposal: on black, borders carry most elevation */
  /* Motion, client.md section 9: slight, as Discord's. Exits are faster than enters. */
  --dur-state: 120ms; --dur-press: 120ms; --dur-popover: 150ms; --dur-modal: 200ms; --dur-toast: 200ms; --dur-exit: 100ms;
  --dur-tooltip: 100ms; --dur-pill-in: 200ms; --dur-pill-out: 100ms; --dur-user-panel: 130ms; --dur-image: 200ms;
  --dur-backdrop: 100ms; --dur-settings-modal: 150ms; --dur-settings-delay: 60ms;
  --dur-accordion: 300ms; --dur-active-bar: 150ms; --dur-spinner: 1.8s;
  --dur-meter: 60ms; --dur-loop: 1.2s; --dur-flash: 2s; --jump-highlight-hold: 2s;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1); --ease-out-cubic: cubic-bezier(0.33, 1, 0.68, 1);
  --ease-spinner: cubic-bezier(0.42, 0, 0.58, 1);   /* CSS ease-in-out, the wandering cubes' curve */
  --motion: 1;   /* 0 under reduced motion; duration tokens also become zero in base.css */
}
```

**Rules**:

- **Units**: type and spacing use rem, so text scales with the browser, as section 11 requires. Column widths stay in px, as in the reference. Row and bar heights are minimums (`min-height`), so larger text never clips.
- **Contrast**: every text pairing meets WCAG AA.
  - `--text-muted` fails AA on `--surface-4`, `--surface-5` and `--surface-6`, at 4.49, 4.05 and 3.64. On those surfaces, and under hover, muted text steps up to `--text-secondary`.
  - `--border-control` reaches 3:1 only on surfaces 0 to 4. Controls on lighter surfaces use `--text-secondary` for their edges.
  - The reference's own timestamp and placeholder greys fail AA, so they are not used.
- **Accent pairings**:
  - Near-black on the accent measures 7.8, while white on the accent fails at 2.4. White never goes on the accent, including toggle knobs and radio dots.
  - Danger buttons and mention badges use `--danger-fill` with white, which passes AA.
- **Focus**: a 2 px `--accent` ring with a 2 px offset, so it shows on accent-filled buttons too. It appears on keyboard focus only.
- **Muted channels**: the reference's dim grey fails contrast on every surface. A muted channel's name is weight 400 in `--text-muted`, with a bell-off icon in `--text-secondary`. Selected or hovered, it steps up like any muted text, and the icon still marks it.
- **Black base**: `--surface-0` stays pure black as measured. Jaakko judges on the live M1 client whether it needs lifting.
- **Presence** is shown by shape as well as colour:

  | State | Shape |
  |---|---|
  | Online | Filled dot |
  | Idle | Crescent |
  | Busy | Dot with a bar |
  | Focus | Ring with a centre dot |
  | Offline | Hollow ring |

- **Rail**: server icons are 40 px squircles with a 12 px radius. The selected server has a 4 by 40 px pill on the left edge. The icon does not morph.
- **Icons**: 20 px by default, 16 px inline and in fields, 24 px for large uses, stroke 2. Lucide's outlines read lighter than the reference's solid glyphs, so active states use the stronger text colour rather than a filled variant.
- **Numbers**: timestamps and counts use `font-variant-numeric: tabular-nums`.
- **Motion**: see below.

**Motion** (M4.6). Follow [the motion spec](design/discord-ui-motion-spec.md), with Concord's colours. These rules replace M4.2 where they differ.

1. **Only transform and opacity move**, including `translate`, `scale` and `rotate`. `clip-path` sizes the meter and rail pill; only the settings navigation may animate `grid-template-rows`. No animated dimensions, offsets or `transition: all`. The toggle track is the sole colour-transition exception. The lints enforce properties and tokens.
2. **Hover and frequent changes are instant.** Channel, message, member and settings rows, buttons and rail tiles have no hover fades. Keyboard-opened surfaces, channel switches, new messages and keyboard list movement have no enter motion. Button press scales and toggle knobs remain.
3. **Enter and exit timings follow the spec.** Menus and general popovers exit at `--dur-exit`. Tooltips crossfade at `--dur-tooltip`, without delay or growth. Profile popouts open, retarget and close instantly. Settings opens and closes with its own fade and scale.
4. **Origin follows the trigger.** Menus grow from the nearest corner; dialogs and the settings modal stay centred. Tooltips only fade.
5. **Small movements.** General popovers, dialogs and call tiles start at 0.98 scale; the settings modal starts at 0.97. Rises are `--space-2`, and a pressed button scales to 0.98.
6. **Curves are tokens.** Use `--ease-out`, `--ease-in-out`, the spec's `--ease-standard` and `--ease-out-cubic`, and `--ease-spinner` for the spinner. Linear is for meters. A critically damped spring is allowed for scrolling; it keeps velocity on retarget and stops for wheel or touch input.
7. **Durations are tokens.** Scrolling reaches 99% in about 520–550 ms, accordion changes take 300 ms, and the loading spinner loops at 1.8 s. Only the spinner, typing/ringing loops and message jump highlight exceed 550 ms.
8. **Reduced motion makes durations zero**, fades included. CSS and JS read the same tokens. Springs jump. Typing dots and ringing pulses stop. The loading spinner keeps turning; a message jump keeps a static 2 s highlight so its destination remains visible.
9. **Exits keep their content.** Closing surfaces retain their content, ignore the pointer and return focus. At zero duration they still finish closing and return focus.

**Components seen in the reference**:

- **Navigation**: server rail, server header, channel and category rows, DM rows.
- **Conversation**:
  - chat header,
  - message group and continuation,
  - chips, embed card, attachment card, reply preview and reaction chips,
  - composer.
- **People and settings**:
  - member list and user dock,
  - DM profile panel and profile popout,
  - emoji picker,
  - settings modal with select, toggle, radio, slider and level meter.

Each is built to the measured sizes above.

**Not in any screenshot, but needed anyway**:

- **States**: hover and unread markers, mention badges, disabled and danger states, and empty and error states.
- **Overlays and popovers**: toasts, context menus, tooltips, the quick switcher, confirm dialogs, the image viewer, and the mention autocomplete.
- **Message furniture**: the typing indicator, in a strip just above the composer over the messages' bottom padding, day and "new messages" dividers, the reply bar, upload progress, and the drag-and-drop overlay.
- **Voice**: voice participants under channels, the voice status panel, and screen-share tiles.
- **Content rendering**: code, quote and spoiler blocks.
- **Account screens**: login, MFA and onboarding.

These follow the same tokens. Agents propose them in the live client for Jaakko's review.

## 10. Voice and screen share

Written for M4 with [m4-plan.md](m4-plan.md), signed off 2026-10-14. The Stoat facts come from reading 0.15.5's source. M4's task 2 checks each on the dev stack, and this section is corrected where they differ. Architecture sections 5.1 to 5.4 say why. This section says how.

Voice code loads only on the first join, through `import()`: `livekit-client` is about 144 KB gzipped and can't be tree-shaken.

### 10.1 Who is in voice

**From Stoat**, for every channel the user can see:
- **At start**: `Ready.voice_states`, a list of `{id: channel, participants}`. It holds only channels with someone in them.
- **Events**:
  - `VoiceChannelJoin {id, state}`,
  - `VoiceChannelLeave {id, user}`,
  - `VoiceChannelMove {user, from, to, state}`,
  - `UserVoiceStateUpdate {id, channel_id, data}`, where `data` holds only the flags that changed.
- **A participant** is `{id, joined_at, is_receiving, is_publishing, screensharing, camera}`.
  - `is_publishing` means "microphone published and not muted".
  - `screensharing` covers screen video and screen audio together.
  - `is_receiving` never changes, so others can't see a deafen.
- **Server mute and deafen** are the member's `can_publish` and `can_receive`, false when set. The client shows them in red.
- **Timing**: joins and leaves arrive only after LiveKit's webhooks reach voice-ingress, about a second late.

**The store** keeps voice states by channel, applied as idempotent upserts. A user is in one channel at most, so a join elsewhere removes them from the previous one. That covers a missed leave.

**Inside the call the user is in**, LiveKit is the truth for tracks, speaking and quality (architecture 5.4). Stoat's list still decides who shows under the channel. LiveKit adds the speaking rings, because Stoat doesn't send speaking to anyone outside the call.

### 10.2 Joining and leaving

1. **Node**: the first LiveKit node from `GET /api/`, `worldwide` on our stacks.
2. **Token**: `POST /channels/{id}/join_call` with `{node, force_disconnect: true}`. The token is valid for 10 seconds.
   - `force_disconnect` ends this account's call on any other device or stale session. Without it Stoat answers `AlreadyConnected`.
3. **Connect at once** to `wss://<our origin>/livekit`, never to the URL Stoat returns.
   - **Room options**:
     - `adaptiveStream` with `pixelDensity: 'screen'`,
     - `dynacast` on,
     - `webAudioMix` on in Chromium only, for volumes above 100 % (section 10.5).
   - **Never send LiveKit data.** voice-ingress disconnects anyone who does. Nothing in the SDK sends data unless called, so the voice module never imports `publishData`, chat, RPC, text streams or data tracks. A lint rule enforces it.
4. **Publish** our own processed microphone track (section 10.4) with `publishTrack`, as source `microphone`, with DTX and RED on.

**Errors**: a toast for each of these:
- no Connect permission,
- the channel full, `CannotJoinCall`,
- LiveKit unavailable,
- microphone access refused. Joining still works without a microphone, to listen.

**Rate limit**: `join_call` shares the 15-per-10-seconds bucket of `/channels/{id}/…` with fetches and acks on that channel. Sending messages has its own bucket. Rejoins back off (section 10.7).

**Switching channels**: join the new one. `force_disconnect` ends the old call.

**Leaving**: the disconnect button, or closing the tab, through LiveKit's `disconnectOnPageLeave`. A reload doesn't rejoin.

**A second device**: joining on device B ends the call on device A, because `force_disconnect` removes A's participant. A sees a removal, like a kick, and never rejoins after one (section 10.7). It shows "Joined from another device" when Stoat's voice states show the user in a call, and "Disconnected" otherwise.

**Sounds**: join, leave, mute, unmute, deafen, undeafen, someone joining or leaving your call, and the ring.
- They are short tones, generated with Web Audio, so there are no sound files to license.
- The join and leave sounds are held back while the call is reconnecting, because a full restart re-announces every participant.

**Idle**: being in a call counts as activity (section 7).

### 10.3 Screens and controls

**Channel sidebar**, after `docs/reference/discord-voice-channel.png`. A voice channel with people in it:
- **The icon turns green** (`--status-online`), and an elapsed timer shows at the row's right edge. The timer counts from the earliest `joined_at` among the people now in it, and resets when the channel empties.
- **Participants are listed under it**:
  - each has a 24 px avatar and display name,
  - then icons for muted, server-muted or server-deafened, camera, and a "LIVE" badge while screen sharing,
  - a green ring around the avatar while speaking, in the user's own call only.
- **A user limit** shows as "2/5".
- **Clicking a voice channel** joins it and opens the call view. When already in it, the click only opens the call view.

**Voice panel** above the user dock while connected, in one bordered panel with it and a line between, as on Discord. The panel and the composer both sit `--space-3` from the window's bottom, so they end level, and the user row's top is level with the composer's:
- "Voice connected" in green, or "Reconnecting…" in `--status-idle`,
- a connection-quality icon whose tooltip gives ping and packet loss,
- the channel and server name, a link back to the call view,
- a disconnect button beside the title, and camera and share screen as equal boxed buttons across the panel.

**User dock**: the microphone and headphones buttons turn into mute and deafen.
- Deafen also mutes.
- Both show a red slash when on.
- Both work outside a call too, and apply at the next join.

**Call view**, in the conversation column of a voice channel, or at the top of a DM:
- **Tiles**:
  - a grid with one tile per participant, plus one per camera or screen share,
  - an audio tile shows the avatar, name, speaking ring and mute icon,
  - clicking a tile focuses it, and double-clicking makes it fullscreen.
- **Bottom bar**: microphone, camera, share screen and disconnect.
- **The channel's text chat** is a 456 px side panel where the member list would be. Above 1,360 px it opens with the stage, beside it; narrower it overlays the stage and waits for the header's chat button. Closed, it stays closed until the next voice channel (M4.6).
- **Not yet in the call**: the view shows who is in it, with a Join button.

**Participant menu**, by right-click or long press on a tile or sidebar row:
- a volume slider, 0 to 200 % in Chromium and 0 to 100 % elsewhere,
- "Mute for me",
- "Profile".

Volumes are saved on the device by user ID.

**Screen tile menu**:
- **Quality**: Auto, 1080p, 720p or 360p. Auto lets adaptive streaming choose by tile size.
- **Stats overlay**:
  - for a viewer: resolution, frames per second, bitrate, codec, layer, packet loss, jitter and round-trip time,
  - for the sharer: the encoder, the quality-limitation reason and whether the CPU is limiting.

**DMs and groups**:
- A call button in the header.
- The DM list marks a DM with a call in progress.
- The `call_started` system message, which is already rendered, gets a Join button while the call runs.

**Friends**: "In voice" from the voice states, as section 7 says.

### 10.4 Microphone

**The chain**: built in our own 48 kHz `AudioContext`, because RNNoise needs 48 kHz. It is published as one track:

1. `getUserMedia`:
   - the chosen device,
   - echo cancellation from settings,
   - automatic gain control on,
   - the browser's own noise suppression and voice isolation off while RNNoise is on, otherwise on.
2. RNNoise, or a bypass when it is off. It runs `@sapphi-red/web-noise-suppressor` (MIT) in an AudioWorklet, with about 220 KB of wasm and worklet code served from our origin.
3. Input volume, a gain node.
4. **The gate**, our own AudioWorklet.
5. A `MediaStreamDestination`, published with `publishTrack`.

**The gate decides when the microphone transmits**:
- **Voice activity**:
  - It opens when the level crosses the threshold.
  - It closes 300 ms after the level falls back, so word endings aren't clipped.
  - **Automatic sensitivity** tracks the noise floor and sets the threshold a margin above it.
  - **Manual sensitivity** is a threshold in dBFS from the settings slider.
- **Push-to-talk**: it opens while the key is held, and closes 200 ms after release.
  - A browser only sees keys while the tab has focus, so the gate closes on blur.
  - Push-to-talk while another window has focus comes with the desktop app in M5.
- **Why a gain node, not muting**: muting the track signals the server, and every client gets a state event for each word. The gate is silent to the server. LiveKit's speaking detection then simply sees silence.

**Mute** is the track's own `mute()`. Others see it, as `is_publishing` turns false.

**Changing a setting mid-call** rebuilds only the affected node. A device change replaces the source without republishing.

**CSP**: `script-src` gains `'wasm-unsafe-eval'` for RNNoise (section 13). The worklet and wasm load from our origin under `/app`.

### 10.5 Output

- **Output device**: `switchActiveDevice('audiooutput')`. It works in Chromium, and in Firefox without `webAudioMix`. Safari can't choose one, so the setting is hidden there.
- **Volume**: output volume times each user's volume.
  - Above 100 % needs `webAudioMix`, so it is Chromium only.
  - Elsewhere the slider stops at 100 %.
- **Deafen**:
  - `setEnabled(false)` on every remote audio publication. The server stops sending audio, and speaking indicators keep working.
  - It is reapplied on `TrackSubscribed` and `Reconnected`, because a full restart forgets it.
  - The microphone is muted too.

### 10.6 Screen share and camera

**Before capture**, a small dialog offers:
- the quality preset,
- "Share audio", in Chromium only.

Then `createScreenTracks` captures the screen:
- **Clamping**: resolution up to the preset, clamped so width × height and the aspect ratio stay within the user's tier in `GET /api/`, `limits.new_user` or `limits.default`. voice-ingress disconnects a track over the limit, and new accounts may have a lower one.
- **Content hint**: `motion`, or `detail` for the Text preset.
- **Capture options**: `selfBrowserSurface: 'exclude'` and `surfaceSwitching: 'include'`.
- **Audio**: all processing off, `suppressLocalAudioPlayback` inside the audio options, and `restrictOwnAudio` where supported. It is published with DTX and RED off, in stereo.

**Presets**:

| Preset | Resolution | fps | Max bitrate | Degradation |
|---|---|---|---|---|
| 1080p60, the default | 1920 × 1080 | 60 | 12 Mbps | keep framerate |
| 1080p30 | 1920 × 1080 | 30 | 8 Mbps | keep framerate |
| 720p30 | 1280 × 720 | 30 | 3 Mbps | keep framerate |
| Text | source, within the limit | 5 | 3 Mbps | keep resolution |

**Publishing**, from architecture 5.2:
- **Codec**: H.264 unless Jaakko's encoder runs say otherwise.
- **Backup codec**: VP8 stays on unless Linux Firefox is shown to decode H.264 (M0 run 11). One viewer without H.264 would otherwise drop every viewer to VP8.
- **Simulcast layers** at 720p30 and 360p15 for H.264 and VP8, so throttled viewers step down.
- **Priority**: high.
- **Firefox sharers** publish VP8 in one layer, because Firefox's H.264 screen share fell to 180 × 240 in M0. The share dialog says so and recommends Chrome or the desktop app.
- **The other settings** come from the test page, `spikes/m0-screenshare`, whose runs measured them.

**Camera**:
- 1280 × 720 at 30 fps, clamped the same way, with LiveKit's default simulcast.
- The device is chosen in settings, with a preview.

**Viewing**:
- **Layers**: adaptive streaming picks a layer by tile size, and the tile's quality menu overrides it with `setVideoQuality`.
- **Tracks**: what is shared comes from LiveKit's tracks. Stoat's `screensharing` flag is used only for the sidebar badge.

### 10.7 Connection quality and reconnects

- **Indicator**: `ConnectionQualityChanged` drives the voice panel's icon. The tooltip reads round-trip time and packet loss from the stats.
- **Network changes**: LiveKit handles them:
  - first a resume with an ICE restart,
  - then a full restart.
  - Both use the refreshed token that Stoat's LiveKit sends right after joining and every 5 minutes, valid for 10 minutes.
- **When LiveKit gives up**, the client rejoins through `join_call`:
  - This applies only when the connection was lost or the server shut down, judged by LiveKit's disconnect reason.
  - A removal never rejoins. Another device's `force_disconnect`, a kick, a ban, a permission change and voice-ingress's video-limit disconnect all arrive as one.
  - It never rejoins within 10 seconds of the last successful join, so two devices can't evict each other in a loop.
  - The rejoin backs off at 1, 2, 5, 10 and 30 seconds, for up to 5 minutes, then shows "Disconnected" with a Rejoin button.
  - Mute and deafen carry over, and a screen share doesn't.
- **LiveKit's Monday restart at 05:00** ends every call, and the rule above brings people back.

### 10.8 DM and group calls

- **Starting**: the call button joins the DM's call. Stoat rings everyone else in it and posts the `call_started` message. While the caller is alone, the call area says "Calling…".
- **Ringing**: `VoiceCallUpdate {ended: false}` from someone else shows a ringing card with the caller's avatar, Join and Ignore.
  - **Sound**: a ringtone loops.
  - **Hidden tab**: a browser notification, following the notification settings in section 8.
- **The ring stops** on the first of:
  - Join or Ignore,
  - `VoiceCallUpdate {ended: true}`,
  - our own `VoiceChannelJoin` in that call from another device,
  - nothing, if this client is rejoining that call itself: after a LiveKit restart, whoever rejoins first rings the others again,
  - 30 seconds.
- **Declining** tells the caller nothing, because Stoat has no decline.
- **`call_started`**: Stoat posts one on the first join of any call, server voice channels included, and again after every empty spell. In a DM or group it renders as the existing system line. In a server channel the log leaves it out, so a started call isn't a message there.

### 10.9 Voice and video settings

A settings section after `docs/reference/discord-voice-settings.png`. It is stored per device in `localStorage` under `concord:voice`, and not synced, because devices differ.

- **Devices**: microphone and speaker, with input and output volume.
- **Mic test**: a button that runs the chain from section 10.4 and plays it back, with a level meter. It works without joining a call.
- **Input mode**: voice activity, or push-to-talk with its key.
- **Input sensitivity**:
  - "Automatic" on or off,
  - when off, a slider over the live level, yellow below the threshold and green above.
- **Noise suppression**: RNNoise, the default, or off.
- **Echo cancellation**: on by default.
- **Automatic gain control**: on by default, under "Advanced".
- **Camera**: the device, with a preview.
- **Screen share**: the default preset, and the stats overlay on or off.

Discord's input profiles, Krisp, attenuation and its QoS switch are left out.

### 10.10 Not in M4

- **Voice moderation**: server mute, deafen, move and disconnect.
  - Stoat 0.15.5 applies them to the moderator's own account instead of the target's. This is from reading the source and goes to the upstream list.
  - The client still shows server mute and deafen set elsewhere.
- **Screen-share audio from the desktop app, and on Linux**: M5.
- **Push-to-talk while another window has focus**: M5.
- **Not planned**: picture-in-picture, soundboard, activities and voice channel status text.

## 11. Accessibility and keyboard

- Semantic landmarks for each column. The channel list is a tree. The message list is a log, and new messages are announced politely only when the user is at the bottom.
- Focus rings appear on keyboard focus only. Every overlay traps focus and returns it on close.
- Shortcuts: Ctrl+K quick switcher, Alt+Up and Alt+Down for channels, Alt+Shift+Up and Down for unread channels, Escape to mark a channel read, Ctrl+E for the emoji picker.
- Reduced-motion settings make all durations zero, including fades; only the loading spinner keeps turning. Message jumps keep a static highlight (section 9, motion).
- Text scales with the browser's font size. Layout uses rem units for type and spacing.

## 12. Internationalisation

A typed message catalogue of our own: one TypeScript module per locale, keys checked at compile time, and plurals through `Intl.PluralRules`. English ships first. Finnish is added in M7. Dates and times use `Intl` with the user's locale. No string literals in components, enforced by a lint rule.

## 13. Security

- Content Security Policy, from `kit.csp` in `apps/web/svelte.config.js` plus two directives Caddy adds:
  - Scripts from our origin only. SvelteKit hashes its inline bootstrap script into the policy.
  - Styles from our origin, plus `unsafe-inline`, which KaTeX's inline styles and Svelte's style attributes need. Jaakko approved this on 2026-10-12. Script injection stays blocked, because `script-src` allows nothing inline beyond the hash.
  - Fonts from our origin and `data:`, because Vite inlines KaTeX's smallest fonts.
  - Images and media from our origin and `data:` and `blob:`. External images come through Stoat's January proxy on our origin.
  - WebSocket connections to our origin.
  - WebAssembly compilation (`'wasm-unsafe-eval'`) for RNNoise in voice, from M4 (section 10.4).
  - `frame-ancestors 'none'` and `form-action 'self'`.
- No `innerHTML` with user content anywhere. A lint rule enforces it.
- Session token in IndexedDB. Logout clears it and every cached store.
- External links get `rel="noopener noreferrer"`.

## 14. Testing and agent workflow

Jaakko decided on 2026-10-12 to keep testing to the risky core and review on the live deployment.

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Permission calculator, store event handling, markdown parser. |
| Contract | Vitest with the M0 fixtures | `packages/stoat` against recorded Stoat traffic. A Stoat upgrade re-records them, and differences fail CI. No new scenarios unless a bug needs one. |
| Live checks | Playwright with the Chromium in Jaakko's user cache | Review screenshots of `https://concord.jaalip.com/app` and the reconnect check, against the seeded stack. Not in CI. |

**Review surface**: the live deployment at `/app`, against the seeded stack. Every task ends deployed there.

**Definition of done for a component**:

1. It is visible in the live client in its real states.
2. It uses tokens only, with no raw colours or sizes.
3. It works by keyboard.
4. Its logic has tests if it is in the risky core above.

**Commands** for agents and Jaakko:

```bash
pnpm dev
```

```bash
pnpm test
```

```bash
pnpm verify
```

```bash
pnpm deploy:web:dev
```

The tools target the dev stack, `dev.concord.jaalip.com`, unless `CONCORD_HOST` names another (`tools/target.ts`). Production is reached only on purpose: `pnpm deploy:web`, `pnpm deploy:stack:prod` and `pnpm live:prod <check>`. Agents deploy to production only when a task says so.

## 15. Decisions

Jaakko accepted every recommendation on 2026-10-12. They are written into the sections above:

1. The user dock spans the rail and sidebar columns (section 5).
2. The black base stays as measured and is judged on the live M1 client (section 9).
3. Muted channels use `--text-muted` with a bell-off icon (section 9).
4. The accent is cyan `#1fb6d1` with near-black labels (section 9).
5. Focus presence is offered in the status menu (section 7).
6. Phones stay quiet while a desktop client is open, for the beta (section 8).
7. No GIF tab in the MVP (section 6.4).
