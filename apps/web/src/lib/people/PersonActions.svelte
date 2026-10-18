<script lang="ts">
  /**
   * The buttons on a profile card (m2b-plan.md task 3): the main action as a button, the rest in a menu. On the
   * popout's banner they are round icon buttons on a dark fill (m4.6-plan.md task 14); the DM panel keeps text.
   */
  import { Button, IconButton, Menu } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Clock from '@lucide/svelte/icons/clock';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Pencil from '@lucide/svelte/icons/pencil';
  import ShieldOff from '@lucide/svelte/icons/shield-off';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import UserX from '@lucide/svelte/icons/user-x';
  import { m } from '$lib/i18n/index.ts';
  import * as act from './actions.ts';
  import { openSettings } from '$lib/settings/modal.svelte.ts';

  interface Props { session: Session; user: string; server?: string | undefined; inDm?: boolean; round?: boolean }
  let { session, user, server, inDm = false, round = false }: Props = $props();
  const u = $derived(session.store.users.get(user));
  const rel = $derived(u?.relationship);
  let anchor = $state<HTMLElement | null>(null);
  let open = $state(false);
</script>

{#if u && round}
  <div class="person-actions round">
    {#if user === session.store.selfId}
      <IconButton label={m.settings.editProfile} onclick={() => openSettings({ kind: 'user', section: 'profile' })}><Pencil /></IconButton>
    {:else}
      {#if !u.bot}
        {#if rel === 'Friend' && !inDm}
          <IconButton label={m.friends.actions.message} onclick={() => void act.message(session, user)}><MessageCircle /></IconButton>
        {:else if rel === 'None'}
          <IconButton label={m.people.addFriend} onclick={() => act.request(session, user)}><UserPlus /></IconButton>
        {:else if rel === 'Incoming'}
          <IconButton label={m.friends.actions.accept} onclick={() => act.accept(session, user)}><UserCheck /></IconButton>
          <IconButton label={m.friends.actions.ignore} onclick={() => act.dropRequest(session, user)}><UserX /></IconButton>
        {:else if rel === 'Outgoing'}
          <IconButton label={m.people.pending} disabled><Clock /></IconButton>
        {:else if rel === 'Blocked'}
          <IconButton label={m.friends.actions.unblock} onclick={() => act.unblock(session, user)}><ShieldOff /></IconButton>
        {/if}
      {/if}
      <span bind:this={anchor}><IconButton label={m.friends.actions.more} aria-haspopup="menu" onclick={() => (open = !open)}><Ellipsis /></IconButton></span>
    {/if}
  </div>
  {#if user !== session.store.selfId}
    <Menu {open} onclose={() => (open = false)} {anchor} label={m.people.menu} items={act.personMenu(session, user, { primary: false, inDm, server })} />
  {/if}
{:else if u && user === session.store.selfId}
  <div class="person-actions">
    <Button size="sm" variant="secondary" onclick={() => openSettings({ kind: 'user', section: 'profile' })}>{m.settings.editProfile}</Button>
  </div>
{:else if u}
  <div class="person-actions">
    {#if !u.bot}
      {#if rel === 'Friend' && !inDm}
        <Button size="sm" onclick={() => void act.message(session, user)}>{m.friends.actions.message}</Button>
      {:else if rel === 'None'}
        <Button size="sm" onclick={() => act.request(session, user)}>{m.people.addFriend}</Button>
      {:else if rel === 'Incoming'}
        <Button size="sm" onclick={() => act.accept(session, user)}>{m.friends.actions.accept}</Button>
        <Button size="sm" variant="secondary" onclick={() => act.dropRequest(session, user)}>{m.friends.actions.ignore}</Button>
      {:else if rel === 'Outgoing'}
        <Button size="sm" variant="secondary" disabled>{m.people.pending}</Button>
      {:else if rel === 'Blocked'}
        <Button size="sm" variant="secondary" onclick={() => act.unblock(session, user)}>{m.friends.actions.unblock}</Button>
      {/if}
    {/if}
    <span bind:this={anchor}><IconButton label={m.friends.actions.more} aria-haspopup="menu" onclick={() => (open = !open)}><EllipsisVertical size={18} /></IconButton></span>
  </div>
  <Menu {open} onclose={() => (open = false)} {anchor} label={m.people.menu} items={act.personMenu(session, user, { primary: false, inDm, server })} />
{/if}

<style>
  .person-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); }
  .person-actions:not(.round) :global(.icon-button) { background: var(--surface-4); }
  .round { gap: var(--space-2); }
  .round :global(.icon-button) { border-radius: var(--radius-full); background: var(--scrim); color: var(--text-strong); }
  .round :global(.icon-button svg) { width: var(--icon-sm); height: var(--icon-sm); }
  @media (hover: hover) { .round :global(.icon-button:hover:not(:disabled)) { background: var(--surface-5); } }
</style>
