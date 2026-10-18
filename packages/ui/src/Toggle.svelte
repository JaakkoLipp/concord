<script lang="ts">
  /**
   * The one on/off switch (m4.6-plan.md task 18, motion spec 4.15): 40 by 24 px, `--accent` when on with an
   * `--on-accent` knob, since light never goes on the accent. Label it with `aria-labelledby` or `aria-label`.
   */
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends Omit<HTMLInputAttributes, 'type' | 'role' | 'checked' | 'onchange'> {
    checked: boolean;
    onchange: (on: boolean) => void;
  }
  let { checked, onchange, ...rest }: Props = $props();
</script>

<label class="toggle">
  <input {...rest} type="checkbox" role="switch" {checked} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"></span>
</label>

<style>
  .toggle { position: relative; flex: none; display: inline-flex; cursor: pointer; }
  .toggle:has(input:disabled) { cursor: not-allowed; }
  .toggle input { position: absolute; inset: 0; z-index: 1; opacity: 0; margin: 0; cursor: inherit; }
  .track { position: relative; width: 2.5rem; height: 1.5rem; border-radius: var(--radius-full); background: var(--surface-5); transition: background-color var(--dur-state) var(--ease-out); }
  .track::after {
    content: ''; position: absolute; top: 3px; left: 3px; width: 1.125rem; height: 1.125rem; border-radius: var(--radius-full);
    background: var(--text-strong); transition: translate calc(var(--dur-state) * var(--motion)) var(--ease-out);
  }
  input:checked + .track { background: var(--accent); }
  input:checked + .track::after { translate: 1rem 0; background: var(--on-accent); }
  input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
  input:disabled + .track { opacity: 0.5; }
</style>
