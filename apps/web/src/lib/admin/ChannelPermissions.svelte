<script lang="ts">
  /**
   * A channel's permission overrides (m2c-plan.md): Everyone, then each role with an override, then "Add a
   * role". Stoat can't delete an override, so removing one writes it empty, and an empty one counts as none.
   */
  import { Button } from '@concord/ui';
  import { Permission, canActOnRole, has, rolesByRank, type Id, type Override, type Session } from '@concord/domain';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { m } from '$lib/i18n/index.ts';
  import { myRank } from '$lib/view/admin.ts';
  import { permissionsIn } from '$lib/view/channels.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import PermissionList from './PermissionList.svelte';
  import SaveBar from './SaveBar.svelte';
  import { guardUnsaved } from './unsaved.ts';

  let { session, channel }: { session: Session; channel: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const text = $derived(info?.kind === 'text' ? info : undefined);
  const server = $derived(text ? store.servers.get(text.server) : undefined);
  const mine = $derived(info ? permissionsIn(store, info) : 0n);
  const rank = $derived(text ? myRank(store, text.server) : Number.POSITIVE_INFINITY);
  const EMPTY: Override = { allow: 0n, deny: 0n };
  const empty = (o: Override | undefined) => !o || (!o.allow && !o.deny);

  /** Roles just added here, shown before they have an override. */
  let added = $state<Id[]>([]);
  const listed = $derived(server ? rolesByRank(server).filter((r) => !empty(text?.rolePermissions[r.id]) || added.includes(r.id)) : []);
  const addable = $derived(server ? rolesByRank(server).filter((r) => !listed.includes(r) && canActOnRole(rank, r)) : []);
  let selected = $state<Id | 'default'>('default');
  let choice = $state('');

  const savedOf = (id: Id | 'default'): Override => (id === 'default' ? text?.defaultPermissions : text?.rolePermissions[id]) ?? EMPTY;
  let draft = $state<Override>(EMPTY);
  let draftFor = $state<Id | 'default' | null>(null);
  let saving = $state(false);
  // Fill when an entry is chosen, not on every update while editing.
  $effect(() => {
    if (draftFor === selected) return;
    draftFor = selected;
    draft = savedOf(selected);
  });
  const original = $derived(savedOf(selected));
  const dirty = $derived(draftFor === selected && (draft.allow !== original.allow || draft.deny !== original.deny));
  const role = $derived(selected === 'default' ? undefined : server?.roles[selected]);
  const locked = $derived(selected !== 'default' && (!role || !canActOnRole(rank, role)));
  const canEdit = $derived(has(mine, Permission.ManagePermissions) && !locked);

  // What Everyone ends up with here, in one line.
  const summary = $derived.by(() => {
    if (!server || selected !== 'default') return '';
    const v = (server.defaultPermissions | draft.allow) & ~draft.deny;
    if (!has(v, Permission.ViewChannel)) return m.admin.overrides.hidden;
    return has(v, Permission.SendMessage) ? m.admin.overrides.open : m.admin.overrides.readOnly;
  });
  // Decision 5: Everyone, or a role without Manage server, allowed to invite here.
  const inviteWarning = $derived((draft.allow & Permission.InviteOthers) !== 0n
    && (selected === 'default' || !role || (role.permissions.allow & Permission.ManageServer) === 0n));

  const reset = () => { draft = savedOf(selected); };
  guardUnsaved(() => dirty, reset);

  async function choose(id: Id | 'default') {
    if (id === selected) return;
    if (dirty && !(await confirm.ask({ title: m.admin.leaveUnsavedTitle, body: m.admin.leaveUnsavedBody, confirm: m.admin.leaveUnsaved, danger: true }))) return;
    selected = id;
  }
  function add() {
    if (!choice) return;
    added = [...added, choice];
    void choose(choice);
    choice = '';
  }

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    try {
      await session.admin.setChannelPermissions(channel, selected, draft);
      toasts.show(m.admin.saved, 'info');
    } catch {
      toasts.show(m.admin.overrides.failed);
    } finally {
      saving = false;
    }
  }
  async function remove() {
    if (selected === 'default') return;
    const id = selected;
    try {
      await session.admin.setChannelPermissions(channel, id, EMPTY);
      added = added.filter((x) => x !== id);
      draft = EMPTY;
      selected = 'default';
      toasts.show(m.admin.overrides.removed, 'info');
    } catch {
      toasts.show(m.admin.overrides.failed);
    }
  }
