# M2c plan: administration and notifications

Status: signed off by Jaakko on 2026-10-14, with all eight decisions accepted. Implements the M2c section of [milestones.md](milestones.md) from [client.md](client.md) sections 7 and 8, and [architecture.md](architecture.md) section 4.2. Results go in `docs/m2c-results.md`.

The working agreement from M2b still applies:
- Every task ends deployed at `https://concord.jaalip.com/app`, with a scripted live check in `tools/live/src/`, and is reviewed there.
- Each finished task is committed and pushed after `pnpm verify`.
- Unit tests cover the risky core only: the rank and grant rules, the REST bucket queue, the reorder merge, the notification rule and the settings round trip. There are no new fixture scenarios.
- Device checks are collected for later, not waited for.

## Checked while planning

Five probes ran against the dev stack: `dev-admin` created four throwaway servers, and `tuuli` and `onni` joined them, with sockets recording every event. Sonnet agents read Stoat's 0.15.5 server source and Stoat's own web client, and a Sonnet challenger reviewed the draft. The findings that shape the design:

| Question | Answer |
|---|---|
| What does creating a server make? | One channel, "General", no roles and no categories. The default permissions include `InviteOthers`. The creator's sessions get `ServerCreate`. Anyone else who isn't allowed gets `CantCreateServers`. |
| Does the bootstrap race anyone? | No. Nobody else can be in the server until an invite exists, so removing `InviteOthers` from the default right after creating it is safe. It takes three requests: the default permissions, the Admin role, and the role's permissions. |
| Rate limits | **Every `/servers/{id}/…` route shares one bucket of 5 requests per 10 s, per user and server**: server edits, categories, roles, ranks, role permissions, channel creation, member edits, kicks, bans, the invite and ban lists, and the member list the client polls. Each channel's routes share 15, emoji and invites 20, server creation 5. Our REST layer learns a bucket only from a route's first response and doesn't count requests in flight, so concurrent saves, or a route used for the first time, get a 429, and a second 429 fails. Building a server takes 40 or more requests in that one bucket, over 80 s. |
| A channel's visibility changes | Stoat sends `ChannelDelete` to a member who loses `ViewChannel`, through an override or a role change, and `ChannelCreate` when they gain it. The store already handles both. Stoat's source suggests a brand-new channel reaches every member, visible or not, so the client keeps checking `ViewChannel` itself, as it does. |
| Creating and deleting a channel | Creating sends `ServerUpdate` with the new channel list, then `ChannelCreate`, so the store picks it up. A new channel is in no category. Deleting sends only `ChannelDelete`, the same event as losing sight of it, and **the channel stays in its category**, because Stoat doesn't clean `categories`. A category write naming a deleted channel succeeds with that ID dropped, so the client can keep every ID it holds when it writes, including channels it can't see. A channel in two categories is refused. |
| Categories | Up to at least 60, ids and titles 1–32 characters, empty categories allowed. Editing them needs `ManageChannel`, not `ManageServer`. |
| Channel overrides | `PUT /channels/{id}/permissions/{role or default}`. **There is no delete**: removing an override means writing allow 0 and deny 0, which stays in the data as an empty entry. Overrides need `ManagePermissions`. Deleting a role may leave its overrides behind, so the client ignores overrides for unknown roles, as the calculator already does. |
| Rank rules | Roles are ranked from 0, the strongest. A member may only edit, delete, assign or set overrides for roles **strictly below** their own best role, so a moderator can't edit their own role. Nobody but the owner can grant a permission they don't hold, or lift a deny on one (`CannotGiveMissingPermissions`), the default permissions included. A new role always goes to the bottom, even when rank 0 is asked for. A moderator may reorder the roles below them but not move any role above their own. The owner can't be kicked. |
| Kicks, bans, leaving | Everyone, the person included, gets `ServerMemberLeave` with `reason`: `Kick`, `Ban` or `Leave`. No `ServerDelete` reaches the person. A banned user rejoining gets `Banned`. `GET /bans` returns the bans with reasons, plus the users. Unbanning needs `BanMembers`. |
| The owner leaving | **`DELETE /servers/{id}` by the owner deletes the server**, even with `leave_silently`. Handing over ownership exists, but needs a fresh MFA ticket from the owner's password or TOTP. |
| Invites | Creating one needs `InviteOthers` in that channel. Listing needs `ManageServer`, and revoking needs `ManageServer` or being its creator. Invites never expire and have no use count. |
| Custom emoji | Names match `[a-z0-9_]`, 1–32 characters, and may repeat. Files up to 500 KB, 100 emoji per server. Renaming exists. Creating, renaming and deleting need `ManageCustomisation`, and an emoji's creator may delete it. `EmojiCreate`, `EmojiUpdate` and `EmojiDelete` reach every member. |
| Validation | Server, channel, role and category names 1–32 characters. Descriptions up to 1024. Role colours accept hex, named colours, `rgb()`, `var()` and gradients, but not `url()`. Icons 2.5 MB (`icons`), banners 6 MB (`banners`). 200 roles and 200 channels per server. |
| A private channel at creation | Making one takes three requests: create, deny `ViewChannel` to Everyone, allow the chosen roles. In between, every member's client receives its name and description. Nothing in 0.15.5 prevents this. |
| Joining | Neither the joiner's `ServerCreate` nor the join response carries their own member record, so our permission check would hide every channel until a reload. |
| `@everyone` and `@online` | **They exist on 0.15.5**, contrary to the M2a plan. Typed as text, they need `MentionEveryone`, as role mentions need `MentionRoles`, and set message flags `4` and `8`. Flag `2` means "don't notify". A reply with mention on adds the replied author to `mentions`. User mentions are kept only for members who can see the channel. |
| How Stoat's client notifies | Messages only. The level is the channel's, else the server's, else the default: **"mentions only" for servers**, all for DMs and groups. Mutes are a separate map with an optional end time. Busy gets nothing, Focus only mentions. The open channel is skipped only while the window has focus. Own and blocked users' messages are skipped. Its flag check is wrong: it tests 2 and 3, so it treats "don't notify" as a mention and misses `@everyone`. We don't copy that. |
| The `notifications` settings key | `{server, channel, server_mutes, channel_mutes}`. Levels are `all`, `mention` and `none`. A mute is `{until?}` in epoch milliseconds. An old level `muted` means muted indefinitely. Our parser knows only the old two-key shape, so **a write from us today would wipe mutes set in Stoat's client**. |

