# Discord UI clone: motion, popups and design spec

This spec is for Claude Code. It describes every animation, transition, fade, popup and visible design choice in a 26.4 s screen recording of the Discord desktop client (2025 "visual refresh" layout, pure-black theme, Finnish locale). Implement the behavior exactly as written. Where the spec gives a measured value, use it. Where it says "recommend", the video did not show enough to measure, so use the recommended default.

## 0. How the numbers were measured

- Source: 1810 x 1606 px recording at 30 fps. Each frame is 33 ms, so all timings are accurate to about +/- 33 ms.
- The OS used 125% display scaling. All sizes below are already converted to CSS px (video px / 1.25).
- Colors were sampled from decoded frames. H.264 compression can shift a value by about 2 units per channel.
- Durations and easing curves were fitted to frame-by-frame position and opacity data (not guessed from screenshots).
- Finnish UI labels appear in parentheses so you can match them to the video. The English labels are literal translations. The real English client can use different words (for example "Data & Privacy" or "Content & Social"). Use the English client's wording if you know it.

## 1. Motion rules at a glance

The most important design choice: **almost all hover feedback is instant**. Only a few elements animate. Do not add transitions to anything that is not listed as animated.

| Element | Animated? | What happens | Duration / easing |
|---|---|---|---|
| Channel row hover / select | No | Background and text color swap in one frame | 0 ms |
| Message row hover + action bar | No | Background + toolbar appear in one frame | 0 ms |
| Member list row hover | No | Background swap | 0 ms |
| Settings sidebar item hover | No | Background swap | 0 ms |
| Scrollbar show / hide | No | Thumb appears only while pointer is over that scroller | 0 ms |
| Tooltips | Yes | Opacity fade in and out, crossfade between targets, no show delay | ~100 ms |
| Server rail pill | Yes | Grows in height and slides in from left edge | in ~200 ms ease-out, out ~100 ms |
| "More active threads" hover popout | Timing only | No fade, but it uses hover-intent delays | open after ~170 ms, close after ~250 ms |
| User panel subtext | Yes | Status line slides up, username slides in from below | ~130 ms ease-in-out |
| Image load | Yes | Average-color placeholder, then image fades in | ~200 ms ease-out |
| Settings modal open | Yes | Backdrop dims, then modal fades in and scales 0.97 to 1 | backdrop ~100 ms, modal ~150 ms |
| Settings modal close | Yes | Modal fades out and scales 1 to 0.97, backdrop fades out | ~150 ms |
| Settings page swap | No | Content swaps in one frame, scroll resets to top | 0 ms |
| Settings sidebar accordion | Yes | Old section collapses while new section expands | ~300 ms ease-out cubic |
| Settings active sub-item bar | Yes | White bar slides to the clicked sub-item at click time | ~150 ms ease-out |
| Settings sub-item click (scroll to anchor) | Yes | Smooth scroll, fixed duration, can retarget mid-flight | ~520-550 ms, spring or cubic-bezier(0.3, 0, 0.2, 1) |
| Settings "Server Boost" loading | Yes | Two "wandering cubes" spinner | 1.8 s loop |
| Voice channel open | No | Main view swaps in one frame | 0 ms |
| Text channel open | No | Static skeleton for ~230 ms, then content swaps in | 0 ms |
| Side chat panel close | No | Panel removed in one frame, stage takes the width | 0 ms |
| User profile popout open / retarget | No | Appears at full opacity in the first frame | 0 ms (max 50 ms fade if you want) |

## 2. Design tokens (measured)

