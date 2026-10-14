<script lang="ts">
  /**
   * Server Overview (m2c-plan.md): icon, banner, name, description and the four system-message channels,
   * saved in one PATCH after any uploads. A system channel that no longer exists shows as Off.
   */
  import { fileUrl } from '@concord/stoat';
  import type { ServerEdit, Session, SystemChannels } from '@concord/domain';
  import { TextField } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import ImagePick, { type ImageChoice } from './ImagePick.svelte';
  import SaveBar from './SaveBar.svelte';
  import { guardUnsaved } from './unsaved.ts';

  let { session, server }: { session: Session; server: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.servers.get(server)!);
  const KINDS = ['joined', 'left', 'kicked', 'banned'] as const;
  const textChannels = $derived(store.channelTree(server).flatMap((g) => g.channels).filter((c) => c.kind === 'text' && !c.voice));
  const known = (id: string | undefined) => (id && store.channels.get(id)?.kind === 'text' ? id : '');

  interface Draft { name: string; description: string; system: Record<(typeof KINDS)[number], string> }
  const saved = (): Draft => ({
    name: info.name,
    description: info.description ?? '',
    system: { joined: known(info.systemMessages?.joined), left: known(info.systemMessages?.left), kicked: known(info.systemMessages?.kicked), banned: known(info.systemMessages?.banned) },
  });
  // Filled once, when opened: a live update while typing must not reset the fields.
  let draft = $state<Draft>(saved());
  let icon = $state<ImageChoice>(null);
  let banner = $state<ImageChoice>(null);
  let saving = $state(false);

  const chars = (s: string) => [...s].length;
  const errors = $derived({
    name: chars(draft.name.trim()) < 1 || chars(draft.name.trim()) > 32 ? m.admin.nameError : undefined,
    description: chars(draft.description) > 1024 ? m.admin.overview.descriptionError : undefined,
  });
  const valid = $derived(!errors.name && !errors.description);
  const original = $derived(saved());
  const systemChanged = $derived(KINDS.some((k) => draft.system[k] !== original.system[k]));
  const dirty = $derived(icon !== null || banner !== null || draft.name.trim() !== original.name || draft.description !== original.description || systemChanged);

  function reset() {
    icon = null;
    banner = null;
    draft = saved();
  }
  guardUnsaved(() => dirty, reset);

  async function save() {
    if (!dirty || !valid || saving) return;
    saving = true;
    try {
      const change: ServerEdit = {};
      const remove: NonNullable<ServerEdit['remove']> = [];
      if (draft.name.trim() !== original.name) change.name = draft.name.trim();
      if (draft.description !== original.description) {
        if (draft.description.trim()) change.description = draft.description;
        else remove.push('description');
      }
      if (systemChanged) {
        const next: SystemChannels = {};
        for (const k of KINDS) if (draft.system[k]) next[k] = draft.system[k];
        if (Object.keys(next).length) change.systemMessages = next;
        else remove.push('systemMessages');
      }
      if (icon === 'remove') remove.push('icon');
      else if (icon) change.icon = await session.admin.uploadImage('icon', icon.file);
      if (banner === 'remove') remove.push('banner');
      else if (banner) change.banner = await session.admin.uploadImage('banner', banner.file);
      if (remove.length) change.remove = remove;
      await session.admin.editServer(server, change);
      icon = null;
      banner = null;
      // The server's own update follows; show the saved values now.
      draft = { ...draft, name: draft.name.trim() };
      toasts.show(m.admin.saved, 'info');
    } catch {
      toasts.show(m.admin.saveFailed);
    } finally {
      saving = false;
    }
  }
</script>

<div class="fields">
  <div class="images">
    <ImagePick label={m.admin.icon} bind:value={icon} current={info.icon ? fileUrl(info.icon, { maxSide: 256 }) : null} limit={store.node?.uploadLimits.icons ?? 2_500_000} />
    <ImagePick label={m.admin.banner} bind:value={banner} current={info.banner ? fileUrl(info.banner, { maxSide: 1024 }) : null} limit={store.node?.uploadLimits.banners ?? 6_000_000} shape="wide" />
  </div>
  <TextField label={m.admin.overview.name} bind:value={draft.name} error={errors.name} />
  <div class="group">
    <label class="label" for="server-description">{m.admin.overview.description}</label>
    <textarea id="server-description" rows="4" bind:value={draft.description} aria-invalid={errors.description ? true : undefined} aria-describedby="server-description-note"></textarea>
    <p class="note" class:error={!!errors.description} id="server-description-note">{errors.description ?? m.admin.overview.descriptionHint}</p>
  </div>
  <fieldset class="group">
    <legend class="label">{m.admin.overview.system}</legend>
    <p class="note">{m.admin.overview.systemHint}</p>
    <div class="system">
      {#each KINDS as kind (kind)}
        <label class="pick">
          <span>{m.admin.overview[kind]}</span>
          <select bind:value={draft.system[kind]}>
            <option value="">{m.admin.overview.off}</option>
            {#each textChannels as c (c.id)}<option value={c.id}>#{c.kind === 'text' ? c.name : ''}</option>{/each}
          </select>
        </label>
      {/each}
    </div>
  </fieldset>
</div>

{#if dirty}<SaveBar {saving} {valid} onreset={reset} onsave={save} />{/if}

<style>
  .fields { display: grid; gap: var(--space-6); }
  .images { display: flex; flex-wrap: wrap; gap: var(--space-8); }
  .group { display: grid; gap: var(--space-3); margin: 0; padding: 0; border: 0; min-width: 0; }
  .label { padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  textarea, select {
    padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong);
    border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans);
  }
  textarea { min-height: 6rem; resize: vertical; }
  textarea:focus-visible, select:focus-visible { outline: none; border-color: var(--accent); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { color: var(--danger); }
  .system { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--space-4); }
  .pick { display: grid; gap: var(--space-2); color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); }
</style>