**Side effects**: four servers created by `dev-admin` and deleted again. `tuuli` and `onni` joined, left, were kicked and banned in them, then unbanned. The seeded server wasn't touched, and nothing was left behind.

## Decisions for Jaakko

1. **Server channels default to "mentions only"**, DMs and groups to all messages, as in Stoat's client. Recommended: with 200 people in `#yleinen`, "all" would notify constantly. Anyone can switch a channel or the server to all.
2. **A muted channel still notifies when you're mentioned personally**: a user mention or a reply that mentions you. Not for `@everyone`, `@online` or roles. This is Discord's behaviour. Stoat's client stays silent even then, so the two clients differ for the same account. Recommended. Muting hides unread markers. Mention badges stay.
3. **Channels and categories are managed in the sidebar**, as on Discord and in Stoat's client: create from the server menu or a category's "+", rename, delete and reorder from the right-click menu. client.md put them in server settings. Recommended, because you see the result where you change it.
   - **Ordering is by menu, not drag, in M2c**: Move up, Move down and "Move to category" for channels, Move up and Move down for categories and roles. Admins set the structure once, and drag is the hardest part to build and to check. Drag comes in M7. Recommended.
4. **The Admin role created with a server gets every permission**, ranked first, not just `InviteOthers` as the seed does. Then a co-admin can run the server, though only the owner can edit the Admin role itself. Recommended.
5. **"Non-admin" for the invite warning means a role without `ManageServer`.** The permission editors warn when `InviteOthers` is granted to the default permissions, a channel's default, or a role without `ManageServer`.
6. **Desktop notifications are turned on per browser.** After sign-in, a bar asks once: "Enable desktop notifications". It sits under the header and can be dismissed. A Notifications section in settings has the same switch and explains a browser block. No sound of our own: the system plays its default. Recommended.
7. **Left out of M2c**:

   | Item | When |
   |---|---|
   | Timeouts, nicknames set by moderators, slowmode, webhooks, delete-messages-on-ban | M7, if asked for |
   | Notification sounds of our own | M7 |
   | Image cropper for icons, banners and emoji | M7, as for avatars |
   | Handing over server ownership | M7. It needs an MFA prompt, and Jaakko owns the one server. |
   | Drag reordering | M7, per decision 3 |
   | `@everyone` and `@online` in autocomplete | M7. Typing them already works for those allowed. |

8. **Accepted limit: a private channel's name briefly reaches every member's client when it is created**, as the table above shows. Make private channels with neutral names, or create them before inviting people. Recommended to accept and document.

## Server settings, screen by screen