</script>

<p class="intro">{m.admin.overrides.intro}</p>
<div class="layout">
  <div class="entries">
    <ul aria-label={m.admin.channelSections.permissions}>
      <li><button class="entry" class:active={selected === 'default'} aria-current={selected === 'default' ? 'true' : undefined} onclick={() => choose('default')}>
        <span class="swatch" style:background="var(--text-muted)" aria-hidden="true"></span>{m.admin.overrides.everyone}
      </button></li>
      {#each listed as r (r.id)}
        <li><button class="entry" class:active={selected === r.id} aria-current={selected === r.id ? 'true' : undefined} onclick={() => choose(r.id)} data-role={r.name}>
          <span class="swatch" style:background={r.colour ?? 'var(--text-muted)'} aria-hidden="true"></span>{r.name}
        </button></li>
      {/each}
    </ul>
    {#if addable.length && has(mine, Permission.ManagePermissions)}
      <div class="add">
        <label class="sr" for="add-role">{m.admin.overrides.addRole}</label>
        <select id="add-role" bind:value={choice}>
          <option value="">{m.admin.overrides.addRole}</option>
          {#each addable as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        </select>
        <Button size="sm" disabled={!choice} onclick={add}>{m.admin.overrides.add}</Button>
      </div>
    {/if}
  </div>

  <div class="editor">
    {#if selected === 'default'}<p class="summary" role="status">{summary}</p>{/if}
    {#if locked}<p class="note">{m.admin.overrides.lockedRole}</p>{/if}
    {#if inviteWarning}<p class="warning" role="alert"><TriangleAlert size={16} aria-hidden="true" />{m.admin.roles.inviteWarning}</p>{/if}
    <PermissionList context="channel" value={draft} {mine} readonly={!canEdit} onchange={(next) => (draft = next)} />
    {#if selected !== 'default' && canEdit}
      <div class="remove"><Button variant="danger" size="sm" onclick={remove}>{m.admin.overrides.remove}</Button></div>
    {/if}
  </div>
</div>

{#if dirty}<SaveBar {saving} valid={true} onreset={reset} onsave={save} />{/if}

<style>
  .intro { margin: 0 0 var(--space-5); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .layout { display: grid; grid-template-columns: 12rem minmax(0, 1fr); gap: var(--space-6); align-items: start; }
  .entries { display: grid; gap: var(--space-4); position: sticky; top: var(--space-4); }
  ul { display: grid; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
  .entry { display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-md); background: none; color: var(--text-secondary); font: 500 var(--text-md) var(--font-sans); text-align: left; cursor: pointer; }
  .entry:hover { background: var(--hover-overlay); color: var(--text-normal); }
  .entry.active { background: var(--surface-5); color: var(--text-strong); }
  .entry:focus-visible { outline: 2px solid var(--accent); }
  .swatch { width: 0.75rem; height: 0.75rem; border-radius: var(--radius-full); flex: none; }
  .add { display: grid; gap: var(--space-2); }
  select { padding: var(--space-2) var(--space-3); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-sm) var(--font-sans); }
  .summary { margin: 0 0 var(--space-5); color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .note { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .warning { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-5); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); border-left: 3px solid var(--status-idle); color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
  .remove { margin-top: var(--space-5); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } .entries { position: static; } }
</style>
