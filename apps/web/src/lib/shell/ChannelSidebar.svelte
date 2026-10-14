<script lang="ts">
  import { Badge, Button, Menu } from '@concord/ui';
  import type { Channel, Id, Store } from '@concord/domain';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Hash from '@lucide/svelte/icons/hash';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import Plus from '@lucide/svelte/icons/plus';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { adminDialogs } from '$lib/admin/dialogs.svelte.ts';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { canView } from '$lib/view/channels.ts';
  import { canManageChannels, categoryMenu, channelMenu, serverMenu } from '$lib/admin/menu.ts';
  import { fileUrl } from '@concord/stoat';
  import { app } from '$lib/session/app.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import VoiceParticipants from './VoiceParticipants.svelte';
  import VoiceTimer from './VoiceTimer.svelte';

  /** `speaking` holds who is talking in the user's own call, from LiveKit; empty when not in one. */
  interface Props { store: Store; server: string; active: string | null; speaking?: ReadonlySet<Id> }
  let { store, server, active, speaking = new Set() }: Props = $props();

  const info = $derived(store.servers.get(server));
  const manager = $derived(!!app.session && canManageChannels(app.session, server));
  // Managers see empty categories, so a new one can be filled.
  const tree = $derived(store.channelTree(server).map((g) => ({ ...g, channels: g.channels.filter((c) => canView(store, c)) })).filter((g) => g.channels.length || (manager && g.id)));
  let collapsed = $state<Record<string, boolean>>({});
  let menuOpen = $state(false);
  let menuButton = $state<HTMLButtonElement | null>(null);
  const menuItems = $derived(menuOpen && app.session ? serverMenu(app.session, server) : []);
  const unfinished = $derived(!!app.session?.admin.setupUnfinished(server));
  let retrying = $state(false);
  async function retry() {
    retrying = true;
    await app.session?.admin.bootstrap(server).catch(() => toasts.show(m.admin.retryFailed));
    retrying = false;
  }

  const isVoice = (c: Channel) => c.kind === 'text' && !!c.voice;
  // Clicking a voice channel also joins its call, or does nothing more when already in it (client.md section 10.3).
  const maxUsers = (c: Channel) => (c.kind === 'text' ? c.voice?.maxUsers : undefined);
  /** A collapsed category still shows its selected and unread channels, as on Discord. */
  const visible = (id: string | null, c: Channel) => !id || !collapsed[id] || c.id === active || (store.isUnread(c.id) && !store.notificationsMuted(c.id));
</script>