Server settings and channel settings are overlays with the same layout as user settings: sections on the left, the section on the right, Escape or × to close, and the back button closes them. They live at `/app/server-settings/<server>/<section>` and `/app/channel-settings/<channel>/<section>`. Every edit screen has the bar from the profile editor: Reset and Save while there are changes, and a question before leaving with unsaved changes. Saves that wait for the rate limit show "Saving…", never an error.

A section shows only to people with its permission. Anyone with none of them sees no "Server settings" item at all.

**Entry points**:
- **The server menu**, from the server name at the top of the sidebar, and by right-clicking the server's icon in the rail:
  - Invite people, shown with `InviteOthers` in any channel,
  - Server settings,
  - Create channel and Create category, with `ManageChannel`,
  - Notification settings and Mute server, for everyone,
  - Leave server, not for the owner, asking first.
- **"+" on the rail**, only for accounts in `restrict_server_creation`.
- **Right-click a channel**: Mark as read, Notification settings, Mute channel, Invite people, Edit channel, Move up, Move down, Move to category, Delete channel, Copy link and Copy ID, each shown as permissions allow.
- **Right-click a category**: Create channel here, Rename, Delete, and Move up or down. Deleting a category leaves its channels uncategorised, at the top.
- **Right-click a member**, anywhere M2b's people menu opens: Roles, with a checklist of the roles you may assign, Kick and Ban.

**Create server**: a dialog with a name and an optional icon. Creating runs the bootstrap: the server, `InviteOthers` removed from the default, then the Admin role with every permission. The client opens the new server. A server whose setup didn't finish is recognised from its state, not from the tab that made it: it has no roles, and Everyone still has `InviteOthers`. Its owner sees a banner, "Setup didn't finish", with Retry, which skips steps already done.

**When a server goes away** for someone, through a kick, a ban, deletion, or leaving on another device, their client leaves it for the Friends screen and closes its settings if open. A kick says "You were removed from <server>", a ban "You were banned from <server>", and a deletion by someone else "<server> was deleted". Leaving says nothing.

**Sections**:

| Section | Who sees it | What it holds |
|---|---|---|
| Overview | `ManageServer` | Icon and banner, with their limits checked first. Name and description. Four system-message channels, for joins, leaves, kicks and bans, each a channel or Off. A channel that no longer exists shows as Off. |
| Roles | `ManageRole` or `ManagePermissions` | The roles in rank order, the strongest first, each with its colour and member count, then Everyone last. "Create role" asks for a name. Roles at or above your own are locked, with a note saying why. Move up and Move down in each row's menu reorder. |
| Role editor | Opened from Roles | **Display**: name, colour from twelve presets or typed as hex or a gradient with a live preview, and "Show members separately". **Permissions**: grouped as Stoat's client groups them, each with a one-line description, each allow, neutral or deny. Permissions you don't hold are disabled. Delete role, asking first. **Everyone** has the permission list only, as on or off. |
| Emoji | `ManageCustomisation` | Upload: pick an image up to 500 KB, the name filled from the file name in the allowed form. Slots left out of 100. The list shows each emoji, its `:name:` editable in place, who uploaded it, and a delete button. |
| Invites | `ManageServer` | Each invite with its code, channel and creator, a copy button and Revoke. |
| Members | `KickMembers`, `BanMembers` or `AssignRoles` | Every member with a search box: avatar, name, role chips and join date. The row menu holds Roles, Kick and Ban, for members ranked below you. |

**The Roles checklist** offers only roles below yours, and saving keeps any role the member holds that you can't assign, because Stoat replaces the whole list.
| Bans | `BanMembers` | Each banned user with the reason, a search box and Unban. |
| Delete server | The owner | Typing the server's name confirms. |

**Kick and ban**: a dialog naming the person. Ban has a reason, up to 1024 characters. The person's client drops the server and says "You were removed from <server>" or "You were banned from <server>".

**Invite dialog**: creates an invite for the chosen channel, the current one by default, offering only channels where you have `InviteOthers`, and shows the link with Copy. Until M6 the link is `https://concord.jaalip.com/invite/<code>`, which Stoat's own client serves.

**Channel settings**:

| Section | Who sees it | What it holds |
|---|---|---|
| Overview | `ManageChannel` | Name and description. Delete channel, asking first. |
| Permissions | `ManagePermissions` | Everyone, then each role with an override, then "Add a role". Each permission is allow, neutral or deny, and the effect on Everyone is summarised in one line, such as "Members can read but not send". Removing an override writes it empty, and an empty override counts as none everywhere. |

