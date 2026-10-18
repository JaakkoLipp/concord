<script lang="ts">
  /**
   * The Roles section (m2c-plan.md): roles strongest first, then Everyone. Roles at or above your own are
   * locked. Move up and Move down reorder through the merged writer, so quick clicks end in the last order.
   */
  import { untrack } from 'svelte';
  import { Button, Dialog, InfoBanner, Menu, TextField, type MenuItem } from '@concord/ui';
  import { Permission, canActOnRole, has, moveRole, rolesByRank, type Id, type Session } from '@concord/domain';
  import Lock from '@lucide/svelte/icons/lock';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import { m } from '$lib/i18n/index.ts';
  import { myRank, serverPerms } from '$lib/view/admin.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import RoleEditor from './RoleEditor.svelte';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { DANGEROUS, DANGEROUS_BITS, SUGGESTED_ROLES } from './permissions.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server)!);
  const roles = $derived(rolesByRank(info));
  const rank = $derived(myRank(store, server));
  const mine = $derived(serverPerms(store, server));
  const canCreate = $derived(has(mine, Permission.ManageRole));
  const counts = $derived.by(() => {
    const n: Record<Id, number> = {};
    for (const mem of store.members.values()) if (mem.server === server) for (const r of mem.roles) n[r] = (n[r] ?? 0) + 1;
    return n;
  });
  // Guardrails (m4.7-plan.md task 11): a server that already gives Everyone a dangerous permission is warned, with one click
  // to take them away, and a server with no roles yet is offered the suggested ones.
  const everyoneDangers = $derived(DANGEROUS.filter((k) => (info.defaultPermissions & Permission[k]) !== 0n));
  const canPerms = $derived(has(mine, Permission.ManagePermissions));
  async function stripEveryone() {
    try {
      await session.admin.setDefaultPermissions(server, info.defaultPermissions & ~DANGEROUS_BITS);
    } catch {
      toasts.show(m.admin.saveFailed);
    }
  }
  async function suggest(kind: keyof typeof SUGGESTED_ROLES) {
    if (busy) return;
    busy = true;
    try {
      const role = await session.admin.createRole(server, kind === 'admin' ? m.admin.roles.adminName : m.admin.roles.moderatorName);
      // Stoat refuses what the creator doesn't hold, so give only that.
      await session.admin.setRolePermissions(server, role.id, { allow: SUGGESTED_ROLES[kind] & mine, deny: 0n });
    } catch {
      toasts.show(m.admin.roles.failed);
    } finally {
      busy = false;
    }
  }

  // Member counts need the member list.
  $effect(() => {
    const id = server;
    untrack(() => void session.loadMembers(id, false).catch(() => {}));
  });

  let selected = $state<Id | 'everyone' | null>(null);
  let creating = $state(false);
  let newName = $state('');
  let busy = $state(false);
  let menu = $state<{ items: MenuItem[]; anchor: HTMLElement } | null>(null);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || [...name].length > 32 || busy) return;
    busy = true;
    try {
      const role = await session.admin.createRole(server, name);
      creating = false;
      newName = '';
      selected = role.id;
    } catch {
      toasts.show(m.admin.roles.failed);
    } finally {
      busy = false;
    }
  }

  function move(role: Id, delta: -1 | 1) {
    const order = rolesByRank(store.servers.get(server)!).map((r) => r.id);
    const next = moveRole(order, info.roles, rank, role, delta);
    if (next) void session.admin.setRanks(server, next).catch(() => toasts.show(m.admin.roles.failed));
  }

  async function remove(role: Id) {
    const name = info.roles[role]?.name ?? '';
    if (!(await confirm.ask({ title: m.admin.roles.deleteTitle(name), body: m.admin.roles.deleteBody, confirm: m.admin.roles.delete, danger: true }))) return;
    try {
      await session.admin.deleteRole(server, role);
      if (selected === role) selected = null;
    } catch {
      toasts.show(m.admin.roles.failed);
    }
  }

  function openMenu(role: Id, anchor: HTMLElement) {
    // Ordering and deleting need Manage roles; Manage permissions alone only edits what roles allow.
    if (!has(mine, Permission.ManageRole)) return;
    const order = roles.map((r) => r.id);
    const items: MenuItem[] = [
      { label: m.admin.moveUp, disabled: !moveRole(order, info.roles, rank, role, -1), onselect: () => move(role, -1) },
      { label: m.admin.moveDown, disabled: !moveRole(order, info.roles, rank, role, 1), onselect: () => move(role, 1) },
      'separator',
      { label: m.admin.roles.delete, danger: true, onselect: () => void remove(role) },
    ];
    menu = { items, anchor };
  }

  // The selected role was deleted, here or elsewhere: back to the list.
  $effect(() => { if (selected && selected !== 'everyone' && !info.roles[selected]) selected = null; });
</script>

