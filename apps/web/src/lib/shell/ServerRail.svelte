<script lang="ts">
  import { Badge, tooltip } from '@concord/ui';
  import { fileUrl } from '@concord/stoat';
  import type { Store } from '@concord/domain';
  import Logo from '$lib/brand/Logo.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import CreateServerDialog from '$lib/admin/CreateServerDialog.svelte';
  import { serverMenu } from '$lib/admin/menu.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { canCreateServers } from '$lib/view/admin.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { resolve } from '$app/paths';
  import { m } from '$lib/i18n/index.ts';
  import { canView, firstChannel, initials, orderedServers, recalled } from '$lib/view/channels.ts';

  interface Props { store: Store; active: string | null }
  let { store, active }: Props = $props();

  const servers = $derived(orderedServers(store));
  let creating = $state(false);
  // Like Discord's home button: DM mentions plus friend requests waiting.
  const dmMentions = $derived(store.dmList().reduce((n, c) => n + store.mentionCount(c.id), 0) + store.related('Incoming').length);

  function href(server: string): string {
    const channel = recalled(server) ?? firstChannel(store, server);
    return channel ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server, channel }) : resolve('/app/channels/@me');
  }
</script>

<nav class="rail" aria-label={m.shell.servers}>
  <a class="item" class:active={active === null} href={resolve('/app/channels/@me')} aria-current={active === null ? 'page' : undefined} use:tooltip={m.shell.directMessages} aria-label={m.shell.directMessages}>
    <span class="pill" aria-hidden="true"></span>
    <span class="tile home"><Logo /></span>
    {#if dmMentions}<span class="badge"><Badge count={dmMentions} label={m.shell.mentions(dmMentions)} /></span>{/if}
  </a>
  <div class="separator" role="separator"></div>
  {#each servers as server (server.id)}
    {@const badge = store.serverBadge(server.id, (c) => canView(store, c))}
    <a
      class="item" class:active={active === server.id} class:unread={badge.unread}
      href={href(server.id)} aria-current={active === server.id ? 'page' : undefined}
      use:tooltip={server.name} aria-label={m.shell.serverLabel(server.name, badge.mentions)}
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
  {#if canCreateServers(store) && app.session}
    <button class="item" onclick={() => (creating = true)} use:tooltip={m.admin.createServer} aria-label={m.admin.createServer}>
      <span class="pill" aria-hidden="true"></span>
      <span class="tile add"><Plus /></span>
    </button>
  {/if}
</nav>
{#if app.session}<CreateServerDialog session={app.session} open={creating} onclose={() => (creating = false)} />{/if}

<style>
  .rail {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
    padding: var(--space-3) 0; overflow-y: auto; scrollbar-width: none;
  }
  .item { position: relative; display: grid; place-items: center; width: 100%; height: var(--rail-icon); color: var(--text-normal); text-decoration: none; }
  .tile {
    display: grid; place-items: center; width: var(--rail-icon); height: var(--rail-icon);
    border-radius: var(--radius-lg); background: var(--surface-3); object-fit: cover;
    transition: background-color var(--dur-hover) var(--ease-out);
  }
  .active .home { background: var(--accent); color: var(--on-accent); }
  @media (hover: hover) { .item:hover .home { background: var(--accent); color: var(--on-accent); } }
  .initials { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
  @media (hover: hover) { .item:hover .initials { background: var(--surface-5); } }
  button.item { padding: 0; border: 0; background: none; cursor: pointer; }
  .add { color: var(--status-online); }
  @media (hover: hover) { .item:hover .add { background: var(--status-online); color: var(--on-accent); } }
  /* The pill on the left edge: a dot for unread, taller on hover, full height when selected. It is always
     38 px tall and scaled, since animating its height would lay out the rail on every frame. */
  .pill {
    position: absolute; left: 0; top: 50%; width: 4px; height: 38px; translate: 0 -50%; scale: 1 0;
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0; background: var(--text-strong);
    transition: scale calc(var(--dur-popover) * var(--motion)) var(--ease-out);
  }
  .unread .pill { scale: 1 calc(8 / 38); }
  .item:hover .pill { scale: 1 calc(20 / 38); }
  .active .pill { scale: 1; }
  .badge { position: absolute; right: 12px; bottom: -4px; padding: 2px; border-radius: var(--radius-full); background: var(--surface-0); line-height: 0; }
  .separator { width: 32px; height: 1px; flex: none; background: var(--border-default); margin: var(--space-1) 0; }
  .item:focus-visible { outline: none; }
  .item:focus-visible .tile { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