**Create channel**: a dialog with Text or Voice, the name, the category, and "Private": when on, Everyone loses `ViewChannel` and the dialog offers the roles to let in.

## Notifications

**The rule**, a pure function with unit tests. A message notifies when all of these hold:
- desktop notifications are on in this browser, and the browser allows them,
- this tab holds the `concord:notify` Web Lock, so one tab per browser notifies,
- it isn't your own, from someone you blocked, or flagged "don't notify" (flag `2`),
- no tab of this browser has the window focused on that channel. Each tab shares the channel it shows while focused through `localStorage`, as idle shares input, refreshed every 30 s and ignored after 60 s, so a crashed tab can't silence notifications,
- your live presence isn't Busy, which also covers a Busy set in another client,
- the level allows it: all, or mention when it mentions you, never none,
- while your live presence is Focus, it mentions you,
- if the channel or server is muted and the mute hasn't ended, it mentions you personally (decision 2).

**Mentions you** means your ID in `mentions`, one of your roles in `role_mentions`, or flag `4` (`@everyone`) or `8` (`@online`). **Mentions you personally** means only your ID in `mentions`, which is a user mention or a reply with mention on.

**What it shows**: the title "Name (#channel, Server)", "Name" in a DM, or "Name (Group)", the text as the body, with mentions, channels and custom emoji shown by name and spoilers replaced by "spoiler", the author's avatar as the icon, and a `tag` per channel so a burst shows as one. A click focuses the window and opens the message. Attachments only: "Sent 2 files".

**Levels and mutes** are set from a "Notification settings" dialog, opened from the server menu, the channel menu and the DM or group menu. It has the level (Default, showing what it inherits, then All messages, Only mentions and Nothing) and the mute: 15 minutes, 1 hour, 8 hours, 24 hours, or until turned off. "Mute channel" and "Mute server" in the menus mute until turned off, and become Unmute while muted. The timed choices cost only the picker, since reading Stoat's timed mutes needs the expiry handling anyway.

**The settings key** is read and written in the shape Stoat's client uses, every sub-key kept, so its mutes survive our writes. Unknown keys are kept too. The old `muted` level is read as a mute with no end, and never written: changing the level of such a channel also writes its mute into the mute map, so it stays muted. Each write starts from the newest local value, including one still waiting to be saved, so two quick changes both survive. A minute clock in the store ends timed mutes, so dimming and badges come back without a reload. The store's default level changes from all to decision 1's, which touches the sidebar's dimming and the rail's badges.

## Agent tasks, in order