```css
:root {
  /* Surfaces: the theme is pure black (Onyx/Midnight-style) */
  --bg-app: #000000;            /* server rail, channel list, chat, member list, header, title bar */
  --bg-floating: #0a090c;       /* tooltips, popouts, message action bar, profile popout body */
  --bg-input: #100f12;          /* chat composer */
  --bg-rail-button: #111111;    /* Home button, Add Server, Discover buttons on the server rail */

  /* Interactive states (main app) */
  --bg-row-hover: #121212;      /* channel row hover, message row hover, member row hover */
  --bg-row-selected: #242326;   /* selected channel row */

  /* Interactive states (settings modal) */
  --bg-settings-nav-hover: #0b0b0b;
  --bg-settings-nav-selected: #1e1d20;

  /* Lines */
  --border-subtle: #1e1e1e;     /* rail | channel list divider, user panel border */
  --border-header: #202020;     /* bottom border of channel header and server header */
  --border-floating: #26262a;   /* 1px border on tooltips and popouts (approx, measured #20-#24 at edges) */
  --border-modal: #1e1d20;      /* settings modal outline */
  --divider-settings: #18181a;  /* settings sidebar | content divider, header divider */

  /* Text */
  --text-strong: #e4e4e7;       /* selected channel, headers, names (approx, peaks measured #dcdbde to #e5e4e7) */
  --text-default: #82828a;      /* normal channel names, category headers, thread names */
  --text-muted-channel: #46464a;/* muted channels */
  --text-timestamp: #72727b;
  --text-link: #5f88b3;         /* channel-mention links inside the header topic, approx */

  /* Brand */
  --brand: #5865f2;             /* toggle ON track, primary buttons, selected theme swatch ring */
  --brand-spinner: #757ff2;     /* wandering-cubes spinner (measured, lighter brand tint) */

  /* Backdrop */
  --backdrop: rgba(0, 0, 0, 0.72); /* measured: app brightness drops to ~27% behind settings */

  /* Scrollbar */
  --scrollbar-thumb: #585862;
  --scrollbar-width: 8px;

  /* Radii */
  --radius-row: 8px;            /* channel rows, settings nav items, buttons */
  --radius-floating: 8px;       /* tooltips, popouts, message action bar */
  --radius-modal: 10px;
  --radius-server-icon: 12px;   /* 40px squircle-like rounded square, no circle-to-square morph */

  /* Font: Discord uses "gg sans" (proprietary). Use an open fallback. */
  --font: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
```

Other colors (measured unless marked "recommend"):

