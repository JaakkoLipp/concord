<script lang="ts">
  import { Badge, fadeIn, tooltip } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import { dropInGap, dropOnto, ulid, type Dragged, type Gap, type RailItem, type Server, type Store } from '@concord/domain';
  import Logo from '$lib/brand/Logo.svelte';
  import FolderIcon from '@lucide/svelte/icons/folder';
  import Plus from '@lucide/svelte/icons/plus';
  import CreateServerDialog from '$lib/admin/CreateServerDialog.svelte';
  import FolderDialog from './FolderDialog.svelte';
  import { folderMenu, saveRail, serverMenu } from '$lib/admin/menu.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { canCreateServers } from '$lib/view/admin.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { openFolders } from '$lib/view/folders.svelte.ts';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { canView, firstChannel, initials, railOf, recalled } from '$lib/view/channels.ts';

  interface Props { store: Store; active: string | null }
  let { store, active }: Props = $props();

  const rail = $derived(railOf(store));
  let creating = $state(false);
  // Like Discord's home button: DM mentions plus friend requests waiting.
  const dmMentions = $derived(store.dmList().reduce((n, c) => n + store.mentionCount(c.id), 0) + store.related('Incoming').length);
  const badgeOf = (server: string) => store.serverBadge(server, (c) => canView(store, c));
  const serverName = (id: string) => store.servers.get(id)?.name ?? '';
  /** A folder's badge adds its servers' (M4.8 task 10b). */
  const folderBadge = (servers: string[]) => servers.map(badgeOf).reduce((a, b) => ({ unread: a.unread || b.unread, mentions: a.mentions + b.mentions }), { unread: false, mentions: 0 });
  const folderTitle = (f: { name: string; servers: string[] }) => f.name || m.shell.folders.unnamed(f.servers.map(serverName));

  // ---------- dragging (M4.8 tasks 10a and 10b) ----------
  // Native pointer events, mouse and pen only, so a touch still scrolls the rail; the menus are the other way. The
  // dragged tile moves by transform only and nothing else moves. Between two tiles, a line marks where it lands:
  // on the rail, or inside an open folder. On the middle of a tile, a ring marks the tile it joins: a server
  // dropped on a server makes a folder of the two, and on a folder or a server in one it joins that folder.
  interface Drag { what: Dragged; pointer: number; startY: number; dy: number; moved: boolean; drop: Drop | null; line: number }
  type Drop = { kind: 'gap'; gap: Gap } | { kind: 'onto'; target: { kind: 'server'; id: string } | { kind: 'folder'; id: string }; key: string };
  let drag = $state<Drag | null>(null);
  let nav = $state<HTMLElement | null>(null);
  /** The click that ends a drag isn't a click on the tile. */
  let swallowClick = false;
  const DRAG_START_PX = 6;
  const draggedKey = (d: Dragged) => `${d.kind}:${d.id}`;
  const lifted = (key: string) => !!drag?.moved && draggedKey(drag.what) === key;

  function pointerDown(e: PointerEvent, what: Dragged) {
    swallowClick = false;
    if (e.button !== 0 || e.pointerType === 'touch' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    drag = { what, pointer: e.pointerId, startY: e.clientY, dy: 0, moved: false, drop: null, line: 0 };
  }

  /** The rail's top-level index of a tile, counted without the dragged item. */
  function topIndex(t: HTMLElement, without: Dragged): number {
    const holder = t.dataset.folder || t.dataset.folderTile;
    const at = rail.findIndex((i) => (holder ? i.kind === 'folder' && i.folder.id === holder : i.kind === 'server' && i.id === t.dataset.server));
    const own = rail.findIndex((i) => (without.kind === 'folder' ? i.kind === 'folder' && i.folder.id === without.id : i.kind === 'server' && i.id === without.id));
    return own >= 0 && own < at ? at - 1 : at;
  }

  /** What the pointer is over: the middle of a tile, or the gap between two, and where the line goes. */
  function dropAt(y: number, what: Dragged): { drop: Drop | null; line: number } {
    const all = [...(nav?.querySelectorAll<HTMLElement>('[data-server], [data-folder-tile]') ?? [])];
    // Not the dragged tile. A folder lands only on the rail itself, so it goes by the rail's tiles alone.
    const tiles = all.filter((t) => what.kind === 'server' ? t.dataset.server !== what.id : t.dataset.folderTile !== what.id && !t.dataset.folder);
    const rects = tiles.map((t) => t.getBoundingClientRect());
    const top = nav?.getBoundingClientRect().top ?? 0;
    const lineAt = (edge: number) => edge - top + (nav?.scrollTop ?? 0);
    if (what.kind === 'server') {
      const i = rects.findIndex((r) => y > r.top + r.height / 4 && y < r.bottom - r.height / 4);
      if (i >= 0) {
        const t = tiles[i]!;
        const target = t.dataset.folderTile ? { kind: 'folder' as const, id: t.dataset.folderTile } : { kind: 'server' as const, id: t.dataset.server! };
        return { drop: { kind: 'onto', target, key: `${target.kind}:${target.id}` }, line: 0 };
      }
    }
    const next = rects.findIndex((r) => r.top + r.height / 2 > y);
    const before = next >= 0 ? tiles[next]! : null;
    const after = next > 0 ? tiles[next - 1]! : next < 0 ? tiles.at(-1) ?? null : null;
    const line = lineAt(before ? rects[next]!.top - 4 : (rects.at(-1)?.bottom ?? top) + 4);
    // Inside an open folder: the next tile is one of its servers, after its header or another of its servers.
    const folder = before?.dataset.folder;
    if (what.kind === 'server' && folder && after && (after.dataset.folderTile === folder || after.dataset.folder === folder)) {
      const servers = tiles.filter((t) => t.dataset.folder === folder);
      return { drop: { kind: 'gap', gap: { folder, at: servers.indexOf(before) } }, line };
    }
    const count = rail.length - (rail.some((i) => draggedKey(i.kind === 'server' ? { kind: 'server', id: i.id } : { kind: 'folder', id: i.folder.id }) === draggedKey(what)) ? 1 : 0);
    return { drop: { kind: 'gap', gap: { folder: null, at: before ? topIndex(before, what) : count } }, line };
  }

  function pointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < DRAG_START_PX) return;
    drag = { ...drag, dy, moved: true, ...dropAt(e.clientY, drag.what) };
  }

  function pointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    if (!d.moved || !d.drop || !app.session) return;
    swallowClick = true;
    const next = d.drop.kind === 'gap' ? dropInGap(rail, d.what, d.drop.gap)
      : d.what.kind === 'server' ? dropOnto(rail, d.what.id, d.drop.target, ulid()) : rail;
    saveRail(app.session, rail, next);
  }

  function keyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drag?.moved) {
      e.preventDefault();
      drag = null;
      swallowClick = true;
    }
  }

  const clickGuard = (e: MouseEvent) => {
    if (!swallowClick) return false;
    e.preventDefault();
    swallowClick = false;
    return true;
  };

  function href(server: string): string {
    const channel = recalled(server) ?? firstChannel(store, server);
    return channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }) : resolve('/app/channels/@me');
  }
