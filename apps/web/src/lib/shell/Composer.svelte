<script lang="ts">
  /**
   * The composer (client.md section 6.3). The editor loads lazily; until then the box is drawn at its real
   * size. Task 1 of m2a-plan.md is a spike: send shows what would be sent, starting from a sample draft.
   */
  import { onDestroy, onMount } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import Smile from '@lucide/svelte/icons/smile';
  import { IconButton } from '@concord/ui';
  import type { Channel, Store } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { customEmojiUrl } from '$lib/markdown/emoji.ts';
  import { COUNTER_FROM, byteLength, outgoing, serialise } from '$lib/composer/text.ts';
  import type { ComposerEditor, Labeller } from '$lib/composer/editor.ts';

  let { placeholder, store, channel }: { placeholder: string; store: Store; channel: Channel | undefined } = $props();

  const LIMIT = 2000;
  let host = $state<HTMLDivElement>();
  let editor = $state<ComposerEditor | null>(null);
  let text = $state('');
  let touch = $state(false);
  let readout = $state<string | null>(null);
  const left = $derived(LIMIT - byteLength(text));
  const server = $derived(channel?.kind === 'text' ? channel.server : undefined);

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

  /** Spike only: a draft with each token kind and Finnish text, built from what this account can see. */
  function sample(): string {
    const others = [...store.members.values()].filter((mb) => mb.server === server && mb.user !== store.selfId);
    const user = others[0]?.user ?? (channel?.kind === 'dm' ? channel.recipients.find((r) => r !== store.selfId) : undefined);
    const roles = server ? Object.values(store.servers.get(server)?.roles ?? {}).sort((a, b) => a.rank - b.rank) : [];
    const emoji = [...store.emojis.values()].find((e) => !server || (e.parent.type === 'server' && e.parent.id === server)) ?? [...store.emojis.values()][0];
    const parts = [
      'Moikka',
      user ? ` ${serialise.user(user)}` : '',
      '! Mennäänkö saunaan',
      emoji ? ` ${serialise.emoji(emoji.id)}` : '',
      ' tänään? Kysy',
      roles[0] ? ` ${serialise.role(roles[0].id)}` : '',
      ' ja katso',
      channel?.kind === 'text' ? ` ${serialise.channel(channel.id)}` : '',
      ' — äiti ja öljy 🇫🇮',
    ];
    return parts.join('');
  }

  function send() {
    const out = outgoing(editor?.text() ?? '');
    readout = out;
  }

  onMount(() => {
    touch = matchMedia('(pointer: coarse)').matches;
    let cancelled = false;
    void import('$lib/composer/editor.ts').then(({ createEditor }) => {
      if (cancelled || !host) return;
      editor = createEditor(host, { text: '', placeholder, touch, label, onChange: (t) => (text = t), onSend: send });
    });
    return () => {
      cancelled = true;
    };
  });
  onDestroy(() => editor?.destroy());

  $effect(() => {
    editor?.setPlaceholder(placeholder);
  });

  // Spike only: fill the sample once the names it shows have loaded.
  let sampled = false;
  $effect(() => {
    if (!editor || sampled || !channel) return;
    if (channel.kind === 'text' && !store.memberListLoaded.has(channel.server)) return;
    sampled = true;
    if (!editor.text()) editor.setText(sample());
  });
</script>

{#if readout !== null}
  <div class="readout" role="status">
    <p class="note">{m.composer.spike.note}</p>
    {#if readout}
      <p class="note">{m.composer.spike.wouldSend(byteLength(readout))}</p>
      <pre>{readout}</pre>
    {:else}
      <p class="note">{m.composer.spike.nothing}</p>
    {/if}
    <button class="link" onclick={() => (readout = null)}>{m.composer.spike.dismiss}</button>
  </div>
{/if}
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
    <span class="side"><IconButton label={m.composer.send} disabled={!editor || left < 0} onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={send}><SendHorizontal size={22} /></IconButton></span>
  {/if}
</div>
<div class="spike-bar">
  <button class="link" disabled={!editor} onclick={() => { editor?.setText(sample()); editor?.focus(); }}>{m.composer.spike.reset}</button>
</div>

<style>
  .composer {
    display: flex; align-items: flex-start; gap: var(--space-3); min-height: var(--composer-h); margin: 0 var(--space-5);
    padding: 0 var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-2);
  }
  .side { display: grid; place-items: center; min-height: calc(var(--composer-h) - 2px); flex: none; }
  .editor { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
  .editor :global(.cm-editor) { flex: 1; }
  .placeholder { color: var(--text-muted); font: var(--text-md) var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .counter { align-self: center; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .counter.over { color: var(--danger); font-weight: 700; }
  .editor :global(.cm-token) {
    padding: 0 2px; border-radius: var(--radius-xs); background: var(--accent-subtle); color: var(--text-strong); font-weight: 500;
  }
  .editor :global(.cm-token-self) { background: var(--accent); color: var(--on-accent); }
  .editor :global(.cm-token-role[style*='--role']) { background: color-mix(in srgb, var(--role) 20%, transparent); }
  .editor :global(.cm-token-emoji) { display: inline-block; width: 1.375em; height: 1.375em; margin: 0 0.05em; vertical-align: -0.3em; object-fit: contain; }
  .spike-bar { display: flex; justify-content: flex-end; min-height: var(--space-5); margin: 0 var(--space-5) var(--space-2); }
  .link { padding: 0; border: 0; background: none; color: var(--link); font: var(--text-xs) var(--font-sans); cursor: pointer; }
  .link:disabled { color: var(--text-muted); cursor: default; }
  .readout {
    margin: 0 var(--space-5) var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border-default);
    border-radius: var(--radius-md); background: var(--surface-1); color: var(--text-normal); font: var(--text-sm) var(--font-sans);
  }
  .note { margin: 0 0 var(--space-2); color: var(--text-secondary); }
  pre { margin: 0 0 var(--space-2); white-space: pre-wrap; overflow-wrap: anywhere; font: var(--text-xs) ui-monospace, monospace; color: var(--text-strong); }
</style>
