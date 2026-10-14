<script lang="ts">
  /**
   * One role's editor (m2c-plan.md): Display (name, colour, hoist) and Permissions, or for Everyone only the
   * permissions as on or off. A locked role is shown read-only. Saving writes only what changed.
   */
  import { Button, Tabs, TextField } from '@concord/ui';
  import { Permission, canActOnRole, has, type Override, type RoleEdit, type Session } from '@concord/domain';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { m } from '$lib/i18n/index.ts';
  import { myRank, serverPerms } from '$lib/view/admin.ts';
  import { confirm } from '$lib/view/confirm.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import PermissionList from './PermissionList.svelte';
  import SaveBar from './SaveBar.svelte';
  import { guardUnsaved } from './unsaved.ts';

  let { session, server, role, onback }: { session: Session; server: string; role: string; onback: () => void } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server)!);
  const everyone = $derived(role === 'everyone');
  const current = $derived(everyone ? undefined : info.roles[role]);
  const mine = $derived(serverPerms(store, server));
  const locked = $derived(!everyone && (!current || !canActOnRole(myRank(store, server), current)));
  const canDisplay = $derived(!locked && !everyone && has(mine, Permission.ManageRole));
  const canPerms = $derived(!locked && has(mine, Permission.ManagePermissions));

  const PRESETS = ['#e5484d', '#f5a524', '#f2d03b', '#3dbd7d', '#1fb6d1', '#5b8def', '#8e7cf0', '#e879c6', '#8b8d98', '#c2703d', 'linear-gradient(90deg, #f472b6, #a78bfa)', 'linear-gradient(90deg, #1fb6d1, #3dbd7d)'];

  interface Draft { name: string; colour: string; hoist: boolean; perms: Override }
  const saved = (): Draft => everyone
    ? { name: '', colour: '', hoist: false, perms: { allow: info.defaultPermissions, deny: 0n } }
    : { name: current?.name ?? '', colour: current?.colour ?? '', hoist: current?.hoist ?? false, perms: current?.permissions ?? { allow: 0n, deny: 0n } };
  // Filled once, when opened: a live update while editing must not reset the fields.
  let draft = $state<Draft>(saved());
  const firstTab = (): 'display' | 'permissions' => (everyone ? 'permissions' : 'display');
  let tab = $state(firstTab());
  let saving = $state(false);
  const original = $derived(saved());

  const colourOk = (c: string) => !c || (c.length <= 128 && !/url\(|expression|[;{}<>]/i.test(c) && CSS.supports('background', c));
  const errors = $derived({
    name: !everyone && ([...draft.name.trim()].length < 1 || [...draft.name.trim()].length > 32) ? m.admin.nameError : undefined,
    colour: colourOk(draft.colour.trim()) ? undefined : m.admin.roles.colourError,
  });
  const valid = $derived(!errors.name && !errors.colour);
  const displayDirty = $derived(!everyone && (draft.name.trim() !== original.name || draft.colour.trim() !== original.colour || draft.hoist !== original.hoist));
  const permsDirty = $derived(draft.perms.allow !== original.perms.allow || draft.perms.deny !== original.perms.deny);
  const dirty = $derived(displayDirty || permsDirty);
  // Decision 5: a role without ManageServer, or Everyone, given InviteOthers.
  const inviteWarning = $derived((draft.perms.allow & Permission.InviteOthers) !== 0n && (everyone || (draft.perms.allow & Permission.ManageServer) === 0n));

  const reset = () => { draft = saved(); };
  guardUnsaved(() => dirty, reset);

  async function back() {
    if (dirty && !(await confirm.ask({ title: m.admin.leaveUnsavedTitle, body: m.admin.leaveUnsavedBody, confirm: m.admin.leaveUnsaved, danger: true }))) return;
    onback();
  }

  async function save() {
    if (!dirty || !valid || saving) return;
    saving = true;
    try {
      if (displayDirty) {
        const change: RoleEdit = {};
        if (draft.name.trim() !== original.name) change.name = draft.name.trim();
        if (draft.hoist !== original.hoist) change.hoist = draft.hoist;
        if (draft.colour.trim() !== original.colour) {
          if (draft.colour.trim()) change.colour = draft.colour.trim();
          else change.remove = ['colour'];
        }
        await session.admin.editRole(server, role, change);
      }
      if (permsDirty) {
        if (everyone) await session.admin.setDefaultPermissions(server, draft.perms.allow);
        else await session.admin.setRolePermissions(server, role, draft.perms);
      }
      draft = { ...draft, name: draft.name.trim(), colour: draft.colour.trim() };
      toasts.show(m.admin.saved, 'info');
    } catch {
      toasts.show(m.admin.saveFailed);
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!(await confirm.ask({ title: m.admin.roles.deleteTitle(original.name), body: m.admin.roles.deleteBody, confirm: m.admin.roles.delete, danger: true }))) return;
    try {
      await session.admin.deleteRole(server, role);
      onback();
    } catch {
      toasts.show(m.admin.roles.failed);
    }
  }
</script>

<div class="head">
  <Button variant="ghost" size="sm" onclick={back}><ArrowLeft size={16} aria-hidden="true" />{m.admin.roles.back}</Button>
  <h2><span class="swatch" style:background={(everyone ? '' : draft.colour.trim()) || 'var(--text-muted)'} aria-hidden="true"></span>{everyone ? m.admin.roles.everyone : draft.name || original.name}</h2>
</div>
{#if locked}<p class="note">{m.admin.roles.locked}</p>{/if}

{#if !everyone}
  <Tabs label={original.name} selected={tab} onselect={(id) => (tab = id as 'display' | 'permissions')}
    tabs={[{ id: 'display', label: m.admin.roles.display }, { id: 'permissions', label: m.admin.roles.permissions }]} />
{/if}

<div class="panel" role={everyone ? undefined : 'tabpanel'} aria-labelledby={everyone ? undefined : `tab-${tab}`}>
  {#if tab === 'display' && !everyone}
    <div class="fields">
      <TextField label={m.admin.roles.name} bind:value={draft.name} error={errors.name} disabled={!canDisplay} />
      <fieldset class="group" disabled={!canDisplay}>
        <legend class="label">{m.admin.roles.colour}</legend>
        <div class="presets">
          <button type="button" class="preset none" class:chosen={!draft.colour.trim()} aria-label={m.admin.roles.noColour} title={m.admin.roles.noColour} onclick={() => (draft.colour = '')}></button>
          {#each PRESETS as c (c)}
            <button type="button" class="preset" class:chosen={draft.colour.trim() === c} style:background={c} aria-label={c} title={c} onclick={() => (draft.colour = c)}></button>
          {/each}
        </div>
        <TextField label={m.admin.roles.colour} hideLabel bind:value={draft.colour} hint={m.admin.roles.colourHint} error={errors.colour} placeholder={m.admin.roles.colourPlaceholder} />
      </fieldset>
      <label class="check">
        <input type="checkbox" bind:checked={draft.hoist} disabled={!canDisplay} />
        <span><strong>{m.admin.roles.hoist}</strong><small>{m.admin.roles.hoistHelp}</small></span>
      </label>
      {#if canDisplay && has(mine, Permission.ManageRole)}
        <div><Button variant="danger" size="sm" onclick={remove}>{m.admin.roles.delete}</Button></div>
      {/if}
    </div>
  {:else}
    {#if inviteWarning}<p class="warning" role="alert"><TriangleAlert size={16} aria-hidden="true" />{m.admin.roles.inviteWarning}</p>{/if}
    <PermissionList context="server" value={draft.perms} plain={everyone} {mine} readonly={!canPerms} onchange={(next) => (draft.perms = next)} />
  {/if}
</div>

{#if dirty}<SaveBar {saving} {valid} onreset={reset} onsave={save} />{/if}

<style>
  .head { display: grid; gap: var(--space-3); justify-items: start; margin-bottom: var(--space-5); }
  h2 { display: flex; align-items: center; gap: var(--space-3); margin: 0; color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .swatch { width: 1rem; height: 1rem; border-radius: var(--radius-full); flex: none; }
  .note { margin: 0 0 var(--space-4); color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .panel { margin-top: var(--space-5); }
  .fields { display: grid; gap: var(--space-6); }
  .group { display: grid; gap: var(--space-3); margin: 0; padding: 0; border: 0; min-width: 0; }
  .label { padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .presets { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .preset { width: 2rem; height: 2rem; border: 2px solid transparent; border-radius: var(--radius-md); cursor: pointer; }
  .preset.none { background: var(--surface-3); border-color: var(--border-control); }
  .preset.chosen { border-color: var(--text-strong); }
  .preset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .check { display: flex; align-items: flex-start; gap: var(--space-3); cursor: pointer; }
  .check input { margin-top: 0.2rem; }
  .check span { display: grid; gap: 2px; }
  .check strong { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .check small { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .warning { display: flex; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-5); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); border-left: 3px solid var(--status-idle); color: var(--text-normal); font: var(--text-sm) var(--font-sans); }
</style>
