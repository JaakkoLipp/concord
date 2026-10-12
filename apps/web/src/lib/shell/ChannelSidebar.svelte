<script lang="ts">
  import { Badge } from '@concord/ui';
  import type { Channel, Store } from '@concord/domain';
  import BellOff from '@lucide/svelte/icons/bell-off';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Hash from '@lucide/svelte/icons/hash';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { canView } from '$lib/view/channels.ts';

  interface Props { store: Store; server: string; active: string | null }
  let { store, server, active }: Props = $props();

  const info = $derived(store.servers.get(server));
  const tree = $derived(store.channelTree(server).map((g) => ({ ...g, channels: g.channels.filter((c) => canView(store, c)) })).filter((g) => g.channels.length));
  let collapsed = $state<Record<string, boolean>>({});

  const isVoice = (c: Channel) => c.kind === 'text' && !!c.voice;
  /** A collapsed category still shows its selected and unread channels, as on Discord. */
  const visible = (id: string | null, c: Channel) => !id || !collapsed[id] || c.id === active || (store.isUnread(c.id) && !store.isMuted(c.id));
</script>

<header class="server-header">
  <h2>{info?.name}</h2>
  <ChevronDown size={18} aria-hidden="true" />
</header>
<nav class="channels" aria-label={m.shell.channels}>
  {#each tree as group (group.id ?? 'loose')}
    <div class="group" role="group" aria-label={group.title || m.shell.channels}>
      {#if group.id}
        {@const id = group.id}
        <button class="category" class:collapsed={collapsed[id]} aria-expanded={!collapsed[id]} onclick={() => (collapsed = { ...collapsed, [id]: !collapsed[id] })}>
          <span>{group.title}</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      {/if}
      {#each group.channels.filter((c) => visible(group.id, c)) as channel (channel.id)}
        {@const unread = store.isUnread(channel.id) && !store.isMuted(channel.id)}
        {@const muted = store.isMuted(channel.id)}
        {@const mentions = store.mentionCount(channel.id)}
        <a
          class="channel" class:active={channel.id === active} class:unread class:muted
          href={resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel: channel.id })}
          aria-current={channel.id === active ? 'page' : undefined}
          aria-label={m.shell.channelLabel(channel.kind === 'text' ? channel.name : '', isVoice(channel), unread, mentions)}
        >
          {#if unread}<span class="unread-pill" aria-hidden="true"></span>{/if}
          <span class="icon" aria-hidden="true">{#if isVoice(channel)}<Volume2 size={20} />{:else}<Hash size={20} />{/if}</span>
          <span class="name">{channel.kind === 'text' ? channel.name : ''}</span>
          {#if muted}<span class="muted-icon" aria-hidden="true"><BellOff size={16} /></span>{/if}
          {#if mentions}<Badge count={mentions} />{/if}
        </a>
      {/each}
    </div>
  {/each}
</nav>

<style>
  .server-header {
    display: flex; align-items: center; gap: var(--space-3); min-height: var(--header-h); padding: 0 var(--space-5);
    border-bottom: 1px solid var(--border-subtle); color: var(--text-strong);
  }
  h2 { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 var(--text-md) var(--font-sans); }
  .channels { flex: 1; overflow-y: auto; padding: var(--space-3) var(--space-3) var(--space-5); }
  .group + .group { margin-top: var(--space-6); }
  .category {
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
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted-icon { display: grid; color: var(--text-secondary); }
  .unread-pill { position: absolute; left: calc(-1 * var(--space-3)); width: 4px; height: 8px; border-radius: 0 var(--radius-xs) var(--radius-xs) 0; background: var(--text-strong); }
</style>
