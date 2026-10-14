<script lang="ts">
  /** Every invite to the server, with copy and revoke (m2c-plan.md). Invites created before a permission change stay valid. */
  import { untrack } from 'svelte';
  import { Button, IconButton } from '@concord/ui';
  import type { Invite, Session } from '@concord/domain';
  import Copy from '@lucide/svelte/icons/copy';
  import { m } from '$lib/i18n/index.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);
  let invites = $state<Invite[] | null>(null);

  $effect(() => {
    const id = server;
    untrack(() => void session.admin.invites(id).then((list) => (invites = list)).catch(() => toasts.show(m.admin.invites.failed)));
  });
  // Creators the client hasn't met yet.
  $effect(() => {
    const unknown = (invites ?? []).map((i) => i.creator).filter((u) => !store.users.has(u));
    untrack(() => { for (const u of new Set(unknown)) void session.backend.user(u).then((x) => store.upsertUsers([x])).catch(() => {}); });
  });

  const channelName = (id: string) => { const c = store.channels.get(id); return c?.kind === 'text' ? c.name : id; };
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/invite/${code}`);
      toasts.show(m.admin.invite.copied, 'info');
    } catch {
      // Clipboard blocked.
    }
  }
  async function revoke(code: string) {
    if (!(await confirm.ask({ title: m.admin.invites.revokeTitle(code), body: m.admin.invites.revokeBody, confirm: m.admin.invites.revoke, danger: true }))) return;
    try {
      await session.admin.deleteInvite(code);
      invites = (invites ?? []).filter((i) => i.code !== code);
    } catch {
      toasts.show(m.admin.invites.revokeFailed);
    }
  }
</script>

<p class="intro">{m.admin.invites.intro}</p>
{#if invites && !invites.length}
  <p class="empty">{m.admin.invites.empty}</p>
{:else if invites}
  <table>
    <thead><tr><th>{m.admin.invites.code}</th><th>{m.admin.invites.channel}</th><th>{m.admin.invites.creator}</th><th></th></tr></thead>
    <tbody>
      {#each invites as inv (inv.code)}
        <tr data-code={inv.code}>
          <td class="code">{inv.code}</td>
          <td>#{channelName(inv.channel)}</td>
          <td>{store.displayName(inv.creator, server)}</td>
          <td class="actions">
            <IconButton size="sm" label={m.admin.invite.copy} onclick={() => copy(inv.code)}><Copy /></IconButton>
            <Button size="sm" variant="ghost" onclick={() => revoke(inv.code)}>{m.admin.invites.revoke}</Button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .intro, .empty { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  table { width: 100%; border-collapse: collapse; font: var(--text-md) var(--font-sans); }
  th { padding: var(--space-2) var(--space-3); text-align: left; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; border-bottom: 1px solid var(--border-default); }
  td { padding: var(--space-3); color: var(--text-normal); border-bottom: 1px solid var(--border-subtle); }
  .code { font-family: var(--font-mono); color: var(--text-strong); }
  .actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
</style>