| # | Task | Done when |
|---|---|---|
| 1 | **Foundations**, mostly invisible, ending in the removal flow, which shows it all working. <br>- **REST**: every `/servers/{id}/…` route shares one bucket per server from the start, and each channel's routes one per channel. A bucket's requests go one at a time while it is near empty, counting those in flight. A 429 is retried after its wait for up to 60 s in all; any other error surfaces at once. Closing the tab while admin writes wait asks first. Unit tests. client.md section 4.4 is corrected. <br>- **Backend**: every admin route. **Mapping**: `reason` on member leaves, `EmojiUpdate`, and the server's `system_messages`. <br>- **Rank rules**, with unit tests: the owner outranks everyone; a member with no roles can act on no role, even if Everyone has `ManageRole`; nobody acts on an equal or higher rank, or on themselves through kick or ban; which permissions you may grant or un-deny; a role list that keeps roles you can't assign; a reorder that leaves roles at or above yours in place and merges with roles created or deleted while it waited. <br>- **Store**: fetch your own member when a `ServerCreate` lacks it, and the "when a server goes away" behaviour. | `removal.ts`, with `tuuli` in a browser and `dev-admin` over the API on a fresh `m2c-check` server: `tuuli` joins and sees its channels without a reload; a kick takes her to Friends with the notice, as does a ban, and a deletion with its own notice. Six role edits fired at once all land. |
| 2 | **Create a server, the server menu and Overview**: "+" on the rail, the create dialog with the bootstrap and Retry, the server menu, the server-settings overlay with Overview and Delete server. | `admin.ts` with `dev-admin` and `tuuli` in browsers: create a server; the API shows Everyone without `InviteOthers` and the Admin role first with every permission. A bootstrap stopped after the first step shows the banner, and Retry finishes it. `tuuli` joins over the API; a rename, an icon, a banner and a system-message channel show for her live. `dev` sees no "+" and no invite item. |
| 3 | **Channels and categories** in the sidebar: create channel and category, rename and delete both, Move up, Move down and Move to category. Reorders merge while they wait, so the latest order wins, and a `ServerUpdate` echo doesn't move the sidebar back while a newer local order waits, as M2b's settings echo works. Managers see empty categories. Channel settings with Overview. | Build the seeded server's four categories and ten channels in the UI, in order, renaming General to `yleinen`. Five quick moves end in the last order with no jump back. `tuuli` sees each new channel, in a category or not, and the order, live. Deleting a channel leaves no gap or stale entry. |
| 4 | **Roles**: the Roles section and role editor, Everyone, ordering, and the Roles checklist on members. Rank reorders merge like task 3's, with the same echo rule. Locked roles and ungrantable permissions follow task 1's rules. The invite warning. | Create the seeded roles other than Admin with their colours, the gradient included, hoisting and permissions, and reorder them. `tuuli`, given Pelaajat, shows in that hoisted group in `onni`'s member list live. `onni`, given a test role with `ManageRole`, `ManagePermissions` and `AssignRoles` but not `MentionEveryone`, sees the roles above his locked, `MentionEveryone` disabled, and keeps a higher role on `tuuli` when he changes her roles. |
| 5 | **Channel permission overrides**, with Private on create. | Make `#säännöt` read-only for Everyone with Moderaattori allowed to send: `tuuli`'s composer turns disabled live. A private channel for Admin only disappears from `tuuli`'s sidebar live and comes back when she gets the role. `onni`, managing channels without seeing that private channel, moves a channel, and the private one keeps its category. A removed override doesn't come back in the list. |
| 6 | **Invites, members, kicks and bans**: the invite dialog, the Invites, Members and Bans sections, and the kick and ban dialogs. | `dev-admin` invites; `tuuli` joins with it over the API. Kick and ban through the UI, with a reason; the ban lists her, a rejoin is refused, an unban lets her back. A revoked invite no longer works. `dev` sees no invite controls in the seeded server. |
| 7 | **Custom emoji**: the Emoji section, with rename. | Upload three emoji: `tuuli` finds them in her picker within a second and sends one. A rename and a delete show in her picker live. A 600 KB file and a bad name are refused before uploading. |
| 8 | **Notifications**: the rule, the settings key round trip, the notification dialog, the mute items, and the enable bar and settings section. | `notify.ts` with `dev` in a browser whose `Notification` is recorded, and messages from `tuuli`: <br>- each level, Busy and Focus, as the rule says, <br>- nothing in the open channel while focused, <br>- a muted channel only for a personal mention, not for `@everyone`, <br>- one notification for two open tabs, and none when the tab holding the lock is in the background and the other is focused on that channel, <br>- a 1-minute mute ending by itself, <br>- a click opening the message, <br>- a mute written in Stoat's shape surviving a level change made here, and a legacy `muted` channel staying muted after one. |
| 9 | **Acceptance and review**: `m2c.ts` builds a server like the seeded one from scratch in the UI as `dev-admin`, compares it with the seeded server over the API, and deletes it. The comparison covers: categories by title and order; channels by name, type, description and position; the two read-only channels' overrides; the roles other than Admin by name, colour, hoist, order and permissions; Admin first with `InviteOthers`; Everyone's permissions; the system-message channel; three emoji by name. The non-admin check also tries both actions with `dev`'s token and expects `CantCreateServers` and `MissingPermission`. `notify.ts` runs again. A Sonnet review of the whole M2c diff, with its findings fixed. Results go in `m2c-results.md`, and the handoff for M3 is written. | The criteria pass, the review findings are fixed or answered. |

Each script cleans up at both ends: it first deletes any server `dev-admin` owns whose name starts with the run prefix `m2c-check`, left by a failed run, and finally deletes its own, so `tuuli` and `onni` end in no extra servers. `dev-admin` is the only account allowed to create servers, so the checks drive it in the browser. Times are measured from the request leaving, not the click, because saves can wait for the 5-per-10 s bucket, and the build in task 8 gets timeouts sized for that.

## Jaakko's tasks

1. Sign off this plan and the eight decisions.
2. Review each task on the live client. Log in as `dev-admin` (`pnpm seed password dev-admin`) to see the admin side.
3. **Device checks, for later**: desktop notifications on Windows and Linux in Chrome and Firefox, and building a small server by hand. They join the list in m2b-results.md.
4. **Still open**: M0's encoder runs, with Chrome on Windows next, before M3.

## Progress

- **Task 1**, 2026-10-14: done and deployed. The live check passed, as recorded in [m2c-results.md](m2c-results.md).