<header class="server-header" class:with-banner={!!info?.banner}>
  {#if info?.banner}<img class="banner" src={fileUrl(info.banner, { maxSide: 640 })} alt="" />{/if}
  <button class="header-button" bind:this={menuButton} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={m.admin.menuLabel(info?.name ?? '')} onclick={() => (menuOpen = !menuOpen)}>
    <h2>{info?.name}</h2>
    <ChevronDown size={18} aria-hidden="true" />
  </button>
</header>
<Menu open={menuOpen && menuItems.length > 0} onclose={() => (menuOpen = false)} items={menuItems} label={m.admin.menuLabel(info?.name ?? '')} anchor={menuButton} />
{#if unfinished || retrying}
  <div class="setup" role="status">
    <p>{m.admin.setupUnfinished}</p>
    <Button size="sm" busy={retrying} onclick={retry}>{m.admin.retry}</Button>
  </div>
{/if}
<nav class="channels" aria-label={m.shell.channels}>
  {#each tree as group (group.id ?? 'loose')}
    <div class="group" role="group" aria-label={group.title || m.shell.channels}>
      {#if group.id}
        {@const id = group.id}
        <div class="category-row" use:menuOn={() => (app.session ? categoryMenu(app.session, server, id) : [])}>
          <button class="category" class:collapsed={collapsed[id]} aria-expanded={!collapsed[id]} onclick={() => (collapsed = { ...collapsed, [id]: !collapsed[id] })}>
            <span>{group.title}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {#if manager}
            <button class="add" aria-label={m.admin.createChannelIn(group.title)} title={m.admin.createChannelIn(group.title)} onclick={() => adminDialogs.open({ kind: 'createChannel', server, category: id })}><Plus size={16} /></button>
          {/if}
        </div>
      {/if}
      {#each group.channels.filter((c) => visible(group.id, c)) as channel (channel.id)}
        {@const unread = store.isUnread(channel.id) && !store.notificationsMuted(channel.id)}
        {@const muted = store.notificationsMuted(channel.id)}
        {@const mentions = store.mentionCount(channel.id)}
        {@const name = channel.kind === 'text' ? channel.name : ''}
        {@const since = isVoice(channel) ? store.voiceSince(channel.id) : undefined}
        {@const occupants = since === undefined ? 0 : store.voiceParticipants(channel.id).length}
        {@const max = maxUsers(channel)}
        <a
          class="channel" class:active={channel.id === active} class:unread class:muted class:occupied={since !== undefined}
          href={resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel: channel.id })}
          aria-current={channel.id === active ? 'page' : undefined}
          aria-label={[m.shell.channelLabel(name, isVoice(channel), unread, mentions), occupants || max ? m.voiceState.occupied(occupants, max) : ''].filter(Boolean).join(', ')}
          use:menuOn={() => (app.session ? channelMenu(app.session, channel.id) : [])}
          onclick={isVoice(channel) ? (e) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) app.voice?.join(channel.id); } : undefined}
        >
          {#if unread}<span class="unread-pill" aria-hidden="true"></span>{/if}
          <span class="icon" aria-hidden="true">{#if isVoice(channel)}<Volume2 size={20} />{:else}<Hash size={20} />{/if}</span>
          <span class="name">{name}</span>
          {#if muted}<span class="muted-icon" aria-hidden="true"><BellOff size={16} /></span>{/if}
          {#if mentions}<Badge count={mentions} />{/if}
          {#if since !== undefined}<VoiceTimer {since} />{/if}
          {#if max}<span class="limit" aria-hidden="true">{m.voiceState.limit(occupants, max)}</span>{/if}
        </a>
        {#if occupants}<VoiceParticipants {store} {server} {name} {speaking} channel={channel.id} />{/if}
      {/each}
    </div>
  {/each}
</nav>

<style>
  .server-header { position: relative; display: flex; min-height: var(--header-h); border-bottom: 1px solid var(--border-subtle); }
  .with-banner { min-height: 8.5rem; align-items: flex-start; border-bottom: 0; }
  .banner { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .with-banner .header-button { position: relative; min-height: var(--header-h); background: linear-gradient(var(--scrim), transparent); text-shadow: 0 1px 2px var(--scrim); }
  .header-button {
    flex: 1; display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: 0 var(--space-5);
    background: none; border: 0; color: var(--text-strong); text-align: left; cursor: pointer;
  }
  .header-button:hover, .header-button[aria-expanded='true'] { background: var(--hover-overlay); }
  .header-button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .setup { display: grid; gap: var(--space-3); margin: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); border-left: 3px solid var(--status-idle); }
  .setup p { margin: 0; color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  h2 { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 var(--text-md) var(--font-sans); }
  .channels { flex: 1; overflow-y: auto; padding: var(--space-3) var(--space-3) var(--space-5); }
  .group + .group { margin-top: var(--space-6); }
  .category-row { display: flex; align-items: center; }
  .add { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; margin-right: var(--space-1); padding: 0; border: 0; border-radius: var(--radius-xs); background: none; color: var(--text-secondary); cursor: pointer; }
  .add:hover { color: var(--text-strong); }
  .add:focus-visible { outline: 2px solid var(--accent); }
  .category {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-2) var(--space-3);
    background: none; border: 0; color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); text-align: left;
  }
  .category:hover { color: var(--text-strong); }
  .category :global(svg) { transition: rotate var(--dur-popover) var(--ease-out); }
  .category.collapsed :global(svg) { rotate: -90deg; }
  .channel {
    position: relative; display: flex; align-items: center; gap: var(--space-3);
    min-height: var(--row-channel); margin-top: 2px; padding: 0 var(--space-3);
    border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none;
    font: 500 var(--text-md) var(--font-sans);
  }
  .channel:hover { background: var(--hover-overlay); color: var(--text-normal); text-decoration: none; }
  .channel.active { background: var(--surface-5); color: var(--text-strong); }
  .channel.unread { color: var(--text-strong); }
  .channel.muted { color: var(--text-muted); font-weight: 400; }
  .channel.muted:hover, .channel.muted.active { color: var(--text-secondary); }
  .icon { display: grid; place-items: center; color: var(--text-muted); flex: none; }
  .channel.active .icon, .channel:hover .icon { color: var(--text-secondary); }
  .channel.occupied .icon { color: var(--status-online); }
  .limit {
    flex: none; padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--surface-4); color: var(--text-secondary);
    font: 500 var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums;
  }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted-icon { display: grid; color: var(--text-secondary); }
  .unread-pill { position: absolute; left: calc(-1 * var(--space-3)); width: 4px; height: 8px; border-radius: 0 var(--radius-xs) var(--radius-xs) 0; background: var(--text-strong); }
</style>
