<script lang="ts">
  /**
   * A member's roles (m2c-plan.md): a checklist of the roles you may give. Saving keeps any role they hold
   * that you can't touch, because Stoat replaces the whole list.
   */
  import { Button, Dialog } from '@concord/ui';
  import { memberKey, nextRoles, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { myRank } from '$lib/view/admin.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { adminDialogs } from './dialogs.svelte.ts';
  import { assignable } from './members.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const d = $derived(adminDialogs.current?.kind === 'memberRoles' ? adminDialogs.current : null);
  const member = $derived(d ? store.members.get(memberKey(d.server, d.user)) : undefined);
  const roles = $derived(d ? assignable(session, d.server) : []);
  const kept = $derived(d && member ? member.roles.filter((r) => store.servers.get(d.server)?.roles[r] && !roles.some((x) => x.id === r)).length : 0);
  let chosen = $state<string[]>([]);
  let busy = $state(false);
  let filledFor: unknown = null;

  // Filled once per dialog opened.
  $effect(() => {
    if (d === filledFor) return;
    filledFor = d;
    if (d && member) chosen = member.roles.filter((r) => roles.some((x) => x.id === r));
  });

  async function save() {
    const dd = d;
    const server = dd ? store.servers.get(dd.server) : undefined;
    if (!dd || !server || !member || busy) return;
    busy = true;
    try {
      await session.admin.setMemberRoles(dd.server, dd.user, nextRoles(server, myRank(store, dd.server), member.roles, chosen));
      adminDialogs.done(dd);
    } catch {
      toasts.show(m.admin.roles.failed);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog open={!!d && !!member} title={d ? m.admin.roles.memberRolesTitle(store.displayName(d.user, d.server)) : ''} onclose={() => adminDialogs.close()}>
  {#if roles.length}
    <ul class="list">
      {#each roles as role (role.id)}
        <li><label class="row">
          <input type="checkbox" value={role.id} bind:group={chosen} />
          <span class="swatch" style:background={role.colour ?? 'var(--text-muted)'} aria-hidden="true"></span>
          <span>{role.name}</span>
        </label></li>
      {/each}
    </ul>
  {:else}
    <p>{m.admin.roles.memberRolesNone}</p>
  {/if}
  {#if kept}<p class="note">{m.admin.roles.memberRolesKept(kept)}</p>{/if}
  {#snippet actions()}
    <Button variant="ghost" onclick={() => adminDialogs.close()}>{m.admin.cancel}</Button>
    <Button {busy} disabled={!roles.length} onclick={save}>{m.admin.save}</Button>
  {/snippet}
</Dialog>

<style>
  .list { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; max-height: 50vh; overflow-y: auto; }
  .row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); cursor: pointer; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .row:hover { background: var(--hover-overlay); }
  .swatch { width: 0.875rem; height: 0.875rem; border-radius: var(--radius-full); flex: none; }
  .note { margin: var(--space-4) 0 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
</style>
