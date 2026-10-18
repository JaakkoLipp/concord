<script lang="ts">
  import { Avatar } from '@concord/ui';
  import type { Store } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl, presenceOf } from '$lib/view/users.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { app } from '$lib/session/app.svelte.ts';
  import { participantMenu } from '$lib/call/menu.ts';
  import TagBadge from '$lib/people/TagBadge.svelte';
  import TimeoutMark from '$lib/people/TimeoutMark.svelte';
  import { rank } from '$lib/composer/rank.ts';

  let { store, server }: { store: Store; server: string } = $props();
  // The filter box narrows the groups by nickname, display name or username (m4.8-plan.md task 12).
  let filter = $state('');
  $effect.pre(() => {
    void server;
    filter = '';
  });
  const groups = $derived.by(() => {
    const all = store.memberGroups(server);
    const q = filter.trim();
    if (!q) return all;
    const matches = (user: string, nickname?: string) => {
      const u = store.users.get(user);
      return [nickname, u?.displayName, u?.username].some((n) => !!n && rank(n, q) >= 0);
    };
    return all.map((g) => ({ ...g, members: g.members.filter((mm) => matches(mm.user, mm.nickname)) })).filter((g) => g.members.length);
  });
  // Until the list loads, its group headers stand in for it, from the server's hoisted roles, without rows (motion spec 4.7).
  const loaded = $derived(store.memberListLoaded.has(server));
  const headers = $derived.by(() => {
    const roles = store.servers.get(server)?.roles ?? {};
    return [...Object.values(roles).filter((r) => r.hoist).sort((a, b) => a.rank - b.rank).map((r) => r.name), m.shell.group.online];
  });
</script>

<aside class="members" aria-label={m.shell.memberList} aria-busy={!loaded || undefined}>
  <input class="filter" type="search" placeholder={m.shell.filterMembers} aria-label={m.shell.filterMembers} bind:value={filter}
    onkeydown={(e) => { if (e.key === 'Escape' && filter) { filter = ''; e.stopPropagation(); } }} />
  {#if !loaded}
    {#each headers as title, i (i)}<h3 class="skeleton">{title}</h3>{/each}
  {/if}
  {#each loaded ? groups : [] as group (group.role ?? group.title)}
    <h3>{group.role ? group.title : m.shell.group[group.title as 'online' | 'offline']} — {group.members.length}</h3>
    <ul>
      {#each group.members as member (member.user)}
        {@const user = store.users.get(member.user)}
        {@const offline = presenceOf(user) === 'offline'}
        <li class:offline><button class="member" class:shown={popout.shownIn(member.user, 'members')} data-profile-trigger="members" aria-label={m.people.openProfile(store.displayName(member.user, server))} onclick={(e) => popout.open(member.user, server, e.currentTarget, 'left')}
          use:menuOn={(node) => (app.session ? participantMenu(app.session, app.voice, member.user, { profile: () => popout.open(member.user, server, node, 'left'), server }) : [])}>
          <Avatar src={avatarUrl(user ?? { id: member.user }, member.avatar)} size={32} presence={offline ? undefined : presenceOf(user)} presenceLabel={m.presence[presenceOf(user)]} />
          <span class="text">
            <span class="top">
              <span class="name" style:--role={store.roleColour(member.user, server)}>{store.displayName(member.user, server)}</span>
              <TagBadge {store} user={member.user} plain />
              <TimeoutMark {store} {server} user={member.user} />
            </span>
            {#if user?.statusText && !offline}<span class="sub">{user.statusText}</span>{/if}
          </span>
        </button></li>
      {/each}
    </ul>
  {/each}
  {#if loaded && filter.trim() && !groups.length}<p class="none">{m.shell.noMembersMatch}</p>{/if}
</aside>

<style>
  .members { overflow-y: auto; padding: var(--space-3) var(--space-3) var(--space-5); height: 100%; }
  .filter {
    width: 100%; min-height: 1.75rem; padding: 0 var(--space-3);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-1); color: var(--text-normal);
    font: var(--text-sm) var(--font-sans);
  }
  .filter::placeholder { color: var(--text-secondary); }
  .filter:focus-visible { outline: none; border-color: var(--accent); }
  .none { margin: var(--space-6) var(--space-3); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  h3 { margin: var(--space-6) var(--space-3) var(--space-2); color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); }
  h3:first-of-type { margin-top: var(--space-4); }
  ul { list-style: none; margin: 0; padding: 0; }
  .member {
    display: flex; align-items: center; gap: var(--space-4); width: 100%; min-height: var(--row-member); padding: var(--space-1) var(--space-3);
    border: 0; border-radius: var(--radius-md); background: none; text-align: left;
  }
  @media (hover: hover) { .member:hover { background: var(--hover-overlay); } }
  /* The row whose profile is open keeps its hover background (m4.6-plan.md task 14). */
  .member.shown { background: var(--hover-overlay); }
  .offline { opacity: 0.45; }
  .offline:hover, .offline:has(.shown) { opacity: 1; }
  .text { display: grid; min-width: 0; }
  .name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 var(--text-md) var(--font-sans);
    color: var(--text-normal);
  }
  /* Role colours may be gradients, so they paint the text through background-clip. */
  .name[style*='--role'] { background: var(--role); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .top { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
</style>
