<script lang="ts">
  /**
   * A channel's name and description (m2c-plan.md, channel settings), a voice channel's user limit (m4.5-plan.md task 8),
   * slow mode, which a voice channel's chat has too (m4.7-plan.md task 6), and age restriction (M4.8 task 14b).
   */
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
    ? { name: info.name, description: info.description ?? '', limit: String(info.voice?.maxUsers ?? 0), slowmode: info.slowmode ?? 0, nsfw: info.nsfw }
    : { name: '', description: '', limit: '0', slowmode: 0, nsfw: false });
  /** Discord's slow mode steps, in seconds (m4.7-plan.md decision 8). Stoat takes up to 6 hours. */
  const SLOWMODES = [0, 5, 10, 30, 60, 5 * 60, 10 * 60, 60 * 60, 6 * 60 * 60];
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
    || (voice && Number(draft.limit) !== Number(original.limit)) || draft.slowmode !== original.slowmode || draft.nsfw !== original.nsfw);

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
      if (draft.slowmode !== original.slowmode) change.slowmode = draft.slowmode;
      if (draft.nsfw !== original.nsfw) change.nsfw = draft.nsfw;
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
  <div class="group">
    <label class="label" for="channel-slowmode">{m.admin.channelOverview.slowmode}</label>
    <select id="channel-slowmode" bind:value={draft.slowmode} aria-describedby="channel-slowmode-note">
      <!-- A value set elsewhere that isn't one of the steps still shows. -->
      {#each SLOWMODES.includes(original.slowmode) ? SLOWMODES : [...SLOWMODES, original.slowmode].sort((a, b) => a - b) as s (s)}
        <option value={s}>{s ? m.admin.channelOverview.slowmodeEvery(s) : m.admin.channelOverview.slowmodeOff}</option>
      {/each}
    </select>
    <p class="note" id="channel-slowmode-note">{m.admin.channelOverview.slowmodeHint}</p>
  </div>
  <div class="row">
    <div class="text">
      <span class="name" id="channel-nsfw">{m.admin.channelOverview.nsfw}</span>
      <span class="note">{m.admin.channelOverview.nsfwHint}</span>
    </div>
    <label class="switch">
      <input type="checkbox" role="switch" aria-labelledby="channel-nsfw" bind:checked={draft.nsfw} />
      <span class="track" aria-hidden="true"></span>
    </label>
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
  select { padding: var(--space-3) var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); }
  textarea:focus-visible, select:focus-visible { outline: none; border-color: var(--accent); }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { color: var(--danger); }
  .row { display: flex; align-items: center; gap: var(--space-5); }
  .text { flex: 1; display: grid; gap: 2px; }
  .name { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .switch { position: relative; flex: none; display: inline-flex; cursor: pointer; }
  .switch input { position: absolute; inset: 0; z-index: 1; opacity: 0; margin: 0; cursor: inherit; }
  .track { width: 2.5rem; height: 1.5rem; border-radius: var(--radius-full); background: var(--surface-5); position: relative; }
  .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 1.125rem; height: 1.125rem; border-radius: var(--radius-full); background: var(--text-strong); transition: translate calc(var(--dur-state) * var(--motion)) var(--ease-out); }
  .switch input:checked + .track { background: var(--status-online); }
  .switch input:checked + .track::after { translate: 1rem 0; }
  .switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
