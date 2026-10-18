# Discord gap research

Status: research, audited 2026-10-18. Not a plan: nothing here is scheduled. It lists what a Discord user would find missing in Concord, checked against Discord's official Help Center, the current working tree on `main`, [milestones.md](milestones.md), the M4.5 to M4.8 plans and results, and Stoat 0.15.5's OpenAPI file (`packages/stoat/api/0.15.5/openapi.json`). Implementation routes and priorities are our assessment, not claims from Discord.

Left out on purpose: anything Concord already has, and anything planned in M4.5 to M4.8 (including task 14c voice messages). Task 15's compact layout and font size are already implemented. Items planned for M5 to M9 are marked "planned" so they aren't forgotten. Cut and deferred items remain labelled; listing them does not reopen their scope.

The inventory has **52 distinct feature entries**, including partial implementations, planned/deferred work and one mobile-call validation item. It is not a count of 52 confirmed bugs. The clearest unscheduled opportunities are search scope and filters, attachment spoilers, accessibility/display controls, status expiry, image cropping, category mute/read actions and a full reaction-member list.

**Columns.**
- **Status**: missing, partial, planned (with the milestone), or cut (decided against in a plan).
- **Needs**: *client only* (Stoat already has the route or data, or it's a pure UI feature); *layer* (needs Concord's own layer, architecture section 11); *Stoat change* (native support needs an upstream change); *architecture decision* (outside the current backend or platform scope). Missing API fields do not prove a layer approximation impossible.
- **Size**: S is about a day, M is a few days, L is a week or more. Rough estimates for the stated approximation, not commitments. Platform-dependent work needs a probe before estimation.

**What the checked Stoat 0.15.5 API does not model natively**: threads, forum and stage channels, polls, stickers, forwarding, edit history, invite expiry and use limits, server-wide search, activities, scheduled events, category permissions (a category is only a title and a list of channels), attachment alt text, configurable friend/DM privacy, status expiry, rules screening and AutoMod. **What it exposes for further client work**: webhooks, bots, role icons and owner transfer (`owner` on a server edit). The client already uses `pinned` for its pins panel.