</script>

<svelte:window onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => (drag = null)} onkeydown={keyDown} />

{#snippet serverTile(server: Server, folder: string | null)}
  {@const badge = badgeOf(server.id)}
  {@const key = `server:${server.id}`}
  <a
    class="item" class:active={active === server.id} class:unread={badge.unread} class:lifted={lifted(key)}
    class:drop-onto={drag?.moved && drag.drop?.kind === 'onto' && drag.drop.key === key}
    style:translate={lifted(key) ? `0 ${drag?.dy ?? 0}px` : undefined}
    data-server={server.id} data-folder={folder ?? undefined} draggable="false"
    onpointerdown={(e) => pointerDown(e, { kind: 'server', id: server.id })}
    onclick={clickGuard}
    href={href(server.id)} aria-current={active === server.id ? 'page' : undefined}
    use:tooltip={{ name: server.name, detail: store.serverMuted(server.id) ? m.notify.muted : undefined, placement: 'right' }} aria-label={m.shell.serverLabel(server.name, badge.mentions)}
    use:menuOn={() => (app.session ? serverMenu(app.session, server.id) : [])}
  >
    <span class="pill" aria-hidden="true"></span>
    {#if server.icon}
      <img use:fadeIn class="tile" src={fileUrl(server.icon, { maxSide: 128 })} alt="" width="40" height="40" draggable="false" />
    {:else}
      <span class="tile initials">{initials(server.name)}</span>
    {/if}
    {#if badge.mentions}<span class="badge"><Badge count={badge.mentions} /></span>{/if}
  </a>
{/snippet}

<!-- In an open folder's band, the band moves when the folder is dragged, so the tile itself doesn't. -->
{#snippet folderTile(item: Extract<RailItem, { kind: 'folder' }>, inBand: boolean)}
  {@const f = item.folder}
  {@const open = openFolders.is(f.id)}
  {@const badge = folderBadge(f.servers)}
  {@const key = `folder:${f.id}`}
  {@const holdsActive = !!active && f.servers.includes(active)}
  <button
    class="item folder-tile" class:active={!open && holdsActive} class:unread={!open && badge.unread} class:lifted={!inBand && lifted(key)}
    class:drop-onto={drag?.moved && drag.drop?.kind === 'onto' && drag.drop.key === key}
    style:translate={!inBand && lifted(key) ? `0 ${drag?.dy ?? 0}px` : undefined}
    data-folder-tile={f.id} aria-expanded={open}
    onpointerdown={(e) => pointerDown(e, { kind: 'folder', id: f.id })}
    onclick={(e) => { if (!clickGuard(e)) openFolders.toggle(f.id); }}
    use:tooltip={{ name: folderTitle(f), detail: f.name ? m.shell.folders.unnamed(f.servers.map(serverName)) : undefined, placement: 'right' }}
    aria-label={m.shell.folders.label(folderTitle(f), open, open ? 0 : badge.mentions)}
    use:menuOn={() => (app.session ? folderMenu(app.session, f.id) : [])}
  >
    <span class="pill" aria-hidden="true"></span>
    {#if open}
      <span class="tile folder-open"><FolderIcon size={20} /></span>
    {:else}
      <span class="tile folder-closed" aria-hidden="true">
        {#each f.servers.slice(0, 4) as id (id)}
          {@const s = store.servers.get(id)}
          {#if s?.icon}<img class="mini" src={fileUrl(s.icon, { maxSide: 64 })} alt="" draggable="false" />{:else}<span class="mini initials">{initials(s?.name ?? '').slice(0, 1)}</span>{/if}
        {/each}
      </span>
      {#if badge.mentions}<span class="badge"><Badge count={badge.mentions} /></span>{/if}
    {/if}
  </button>
{/snippet}

<nav class="rail" class:dragging={drag?.moved} bind:this={nav} aria-label={m.shell.servers}>
  <a class="item" class:active={active === null} href={resolve('/app/channels/@me')} aria-current={active === null ? 'page' : undefined} use:tooltip={{ text: m.shell.directMessages, placement: 'right' }} aria-label={m.shell.directMessages}>
    <span class="pill" aria-hidden="true"></span>
    <span class="tile home"><Logo /></span>
    {#if dmMentions}<span class="badge"><Badge count={dmMentions} label={m.shell.mentions(dmMentions)} /></span>{/if}
  </a>
  <div class="separator" role="separator"></div>
  {#each rail as item (item.kind === 'server' ? item.id : item.folder.id)}
    {#if item.kind === 'server'}
      {@const server = store.servers.get(item.id)}
      {#if server}{@render serverTile(server, null)}{/if}
    {:else if openFolders.is(item.folder.id)}
      {@const key = `folder:${item.folder.id}`}
      <div class="folder" class:lifted={lifted(key)} style:translate={lifted(key) ? `0 ${drag?.dy ?? 0}px` : undefined} role="group" aria-label={folderTitle(item.folder)}>
        {@render folderTile(item, true)}
        {#each item.folder.servers as id (id)}
          {@const server = store.servers.get(id)}
          {#if server}{@render serverTile(server, item.folder.id)}{/if}
        {/each}
      </div>
    {:else}
      {@render folderTile(item, false)}
    {/if}
  {/each}
  {#if drag?.moved && drag.drop?.kind === 'gap'}<span class="drop-line" style:translate="0 {drag.line}px" aria-hidden="true"></span>{/if}
  {#if canCreateServers(store) && app.session}
    <button class="item" onclick={() => (creating = true)} use:tooltip={{ text: m.admin.createServer, placement: 'right' }} aria-label={m.admin.createServer}>
      <span class="pill" aria-hidden="true"></span>
      <span class="tile add"><Plus /></span>
    </button>
  {/if}
</nav>
{#if app.session}
  <CreateServerDialog session={app.session} open={creating} onclose={() => (creating = false)} />
  <FolderDialog session={app.session} />
{/if}

<style>
  .rail {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
    padding: var(--space-3) 0; overflow-y: auto; scrollbar-width: none;
  }
  .item { position: relative; display: grid; place-items: center; width: 100%; height: var(--rail-icon); color: var(--text-normal); text-decoration: none; }
  .tile {
    display: grid; place-items: center; width: var(--rail-icon); height: var(--rail-icon);
    border-radius: var(--radius-lg); background: var(--surface-3); object-fit: cover;
  }
  .active .home { background: var(--accent); color: var(--on-accent); }
  @media (hover: hover) { .item:hover .home { background: var(--accent); color: var(--on-accent); } }
  .initials { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  @media (hover: hover) { .item:hover .initials { background: var(--surface-5); } }
  button.item { padding: 0; border: 0; background: none; cursor: pointer; }
  .add { color: var(--status-online); }
  @media (hover: hover) { .item:hover .add { background: var(--status-online); color: var(--on-accent); } }
  /* The pill on the left edge (motion spec 4.4): 8 px for unread, 20 on hover, 40 when selected. It is always
     40 px tall and clipped to size with rounded ends, since animating its height would lay out the rail on
     every frame, and a scale would flatten its ends. Growing, it slides in from the left and brightens over
     --dur-pill-in; shrinking takes --dur-pill-out. */
  .pill {
    position: absolute; left: 0; top: 50%; width: 4px; height: var(--rail-icon); translate: -100% -50%; opacity: 0;
    background: var(--text-strong); clip-path: inset(50% 0 round 0 var(--radius-xs) var(--radius-xs) 0);
    transition: clip-path var(--dur-pill-out) var(--ease-standard), translate var(--dur-pill-out) var(--ease-standard), opacity var(--dur-pill-out) var(--ease-standard);
  }
  .unread .pill { translate: 0 -50%; opacity: 1; clip-path: inset(16px 0 round 0 var(--radius-xs) var(--radius-xs) 0); }
  @media (hover: hover) {
    .item:hover .pill { translate: 0 -50%; opacity: 1; clip-path: inset(10px 0 round 0 var(--radius-xs) var(--radius-xs) 0); transition-duration: var(--dur-pill-in); }
  }
  /* After hover, so a hovered selected server keeps its full pill. */
  .item.active .pill { translate: 0 -50%; opacity: 1; clip-path: inset(0 round 0 var(--radius-xs) var(--radius-xs) 0); transition-duration: var(--dur-pill-in); }
  .badge { position: absolute; right: 12px; bottom: -4px; padding: 2px; border-radius: var(--radius-full); background: var(--surface-0); line-height: 0; }
  /* Dragging: the lifted tile follows the pointer above the rest, and nothing else moves. */
  .dragging { user-select: none; cursor: grabbing; }
  .lifted { z-index: 1; pointer-events: none; }
  .lifted .tile, .folder.lifted { box-shadow: var(--shadow-popover); }
  .drop-onto .tile { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* An open folder: a band behind its tile and its servers. */
  .folder { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-3); width: calc(var(--rail-icon) + var(--space-4)); padding-bottom: var(--space-3); border-radius: var(--radius-lg); background: var(--surface-2); }
  .folder .item { width: var(--rail-w); }
  .folder-open { color: var(--text-secondary); background: none; }
  .folder-closed { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); gap: 2px; padding: 5px; }
  .mini { display: grid; place-items: center; width: 100%; height: 100%; border-radius: var(--radius-xs); object-fit: cover; overflow: hidden; background: var(--surface-5); font: 700 0.5rem/1 var(--font-sans); }
  @media (hover: hover) { .folder-tile:hover .folder-closed { background: var(--surface-5); } }
  .drop-line { position: absolute; top: 0; left: var(--space-3); right: var(--space-3); height: 2px; margin-top: -1px; border-radius: var(--radius-full); background: var(--accent); pointer-events: none; }
  .separator { width: 32px; height: 1px; flex: none; background: var(--border-default); margin: var(--space-1) 0; }
  .item:focus-visible { outline: none; }
  .item:focus-visible .tile { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
