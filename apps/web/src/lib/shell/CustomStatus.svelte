<script lang="ts">
  /** The custom status: an optional leading emoji from the picker, then up to 128 characters (m2b-plan.md task 5). */
  import { Button, Dialog, IconButton, TextField } from '@concord/ui';
  import type { Session } from '@concord/domain';
  import Smile from '@lucide/svelte/icons/smile-plus';
  import { m } from '$lib/i18n/index.ts';
  import { picker } from '$lib/emoji/picker.svelte.ts';
  import EmojiPicker from '$lib/emoji/EmojiPicker.svelte';
  import { toasts } from '$lib/view/toast.svelte.ts';

  const MAX = 128;
  interface Props { session: Session; open: boolean; onclose: () => void }
  let { session, open, onclose }: Props = $props();
  let emoji = $state('');
  let text = $state('');
  let button = $state<HTMLElement | null>(null);

  /** Split a status into its leading emoji, if any, and the rest. */
  function split(status: string): [string, string] {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(status)[Symbol.iterator]().next().value?.segment ?? '';
    return /\p{Extended_Pictographic}/u.test(first) ? [first, status.slice(first.length).trimStart()] : ['', status];
  }

  $effect(() => {
    if (!open) return;
    [emoji, text] = split(session.store.self?.statusText ?? '');
  });

  // Stoat counts characters as code points, so an emoji is one.
  const full = $derived(emoji ? (text.trim() ? `${emoji} ${text.trim()}` : emoji) : text.trim());
  const left = $derived(MAX - [...full].length);

  function save() {
    if (left < 0) return;
    void session.setStatusText(full || null).catch(() => toasts.show(m.status.failed));
    onclose();
  }
</script>

<Dialog {open} title={m.status.title} {onclose} width="26rem">
  <form class="row" onsubmit={(e) => { e.preventDefault(); save(); }}>
    <span bind:this={button} class="emoji">
      {#if emoji}
        <button type="button" class="chosen" aria-label={m.status.removeEmoji} onclick={() => (emoji = '')}>{emoji}</button>
      {:else}
        <IconButton label={m.status.emoji} onclick={() => button && picker.open(button, 'unicode', (e) => { if (e.kind === 'unicode') emoji = e.value; }, 'status')}><Smile /></IconButton>
      {/if}
    </span>
    <div class="field">
      <TextField label={m.status.text} hideLabel placeholder={m.status.text} bind:value={text} autocomplete="off"
        error={left < 0 ? m.status.tooLong : undefined} hint={left < 20 && left >= 0 ? m.status.left(left) : undefined} />
    </div>
  </form>
  <EmojiPicker host="status" />
  {#snippet actions()}
    <Button variant="ghost" onclick={onclose}>{m.status.cancel}</Button>
    <Button onclick={save} disabled={left < 0}>{m.status.save}</Button>
  {/snippet}
</Dialog>

<style>
  .row { display: flex; align-items: flex-start; gap: var(--space-3); }
  .emoji { display: grid; place-items: center; width: var(--control-h); height: var(--control-h); flex: none; }
  .chosen { width: 100%; height: 100%; border: 0; border-radius: var(--radius-md); background: var(--surface-3); font-size: 1.375rem; }
  .field { flex: 1; min-width: 0; }
</style>
