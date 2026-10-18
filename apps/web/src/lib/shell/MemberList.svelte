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

  let { store, server }: { store: Store; server: string } = $props();
  const groups = $derived(store.memberGroups(server));
  // Until the list loads, its group headers stand in for it, from the server's hoisted roles, without rows (motion spec 4.7).
  const loaded = $derived(store.memberListLoaded.has(server));
  const headers = $derived.by(() => {
    const roles = store.servers.get(server)?.roles ?? {};
    return [...Object.values(roles).filter((r) => r.hoist).sort((a, b) => a.rank - b.rank).map((r) => r.name), m.shell.group.online];
  });
</script>

<aside class="members" aria-label={m.shell.memberList} aria-busy={!loaded || undefined}>
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
</aside>

<style>
  .members { overflow-y: auto; padding: var(--space-3) var(--space-3) var(--space-5); height: 100%; }
  h3 { margin: var(--space-6) var(--space-3) var(--space-2); color: var(--text-secondary); font: 500 var(--text-sm) var(--font-sans); }
  h3:first-child { margin-top: var(--space-4); }
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