## Messaging

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Search the whole server, not one channel. Fan out per channel with a cap, and say which channels were searched. Upstream stays the real fix | [How to Use Search](https://support.discord.com/hc/en-us/articles/115000468588-How-to-Use-Search-on-Discord) | missing (known gap, architecture section 9) | client only (fan-out); Stoat change (proper) | M |
| Search filters `has:`, `mentions:` and `in:`, plus oldest/relevance sort. Author and dates exist; `Session.search` forces Latest. Stoat supports sort; content/mention filters need bounded client scanning, and `in:` needs channel selection | [Search guide](https://support.discord.com/hc/en-us/articles/115000468588-How-to-Use-Search-on-Discord) | partial | client only; disclose incomplete coverage | M |
| Spoiler attachments. Text spoilers exist, but images/files cannot be hidden. A filename convention is a possible implementation, not verified compatibility with other clients | [Spoiler Tags](https://support.discord.com/hc/en-us/articles/360022320632-Spoiler-Tags) | missing | client only approximation | S |
| Full "who reacted" list. `Reactions.svelte` names only the first six in a tooltip | [Reactions FAQ](https://support.discord.com/hc/en-us/articles/12102061808663-Reactions-and-Super-Reactions-FAQ) | partial | client only | S |
| Poll creation, voting, closure and results. A reaction-vote helper cannot enforce single choice or deadlines. Discord creates polls from the attachment menu, not `/poll` | [Polls FAQ](https://support.discord.com/hc/en-us/articles/22163184112407-Polls-FAQ) | missing | client only helper; layer for authoritative voting; Stoat change for native parity | M/L |
| Author-written image alt text. Attachments use the filename; the API File schema has no description field | [File Attachments FAQ](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ) | missing | layer metadata or Stoat change for interoperability | M |
| Discord underline (`__text__`) and subtext (`-#`). The parser treats double underscores as bold and has no subtext block | [Markdown Text 101](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline) | partial | client only; changing underscore semantics affects existing messages | S |
| Threads, forum channels | [Threads FAQ](https://support.discord.com/hc/en-us/articles/4403205878423-Threads-FAQ) | deferred; decision gate criterion 2 if required for MVP | architecture decision for native parity | L |
| Forward a message. Could be faked as a quote plus link to the original | [Message Forwarding](https://support.discord.com/hc/en-us/articles/24640649961367-Message-Forwarding) | cut | client only (fake); Stoat change (real) | S |
| Saved messages, bookmarks, reminders. Discord documents a limited Nitro experiment, not a universal baseline | [Bookmarks and Reminders](https://support.discord.com/hc/en-us/articles/26442819646999-Message-Bookmarks-and-Reminders) | cut from M4.8 (decision 2) | client only synced bookmarks; layer/push for offline reminders | M |
| GIF search and browsing. M4.5 delivered saved favourites only, narrowing its original search scope | [Sending GIFs](https://support.discord.com/hc/en-us/articles/360021235192-Sending-GIFs-on-Discord) | partial; deferred from original scope | layer/provider integration; provider availability and terms need checking | M |

## Servers and channels

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Mute a category, and mark a category read. Stoat's notification settings hold only server and channel; apply to each channel or keep a `concord:` key | [Notifications Settings 101](https://support.discord.com/hc/en-us/articles/215253258-Notifications-Settings-101) | missing | client only | S |
| Rules and a welcome page that a new member must accept before posting | [Rules Screening FAQ](https://support.discord.com/hc/en-us/articles/1500000466882-Rules-Screening-FAQ) | missing | layer (acceptance stored; a gate only Concord's clients obey) | M |
| Webhooks in server settings (create, name, avatar, copy URL). Stoat has the routes and the permission exists, but M4.7 decision 7 hid it | [Intro to Webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks) | cut for now (m4.7-plan.md) | client only | M |
| Transfer server ownership (Stoat asks for an MFA ticket) | [Transfer Ownership](https://support.discord.com/hc/en-us/articles/216273938-How-to-Transfer-Ownership-of-a-Discord-Server) | missing (planned for M7 in m2c-plan.md, never scheduled) | client only | S |
| Invite expiry and use limits | [Invites 101](https://support.discord.com/hc/en-us/articles/208866998-Invites-101) | missing. Concord's invite-on-request flow softens it | Stoat change | M |
| AutoMod keyword and mention-spam rules. The history guard is not content moderation; a bot can remove a message after delivery but cannot block its publication | [AutoMod FAQ](https://support.discord.com/hc/en-us/articles/4421269296535-AutoMod-FAQ) | missing | layer/bot approximation; Stoat change for pre-send enforcement | L |
| Scheduled events with "interested" and a reminder | [Scheduled Events](https://support.discord.com/hc/en-us/articles/4409494125719-Scheduled-Events) | missing (deferred in the product brief) | layer; reminders need push (M7) | L |
| Server guide and onboarding questions that hand out roles | [Server Guide FAQ](https://support.discord.com/hc/en-us/articles/13497665141655-Server-Guide-FAQ) | missing | layer | L |
| Announcement channels and following them across servers | [Announcement Channels](https://support.discord.com/hc/en-us/articles/360032008192-Announcement-Channel-FAQ) | missing; low fit for this private community | layer relay approximation; Stoat change for native channel type | L |

## Roles and permissions

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Category permissions that channels inherit, and "Sync now". A cheaper form: "apply this override to every channel in the category" | [Channel Categories 101](https://support.discord.com/hc/en-us/articles/115001580171-Channel-Categories-101) | missing | client only (bulk apply); Stoat change (real inheritance) | M |
| Role icons: upload in the role editor and show next to names. The field exists in Stoat | [Custom Role Icons FAQ](https://support.discord.com/hc/en-us/articles/4409571023639-Custom-Role-Icons-FAQ) | partial (shown on the profile card only; no upload) | client only | S |
| View server as role | [View Server As Role](https://support.discord.com/hc/en-us/articles/360055709773-View-Server-As-Role-Permission-Guide) | missing. The permission calculator already exists | client only | M |

## Voice and video

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Picture-in-picture for a stream while using another tab | [Go Live and Screen Share](https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share) | missing (listed "not planned" in client.md section 10.10) | client only (browser PiP; desktop in M5) | M |
| Video background blur and backgrounds | [Video Backgrounds](https://support.discord.com/hc/en-us/articles/4413490191127-Video-Backgrounds) | missing | client only (a segmentation model in the browser) | L |
| Voice channel status text | [Voice Channels FAQ](https://support.discord.com/hc/en-us/articles/19583625604887-Voice-Channels-FAQs) | missing (not planned) | layer | M |
| Push-to-talk and shortcuts outside the window, screen-share audio | [Voice, Video and Streaming Guide](https://support.discord.com/hc/en-us/articles/33030151293079-Discord-Voice-Video-Streaming-Guide) | planned M5 | client only | L |

## Profile and social

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Custom status "clear after" (30 minutes, 1 hour, today). m2b-plan.md decision 6 left it out. The client can store an expiry in a `concord:` key and clear the status when any client next sees it expired; it won't fire while every device is closed | [Custom Status](https://support.discord.com/hc/en-us/articles/360035407531-Custom-Status) | missing | client only (clears late); layer (exact) | S |
| Activity status ("Playing X"), with opt-out and per-server sharing controls | [Activity Sharing](https://support.discord.com/hc/en-us/articles/7931156448919-Activity-Sharing-on-Discord-FAQ) | deferred in product brief; M5 does not itself promise rich presence | layer + desktop detection | L |
| Connections (Steam, YouTube) on the profile, and linked roles | [Connections and Linked Roles](https://support.discord.com/hc/en-us/articles/8063233404823-Connections-Linked-Roles-Community-Members) | missing | layer | L |
| Privacy controls for friend requests, server-member DMs and message requests. Existing blocking does not provide these configurable policies | [Blocking and Privacy Settings](https://support.discord.com/hc/en-us/articles/217916488-Blocking-Privacy-Settings) | missing | client filtering only approximates it; enforcement needs backend support/access architecture changes | L |
| Username change and self-service account deletion. Email-change UI already exists, conditional on the node email capability | [Account management](https://support.discord.com/hc/en-us/sections/360007770532-Account-Management) | deletion planned M6; username change not explicit in current M6 scope | client only; verify deployment prerequisites | M |
| Ignore without blocking: hidden messages, notification suppression and call warnings. Current Ignore actions dismiss requests/calls, not a stored ignore list. Discord labels availability experimental | [Ignore users](https://support.discord.com/hc/en-us/articles/28084948873623-How-to-Ignore-Users-on-Discord) | missing; experimental comparison | client only synced preference | M |
| Switch between signed-in accounts without logging out | [Account Switcher FAQ](https://support.discord.com/hc/en-us/articles/4412732047127-Discord-Account-Switcher-FAQ) | missing; lower priority for one community | client only; session/cache isolation required | M |

## Notifications

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Unread count on the installed app's icon (Badging API) and a dot on the favicon. Only the tab title shows a count today | [Notifications Settings 101](https://support.discord.com/hc/en-us/articles/215253258-Notifications-Settings-101) | partial | client only | S |
| Web push to phones, with mobile-specific toggles; mutes aren't honoured by Stoat's push | [Mobile Notifications Settings 101](https://support.discord.com/hc/en-us/articles/218892547--Mobile-Notifications-Settings-101) | planned M7 | client only (a RabbitMQ sidecar if mutes matter) | L |
| Tray icon, taskbar flash, desktop notification badges | [Notifications Settings 101](https://support.discord.com/hc/en-us/articles/215253258-Notifications-Settings-101) | planned M5 | client only | M |
| Email notifications and digest preferences | [Email notification settings](https://support.discord.com/hc/en-us/articles/4408820335767-How-can-I-manage-my-email-notifications-settings) | missing | layer and email delivery; do not assume immediate email for every mention | L |
| Notifications for reactions to your messages, with preferences. Discord labels this a limited experiment | [Reactions FAQ](https://support.discord.com/hc/en-us/articles/12102061808663-Reactions-and-Super-Reactions-FAQ) | missing; experimental comparison | client only while open; layer/push for offline delivery | M |

## Settings and accessibility

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| In-app **Reduced motion** switch, "Play GIFs automatically" and "Play animated emoji" (on hover or never). Today only the OS setting is read | [Reduced Motion Setting](https://support.discord.com/hc/en-us/articles/360040613412-Reduced-Motion-Setting) and [Accessibility tab](https://support.discord.com/hc/en-us/articles/1500010454681-Accessibility-Settings-Tab) | partial | client only | S |
| Chat display toggles: link/image previews, reaction visibility, spoiler reveal behaviour | [Attachment settings](https://support.discord.com/hc/en-us/articles/25444343291031-File-Attachments-FAQ), [Spoiler settings](https://support.discord.com/hc/en-us/articles/360022320632-Spoiler-Tags) | missing | client only | S |
| Streamer mode: hide your email, invite links and notifications while streaming, with a keybind | [Streamer Mode 101](https://support.discord.com/hc/en-us/articles/218485407-Streamer-Mode-101) | missing | client only | M |
| Role colour contrast, high-contrast mode, saturation slider, "always underline links" | [Accessibility tab](https://support.discord.com/hc/en-us/articles/1500010454681-Accessibility-Settings-Tab) | missing | client only | M |
| Themes beyond the black one (light, ash) | [Themes and Appearance](https://support.discord.com/hc/en-us/articles/207260127-How-to-Change-Discord-Color-Themes-and-Customize-Appearance-Settings) | cut (M4.8 decision 3) | client only | M |
| Editable keybinds for every shortcut. Voice keybinds are editable; the rest are fixed | [Commands, Shortcuts and Navigation](https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide) | partial | client only | S |
| Avatar, banner and icon cropper. Uploads use fixed rendering crops; the Discord source explicitly documents banner cropping | [Custom Profiles](https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles) | missing; earlier plan deferred to M7, current milestone does not name it | client only | M |
| Finnish language and a language picker | [Language settings](https://support.discord.com/hc/en-us/articles/216406447-How-can-I-change-Discord-s-Language) | planned M7 | client only | M |
| Text-to-speech/read-aloud controls, including rate and channel notification choices | [Text-to-Speech 101](https://support.discord.com/hc/en-us/articles/212517297-Text-to-Speech-101), [Accessibility](https://support.discord.com/hc/en-us/articles/1500010454681-Accessibility-Settings-Tab) | missing; generic M7 accessibility pass does not promise this | client only for local read-aloud; shared `/tts` semantics need a protocol decision | M |

## Mobile

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Complete phone layout, swipe panels and home-screen installation. A responsive shell exists; the mobile pass remains | [Getting Started on Mobile](https://support.discord.com/hc/en-us/articles/360046618751-Getting-Started-on-Mobile) | partial; planned M7 (PWA is Concord's implementation) | client only | L |
| Calls continuing reliably while a phone is locked or another app is foreground. Unverified platform requirement, not a confirmed runtime defect | [Mobile voice baseline](https://support.discord.com/hc/en-us/articles/360046618751-Getting-Started-on-Mobile) | needs device validation; not explicit in M7 | platform probe first; no proven client-only fix | unknown |
| Screen share from a phone | [Mobile Screenshare FAQ](https://support.discord.com/hc/en-us/articles/360058862134--Mobile-Screenshare-FAQ) | missing; Discord documents native mobile clients | architecture/platform decision; PWA feasibility not tested in this audit | L |

## Discovery

Public discovery is out of scope (below). What is left is finding things inside the community:

| Feature | Discord doc | Status | Needs | Size |
|---|---|---|---|---|
| Invite page that shows the server's name, icon and online count | [Invites 101](https://support.discord.com/hc/en-us/articles/208866998-Invites-101) | planned M6 | client only | S |

## Recommended top 10 before the closed beta

Ranked by likely value to the stated 200-person community. This is a product judgment, not usage research. M5 to M7's planned items (desktop, push, PWA, Finnish) are separate commitments. Approximations below are not full Discord parity.

1. **Search the whole server (and `has:`/`mentions:` filters).** Discord users search constantly, and one-channel search makes old answers feel lost; fan-out with a cap is good enough for a 200-person server. M and S.
2. **Validate mobile call continuity early.** Test locked-screen and background calls on Android and iOS before promising parity. No implementation estimate or proposed fix until the device probe.
3. **Reduced motion, GIF autoplay and link-preview switches.** GIF-heavy chat is a main complaint without "play on hover", and the in-app reduced-motion switch is the first accessibility setting Discord users look for. S.
4. **Custom status "clear after".** Statuses like "sleeping" or "in a meeting" otherwise stay for days, which makes the status line untrustworthy. S.
5. **Spoiler attachments.** Image-sharing communities rely on hiding images behind a click, and text spoilers alone don't cover it. S.
6. **Avatar, banner and icon cropper.** Every new member uploads an avatar on day one, and an uncroppable upload is the first rough edge they hit. M.
7. **Mute a category and mark it read.** With 200 members the channel list grows, and muting a whole group of channels at once is how people tame it. S.
8. **A reaction-based vote helper.** Useful for choosing a game or date, provided it is described as an informal vote. Enforced single-choice voting and deadlines need more work. M for the helper.
9. **Streamer mode.** The community shares screens and some will stream; hiding invite links, notifications and email while live is expected from a Discord replacement. M.
10. **Full "who reacted" list.** Clicking a reaction to see who voted is a habit, and a six-name tooltip is a visible step down. S.

Next after these, if the beta asks: webhooks in server settings (M), category permission "apply to all" (M), rules and welcome page for new members (M), scheduled events (L), and "Playing X" activity status with the desktop app (L).

## Deliberately out of scope

Nitro and every paid perk (boosts, profile effects, avatar decorations, nameplates, higher upload limits), monetisation and the shop, Activities and Watch Together, the soundboard, stickers, Stage channels and Stage-for-events, public server discovery and the Community server features built on it, apps and slash commands, the in-game overlay, Family Center and teen-safety controls, and Discord's own account-trust and age-verification flows.

## Audit evidence and limits

Repository instructions used: [next-session handoff](next-session-prompt.md#how-to-work), [product scope](product-brief.md), [milestones](milestones.md), and the decisions in [M4.8](m4.8-plan.md) and [M4.7](m4.7-plan.md). The handoff's implementation chronology is stale: code and results take precedence for what is built. This updates the existing research draft without changing the roadmap.

The source survey covered Discord's [Messaging and Chat](https://support.discord.com/hc/en-us/sections/115000458672-Messaging-and-Chat), [Features](https://support.discord.com/hc/en-us/sections/201110577-Features), and [Account Management](https://support.discord.com/hc/en-us/sections/360007770532-Account-Management) indexes and the linked official articles above. Experimental features are labelled; community forum requests are not treated as shipped features. This is a scoped parity audit, not an exhaustive inventory of every Discord experiment or paid feature.

| Repository evidence | Finding |
|---|---|
| `apps/web/src/lib/conversation/FindPanel.svelte`, `find.ts`; `packages/domain/src/session.svelte.ts` (`search`) | One channel, author/date filters, bounded scanning and Latest sort; no server-wide search or content/mention filters |
| `apps/web/src/lib/conversation/Reactions.svelte` | Tooltip truncates names at six; clicking toggles a reaction, no full list |
| `apps/web/src/lib/conversation/Attachment.svelte`; `shell/Composer.svelte` | Filename alt text; no attachment spoiler/description control |
| `apps/web/src/lib/markdown/parse.ts` (`DELIMS`, `Block`) | Double underscore maps to strong; no subtext node |
| `apps/web/src/lib/composer/GifPicker.svelte`; [M4.5 results](m4.5-results.md) | Saved favourites only; external GIF search was not delivered |
| `apps/web/src/lib/shell/CustomStatus.svelte` | Saves text without expiration |
| `apps/web/src/lib/admin/menu.ts` (`categoryMenu`), `Roles.svelte`, `ServerSettings.svelte` | Category editing without mute/read actions; no role-icon editor, ownership-transfer UI or role-preview mode |
| `apps/web/src/lib/settings/AppearanceSection.svelte`, `ProfileEditor.svelte`, `AccountSection.svelte` | Compact layout/font size are built; no cropper; email-change implementation is capability-gated |
| `apps/web/src/lib/conversation/MessageItem.svelte`; `view/contextmenu.svelte.ts` (`menuOn`) | Message long-press menus are implemented, so removed from the gap list |
| `apps/web/src/lib/people/actions.ts`; `session/token.ts`, `session/app.svelte.ts`; `notify/watch.ts` | Request dismissal/blocking and a single active session exist; no separate ignore list, account-switcher UI or reaction-notification preference found |
| `packages/stoat/api/0.15.5/openapi.json` | `DataMessageSearch` has query/pinned/limit/before/after/sort/include_users; `Category` has id/title/channels; `File` has no alt-text field; `UserStatus` has text/presence; `DataEditRole.icon` and `DataEditServer.owner` exist |
| [M5–M7 scopes](milestones.md#m5-desktop-apps) | Desktop, account website, mobile/push/Finnish and general accessibility work are already planned; individual gaps are not automatically committed by those broad headings |

Missing means no implementation was found in the relevant UI, domain code and settings, not that every runtime path was tested. Implementation routes are inferences from the repository. The layer can store new data, but a client-only rule does not enforce restrictions against direct Stoat API use. A moderation bot observes messages after publication. Neither is equivalent to backend enforcement.

No device testing was performed. Background voice, mobile screen capture, PiP and notification delivery need platform checks. A phone share-sheet target remains a Concord improvement idea, but was removed from the documented parity list because this audit did not establish an official Discord source for it.

The repository requests Sonnet research/review agents in its handoff. Sonnet is not available in this session's agent model list; this audit was performed in the main session and does not claim an independent challenger review.

The earlier draft linked profile cropping to the self-bot policy and language selection to appearance settings; both citations are corrected. Bookmarks now have an official source and an experiment/Nitro qualifier. Compact layout, font size, email-change UI and message long-press menus are excluded from missing-feature counts because they are implemented.
