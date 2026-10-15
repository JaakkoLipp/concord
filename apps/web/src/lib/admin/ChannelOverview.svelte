<script lang="ts">
  /** A channel's name and description (m2c-plan.md, channel settings), and a voice channel's user limit (m4.5-plan.md task 8). */
  import type { ChannelEdit, Session } from '@concord/domain';
  import { TextField } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import SaveBar from './SaveBar.svelte';
  import { guardUnsaved } from './unsaved.ts';

  let { session, channel }: { session: Session; channel: string } = $props();
  const info = $derived(session.store.channels.get(channel));
  const voice = $derived(info?.kind === 'text' && !!info.voice);
  /** The limit as the field shows it: 0 for none. */
  const saved = () => (info?.kind === 'text'
    ? { name: info.name, description: info.description ?? '', limit: String(info.voice?.maxUsers ?? 0) }
    : { name: '', description: '', limit: '0' });
  const MAX_LIMIT = 99;
  // Filled once, when opened: a live update while typing must not reset the fields.
  let draft = $state(saved());
  let saving = $state(false);
  const chars = (s: string) => [...s].length;
  const errors = $derived({
    name: chars(draft.name.trim()) < 1 || chars(draft.name.trim()) > 32 ? m.admin.nameError : undefined,
    description: chars(draft.description) > 1024 ? m.admin.overview.descriptionError : undefined,
    limit: !/^\d{1,2}$/.test(draft.limit.trim()) || Number(draft.limit) > MAX_LIMIT ? m.admin.channelOverview.limitError : undefined,
  });
  const valid = $derived(!errors.name && !errors.description && (!voice || !errors.limit));
  const original = $derived(saved());
  const dirty = $derived(draft.name.trim() !== original.name || draft.description !== original.description
    || (voice && Number(draft.limit) !== Number(original.limit)));

  const reset = () => { draft = saved(); };
  guardUnsaved(() => dirty, reset);

  async function save() {
    if (!dirty || !valid || saving) return;
    saving = true;
    try {
      const change: ChannelEdit = {};
      if (draft.name.trim() !== original.name) change.name = draft.name.trim();
      if (draft.description !== original.description) {
        if (draft.description.trim()) change.description = draft.description;
        else change.remove = ['description'];
      }
      if (voice && Number(draft.limit) !== Number(original.limit)) change.maxUsers = Number(draft.limit) || null;
      await session.admin.editChannel(channel, change);
      draft = { ...draft, name: draft.name.trim(), limit: String(Number(draft.limit)) };
      toasts.show(m.admin.saved, 'info');
    } catch {
      toasts.show(m.admin.saveFailed);
    } finally {
      saving = false;
    }
  }
</script>

<div class="fields">
  <TextField label={m.admin.channelOverview.name} bind:value={draft.name} error={errors.name} />
  <div class="group">
    <label class="label" for="channel-description">{m.admin.channelOverview.description}</label>
    <textarea id="channel-description" rows="4" bind:value={draft.description} aria-invalid={errors.description ? true : undefined} aria-describedby="channel-description-note"></textarea>
    <p class="note" class:error={!!errors.description} id="channel-description-note">{errors.description ?? m.admin.channelOverview.descriptionHint}</p>
  </div>
  {#if voice}
    <TextField label={m.admin.channelOverview.limit} bind:value={draft.limit} inputmode="numeric" error={errors.limit} hint={m.admin.channelOverview.limitHint} />
  {/if}
</div>

{#if dirty}<SaveBar {saving} {valid} onreset={reset} onsave={save} />{/if}

<style>
  .fields { display: grid; gap: var(--space-6); }
  .group { display: grid; gap: var(--space-3); }
  .label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  textarea {
    min-height: 6rem; padding: var(--space-3) var(--space-4); resize: vertical; background: var(--surface-0); color: var(--text-strong);
    border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans);
  }
  textarea:focus-visible { outline: none; border-color: var(--accent); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { color: var(--danger); }
</style>
