<script lang="ts">
  import { Badge, tooltip } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import type { Store } from '@concord/domain';
  import Logo from '$lib/brand/Logo.svelte';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import { shell } from '$lib/view/shell.svelte.ts';
  import Plus from '@lucide/svelte/icons/plus';
  import CreateServerDialog from '$lib/admin/CreateServerDialog.svelte';
  import { serverMenu } from '$lib/admin/menu.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { canCreateServers } from '$lib/view/admin.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { canView, firstChannel, initials, orderedServers, recalled } from '$lib/view/channels.ts';
  import { placeServer } from '@concord/domain';
  import { toasts } from '$lib/view/toast.svelte.ts';

  interface Props { store: Store; active: string | null }
  let { store, active }: Props = $props();

  const servers = $derived(orderedServers(store));
  let creating = $state(false);
  // Like Discord's home button: DM mentions plus friend requests waiting.
  const dmMentions = $derived(store.dmList().reduce((n, c) => n + store.mentionCount(c.id), 0) + store.related('Incoming').length);

  // ---------- dragging to reorder (M4.8 task 10a) ----------
  // Native pointer events, mouse and pen only, so a touch still scrolls the rail; Move up and Move down in the
  // server's menu are the other way. The dragged tile moves by transform only, the others stay put, and a line
  // marks where it will land.
  interface Drag { id: string; pointer: number; startY: number; dy: number; moved: boolean; to: number; line: number }
  let drag = $state<Drag | null>(null);
  let rail = $state<HTMLElement | null>(null);
  /** The click that ends a drag isn't a click on the server. */
  let swallowClick = false;
  const DRAG_START_PX = 6;

  function pointerDown(e: PointerEvent, id: string) {
    swallowClick = false;
    if (e.button !== 0 || e.pointerType === 'touch' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    drag = { id, pointer: e.pointerId, startY: e.clientY, dy: 0, moved: false, to: -1, line: 0 };
  }

  /** Where the tile would land, among the other servers, and where the line goes, in the rail's own coordinates. */
  function target(y: number, id: string): { to: number; line: number } {
    const others = [...(rail?.querySelectorAll<HTMLElement>('a[data-server]') ?? [])].filter((t) => t.dataset.server !== id).map((t) => t.getBoundingClientRect());
    const to = others.filter((r) => r.top + r.height / 2 < y).length;
    const top = rail?.getBoundingClientRect().top ?? 0;
    const edge = to < others.length ? others[to]!.top - 4 : (others.at(-1)?.bottom ?? top) + 4;
    return { to, line: edge - top + (rail?.scrollTop ?? 0) };
  }

  function pointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < DRAG_START_PX) return;
    drag = { ...drag, dy, moved: true, ...target(e.clientY, drag.id) };
  }

  function pointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    swallowClick = true;
    const shown = servers.map((s) => s.id);
    const next = placeServer(shown, d.id, d.to);
    if (next.some((id, i) => id !== shown[i]) && app.session) void app.session.setServerOrder(next).catch(() => toasts.show(m.shell.serverOrderFailed));
  }

  function keyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drag?.moved) {
      e.preventDefault();
      drag = null;
      swallowClick = true;
    }
  }

  function href(server: string): string {
    const channel = recalled(server) ?? firstChannel(store, server);
    return channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }) : resolve('/app/channels/@me');
  }
</script>

<svelte:window onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => (drag = null)} onkeydown={keyDown} />

<nav class="rail" class:dragging={drag?.moved} bind:this={rail} aria-label={m.shell.servers}>
  <a class="item" class:active={active === null} href={resolve('/app/channels/@me')} aria-current={active === null ? 'page' : undefined} use:tooltip={{ text: m.shell.directMessages, placement: 'right' }} aria-label={m.shell.directMessages}>
    <span class="pill" aria-hidden="true"></span>
    <span class="tile home"><Logo /></span>
    {#if dmMentions}<span class="badge"><Badge count={dmMentions} label={m.shell.mentions(dmMentions)} /></span>{/if}
  </a>
  <button class="item" onclick={() => shell.openMentions()} use:tooltip={m.mentions.title} aria-label={m.mentions.title}>
    <span class="tile inbox"><AtSign /></span>
  </button>
  <div class="separator" role="separator"></div>
  {#each servers as server (server.id)}
    {@const badge = store.serverBadge(server.id, (c) => canView(store, c))}
    <a
      class="item" class:active={active === server.id} class:unread={badge.unread} class:lifted={drag?.moved && drag.id === server.id}
      style:translate={drag?.moved && drag.id === server.id ? `0 ${drag.dy}px` : undefined}
      data-server={server.id} draggable="false"
      onpointerdown={(e) => pointerDown(e, server.id)}
      onclick={(e) => { if (swallowClick) { e.preventDefault(); swallowClick = false; } }}
      href={href(server.id)} aria-current={active === server.id ? 'page' : undefined}
      use:tooltip={{ name: server.name, detail: store.serverMuted(server.id) ? m.notify.muted : undefined, placement: 'right' }} aria-label={m.shell.serverLabel(server.name, badge.mentions)}
      use:menuOn={() => (app.session ? serverMenu(app.session, server.id) : [])}
    >
      <span class="pill" aria-hidden="true"></span>
      {#if server.icon}
        <img class="tile" src={fileUrl(server.icon, { maxSide: 128 })} alt="" width="40" height="40" draggable="false" />
      {:else}
        <span class="tile initials">{initials(server.name)}</span>
      {/if}
      {#if badge.mentions}<span class="badge"><Badge count={badge.mentions} /></span>{/if}
    </a>
  {/each}
  {#if drag?.moved}<span class="drop-line" style:translate="0 {drag.line}px" aria-hidden="true"></span>{/if}
  {#if canCreateServers(store) && app.session}
    <button class="item" onclick={() => (creating = true)} use:tooltip={{ text: m.admin.createServer, placement: 'right' }} aria-label={m.admin.createServer}>
      <span class="pill" aria-hidden="true"></span>
      <span class="tile add"><Plus /></span>
    </button>
  {/if}
</nav>
{#if app.session}<CreateServerDialog session={app.session} open={creating} onclose={() => (creating = false)} />{/if}

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
  .inbox { color: var(--text-secondary); }
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
  .lifted .tile { box-shadow: var(--shadow-popover); }
  .drop-line { position: absolute; top: 0; left: var(--space-3); right: var(--space-3); height: 2px; margin-top: -1px; border-radius: var(--radius-full); background: var(--accent); pointer-events: none; }
  .separator { width: 32px; height: 1px; flex: none; background: var(--border-default); margin: var(--space-1) 0; }
  .item:focus-visible { outline: none; }
  .item:focus-visible .tile { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
