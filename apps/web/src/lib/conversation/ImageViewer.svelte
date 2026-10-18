<script lang="ts">
  import { dialogLeave, IconButton, settle } from '@concord/ui';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ZoomIn from '@lucide/svelte/icons/zoom-in';
  import ZoomOut from '@lucide/svelte/icons/zoom-out';
  import { m } from '$lib/i18n/index.ts';
  import { viewer } from '$lib/view/viewer.svelte.ts';

  let dialog = $state<HTMLDialogElement | null>(null);
  // It fades in, and fades out keeping the image, closing when that has run (client.md section 9).
  $effect(() => {
    if (!viewer.current || !dialog) return;
    settle(dialog);
    if (!dialog.open) dialog.showModal();
  });

  // Zoom (M4.8 task 14a): by the wheel around the pointer, by buttons and keys around the centre, and a drag pans.
  // Only the transform changes, instantly, as for any frequent change (client.md section 9, rule 2).
  const MIN = 1;
  const MAX = 8;
  let img = $state<HTMLImageElement | null>(null);
  let zoom = $state({ s: 1, x: 0, y: 0 });
  $effect(() => {
    void viewer.current?.src;
    zoom = { s: 1, x: 0, y: 0 };
  });
  /** To scale `s`, keeping the screen point (px, py) over the same spot of the image; the centre if none. */
  function zoomTo(s: number, px?: number, py?: number) {
    if (!img) return;
    const next = Math.min(MAX, Math.max(MIN, s));
    if (next === MIN) return void (zoom = { s: 1, x: 0, y: 0 });
    const r = img.getBoundingClientRect();
    // The untransformed centre: scaling about the centre leaves it where the translation put it.
    const cx = r.left + r.width / 2 - zoom.x;
    const cy = r.top + r.height / 2 - zoom.y;
    const x = px ?? cx + zoom.x;
    const y = py ?? cy + zoom.y;
    zoom = { s: next, x: x - cx - (next / zoom.s) * (x - cx - zoom.x), y: y - cy - (next / zoom.s) * (y - cy - zoom.y) };
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    zoomTo(zoom.s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)), e.clientX, e.clientY);
  }
  let drag = $state<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  /** A drag that ended off the image mustn't count as a click beside it, which closes the viewer. */
  let justDragged = false;
  function down(e: PointerEvent) {
    if (zoom.s === 1 || e.button !== 0) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    img?.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag = { ...drag, x: e.clientX, y: e.clientY, moved: drag.moved || Math.abs(dx) + Math.abs(dy) > 2 };
    zoom = { ...zoom, x: zoom.x + dx, y: zoom.y + dy };
  }
  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    justDragged = drag.moved;
    drag = null;
    setTimeout(() => (justDragged = false));
  }
  function keys(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') zoomTo(zoom.s * 1.5);
    else if (e.key === '-') zoomTo(zoom.s / 1.5);
    else if (e.key === '0') zoomTo(1);
    else return;
    e.preventDefault();
  }

  function closed() {
    if (viewer.current || !dialog) return;
    dialog.close();
    settle(dialog);
  }
</script>

<dialog bind:this={dialog} class="viewer" aria-label={m.conversation.imageViewer} oncancel={(e) => { e.preventDefault(); viewer.close(); }}
  onclose={() => viewer.close()} onclick={(e) => { if (e.target === dialog && !justDragged) viewer.close(); }} onkeydown={keys}>
  {#if viewer.current}
    <div class="content" out:dialogLeave={dialog} onoutroend={closed}>
    <img bind:this={img} src={viewer.current.src} alt={viewer.current.alt} width={viewer.current.width} height={viewer.current.height}
      class:zoomed={zoom.s > 1} class:dragging={!!drag} style:transform="translate({zoom.x}px, {zoom.y}px) scale({zoom.s})"
      onwheel={wheel} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
      ondblclick={(e) => zoomTo(zoom.s > 1 ? 1 : 2, e.clientX, e.clientY)} draggable="false" />
    <div class="bar">
      <div class="zoom" role="group" aria-label={m.conversation.zoom}>
        <IconButton label={m.conversation.zoomOut} disabled={zoom.s <= MIN} onclick={() => zoomTo(zoom.s / 1.5)}><ZoomOut /></IconButton>
        <button class="level" aria-label={m.conversation.zoomReset} onclick={() => zoomTo(1)}>{m.conversation.zoomLevel(Math.round(zoom.s * 100))}</button>
        <IconButton label={m.conversation.zoomIn} disabled={zoom.s >= MAX} onclick={() => zoomTo(zoom.s * 1.5)}><ZoomIn /></IconButton>
      </div>
      {#if viewer.current.original}
        <a class="open" href={viewer.current.original} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />{m.conversation.openOriginal}</a>
      {/if}
      <IconButton label={m.conversation.close} onclick={() => viewer.close()}><X /></IconButton>
    </div>
    </div>
  {/if}
</dialog>

<style>
  .viewer {
    max-width: 100vw; max-height: 100dvh; width: 100vw; height: 100dvh; margin: 0; padding: var(--space-8);
    border: 0; background: transparent; display: none; place-items: center;
  }
  .viewer[open] { display: grid; animation: viewer-in var(--dur-modal) var(--ease-out); }
  .viewer::backdrop { background: var(--scrim); }
  .viewer[open]::backdrop { animation: fade-in var(--dur-modal) var(--ease-out); }
  /* It fills the dialog, so clicks beside the image pass through to the dialog, which closes on them. */
  .content { display: grid; place-items: center; width: 100%; height: 100%; pointer-events: none; }
  .content > * { pointer-events: auto; }
  @keyframes viewer-in { from { opacity: 0; scale: calc(1 - 0.02 * var(--motion)); } }
  @keyframes fade-in { from { opacity: 0; } }
  .viewer { overflow: hidden; }
  img.zoomed { cursor: grab; touch-action: none; }
  img.dragging { cursor: grabbing; }
  .zoom { display: flex; align-items: center; gap: var(--space-1); }
  .level {
    min-width: 3.5rem; min-height: 2rem; padding: 0 var(--space-2); border: 0; border-radius: var(--radius-md);
    background: none; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); font-variant-numeric: tabular-nums;
  }
  @media (hover: hover) { .level:hover { background: var(--hover-overlay); } }
  img { max-width: min(100%, 90vw); max-height: 85dvh; width: auto; height: auto; object-fit: contain; border-radius: var(--radius-md); }
  .bar { position: fixed; top: var(--space-5); right: var(--space-5); display: flex; gap: var(--space-3); align-items: center; }
  .open { display: inline-flex; gap: var(--space-2); align-items: center; color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); }
</style>
