<script lang="ts">
  /** Appearance (M4.8 task 15): cozy or compact messages, and the font size, on this device. No light theme (decision 3). */
  import { m } from '$lib/i18n/index.ts';
  import { appearance, DEFAULT_FONT_SIZE, FONT_SIZES } from './appearance.svelte.ts';

  const t = $derived(m.settings.appearance);
  const index = $derived(Math.max(0, FONT_SIZES.findIndex((s) => s === appearance.fontSize)));
</script>

<fieldset class="display">
  <legend class="label">{t.display}</legend>
  <label class="option">
    <input type="radio" name="message-display" checked={!appearance.compact} onchange={() => appearance.set({ compact: false })} />
    <span><strong>{t.cozy}</strong><small>{t.cozyHelp}</small></span>
  </label>
  <label class="option">
    <input type="radio" name="message-display" checked={appearance.compact} onchange={() => appearance.set({ compact: true })} />
    <span><strong>{t.compact}</strong><small>{t.compactHelp}</small></span>
  </label>
</fieldset>

<label class="size">
  <span class="label">{t.fontSize}<span class="value">{t.px(appearance.fontSize)}</span></span>
  <input class="slider" type="range" min="0" max={FONT_SIZES.length - 1} step="1" value={index} aria-valuetext={t.px(appearance.fontSize)}
    style:--fill="{(index / (FONT_SIZES.length - 1)) * 100}%" oninput={(e) => appearance.set({ fontSize: FONT_SIZES[Number(e.currentTarget.value)] ?? DEFAULT_FONT_SIZE })} />
  <span class="ticks" aria-hidden="true">{#each FONT_SIZES as s (s)}<span class:current={s === appearance.fontSize}>{s}</span>{/each}</span>
  <span class="help">{t.fontSizeHelp}</span>
</label>
<p class="note">{t.perDevice}</p>

<style>
  .display { display: grid; gap: var(--space-3); margin: 0; padding: 0; border: 0; }
  .label { display: flex; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .value { color: var(--text-normal); font-variant-numeric: tabular-nums; text-transform: none; }
  .option {
    display: flex; align-items: center; gap: var(--space-4); min-height: var(--control-h); padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); background: var(--surface-2); cursor: pointer;
  }
  @media (hover: hover) { .option:hover { background: var(--surface-3); } }
  .option input { flex: none; width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--accent); }
  .option span { display: grid; gap: 2px; }
  .option strong { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .option small { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .size { display: grid; gap: var(--space-3); margin-top: var(--space-8); }
  .ticks { display: flex; justify-content: space-between; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .ticks .current { color: var(--text-strong); }
  .help, .note { color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .note { margin: var(--space-6) 0 0; }
  /* As the other settings' sliders: the native range input, drawn with tokens. */
  .slider { appearance: none; width: 100%; height: var(--icon-md); margin: 0; background: transparent; cursor: pointer; }
  .slider::-webkit-slider-runnable-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-moz-range-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-webkit-slider-thumb { appearance: none; width: var(--icon-sm); height: var(--icon-sm); margin-top: calc((var(--space-2) - var(--icon-sm)) / 2); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider::-moz-range-thumb { width: var(--icon-sm); height: var(--icon-sm); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider:focus-visible { outline: none; }
  .slider:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
  .slider:focus-visible::-moz-range-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
