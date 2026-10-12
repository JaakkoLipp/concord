<script lang="ts">
  /**
   * The composer (client.md section 6.3). The editor loads lazily; until then, and when this account can't
   * send here, the box is drawn at its real size. Each channel keeps its own draft while the tab is open.
   */
  import { untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import Smile from '@lucide/svelte/icons/smile';
  import { IconButton } from '@concord/ui';
  import type { Channel, Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { COUNTER_FROM, byteLength, outgoing } from '$lib/composer/text.ts';
  import type { ComposerEditor, Labeller } from '$lib/composer/editor.ts';
  import { sendBlock } from '$lib/view/channels.ts';

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

  const label: Labeller = (kind, id) => {
    if (kind === 'user') return { text: `@${store.displayName(id, server) || m.markdown.unknownUser}`, self: id === store.selfId };
    if (kind === 'role') {
      const role = server ? store.servers.get(server)?.roles[id] : undefined;
      return { text: `@${role?.name ?? m.markdown.unknownRole}`, colour: role?.colour };
    }
    if (kind === 'channel') {
      const c = store.channels.get(id);
      return { text: `#${c && (c.kind === 'text' || c.kind === 'group') ? c.name : m.markdown.unknownChannel}` };
    }
    return { image: customEmojiUrl(id), alt: `:${store.emojis.get(id)?.name ?? id}:` };
  };

  function send() {
    if (!editor || !channel || block) return;
    const out = outgoing(editor.text());
    if (!out || byteLength(out) > limit) return;
    void session.send(channel.id, out);
    editor.clear();
  }

  function escape() {
    if (channel) session.markRead(channel.id);
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
        ed = createEditor(el, { draft: channel?.id ?? '', placeholder, touch, label, onChange: (t) => (text = t), onSend: send, onEscape: escape });
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
  <div class="composer">
    <span class="side"><IconButton label={m.composer.attach} disabled><Plus size={22} /></IconButton></span>
    <div class="editor" bind:this={host}>
      {#if !editor}<span class="placeholder">{placeholder}</span>{/if}
    </div>
    {#if left <= COUNTER_FROM}
      <span class="counter" class:over={left < 0} aria-label={m.composer.bytesLeftLabel(left)}>{left}</span>
    {/if}
    <span class="side"><IconButton label={m.composer.emoji} disabled><Smile size={22} /></IconButton></span>
    {#if touch}
      <span class="side">
        <IconButton label={m.composer.send} disabled={!editor || left < 0 || !outgoing(text)} onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={send}>
          <SendHorizontal size={22} />
        </IconButton>
      </span>
    {/if}
  </div>
{/if}

<style>
  .composer {
    display: flex; align-items: flex-start; gap: var(--space-3); min-height: var(--composer-h); margin: 0 var(--space-5) var(--space-5);
    padding: 0 var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-2);
  }
  .blocked { align-items: center; cursor: not-allowed; }
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
