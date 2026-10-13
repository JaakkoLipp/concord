<script lang="ts">
  import { Avatar, Badge } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import type { Store } from '@concord/domain';
  import Users from '@lucide/svelte/icons/users';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { channelName, dmPartner } from '$lib/view/channels.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { personMenu } from '$lib/people/actions.ts';

  interface Props { store: Store; active: string | null }
  let { store, active }: Props = $props();
  const dms = $derived(store.dmList());
  const incoming = $derived(store.related('Incoming').length);
</script>

<header class="search-header">
  <button class="search" disabled>{m.shell.findConversation}</button>
</header>
<nav class="dms" aria-label={m.shell.directMessages}>
  <a class="row friends" class:active={active === null} href={resolve('/app/channels/@me')} aria-current={active === null ? 'page' : undefined}>
    <span class="friends-icon" aria-hidden="true"><Users size={24} /></span>
    <span class="name">{m.shell.friends}</span>
    {#if incoming}<Badge count={incoming} label={m.friends.waiting(incoming)} />{/if}
  </a>
  <h3 class="section">{m.shell.directMessages}</h3>
  {#each dms as channel (channel.id)}
    {@const partner = dmPartner(store, channel)}
    {@const user = partner ? store.users.get(partner) : undefined}
    {@const unread = store.isUnread(channel.id)}
    {@const mentions = store.mentionCount(channel.id)}
    <a
      class="row" class:active={channel.id === active} class:unread
      href={resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel: channel.id })}
      aria-current={channel.id === active ? 'page' : undefined}
      use:menuOn={() => (app.session && partner ? personMenu(app.session, partner, { inDm: true }) : [])}
    >
      {#if channel.kind === 'group'}
        {#if channel.icon}
          <img class="group-icon" src={fileUrl(channel.icon, { maxSide: 64 })} alt="" width="32" height="32" />
        {:else}
          <span class="group-icon initials" aria-hidden="true"><Users size={18} /></span>
        {/if}
      {:else}
        <Avatar src={avatarUrl(user ?? (partner ? { id: partner } : undefined))} size={32} presence={presenceOf(user)} />
      {/if}
      <span class="text">
        <span class="name">{channelName(store, channel)}</span>
        {#if channel.kind === 'group'}
          <span class="sub">{m.common.members(channel.recipients.length)}</span>
        {:else if statusTextOf(user)}
          <span class="sub">{statusTextOf(user)}</span>
        {/if}
      </span>
      {#if mentions}<Badge count={mentions} label={m.shell.mentions(mentions)} />{/if}
    </a>
  {/each}
</nav>

<style>
  .search-header { display: flex; align-items: center; min-height: var(--header-h); padding: 0 var(--space-3); border-bottom: 1px solid var(--border-subtle); }
  .search {
    width: 100%; min-height: 1.75rem; border: 0; border-radius: var(--radius-md); background: var(--surface-3);
    color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); cursor: default;
  }
  .dms { flex: 1; overflow-y: auto; padding: var(--space-3); }
  .section { margin: var(--space-6) var(--space-3) var(--space-3); color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); }
  .row {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--row-dm); margin-top: 2px; padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none;
  }
  .row:hover { background: var(--hover-overlay); color: var(--text-normal); text-decoration: none; }
  .row.active { background: var(--surface-5); color: var(--text-strong); }
  .row.unread { color: var(--text-strong); }
  .friends { min-height: var(--row-dm); font: 500 var(--text-md) var(--font-sans); }
  .friends-icon { display: grid; place-items: center; width: 32px; }
  .friends .name { flex: 1; }
  .group-icon { width: 32px; height: 32px; border-radius: 50%; flex: none; object-fit: cover; }
  .group-icon.initials { display: grid; place-items: center; background: var(--accent); color: var(--on-accent); }
  .text { display: grid; flex: 1; min-width: 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--text-md) var(--font-sans); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
</style>
