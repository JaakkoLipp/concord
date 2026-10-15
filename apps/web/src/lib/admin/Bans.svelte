<script lang="ts">
  /** Banned users with their reasons, a search box and Unban (m2c-plan.md). */
  import { untrack } from 'svelte';
  import { Avatar, Button, TextField } from '@concord/ui';
  import type { Ban, Session, User } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, server }: { session: Session; server: string } = $props();
  let bans = $state<Ban[] | null>(null);
  let users = $state<Record<string, User>>({});
  let query = $state('');

  $effect(() => {
    const id = server;
    untrack(() => void session.admin.bans(id).then((r) => {
      bans = r.bans;
      users = Object.fromEntries(r.users.map((u) => [u.id, u]));
    }).catch(() => toasts.show(m.admin.bans.failed)));
  });

  const nameOf = (id: string) => users[id] ? `${users[id]!.username}#${users[id]!.discriminator}` : id;
  const shown = $derived.by(() => {
    const q = query.trim().toLocaleLowerCase();
    return (bans ?? []).filter((b) => !q || nameOf(b.user).toLocaleLowerCase().includes(q) || (b.reason ?? '').toLocaleLowerCase().includes(q));
  });

  async function unban(user: string) {
    try {
      await session.admin.unban(server, user);
      bans = (bans ?? []).filter((b) => b.user !== user);
      toasts.show(m.admin.bans.unbanned(nameOf(user)), 'info');
    } catch {
      toasts.show(m.admin.bans.unbanFailed);
    }
  }
</script>

<p class="intro">{m.admin.bans.intro}</p>
{#if bans && !bans.length}
  <p class="intro">{m.admin.bans.empty}</p>
{:else if bans}
  <div class="search"><TextField label={m.admin.bans.search} hideLabel placeholder={m.admin.bans.search} bind:value={query} /></div>
  <ul class="bans">
    {#each shown as ban (ban.user)}
      <li class="ban" data-user={ban.user}>
        <Avatar src={avatarUrl(users[ban.user] ?? { id: ban.user })} size={32} />
        <div class="text">
          <span class="name">{nameOf(ban.user)}</span>
          <span class="reason" class:none={!ban.reason}>{ban.reason ?? m.admin.bans.noReason}</span>
        </div>
        <Button size="sm" variant="secondary" onclick={() => unban(ban.user)}>{m.admin.bans.unban}</Button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .search { margin-bottom: var(--space-4); }
  .bans { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
  .ban { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3); border-radius: var(--radius-md); }
  @media (hover: hover) { .ban:hover { background: var(--hover-overlay); } }
  .text { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .name { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .reason { color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow-wrap: anywhere; }
  .reason.none { color: var(--text-muted); font-style: italic; }
</style>
