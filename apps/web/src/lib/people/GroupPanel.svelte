<script lang="ts">
  /** A group's side panel (m2b-plan.md task 4): members with the owner marked, and the group's actions. */
  import { Avatar, Button } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import Crown from '@lucide/svelte/icons/crown';
  import { m } from '$lib/i18n/index.ts';
  import { menuOn } from '$lib/view/contextmenu.svelte.ts';
  import { popout } from '$lib/view/popout.svelte.ts';
  import { avatarUrl, presenceOf, statusTextOf } from '$lib/view/users.ts';
  import FriendPicker from './FriendPicker.svelte';
  import GroupSettings from './GroupSettings.svelte';
  import { leaveGroup, memberMenu, room } from './groups.ts';

  let { session, channel }: { session: Session; channel: string } = $props();
  const store = $derived(session.store);
  const group = $derived.by(() => { const c = store.channels.get(channel); return c?.kind === 'group' ? c : undefined; });
  const members = $derived.by(() => {
    if (!group) return [];
    const name = (id: string) => store.displayName(id).toLocaleLowerCase();
    return [...group.recipients].sort((a, b) => Number(b === group.owner) - Number(a === group.owner) || name(a).localeCompare(name(b)));
  });
  let adding = $state(false);
  let editing = $state(false);
</script>

{#if group}
  <aside class="group" aria-label={m.shell.memberList}>
    <div class="buttons">
      <Button size="sm" variant="secondary" onclick={() => (adding = true)}>{m.groups.addMembers}</Button>
      <Button size="sm" variant="secondary" onclick={() => (editing = true)}>{m.groups.edit}</Button>
    </div>
    <h3>{m.groups.members(members.length)}</h3>
    <ul>
      {#each members as id (id)}
        {@const user = store.users.get(id)}
        {@const presence = presenceOf(user)}
        {@const status = statusTextOf(user, store.selfId)}
        <li class:offline={presence === 'offline'} data-user={id}>
          <button class="member" aria-label={m.people.openProfile(store.displayName(id))}
            onclick={(e) => popout.open(id, undefined, e.currentTarget, 'left')}
            use:menuOn={(node) => memberMenu(session, group.id, id, () => popout.open(id, undefined, node, 'left'))}>
            <Avatar src={avatarUrl(user ?? { id })} size={32} presence={presence === 'offline' ? undefined : presence} presenceLabel={m.presence[presence]} />
            <span class="text">
              <span class="name">{store.displayName(id)}{#if id === group.owner}<span class="crown" title={m.groups.owner} aria-label={m.groups.owner}><Crown size={14} /></span>{/if}</span>
              {#if status}<span class="sub">{status}</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    <div class="leave"><Button size="sm" variant="danger" wide onclick={() => void leaveGroup(session, group.id)}>{m.groups.leave}</Button></div>
  </aside>
  <FriendPicker {session} open={adding} title={m.groups.addTitle(group.name)} exclude={group.recipients} max={room(session, group.recipients.length)}
    onclose={() => (adding = false)} onpick={(users) => session.addGroupMembers(group.id, users)} />
  <GroupSettings {session} {group} open={editing} onclose={() => (editing = false)} />
{/if}

<style>
  .group { display: flex; flex-direction: column; height: 100%; overflow-y: auto; padding: var(--space-4) var(--space-3); }
  .buttons { display: flex; gap: var(--space-3); padding: 0 var(--space-3) var(--space-4); }
  h3 { margin: var(--space-3) var(--space-3) var(--space-2); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); text-transform: uppercase; letter-spacing: 0.02em; }
  ul { margin: 0; padding: 0; list-style: none; flex: 1; }
  .member { display: flex; align-items: center; gap: var(--space-4); width: 100%; min-height: var(--row-member); padding: var(--space-1) var(--space-3); border: 0; border-radius: var(--radius-md); background: none; color: inherit; text-align: left; }
  @media (hover: hover) { .member:hover { background: var(--hover-overlay); } }
  .offline .member { opacity: 0.45; }
  .text { display: grid; min-width: 0; }
  .name { display: flex; align-items: center; gap: var(--space-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .crown { display: inline-grid; color: var(--status-idle); }
  .sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .leave { padding: var(--space-4) var(--space-3) 0; }
</style>
