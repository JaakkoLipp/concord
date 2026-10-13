<script lang="ts">
  /**
   * The composer (client.md section 6.3). The editor loads lazily; until then, and when this account can't
   * send here, the box is drawn at its real size. Each channel keeps its own draft while the tab is open.
   */
  import { untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import Smile from '@lucide/svelte/icons/smile';
  import { IconButton } from '@concord/ui';
  import type { Channel, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { COUNTER_FROM, byteLength, outgoing, serialise } from '$lib/composer/text.ts';
  import type { ComposerEditor } from '$lib/composer/editor.ts';
  import { labeller } from '$lib/composer/tokens.ts';
  import { picker } from '$lib/emoji/picker.svelte.ts';
  import { sendBlock } from '$lib/view/channels.ts';
  import { compose } from '$lib/view/compose.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';

  let { placeholder, session, channel }: { placeholder: string; session: Session; channel: Channel | undefined } = $props();

  const store = $derived(session.store);
  const limit = $derived(store.node?.limits.messageLength ?? 2000);
  const server = $derived(channel?.kind === 'text' ? channel.server : undefined);
  /** Ticks while timed out, so the composer comes back when the timeout ends. */
  let now = $state(new Date());
  const block = $derived(channel ? sendBlock(store, channel, now) : null);
  $effect(() => {
    if (block !== 'timeout') return;
    const t = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(t);
  });

  let host = $state<HTMLDivElement>();
  let editor = $state<ComposerEditor | null>(null);
  let text = $state('');
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const left = $derived(limit - byteLength(outgoing(text)));

  const label = $derived(labeller(store, () => server));

  const reply = $derived(channel ? compose.replies[channel.id] : undefined);
  const replyTo = $derived(reply ? store.messages.get(reply.id) : undefined);

  function send() {
    if (!editor || !channel || block) return;
    const out = outgoing(editor.text());
    if (!out || byteLength(out) > limit) return;
    void session.send(channel.id, out, reply ? [reply] : []);
    compose.clearReply(channel.id);
    editor.clear();
  }

  /** Escape cancels a reply first; otherwise it marks the channel read (m2a-plan.md decision 5). */
  function escape(): boolean {
    if (!channel) return false;
    if (reply) {
      compose.clearReply(channel.id);
      return true;
    }
    session.markRead(channel.id);
    return true;
  }

  /** Up arrow in an empty composer edits this account's last message here. */
  function editLast(): boolean {
    if (!channel) return false;
    const ids = store.windows.get(channel.id)?.ids ?? [];
    for (let i = ids.length - 1; i >= 0; i--) {
      const msg = store.messages.get(ids[i]!);
      if (msg && msg.author === store.selfId && !msg.system && msg.content) {
        compose.editing = msg.id;
        return true;
      }
    }
    return false;
  }

  // A reply whose message is deleted closes, and says so.
  $effect(() => {
    if (channel && reply && store.deleted.has(reply.id)) {
      compose.clearReply(channel.id);
      toasts.show(m.composer.replyDeleted, 'info');
    }
  });

  $effect(() => {
    if (compose.focusRequest) untrack(() => editor?.focus());
  });

  // The emoji picker inserts at the caret: Unicode as itself, custom emoji as a token (client.md section 6.4).
  let emojiButton = $state<HTMLElement | null>(null);
  function openPicker() {
    if (!emojiButton || !editor) return;
    picker.open(emojiButton, 'insert', (e) => editor?.insert(e.kind === 'custom' ? serialise.emoji(e.value) : e.value));
  }
  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      openPicker();
    }
  }

  // The editor exists while the box can be typed in, and is created once its code has loaded.
  $effect(() => {
    const el = host;
    if (!el) return;
    let ed: ComposerEditor | null = null;
    let cancelled = false;
    void import('$lib/composer/editor.ts').then(({ createEditor }) => {
      if (cancelled) return;
      untrack(() => {
        ed = createEditor(el, { draft: channel?.id ?? '', placeholder, touch, label, onChange: (t) => (text = t), onSend: send, onEscape: escape, onArrowUp: editLast });
        text = ed.text();
        editor = ed;
      });
    });
    return () => {
      cancelled = true;
      ed?.destroy();
      editor = null;
    };
  });

  $effect(() => {
    const id = channel?.id;
    const p = placeholder;
    untrack(() => {
      if (!editor || !id) return;
      editor.switchTo(id);
      editor.setPlaceholder(p);
    });
  });
