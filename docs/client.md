# Concord: client specification

Status: signed off 2026-10-12, layer 3. Covers M1 and M2 in detail, and M4 voice at outline level.
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
| Voice | `livekit-client` and the RNNoise processor | Lazily, on first voice join |

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
| `/app` | Redirects to the last visited channel. |
| `/app/channels/@me` | Friends: online, all, pending, blocked. |
| `/app/channels/@me/<channel>` | DM or group DM. |
| `/app/channels/@me/<channel>/<message>` | Same, jumped to a message. Added in M2a. |
| `/app/channels/<server>/<channel>` | Server channel. |
| `/app/channels/<server>/<channel>/<message>` | Same, jumped to a message. |
| `/login`, `/login/verify/<token>` | Login with MFA, email verification, onboarding. |
| `/account` | Standalone account and security page, also shown inside settings. |

**Until M6**, Caddy gives our app only `/app`, and every other path, including Stoat's email links, goes to Stoat's own client. Our login and account pages are therefore served at `/app/login` and `/app/account` until M6 moves them to the top-level paths above. Verification links open in Stoat's client until then.

Settings, profile popouts, the emoji picker and image viewers are overlays, not routes. Settings uses SvelteKit shallow routing, so the browser's back button closes it.

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

  --radius-xs: 0.25rem; --radius-md: 0.5rem; --radius-lg: 0.75rem; --radius-xl: 1rem; --radius-full: 9999px;
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
  --popout-w: 400px; --picker-w: 500px; --picker-h: 486px; --settings-nav-w: 252px; --settings-col-w: 696px;
  --control-h: 40px; --icon-sm: 16px; --icon-md: 20px; --icon-lg: 24px;

  --shadow-popover: 0 8px 32px rgb(0 0 0 / 0.28);  /* proposal: on black, borders carry most elevation */
  --dur-hover: 100ms; --dur-press: 60ms; --dur-popover: 140ms; --dur-modal: 200ms;   /* proposals */
  --ease-out: cubic-bezier(0.2, 0, 0, 1); --ease-in: cubic-bezier(0.4, 0, 1, 1);
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

- **Rail**: server icons are 40 px squircles with a 12 px radius. The selected server has a 4 by 38 px pill on the left edge. The icon does not morph.
- **Icons**: 20 px by default, 16 px inline and in fields, 24 px for large uses, stroke 2. Lucide's outlines read lighter than the reference's solid glyphs, so active states use the stronger text colour rather than a filled variant.
- **Numbers**: timestamps and counts use `font-variant-numeric: tabular-nums`.
- **Motion**: durations are proposals, since screenshots can't show motion. With reduced motion, they are all 0 ms.

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
- **Message furniture**: the typing indicator, day and "new messages" dividers, the reply bar, upload progress, and the drag-and-drop overlay.
- **Voice**: voice participants under channels, the voice status panel, and screen-share tiles.
- **Content rendering**: code, quote and spoiler blocks.
- **Account screens**: login, MFA and onboarding.

These follow the same tokens. Agents propose them in the live client for Jaakko's review.

## 10. Voice, outline for M4

Voice code loads only when the user first joins a channel. A detailed voice spec precedes M4. The outline:

- **Controller**: one voice session at a time. It joins through Stoat, connects LiveKit, and maps LiveKit participants to domain users.
- **Settings**, matching the reference screenshot:
  - input and output device, with input and output volume,
  - a microphone test with a level meter,
  - an input sensitivity threshold, either automatic or manual,
  - noise suppression: RNNoise, or off,
  - echo cancellation,
  - push-to-talk or voice activity.
  Krisp is not available outside LiveKit's cloud, so RNNoise replaces it.
- **Input sensitivity** is ours to build. A level meter on the microphone track gates transmission with a short hold time, so word endings aren't clipped.
- **Screen share** follows section 5.2 of the architecture document, with a quality picker and a stats overlay.

## 11. Accessibility and keyboard

- Semantic landmarks for each column. The channel list is a tree. The message list is a log, and new messages are announced politely only when the user is at the bottom.
- Focus rings appear on keyboard focus only. Every overlay traps focus and returns it on close.
- Shortcuts: Ctrl+K quick switcher, Alt+Up and Alt+Down for channels, Alt+Shift+Up and Down for unread channels, Escape to mark a channel read, Ctrl+E for the emoji picker.
- Reduced-motion settings disable animated transitions.
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
pnpm deploy:web
```

## 15. Decisions

Jaakko accepted every recommendation on 2026-10-12. They are written into the sections above:

1. The user dock spans the rail and sidebar columns (section 5).
2. The black base stays as measured and is judged on the live M1 client (section 9).
3. Muted channels use `--text-muted` with a bell-off icon (section 9).
4. The accent is cyan `#1fb6d1` with near-black labels (section 9).
5. Focus presence is offered in the status menu (section 7).
6. Phones stay quiet while a desktop client is open, for the beta (section 8).
7. No GIF tab in the MVP (section 6.4).
