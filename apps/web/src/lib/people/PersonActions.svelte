<script lang="ts">
  /** The buttons on a profile card (m2b-plan.md task 3): the main action as a button, the rest in a menu. */
  import { Button, IconButton, Menu } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
  import { m } from '$lib/i18n/index.ts';
  import * as act from './actions.ts';
  import { openSettings } from '$lib/settings/modal.svelte.ts';

  interface Props { session: Session; user: string; server?: string | undefined; inDm?: boolean }
  let { session, user, server, inDm = false }: Props = $props();
  const u = $derived(session.store.users.get(user));
  const rel = $derived(u?.relationship);
  let anchor = $state<HTMLElement | null>(null);
  let open = $state(false);
</script>

{#if u && user === session.store.selfId}
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
  .person-actions :global(.icon-button) { background: var(--surface-4); }
</style>