</script>

{#if block}
  <div class="composer blocked" aria-disabled="true">
    <span class="side"><IconButton label={m.composer.attach} disabled><Plus size={22} /></IconButton></span>
    <span class="placeholder">{m.composer.blocked[block]}</span>
  </div>
{:else}
  {#if reply && channel}
    <div class="reply-bar">
      <span class="replying">{m.composer.replyingTo(replyTo ? store.displayName(replyTo.author, server) : '')}</span>
      <button class="mention" class:on={reply.mention} aria-pressed={reply.mention} aria-label={m.composer.mentionToggle}
        onclick={() => channel && (compose.replies = { ...compose.replies, [channel.id]: { ...reply, mention: !reply.mention } })}>
        <AtSign size={14} />{reply.mention ? m.composer.mentionOn : m.composer.mentionOff}
      </button>
      <IconButton size="sm" label={m.composer.cancelReply} onclick={() => channel && compose.clearReply(channel.id)}><CircleX size={16} /></IconButton>
    </div>
  {/if}
  <div class="composer" class:with-reply={!!reply}>
    <span class="side"><IconButton label={m.composer.attach} disabled><Plus size={22} /></IconButton></span>
    <div class="editor" bind:this={host}>
      {#if !editor}<span class="placeholder">{placeholder}</span>{/if}
    </div>
    {#if left <= COUNTER_FROM}
      <span class="counter" class:over={left < 0} aria-label={m.composer.bytesLeftLabel(left)}>{left}</span>
    {/if}
    <span class="side" bind:this={emojiButton}><IconButton label={m.composer.emoji} disabled={!editor} active={!!picker.request && picker.request.anchor === emojiButton} onclick={openPicker}><Smile size={22} /></IconButton></span>
    {#if touch}
      <span class="side">
        <IconButton label={m.composer.send} disabled={!editor || left < 0 || !outgoing(text)} onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={send}>
          <SendHorizontal size={22} />
        </IconButton>
      </span>
    {/if}
  </div>
{/if}

<svelte:window {onkeydown} />

<style>
  .composer {
    display: flex; align-items: flex-start; gap: var(--space-3); min-height: var(--composer-h); margin: 0 var(--space-5) var(--space-5);
    padding: 0 var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-2);
  }
  .blocked { align-items: center; cursor: not-allowed; }
  .with-reply { border-top-left-radius: 0; border-top-right-radius: 0; }
  .reply-bar {
    display: flex; align-items: center; gap: var(--space-3); margin: 0 var(--space-5); padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
    border: 1px solid var(--border-subtle); border-bottom: 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--surface-1);
    color: var(--text-secondary); font: var(--text-sm) var(--font-sans);
  }
  .replying { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mention { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0; border: 0; background: none; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); cursor: pointer; }
  .mention.on { color: var(--link); }
  .side { display: grid; place-items: center; min-height: calc(var(--composer-h) - 2px); flex: none; }
  .editor { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
  .editor :global(.cm-editor) { flex: 1; }
  .placeholder { flex: 1; min-width: 0; color: var(--text-muted); font: var(--text-md) var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .counter { align-self: center; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .counter.over { color: var(--danger); font-weight: 700; }
  .editor :global(.cm-token) {
    padding: 0 2px; border-radius: var(--radius-xs); background: var(--accent-subtle); color: var(--text-strong); font-weight: 500;
  }
  .editor :global(.cm-token-self) { background: var(--accent); color: var(--on-accent); }
  .editor :global(.cm-token-role[style*='--role']) { background: color-mix(in srgb, var(--role) 20%, transparent); }
  .editor :global(.cm-token-emoji) { display: inline-block; width: 1.375em; height: 1.375em; margin: 0 0.05em; vertical-align: -0.3em; object-fit: contain; }
</style>
