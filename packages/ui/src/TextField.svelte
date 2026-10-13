<script lang="ts">
  /** A labelled text input with a hint or an error below it, and room for a button inside its edge. */
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'value'> {
    label: string;
    /** Keep the label for screen readers only. */
    hideLabel?: boolean;
    value?: string;
    hint?: string | undefined;
    error?: string | undefined;
    /** Shown inside the field's right edge, such as a submit button. */
    trailing?: Snippet;
    input?: HTMLInputElement | null;
  }
  let { label, hideLabel = false, value = $bindable(''), hint, error, trailing, input = $bindable(null), id, ...rest }: Props = $props();
  const uid = $props.id();
  const fieldId = $derived(id ?? `field-${uid}`);
  const note = $derived(error ?? hint);
</script>

<div class="field" class:invalid={!!error}>
  <label for={fieldId} class:sr={hideLabel}>{label}</label>
  <div class="control">
    <input id={fieldId} bind:this={input} bind:value aria-invalid={error ? true : undefined} aria-describedby={note ? `${fieldId}-note` : undefined} {...rest} />
    {#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
  </div>
  {#if note}<p class="note" class:error={!!error} id="{fieldId}-note" role={error ? 'alert' : undefined}>{note}</p>{/if}
</div>

<style>
  .field { display: grid; gap: var(--space-3); min-width: 0; }
  label { color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .control {
    display: flex; align-items: center; gap: var(--space-3); min-height: var(--control-h); padding: 0 var(--space-2) 0 var(--space-4);
    background: var(--surface-0); border: 1px solid var(--border-control); border-radius: var(--radius-md);
  }
  .control:focus-within { border-color: var(--accent); }
  .invalid .control { border-color: var(--danger); }
  input { flex: 1; min-width: 0; min-height: calc(var(--control-h) - 2px); padding: 0; border: 0; background: none; color: var(--text-strong); outline: none; }
  input::placeholder { color: var(--text-muted); }
  input:disabled { opacity: 0.6; }
  .trailing { display: flex; flex: none; }
  .note { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note.error { color: var(--danger); }
</style>
