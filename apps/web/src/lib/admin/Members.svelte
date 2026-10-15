<script lang="ts">
  /**
   * Every member with a search box (m2c-plan.md): avatar, name, roles and join date. The row menu holds
   * Roles, Kick and Ban for members ranked below you, as the people menu does.
   */
  import { untrack } from 'svelte';
  import { Avatar, IconButton, Menu, TextField, type MenuItem } from '@concord/ui';
  import { rolesByRank, type Session } from '@concord/domain';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { memberItems } from './members.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server)!);
  let query = $state('');
  let menu = $state<{ items: MenuItem[]; anchor: HTMLElement } | null>(null);

  $effect(() => {
    const id = server;
    untrack(() => void session.loadMembers(id, true).catch(() => {}));
  });

  const order = $derived(new Map(rolesByRank(info).map((r, i) => [r.id, i])));
  const all = $derived([...store.members.values()].filter((x) => x.server === server));
  const shown = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase();
    const name = (u: string) => store.displayName(u, server);
    return all
      .filter((x) => !q || name(x.user).toLocaleLowerCase().includes(q) || (store.users.get(x.user)?.username ?? '').toLocaleLowerCase().includes(q))
      .sort((a, b) => name(a.user).localeCompare(name(b.user)));
  });
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
</script>

<div class="search"><TextField label={m.admin.members.search} hideLabel placeholder={m.admin.members.search} bind:value={query} /></div>
<p class="count">{m.admin.members.count(all.length)}</p>
{#if !shown.length}<p class="count">{m.admin.members.none}</p>{/if}
<ul class="members">
  {#each shown as member (member.user)}
    {@const user = store.users.get(member.user)}
    {@const items = memberItems(session, server, member.user)}
    {@const label = store.displayName(member.user, server)}
    <li class="member" data-user={member.user}>
      <Avatar src={avatarUrl(user ?? { id: member.user }, member.avatar)} size={32} />
      <div class="text">
        <span class="name" style:--role={store.roleColour(member.user, server)}>{label}{#if member.user === info.owner}<span class="owner">{m.admin.members.owner}</span>{/if}</span>
        <span class="sub">{user ? `${user.username}#${user.discriminator}` : ''} · {m.admin.members.joined(date(member.joinedAt))}</span>
        {#if member.roles.length}
          <span class="roles">
            {#each [...member.roles].filter((r) => info.roles[r]).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) as r (r)}
              <span class="chip"><span class="swatch" style:background={info.roles[r]!.colour ?? 'var(--text-muted)'}></span>{info.roles[r]!.name}</span>
            {/each}
          </span>
        {/if}
      </div>
      {#if items.length}
        <IconButton size="sm" label={m.admin.members.menu(label)} onclick={(e) => (menu = { items, anchor: e.currentTarget as HTMLElement })}><Ellipsis /></IconButton>
      {/if}
    </li>
  {/each}
</ul>
<Menu open={!!menu} onclose={() => (menu = null)} items={menu?.items ?? []} label={m.admin.sections.members} anchor={menu?.anchor ?? null} />

<style>
  .search { margin-bottom: var(--space-3); }
  .count { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .members { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
  .member { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); }
  @media (hover: hover) { .member:hover { background: var(--hover-overlay); } }
  .text { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .name { display: flex; align-items: center; gap: var(--space-2); color: var(--role, var(--text-strong)); font: 500 var(--text-md) var(--font-sans); }
  .owner { padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--surface-4); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); }
  .sub { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .roles { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-1); }
  .chip { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0 var(--space-2); border-radius: var(--radius-xs); background: var(--surface-3); color: var(--text-normal); font: var(--text-xs) var(--font-sans); }
  .swatch { width: 0.5rem; height: 0.5rem; border-radius: var(--radius-full); }
</style>