{#if selected}
  <RoleEditor {session} {server} role={selected} onback={() => (selected = null)} />
{:else}
  {#if everyoneDangers.length}
    <div class="danger" role="alert">
      <TriangleAlert size={16} aria-hidden="true" />
      <p>{m.admin.roles.everyoneDanger(everyoneDangers.map((k) => m.admin.permissionNames[k][0]).join(', '))}</p>
      {#if canPerms}<Button size="sm" variant="danger" onclick={stripEveryone}>{m.admin.roles.everyoneDangerFix}</Button>{/if}
    </div>
  {/if}
  <p class="intro">{m.admin.roles.intro}</p>
  {#if canCreate}<div class="actions"><Button onclick={() => (creating = true)}>{m.admin.roles.create}</Button></div>{/if}
  {#if canCreate && canPerms && !roles.length}
    <section class="suggested">
      <h3>{m.admin.roles.suggested}</h3>
      <p class="intro">{m.admin.roles.suggestedHelp}</p>
      <div class="buttons">
        <Button variant="secondary" size="sm" {busy} onclick={() => suggest('admin')}>{m.admin.roles.addAdmin}</Button>
        <Button variant="secondary" size="sm" {busy} onclick={() => suggest('moderator')}>{m.admin.roles.addModerator}</Button>
      </div>
    </section>
  {/if}
  <ul class="roles" aria-label={m.admin.roles.title}>
    {#each roles as role (role.id)}
      {@const locked = !canActOnRole(rank, role)}
      <li class="role" data-role={role.name}>
        <button class="open" onclick={() => (selected = role.id)}>
          <span class="swatch" style:background={role.colour ?? 'var(--text-muted)'} aria-hidden="true"></span>
          <span class="name">{role.name}</span>
          <span class="count">{m.admin.roles.members(counts[role.id] ?? 0)}</span>
          {#if locked}<span class="locked" title={m.admin.roles.locked}><Lock size={14} aria-hidden="true" />{m.admin.roles.lockedShort}</span>{/if}
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        {#if !locked && canCreate}
          <button class="more" aria-label={m.admin.roles.menu(role.name)} onclick={(e) => openMenu(role.id, e.currentTarget)}><Ellipsis size={18} /></button>
        {/if}
      </li>
    {/each}
    <li class="role everyone">
      <button class="open" onclick={() => (selected = 'everyone')}>
        <span class="swatch" style:background="var(--text-muted)" aria-hidden="true"></span>
        <span class="name">{m.admin.roles.everyone}</span>
        <span class="count">{m.admin.roles.everyoneHelp}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </li>
  </ul>
  {#if roles.some((r) => !canActOnRole(rank, r))}<div class="banner"><InfoBanner>{m.admin.roles.locked}</InfoBanner></div>{/if}
{/if}

<Menu open={!!menu} onclose={() => (menu = null)} items={menu?.items ?? []} label={m.admin.roles.title} anchor={menu?.anchor ?? null} />
<Dialog open={creating} title={m.admin.roles.createTitle} onclose={() => (creating = false)}>
  <form id="create-role" onsubmit={create}><TextField label={m.admin.roles.name} bind:value={newName} maxlength={64} error={[...newName.trim()].length > 32 ? m.admin.nameError : undefined} /></form>
  {#snippet actions()}
    <Button variant="ghost" onclick={() => (creating = false)}>{m.admin.cancel}</Button>
    <Button type="submit" form="create-role" {busy} disabled={!newName.trim() || [...newName.trim()].length > 32}>{m.admin.roles.create}</Button>
  {/snippet}
</Dialog>

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .banner { margin: var(--space-4) 0 var(--space-5); }
  .actions { margin-bottom: var(--space-5); }
  .danger {
    display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); background: var(--surface-3); border-left: 3px solid var(--danger); color: var(--text-normal); font: var(--text-sm) var(--font-sans);
  }
  .danger p { flex: 1; margin: 0; }
  .suggested { margin-bottom: var(--space-6); }
  .suggested h3 { margin: 0 0 var(--space-2); color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .roles { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
  .role { display: flex; align-items: center; gap: var(--space-2); border-radius: var(--radius-md); }
  @media (hover: hover) { .role:hover { background: var(--hover-overlay); } }
  .open { flex: 1; display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); border: 0; background: none; color: var(--text-normal); text-align: left; cursor: pointer; border-radius: var(--radius-md); }
  .open:focus-visible, .more:focus-visible { outline: 2px solid var(--accent); }
  .swatch { width: 0.875rem; height: 0.875rem; border-radius: var(--radius-full); flex: none; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .count { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .locked { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--text-muted); font: var(--text-sm) var(--font-sans); }
  .more { display: grid; place-items: center; width: 2rem; height: 2rem; margin-right: var(--space-2); border: 0; border-radius: var(--radius-md); background: none; color: var(--text-secondary); cursor: pointer; }
  @media (hover: hover) { .more:hover { color: var(--text-strong); background: var(--surface-4); } }
  .everyone { margin-top: var(--space-3); border-top: 1px solid var(--border-subtle); padding-top: var(--space-2); }
</style>
