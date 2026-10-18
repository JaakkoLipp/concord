<script lang="ts">
  /**
   * A private note on a person (M4.8 task 13), on their profile card. Saved after a pause in typing, and at once
   * when the field loses focus, the card closes or the page hides. Synced as `concord:notes`.
   */
  import { onDestroy } from 'svelte';
  import { NOTE_MAX, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { session, user, name }: { session: Session; user: string; name: string } = $props();
  const stored = $derived(session.store.notes[user] ?? '');
  let text = $state('');
  let editing = $state(false);
  // Show what is stored (another device may change it) unless this field is being typed in.
  $effect.pre(() => {
    const next = stored;
    if (!editing) text = next;
  });
  let failedShown = false;
  function save() {
    void session.setNote(user, text).then(() => (failedShown = false), () => {
      if (!failedShown) toasts.show(m.people.noteFailed);
      failedShown = true;
    });
  }
  onDestroy(() => session.flushNotes());
</script>

<svelte:window onpagehide={() => session.flushNotes()} />
<textarea class="note" rows="1" maxlength={NOTE_MAX} placeholder={m.people.notePlaceholder} aria-label={m.people.noteLabel(name)} bind:value={text}
  onfocus={() => (editing = true)}
  oninput={save}
  onblur={() => { editing = false; session.flushNotes(); }}
  onkeydown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}></textarea>

<style>
  .note {
    width: 100%; min-height: 2rem; max-height: 8rem; padding: var(--space-2) var(--space-3); resize: none; field-sizing: content;
    border: 1px solid transparent; border-radius: var(--radius-xs); background: none; color: var(--text-normal); font: var(--text-xs) var(--font-sans);
  }
  .note::placeholder { color: var(--text-secondary); }
  @media (hover: hover) { .note:hover { background: var(--hover-overlay); } }
  .note:focus { outline: none; border-color: var(--border-control); background: var(--surface-0); }
</style>
