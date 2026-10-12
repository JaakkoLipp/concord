# Concord: product brief

Status: draft for review, layer 1 of the planning stack (brief → architecture → component specs → milestone plans).
Concord is a working name.

## What we are building

A private, Discord-style chat app for one existing community of about 200 people, mostly in Finland.
It runs on a self-hosted [Stoat](https://github.com/stoatchat/stoatchat) backend (formerly Revolt), left unmodified.
Everything people see and touch is ours: a browser client, Windows and Linux desktop clients, and a website.

The product is the client experience. The backend is a dependency we operate, not a thing we build.

## Who it is for

- **Members**: about 200 people, of whom maybe 30 to 60 are online at once and 5 to 15 are in voice on a busy evening.
  They already use Discord daily, so every interaction is judged against it.
- **Server admins**: Jaakko and a few trusted members who create channels, manage roles, issue invites and moderate. Only server admins can create invites.
- **Global admins**: the accounts allowed to create servers, initially only Jaakko.
- **Language**: the community speaks Finnish. The UI ships in English first with every string externalised, and Finnish follows as the second locale.

## Goals

1. Members can move their daily chat and voice evenings off Discord without feeling a downgrade in look, feel or reliability.
2. Screen sharing reaches 1080p60 for game streaming, degrading gracefully instead of failing.
3. The client stays light: fast to start, low idle memory, no unnecessary JavaScript.
4. The protocol and client architecture leave room for an optimised native client later.
5. One person can operate the whole system on a single VPS with scripted backups and upgrades.

## Non-goals

- Public sign-up, discovery, or growth features. Registration is invite-only.
- Native mobile apps. Phones get the responsive web client installed to the home screen as a PWA, with push notifications.
- Federation, end-to-end encryption, a bot platform, or a plugin system.
- Payments, Nitro-style perks, stickers marketplace, or any monetisation.
- Changes to the Stoat backend. Gaps are handled by upstream pull requests or dropped.

## MVP feature set

| Area | In the MVP |
|---|---|
| Accounts | Invite-only registration, email verification, login, password reset, TOTP 2FA with recovery codes, session list with sign-out. |
| Profile | Avatar, banner, display name, bio, custom status, presence (online, idle, busy, invisible). |
| Communities | Servers with icon and banner, categories, text and voice channels, roles with colours, basic per-channel permissions, invites, kicks and bans. Invites are created by server admins only, and servers by global admins only. |
| Messaging | Persistent history, markdown, replies, mentions, reactions, edit, delete, pins, attachments with image previews, link embeds, custom and Unicode emoji, typing indicator, unread and mention markers. |
| Search | Message search. Scope is per channel in Stoat today; server-wide search is a known gap. |
| Social | Friends list with requests and blocks, direct messages, small group DMs, DM voice calls. |
| Notifications | Browser and desktop notifications while the app runs. Web push to the installed web app on Android and on iOS 16.4 or later. |
| Voice | Voice channels with join and leave, mute, deafen, speaking indicators, per-user volume, push-to-talk on desktop. |
| Screen share | 1080p60 target with automatic fallback to lower layers, and viewers choose quality. System audio on Windows, with the call itself filtered out, if the desktop milestone confirms that works. Camera video comes free with the same stack. |
| Website | Invite landing page, registration, account and security management, downloads. |
| Platforms | Browser (Chromium and Firefox), Windows desktop, Linux desktop as Flatpak, phones through the installed web app. |

Explicitly deferred: threads, forum channels, scheduled events, stickers, soundboard, rich game activity, server tag chips, server-wide search, server discovery.
Threads, rich activity and server tags have no equivalent in Stoat. The architecture document explains how the UI approximates or drops each one.

## Quality bar

The reference is the current Discord dark desktop client. Screenshots live in `docs/reference/`, kept out of git because they show real people:

| File | Shows |
|---|---|
| `discord-reference.webp` | Server view: rail, channel list, conversation with embed and thread card, member list, user dock |
| `discord-dm-and-profile-panel.webp` | DM view: friends and DM list, image attachments, reactions, profile side panel |
| `discord-profile-popout.png` | Profile popout: banner, avatar, badges, bio, member since |
| `discord-emoji-picker.png` | Emoji picker: tabs, search, favourites, frequently used, per-server sections |
| `discord-voice-settings.png` | Settings modal: voice devices, volumes, mic test, input profile, noise suppression |

What they show:

- Nearly black surfaces with a few close tones to separate the server rail, channel list, conversation and member list.
- Compact, dense navigation: server icons with unread pills, collapsible categories, voice participants under voice channels.
- A conversation column with grouped messages, coloured role names, small badge chips, inline embeds, and a reply and reaction model that feels instant.
- A member list grouped by role with presence dots and custom status lines.
- A bottom-left user dock with voice controls always in reach.
- Profile popouts and a DM profile panel with banner, avatar with presence ring, bio and member-since date.
- An emoji picker with search, favourites, frequently used and per-server sections.
- A settings modal with left navigation and dense form controls: selects, sliders, toggles and radio groups.
- Subtle borders, consistent hover and focus states, smooth scrolling, and no layout jumps when images or embeds load.

We match Discord's layout, density and surfaces, not its identity. Concord uses its own accent colour, an open font and an open icon set, and no Discord logos or artwork.

Every interactive element needs hover, active, focus-visible and disabled states, and keyboard navigation for the main flows.
Optimistic updates are the default for sending, reacting and editing.

Starting targets, to be confirmed with measurements in the first client milestone:

| Measure | Target |
|---|---|
| Client JavaScript, gzipped, initial load | under 250 KB excluding the voice SDK, which loads on first voice join |
| Desktop idle memory, one server open | under 300 MB total across Electron processes |
| Message list scroll | 60 fps with 1,000 loaded messages on a mid-range laptop |
| Cold start to usable channel, desktop | under 2 seconds on a warm cache |
| Switching channels | under 100 ms when history is cached |

## Success criteria for the first 200 users

- The community runs its normal week on Concord for a month with no return to Discord for chat.
- Voice evenings with 10 or more people run without dropouts on typical Finnish home connections.
- A 1080p60 share from Windows reaches viewers at 1080p60 when the sharer's upload allows it, and steps down cleanly when it doesn't.
- No lost messages and no account lockouts that need database surgery.
- Jaakko spends under an hour a week on operations.

## Constraints

- Backend: Stoat, self-hosted on one Hetzner VPS in Helsinki at `concord.jaalip.com`, unmodified. AGPL-3.0.
- Development runs against the Stoat stack on the VPS, with the client built and served locally on Jaakko's machine. Other people get accounts from M3, when the VPS becomes production.
- Our code: AGPL-3.0.
- Implementation is done mostly by coding agents. Jaakko reviews the experience and tests on real devices, so every milestone ends with a device test list.