- Mention highlight row (message that mentions you): measured background `#100b00` (about `rgba(240, 178, 50, 0.065)` on black) with a 2px left border measured `#c48206` (Discord's token is `#f0b232`, the recording shows it darker).
- "NEW" badge in settings sidebar: small magenta/pink pill (approx `#a54992`) with white bold uppercase text.
- "Log out" item in settings sidebar: red text (recommend `#f23f43`).
- Toggle OFF: black track with 1px `--border-floating` outline, white knob on the left. Toggle ON: `--brand` track, white knob on the right.

## 3. Layout (CSS px, at 100% scale)

```
+--------------------------------------------------------------------------------+
| Title bar 36px: back/fwd arrows (left) | server icon + name (center) | inbox, help, window controls (right)
+------+----------------------+-------------------------------------+-------------+
| Rail | Channel list  ~264px | Channel header 48px (name | topic | icons | search)  |
| 72px | server header 48px   +-------------------------------------+ Member list |
|      | (name + chevron +    | Messages (scroller)                 |   ~264px    |
|      |  invite icon)        |                                     |             |
|      | Events / Boosts rows |                                     |             |
|      | categories + rows    | Composer (radius 8px, ~56px tall)   |             |
| +------------------------------+ floating user panel            |             |
| | user panel ~320x58, spans rail + channel list, 8px margin     |             |
+--------------------------------------------------------------------------------+
```

- **Server rail (72px)**: 40px icons, 8px vertical gap (48px pitch), centered. Home (Discord logo) button on top with `--bg-rail-button`, then a short horizontal separator, then servers, then "Add server" (+) and "Discover" (compass) round-square buttons at the end of the list.
- **Server folders**: a 40px rounded square that shows a 2x2 grid of mini icons.
- **Channel rows**: 32px tall, 2px gap (34px pitch), 8px horizontal inset, `--radius-row`. Content: type icon (`#`, speaker, `#` with a small lock or thread badge), then the name. Selected row uses `--bg-row-selected` and `--text-strong`.
- **Category headers**: small text, `--text-default`, a down chevron after the name, and a `+` button at the right edge.
- **Thread rows** under a channel: indented, joined to the parent with an L-shaped 1px connector line (`└`), smaller gray text, ellipsis on overflow.
- **User panel**: a floating card (not a strip). It sits 8px from the left, bottom and right of the channel list column, spans the rail and the channel list, has `--radius-row` corners and a 1px `--border-subtle` border. Content: 32px avatar with status dot, name (bold) over a subtext line, then mic + chevron, headphones + chevron, gear.
- **Member list**: group headers in the form `ROLE NAME` + space + an em dash character (U+2014) + space + count (for example "Chef ... 1"). Rows: avatar with status dot, role-colored name, optional activity line with a small icon. Some members show a "nameplate" image or gradient behind the full row. Offline members are dimmed (recommend `opacity: 0.35`).
- **Chat header**: channel icon, name in `--text-strong`, a 1px vertical bar, topic in a muted color, then thread / notification / pin / member-list icons, then a search field.
- **Composer**: `--bg-input`, radius 8px, `+` button on the left, placeholder "Message #channel", gift / GIF / sticker / emoji / apps icons on the right.
- **Date dividers**: centered small gray date text with a 1px line on each side.

## 4. Component specs

### 4.1 Channel row hover and hover actions

Trigger: pointer enters a channel row.

- Background changes to `--bg-row-hover` in the same frame. No transition.
- Text gets brighter in the same frame (measured: a muted channel goes from about `#46464a` to about `#7b7b7b`). Recommend: muted to default, default to strong.
- Action icons appear at the right edge of the row on hover: "Invite to channel" (person + plus) and "Edit channel" (gear). Voice channels also show "Open chat" (speech bubble). The selected row always shows these icons.
- Each icon has its own tooltip (see 4.3), placed **above** the icon with a down caret.

```css
.channel-row { transition: none; }
.channel-row:hover { background: var(--bg-row-hover); color: var(--text-strong); }
.channel-row .actions { display: none; }
.channel-row:hover .actions, .channel-row.selected .actions { display: flex; }
```

### 4.2 Message row hover and action bar

Trigger: pointer over a message group or message.

- Row background becomes `--bg-row-hover` across the full chat width. Instant.
- A floating action bar appears at the top-right of the message. It overlaps the top edge of the row by about half its height (recommend `top: -16px; right: 16px`). Instant, no fade.
- Action bar: `--bg-floating`, 1px `--border-floating`, `--radius-floating`, about 32px tall.
- Content left to right: three recent reaction emojis, a 1px vertical divider, then icons: add reaction, edit (own message) or reply (other people's message), forward, more ("...").
- When the pointer leaves the chat, the hover state and the bar disappear in the same frame.

### 4.3 Tooltips

Seen on: channel row icons (above), server rail icons (right), user panel gear (above), side panel close button (below), server folders (right).

- Show delay: none. The tooltip starts to fade in on the first frame of hover.
- Fade in: opacity 0 to 1 over about 100 ms (3 frames). No movement was visible. Recommend adding `scale(0.95)` to `scale(1)` only if you want Discord's default feel. Keep translate at 0.
- Fade out: opacity 1 to 0 over about 66-100 ms.
- Moving from one target to the next: the old tooltip fades out while the new one fades in at its own position. Both are visible for 1-2 frames (a crossfade). Do not reuse one tooltip element and move it.
- Look: `--bg-floating`, 1px `--border-floating`, `--radius-floating`, padding about 8px 12px, text 14px semibold `--text-strong`, a 5px caret pointing at the target with the same fill and border.
- Server tooltips: 16px bold name. If the server is muted, a second line "Muted" (Mykistetty) in 12px `--text-default`.
- Server folder tooltip: a short list of the server names inside the folder, comma-separated, wrapped over 2-3 lines, max width about 200px.
- Offset from target: about 8px gap.

```css
.tooltip { opacity: 0; transition: opacity 100ms ease-out; pointer-events: none; }
.tooltip[data-open="true"] { opacity: 1; }
```

### 4.4 Server rail: pill indicator

The pill is a white bar on the left edge of the rail, vertically centered on its server icon. Only the right half is visible (it is offset half of its width outside the rail).

| State | Visible size |
|---|---|
| Selected | 4 x 40 px |
| Hover (not selected) | 4 x 20 px |
| Unread (not shown in video, Discord default) | 4 x 8 px |
| None | 0 height, slid out to the left |

Animation (measured):

- Hover in: height 0 to 20px and slide in from `translateX(-100%)` to its final position, about 200 ms, ease-out (fast start, soft stop). Brightness also rises over the same frames.
- Hover out: collapse back in about 100 ms.
- Hovering the next icon: the previous pill collapses while the new pill grows. Both are visible for 1-2 frames.
- Icon shape: icons are already 12px-radius rounded squares. The video shows **no** circle-to-squircle morph on hover. Do not add one.

```css
.pill {
  position: absolute; left: 0; top: 50%;
  width: 8px; margin-left: -4px; border-radius: 0 4px 4px 0;
  background: #fff;
  height: 0; transform: translate(-100%, -50%);
  transition: height 200ms cubic-bezier(0.2, 0, 0, 1), transform 200ms cubic-bezier(0.2, 0, 0, 1);
}
.server:hover .pill { height: 20px; transform: translate(0, -50%); }
.server.selected .pill { height: 40px; transform: translate(0, -50%); }
.server:not(:hover):not(.selected) .pill { transition-duration: 100ms; }
```

### 4.5 "More active threads" hover popout

Seen when the pointer rests on a channel that has more active threads than the sidebar shows.

- Open: about 170 ms after the pointer enters the channel row (hover intent). It appears at full opacity in one frame. No fade, no slide.
- Close: about 250 ms after the pointer leaves the row. This grace period lets the user move the pointer into the popout. If the pointer enters the popout, keep it open.
- Position: to the right of the channel list, overlapping the chat. Its top aligns with the hovered row.
- Look: `--bg-floating`, 1px `--border-floating`, radius 8px, width about 270px, padding 12px.
- Content: a small gray heading "More active threads" (Lisää aktiivisia ketjuja), then one row per thread (creator avatar 16px, thread name, a bullet, "22 days ago" in gray), then a "Show all" (Näytä kaikki) row with a threads icon.

### 4.6 Scrollbars

- Thin, `--scrollbar-width` (8px), thumb `--scrollbar-thumb`, fully rounded, no visible track.
- The thumb is visible only while the pointer is over that scroll container. It appears and disappears in one frame. Channel list, chat, settings sidebar and settings content all behave this way.

```css
.scroller::-webkit-scrollbar { width: 8px; }
.scroller::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
.scroller:hover::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); }
```

### 4.7 Switching channels

**Text channel** (video 22.57 s):

1. On click, the channel row becomes selected in the same frame.
2. The channel header (name and topic) updates in the same frame. The chat area and member list swap to a **static skeleton** in the same frame. There is no shimmer or pulse in the ~230 ms it is visible.
   - Message skeleton: 40px circle avatar `#121212`, a short name bar `#202020` (height ~8px, width 80-140px), 1-3 content bars `#0c0c0c` of random width (40-80% of the column), and sometimes a large attachment block `#0a0a0a` (about 320 x 200px). Vary widths per row so it looks organic.
   - Member list skeleton: the group headers render first with no member rows under them.
3. Member rows pop in (about 170 ms after click), then messages pop in (about 230 ms after click). Both swap in one frame with no fade. The chat opens scrolled to the bottom.
4. Images inside the loaded messages use the image-load behavior in 4.8.

**Voice channel** (video 5.13 s):

- The main area swaps to the voice "stage" view in one frame. No skeleton, no fade.
- The side chat panel (4.9) opens at the same moment and loads its messages and images.

### 4.8 Image loading

- Before an image loads, render a placeholder box at the final size, filled with the **average color of the image** (the mean color stays the same before and after the load, so it is a dominant-color or blurhash-style placeholder). Store the average color with the attachment metadata.
- When the image loads, fade it in over it: opacity 0 to 1 in about 200 ms, ease-out.
- Avatars load the same way but the placeholder is a black circle.

```css
.media { background: var(--avg-color); }
.media img { opacity: 0; transition: opacity 200ms ease-out; }
.media img.loaded { opacity: 1; }
```

### 4.9 Voice channel stage and side chat panel

Stage (main area):

- Background: near-black at the top, blue-violet at the bottom, with a brighter glow at the bottom center. Measured stops (top to bottom, center column): `#100e18` 0%, `#141032` 25%, `#1d1a52` 45%, `#2e2a84` 62%, `#4445b8` 80%, `#7076da` at the bottom center (bottom corners stay near `#4547b8`).

```css
.voice-stage {
  background:
    radial-gradient(45% 30% at 50% 100%, rgba(150, 158, 245, 0.55), rgba(150, 158, 245, 0) 100%),
    linear-gradient(180deg, #100e18 0%, #141032 25%, #1d1a52 45%, #2e2a84 62%, #4445b8 82%, #4547b8 100%);
}
```

- Header row overlays the gradient: speaker icon, channel name, and a people icon with the participant count ("0") on the right.
- Empty state centered: channel emoji + 1px vertical bar + channel name (24px bold, white), a one-line gray subtitle "No one is currently in voice" (Kukaan ei ole parhaillaan puhekanavalla), and a white button "Join Voice" (Liity puhekanavalle) with black text, radius 8px, about 36px tall.
- The stage has rounded corners (about 8px) and sits inside the black app background.

Side chat panel (right):

- Width about 456px, separated from the stage by an 8px black gap and a 1px `--border-subtle` line. Header: chat bubble icon, channel name, and an X close button at the right.
- X hover: a rounded-square background appears instantly. Tooltip "Close" (Sulje) appears **below** the X with an up caret.
- Click X: the panel is removed in one frame. The stage expands to full width in the same frame. A chat bubble button appears in the stage header so the user can reopen the panel.
- The panel contains the normal message list and composer, scaled to the panel width.

### 4.10 User panel

- Hover over the panel: the subtext line ("now playing" status, for example "♫ GYMBRO, Jos...") slides **up and out**, and the username slides **up and in** from below. Measured about 130 ms (4 frames), ease-in-out. Clip the two lines with `overflow: hidden` on a container that is one line tall.
- Leaving the panel: not shown in the video. Recommend the reverse animation with the same timing.
- Icon buttons (mic, headphones, gear): hover shows a rounded-square background (`--bg-row-selected`) instantly. The gear shows the tooltip "User Settings" (Käyttäjäasetukset) **above** it.

```css
.subtext { height: 16px; overflow: hidden; }
.subtext-inner { display: flex; flex-direction: column; transition: transform 130ms ease-in-out; }
.user-panel:hover .subtext-inner { transform: translateY(-16px); } /* line 1 = status, line 2 = username */
```

### 4.11 Settings modal: open and close

Settings is **not** a full-screen page. It is a large modal over a dimmed app.

Geometry:

- `position: fixed`, inset about 40-48px from each window edge (measured: 40 left, 48 right, 43 top and bottom). It is vertically centered and sits just below the title bar.
- Radius `--radius-modal`, 1px `--border-modal`, background `--bg-app`.
- Backdrop: `--backdrop` over the whole app (the app stays visible but very dark).

Open (measured, video 10.83 s):

| Time after click | Backdrop | Modal |
|---|---|---|
| 0 ms | 0 | not mounted |
| ~33 ms | ~50% of final dim | not visible |
| ~66-100 ms | final dim | starts: opacity ~0.75, scale ~0.975 |
| ~200 ms | final | opacity 1, scale 1 |

- The modal scales from its own center (the box grew equally on all sides: about 0.975 to 1.0).
- Recommend: backdrop `opacity 0 to 1, 100ms ease-out`. Modal `opacity 0 to 1` and `scale(0.97) to scale(1)`, 150 ms, `cubic-bezier(0.2, 0, 0, 1)`, with a 60 ms delay.

Close (measured, video 19.70 s, X button or Esc):

- Modal: opacity 1 to 0 and scale 1 to about 0.97, about 150 ms. Most of the fade happens in the first 66 ms (ease-out).
- Backdrop fades out in parallel over the same time.

```css
.settings-backdrop { opacity: 0; transition: opacity 100ms ease-out; }
.settings-backdrop.open { opacity: 1; }
.settings-modal { opacity: 0; transform: scale(0.97); transition: opacity 150ms cubic-bezier(0.2,0,0,1) 60ms, transform 150ms cubic-bezier(0.2,0,0,1) 60ms; }
.settings-modal.open { opacity: 1; transform: scale(1); }
.settings-modal.closing { opacity: 0; transform: scale(0.97); transition-delay: 0ms; }
```

Header and close button:

- Content header row (48px tall, 1px `--divider-settings` bottom border): the current page title at the left (16px semibold), an X button at the right.
- X hover: a rounded-square background appears instantly (about 32px, radius 8px, `--bg-row-selected`).

### 4.12 Settings sidebar

Layout (left column, about 250px, 1px `--divider-settings` right border):

1. Profile block: 48px avatar, username (bold), "Edit Profiles ✎" (Muokkaa profiileja) in `--text-default`.
2. Search input: placeholder "Search" (Hae), magnifier icon, 1px `#242424` border, radius 8px, ~40px tall.
3. Nav groups with small gray group labels: Account items, "Billing" (Laskutus), "App Settings" (Käyttökokemus), "Games and Apps" (Pelit ja sovellukset), then "Developer", then red "Log Out" and a small version string at the end.
4. Nav items: 36px tall, radius 8px, 16px icon + label. Hover `--bg-settings-nav-hover`, selected `--bg-settings-nav-selected` with `--text-strong`. Both instant.

**Accordion behavior** (this is the main settings animation):

- Only the selected top-level item is expanded. Its sub-items (the page's section anchors) are listed under it.
- Click a different top-level item:
  1. The content area swaps to the new page in the same frame. The content scroll position resets to the top. The header title changes in the same frame.
  2. The old item's sub-list collapses (height to 0) and its sub-items fade out quickly (gone in about 66 ms).
  3. At the same time the new item's sub-list expands (height 0 to auto) and its sub-items fade in (visible from ~100 ms, full at ~200 ms).
  4. Items between them slide to their new positions as a result of the height change.
- Measured: total about 230-300 ms. Best fit: ease-out cubic, 300 ms (`cubic-bezier(0.33, 1, 0.68, 1)`). Progress per 33 ms frame after click: 0.20, 0.45, 0.66, (one dropped frame), 0.85, 0.96, 1.0.

Sub-item look:

- Indented about 24px. A 1px vertical guide line (`#2a2a2e`) runs down the left side of the sub-list.
- The **active** sub-item has a 2px white bar that overlays the guide line, and white text. Other sub-items use `--text-default`. Hover makes the text white but does not move the bar.
- Long labels wrap to two lines.

**Active bar**:

- The bar moves **at the click**. It does not wait for the content scroll to arrive (measured: the bar starts to move in the same frame as the scroll starts).
- It slides vertically to the clicked item and resizes to that item's height (animate `transform` + `height`). Measured about 150 ms, ease-out (most of the move happens in the first 66 ms).
- If the content is already at the bottom and cannot scroll, a click still moves the bar (seen at 14.07 s).
- Manual wheel scrolling was not shown. Recommend scroll-spy (scroll-spy = the active item follows the section that is currently at the top of the viewport) for manual scrolling, with the last item active at scroll end. Ignore scroll-spy updates while a click-scroll animation runs, so the bar does not jump back.

```css
.subnav { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 300ms cubic-bezier(0.33,1,0.68,1); }
.nav-item.expanded + .subnav { grid-template-rows: 1fr; }
.subnav > .inner { overflow: hidden; }
.subnav .sub-item { opacity: 0; transition: opacity 60ms linear; }
.nav-item.expanded + .subnav .sub-item { opacity: 1; transition: opacity 150ms ease-out 60ms; }
.active-bar { position: absolute; left: 0; width: 2px; background: #fff; transition: transform 150ms cubic-bezier(0.2,0,0,1), height 150ms cubic-bezier(0.2,0,0,1); }
```

### 4.13 Settings content: smooth scroll to a section

Trigger: click a sub-item in the sidebar.

- The content scrolls to the section with a **fixed-duration** animation. A ~620px scroll and a ~1245px scroll both took about 550 ms, so the duration does not depend on distance.
- Measured progress (fraction of distance per 33 ms frame): 0.02, 0.14, 0.28, 0.43, 0.56, 0.67, 0.76, 0.83, 0.88, 0.92, 0.95, 0.97, 0.99, 1.0.
- Best fit: a critically damped spring with angular frequency about 12.75 rad/s (`x(t) = 1 - (1 + w*t) * e^(-w*t)`). It settles in about 520 ms. A tween alternative: 550 ms `cubic-bezier(0.3, 0, 0.2, 1)`.
- **Retarget**: if the user clicks another sub-item during a scroll, start the new scroll from the current position and keep the current velocity (seen at 18.73 s). A spring handles this without a visible jump. Do not use native `scrollIntoView({behavior: "smooth"})` because its timing is different and it cannot keep velocity.

```ts
// Critically damped spring scroll with retarget. w ~= 12.75 rad/s.
let anim: { target: number; v: number; raf: number } | null = null;
export function springScrollTo(el: HTMLElement, target: number, w = 12.75) {
  const max = el.scrollHeight - el.clientHeight;
  target = Math.max(0, Math.min(max, target));
  if (anim) { anim.target = target; return; }        // retarget: keep velocity
  let x = el.scrollTop, last = performance.now();
  anim = { target, v: 0, raf: 0 };
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    const a = -2 * w * anim!.v - w * w * (x - anim!.target); // critical damping
    anim!.v += a * dt; x += anim!.v * dt;
    el.scrollTop = x;
    if (Math.abs(x - anim!.target) < 0.5 && Math.abs(anim!.v) < 5) { el.scrollTop = anim!.target; anim = null; return; }
    anim!.raf = requestAnimationFrame(step);
  };
  anim.raf = requestAnimationFrame(step);
}
// Cancel on user wheel/touch input: el.addEventListener("wheel", () => { if (anim) { cancelAnimationFrame(anim.raf); anim = null; } });
```

### 4.14 Settings: loading spinner ("wandering cubes")

Seen on the "Server Boost" (Palvelimen nostatus) page for about 600 ms before content appears. It is placed at the top center of the content area. The content then appears in one frame, and its images load as in 4.8.

- Two 10px squares, color `--brand-spinner`, in a 32 x 32px box.
- Each square travels around the box corners (22px moves), rotates -90 degrees per side, and shrinks to 0.5 scale at the midpoint corners. The second square is half a cycle behind.

```css
.wandering-cubes { position: relative; width: 32px; height: 32px; }
.wandering-cubes span { position: absolute; top: 0; left: 0; width: 10px; height: 10px; background: var(--brand-spinner);
  animation: cubes 1.8s ease-in-out infinite; }
.wandering-cubes span:last-child { animation-delay: -0.9s; }
@keyframes cubes {
  25%  { transform: translateX(22px) rotate(-90deg) scale(0.5); }
  50%  { transform: translateX(22px) translateY(22px) rotate(-180deg); }
  75%  { transform: translateX(0) translateY(22px) rotate(-270deg) scale(0.5); }
  100% { transform: rotate(-360deg); }
}
```

### 4.15 Settings content: visual patterns

- Content column: centered, max width about 700px, large left and right padding.
- Section heading: 20px semibold, `--text-strong`, about 40px space above.
- Setting row: label (16px, `--text-strong`) with a description under it (14px, `--text-default`), control aligned right.
- Secondary button ("Edit", Muokkaa): dark gray fill (recommend `#2b2b30`), white text, radius 8px, ~32px tall.
- Inline links such as "Reveal" (Paljasta) and "Learn more" (Lue lisää): blue-violet (recommend `#7289ff`).
- Info banner: dark fill, 1px brand-blue border, info icon on the left, dismiss X on the right.
- Toggles: about 40 x 24px, see section 2.
- Radio buttons: brand-colored filled circle when selected.
- Theme swatches (Appearance page): 48px rounded squares. The selected swatch has a 2px `--brand` ring and a small brand check badge on its top-right corner.
- Row with chevron (">") at the far right opens a sub-page.

### 4.16 User profile popout

Trigger: click a member in the member list (also usable from usernames in chat).

- Opens on click at full opacity in the first frame. No fade or slide was visible. If you add one, keep it under 50 ms.
- Position: to the **left** of the member list with a gap of about 12px. Its top aligns with the clicked row, clamped so it stays inside the window.
- Size: 300px wide. Background `--bg-floating`, radius 8px, 1px `--border-floating`.
- Clicking another member while it is open: the popout jumps to the new row position and re-renders with the new user in the same frame. The avatar shows a black circle placeholder for one or two frames, then the image (see 4.8).
- The popout stays open while the pointer moves elsewhere. Recommend: close on outside click and on Esc (not shown in the video).
- The clicked member row keeps the hover background while the popout is open.
- Content top to bottom:
  1. Banner (about 105px tall) in the user's profile color. Three round icon buttons at the top-right of the banner (add friend, a second action, more "...") on a dark translucent fill.
  2. Avatar (80px) overlapping the banner bottom-left, with a 6px ring in the popout color and a status dot.
  3. Display name (20px bold), then username, pronouns and badge icons on one line.
  4. Mutual info: small stacked avatars + "14 mutual friends • 11 mutual servers" in gray.
  5. Activity card ("Playing:" War Thunder): dark inner card, game icon, name, elapsed time with a small icon, full-width button "Get on Steam".
  6. Role chips: small pill per role with a colored dot, name and "x", then "+28" and a "+" add button.
  7. Message input at the bottom: "Message @username" placeholder, emoji icon on the right.

## 5. Shared implementation helpers

### 5.1 Tooltip manager (crossfade, no delay)

- Render each tooltip in a portal layer above the app.
- Keep a short-lived list of tooltips, not one shared node. When the hovered target changes, mark the old tooltip as `leaving` and add a new one. Remove a leaving tooltip after its 100 ms fade.
- Compute position from the target's `getBoundingClientRect()` and the placement (`top`, `right`, `bottom`). Gap 8px. Flip to the other side if it overflows the window.

### 5.2 Hover intent (for the threads popout)

```ts
// open after openDelay of continuous hover, close after closeDelay unless the pointer enters the popout
export function hoverIntent(trigger: HTMLElement, popout: () => HTMLElement | null,
  onOpen: () => void, onClose: () => void, openDelay = 170, closeDelay = 250) {
  let openT: number | undefined, closeT: number | undefined;
  const enter = () => { clearTimeout(closeT); openT = window.setTimeout(onOpen, openDelay); };
  const leave = () => { clearTimeout(openT); closeT = window.setTimeout(onClose, closeDelay); };
  trigger.addEventListener("pointerenter", enter);
  trigger.addEventListener("pointerleave", leave);
  // also bind enter/leave to the popout element when it mounts, so moving into it cancels the close
  return { bindPopout(el: HTMLElement) { el.addEventListener("pointerenter", () => clearTimeout(closeT)); el.addEventListener("pointerleave", leave); } };
}
```

### 5.3 Reduced motion

Respect `prefers-reduced-motion: reduce`. Under it, set every duration in this spec to 0 ms, replace the spring scroll with an instant jump, and keep the spinner (it shows loading state).

## 6. Video timeline (for side-by-side checking)

| Time (s) | User action | What to reproduce |
|---|---|---|
| 0.00-0.30 | Pointer on a message in #general-gaming | Message hover background + action bar (4.2) |
| 0.33 | Pointer enters channel list | Message hover clears in one frame. Channel list scrollbar appears, chat scrollbar hides (4.6) |
| 0.37-0.47 | Pointer on row icons of #general-gaming | Row icons + tooltips "Edit channel" then "Invite to channel" with crossfade (4.1, 4.3) |
| 0.57 | Pointer still on the row | "More active threads" popout opens (4.5) |
| 0.90 / 1.17 | Pointer moves to the row above | Popout closes about 250 ms later (4.5) |
| 1.2-5.0 | Pointer moves up the channel list | Instant row hovers, icon tooltips |
| 5.0 | Pointer on a voice channel's chat icon | Tooltip "Open chat" (Avaa keskustelu) |
| 5.13 | Click voice channel | Instant swap to voice stage + side chat panel (4.7, 4.9) |
| 5.37-5.57 | Panel images load | Average-color placeholder, 200 ms fade in (4.8) |
| 7.2-9.0 | Pointer over the server rail | Server tooltips to the right with crossfade, pill grow and shrink (4.3, 4.4) |
| 9.67-9.80 | Pointer reaches the user panel | Subtext slides up, username slides in (4.10) |
| 9.80 | Pointer on gear | Gear hover background + tooltip "User Settings" |
| 10.83 | Click gear | Settings open: backdrop, then modal fade + scale (4.11) |
| 12.47 | Click "Privacy & Data" (Data ja tietosuoja) | Page swap + accordion (4.12) |
| 13.40-13.97 | Click sub-item "Profile Privacy" | Spring scroll ~620 px in ~550 ms, active bar slides at click (4.12, 4.13) |
| 14.07 | Click the last sub-item while content is already at the bottom | No scroll, but the active bar still slides (4.12) |
| 14.80 | Click "Message permissions" (Viestintäluvat) | Page swap + accordion |
| 15.47-16.03 | Click sub-item "Connected games" | Spring scroll ~1245 px in ~550 ms |
| 16.67-17.30 | Click "Server Boost" | Wandering-cubes spinner, then content (4.14) |
| 17.43 | Click "Appearance" (Ulkoasu) | Page swap + accordion |
| 18.20 / 18.73 | Click "App Icon", then "Messages" mid-scroll | Scroll retarget keeps velocity (4.13) |
| 19.47 | Pointer on modal X | Instant rounded hover background |
| 19.70-19.85 | Click X | Settings close: fade + scale down, backdrop fades (4.11) |
| 20.5 | Pointer on side panel X | Tooltip "Close" below the button (4.9) |
| 20.80 | Click side panel X | Panel removed in one frame (4.9) |
| 22.57 | Click #yleinen | Static skeleton, members at ~170 ms, messages at ~230 ms (4.7) |
| 23.07 | Pointer on a message | Hover background + action bar |
| 23.97 | Click member "there here" | Profile popout opens instantly to the left of the member list (4.16) |
| 24.67 | Click member "mead reveler" | Popout jumps to the new row and swaps content, avatar placeholder then image |
| 25.47-25.57 | Pointer crosses a server folder | Folder tooltip (list of server names) crossfades with the next tooltip |

## 7. Not shown in the video (use Discord defaults or decide later)

- Profile popout close behavior (recommend outside click + Esc, no animation).
- Context menus, modals other than Settings, emoji picker, reactions, typing indicator, voice connected state.
- Toggle switch animation (no toggle was clicked). Recommend knob slide + track color, 200 ms ease.
- Unread pill (8px) and mention badges on the server rail.
- Light theme. All tokens above are for the pure-black theme only.

## 8. Asset note

Do not copy Discord's logo, the proprietary "gg sans" font, nameplates or other brand art into the clone. Use your own icon set (for example Lucide or Phosphor), an open font, and placeholder images. The motion, layout and token values in this spec are behavior descriptions and are safe to reimplement.

## 9. Acceptance checklist

- [ ] No CSS transition on channel, message, member or settings nav hover. Verify with a 30 fps screen recording: the change is complete in one frame.
- [ ] Tooltips have zero show delay, fade in ~100 ms, crossfade between targets, correct side per element (channel icons top, rail right, gear top, panel close bottom).
- [ ] Pill grows to 20px on hover in ~200 ms with slide-in from the left, 40px when selected, shrinks in ~100 ms.
- [ ] Threads popout opens after ~170 ms of hover, stays ~250 ms after leave, no fade.
- [ ] Scrollbars are 8px, rounded, `#585862`, visible only while hovering their scroller.
- [ ] Text channel switch shows a static skeleton, then swaps in without a fade. Voice channel switch is instant.
- [ ] Images show an average-color box first, then fade in over ~200 ms.
- [ ] User panel subtext slides up to reveal the username in ~130 ms.
- [ ] Settings opens as an inset modal (about 40-48px from window edges) over a ~72% black backdrop. Backdrop ~100 ms, modal fade + scale 0.97 to 1 in ~150 ms after a ~60 ms delay. Close mirrors it in ~150 ms.
- [ ] Settings page swap is instant and resets scroll. The sidebar accordion collapses the old group and expands the new one together in ~300 ms ease-out cubic.
- [ ] Sub-item click scrolls with a fixed ~550 ms spring (distance does not change the duration) and retargets without a jump.
- [ ] Active sub-item bar moves at click time and slides in ~150 ms. It moves even when the content cannot scroll further.
- [ ] Wandering-cubes spinner matches the keyframes in 4.14.
- [ ] Profile popout is 300px wide, opens instantly to the left of the member list, aligned with the clicked row, and re-anchors instantly when another member is clicked.
- [ ] All colors match section 2 within a few units.
