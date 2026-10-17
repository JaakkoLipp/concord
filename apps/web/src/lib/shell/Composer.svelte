<script lang="ts">
  /**
   * The composer (client.md section 6.3). The editor loads lazily; until then, and when this account can't
   * send here, the box is drawn at its real size. Each channel keeps its own draft while the tab is open.
   */
  import ImagePlay from '@lucide/svelte/icons/image-play';
  import GifPicker from '$lib/composer/GifPicker.svelte';
  import { untrack } from 'svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import AtSign from '@lucide/svelte/icons/at-sign';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import FileText from '@lucide/svelte/icons/file-text';
  import Trash from '@lucide/svelte/icons/trash-2';
  import { attachFiles } from '$lib/composer/files.ts';
  import TypingIndicator from './TypingIndicator.svelte';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import Smile from '@lucide/svelte/icons/smile';
  import { IconButton } from '@concord/ui';
  import { Permission, has, type Channel, type FavouriteGif, type Session } from '@concord/domain';
  import { m } from '$lib/i18n/index.ts';
  import { COUNTER_FROM, byteLength, outgoing, serialise } from '$lib/composer/text.ts';
  import type { ComposerEditor, ListKey, Query } from '$lib/composer/editor.ts';
  import { suggest, type Suggestion } from '$lib/composer/suggest.ts';
  import { unicodeEmoji, type UnicodeEmoji } from '$lib/emoji/data.ts';
  import { labeller } from '$lib/composer/tokens.ts';
  import { picker } from '$lib/emoji/picker.svelte.ts';
  import { permissionsIn, sendBlock } from '$lib/view/channels.ts';
  import { compose } from '$lib/view/compose.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import { setComposerFocus } from '$lib/view/composerFocus.ts';
  import { settingsModal } from '$lib/settings/modal.svelte.ts';

  let { placeholder, session, channel }: { placeholder: string; session: Session; channel: Channel | undefined } = $props();

  const store = $derived(session.store);
  const limit = $derived(store.node?.limits.messageLength ?? 2000);
  const server = $derived(channel?.kind === 'text' ? channel.server : undefined);
  // Comes back by itself when a timeout ends (clock.svelte.ts).
  const block = $derived(channel ? sendBlock(store, channel) : null);

  let host = $state<HTMLDivElement>();
  let editor = $state<ComposerEditor | null>(null);
  let text = $state('');
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const left = $derived(limit - byteLength(outgoing(text)));

  const label = $derived(labeller(store, () => server));

  const reply = $derived(channel ? compose.replies[channel.id] : undefined);
  const replyTo = $derived(reply ? store.messages.get(reply.id) : undefined);

  // Attachments (m2a-plan.md task 6): chosen here, uploaded by the session when the message is sent.
  const chosen = $derived(channel ? (compose.files[channel.id] ?? []) : []);
  const canUpload = $derived(!!channel && has(permissionsIn(store, channel), Permission.UploadFiles));
  let fileInput = $state<HTMLInputElement | null>(null);
  const addFiles = (files: File[]) => channel && attachFiles(store, channel, files);

  function send() {
    if (!editor || !channel || block) return;
    const out = outgoing(editor.text());
    if ((!out && !chosen.length) || byteLength(out) > limit) return;
    const files = compose.takeFiles(channel.id).map((c) => ({ file: c.file, name: c.file.name, preview: c.preview }));
    session.stopTyping(channel.id);
    compose.presentRequest++;
    void session.send(channel.id, out, reply ? [reply] : [], files);
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

  // Autocomplete (m2a-plan.md task 5): the editor reports the query under the caret, the list follows it.
  let query = $state<Query | null>(null);
  let dismissedAt = -1;
  let unicode = $state<UnicodeEmoji[]>([]);
  let active = $state(0);
  const suggestions = $derived(query && channel
    ? suggest(store, channel, query.kind, query.query, { mentionRoles: has(permissionsIn(store, channel), Permission.MentionRoles), mentionEveryone: has(permissionsIn(store, channel), Permission.MentionEveryone), unicode })
    : []);
  $effect(() => {
    if (query?.kind === ':' && !unicode.length) void unicodeEmoji().then((d) => (unicode = d));
  });
  function onQuery(q: Query | null) {
    // Escape closes the list until the caret leaves that query.
    if (q && q.from === dismissedAt) return void (query = null);
    if (!q) dismissedAt = -1;
    if (q?.kind !== query?.kind || q?.query !== query?.query) active = 0;
    query = q;
  }
  function choose(s: Suggestion) {
    if (!query || !editor) return;
    editor.replace(query.from, query.to, `${s.insert} `);
    query = null;
  }
  function listKey(key: ListKey): boolean {
    if (!query || !suggestions.length) return false;
    const n = suggestions.length;
    if (key === 'up') active = (active - 1 + n) % n;
    else if (key === 'down') active = (active + 1) % n;
    else if (key === 'pick') choose(suggestions[active]!);
    else {
      dismissedAt = query.from;
      query = null;
    }
    return true;
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

  // Text asked for from elsewhere, such as Mention in a person's menu. Each request is applied once.
  // Starting from the current request, so one made before this composer existed isn't applied to it.
  let inserted = compose.insertRequest?.n ?? 0;
  $effect(() => {
    const r = compose.insertRequest;
    if (!r || r.n === inserted) return;
    inserted = r.n;
    untrack(() => {
      if (!editor || !channel || block) return;
      editor.focus();
      editor.insert(r.text);
    });
  });

  // Typing with nothing focused goes here (typeToFocus.ts). Registered only while the editor takes text: on a channel,
  // with the editor shown rather than the "you can't send" notice.
  $effect(() => {
    const ed = editor;
    if (!ed || !channel || block) return;
    setComposerFocus(() => {
      ed.focus();
      return !!document.activeElement?.closest('.cm-editor');
    });
    return () => setComposerFocus(null);
  });

  // The emoji picker inserts at the caret: Unicode as itself, custom emoji as a token (client.md section 6.4).
  let emojiButton = $state<HTMLElement | null>(null);
  // Favourite GIFs (m4.5 follow-up): picking one sends its link at once, as a reply when replying, as on Discord.
  let gifButton = $state<HTMLElement | null>(null);
  let gifsOpen = $state(false);
  function sendGif(gif: FavouriteGif) {
    gifsOpen = false;
    if (!channel || block) return;
    void session.send(channel.id, gif.url, reply ? [reply] : []);
    compose.clearReply(channel.id);
    editor?.focus();
  }
  function openPicker() {
    if (!emojiButton || !editor) return;
    picker.open(emojiButton, 'insert', (e) => editor?.insert(e.kind === 'custom' ? serialise.emoji(e.value) : e.value));
  }
  function onkeydown(e: KeyboardEvent) {
    // Not under settings, where the composer is inert (m4.6-plan.md task 16a).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !e.shiftKey && !e.altKey && !settingsModal.shown) {
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
        ed = createEditor(el, { draft: `${store.selfId}:${channel?.id ?? ''}`, placeholder, touch, label, onChange: (t) => (text = t), onSend: send, onEscape: escape, onArrowUp: editLast, onQuery, onListKey: listKey, onPasteFiles: addFiles,
          onEdit: (t) => { if (!channel) return; if (outgoing(t)) session.typing(channel.id); else session.stopTyping(channel.id); } });
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
      editor.switchTo(`${store.selfId}:${id}`);
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
  <div class="wrap">
  {#if suggestions.length}
    <ul class="suggestions" role="listbox" aria-label={m.composer.suggestions}>
      {#each suggestions as s, i (s.kind + s.id)}
        <!-- Keys reach the list through the editor, which keeps focus, as in an ARIA combobox. -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li role="option" aria-selected={i === active} class:active={i === active}
          onmousedown={(e) => e.preventDefault()} onmouseenter={() => (active = i)} onclick={() => choose(s)}>
          {#if s.kind === 'channel'}<span class="sym">#</span>{:else if s.kind === 'role' || s.kind === 'mass'}<span class="sym" style:color={s.colour}>@</span>{:else if s.image}<img class:round={s.kind === 'user'} src={s.image} alt="" width="24" height="24" />{/if}
          <span class="label" style:color={s.kind === 'user' ? s.colour : undefined}>{s.label}</span>
          {#if s.detail}<span class="detail">{s.detail}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
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
  {#if chosen.length && channel}
    <ul class="tiles" class:after-reply={!!reply}>
      {#each chosen as c (c.key)}
        <li class="tile">
          {#if c.preview}<img src={c.preview} alt="" />{:else}<span class="file-icon"><FileText size={32} /></span>{/if}
          <span class="file-name">{c.file.name}</span>
          <span class="file-size">{m.files.size(c.file.size)}</span>
          <span class="remove"><IconButton size="sm" label={m.files.remove(c.file.name)} onclick={() => channel && compose.removeFile(channel.id, c.key)}><Trash size={16} /></IconButton></span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="composer" class:with-reply={!!reply || !!chosen.length}>
    <!-- Locked rather than disabled without Upload files, so its tooltip gives the reason (m4.7-plan.md task 5). -->
    <span class="side" class:locked={!canUpload}><IconButton label={canUpload ? m.composer.attach : m.composer.cantUpload} aria-disabled={!canUpload} onclick={() => { if (canUpload) fileInput?.click(); }}><Plus size={22} /></IconButton></span>
    <input class="file-input" type="file" multiple tabindex="-1" aria-hidden="true" bind:this={fileInput}
      onchange={(e) => { const input = e.currentTarget; addFiles([...(input.files ?? [])]); input.value = ''; }} />
    <div class="editor" bind:this={host}>
      {#if !editor}<span class="placeholder">{placeholder}</span>{/if}
    </div>
    {#if left <= COUNTER_FROM}
      <span class="counter" class:over={left < 0} aria-label={m.composer.bytesLeftLabel(left)}>{left}</span>
    {/if}
    <span class="side" bind:this={gifButton}><IconButton label={m.gifs.button} disabled={!editor} active={gifsOpen} aria-haspopup="dialog" aria-expanded={gifsOpen} onclick={() => (gifsOpen = !gifsOpen)}><ImagePlay size={22} /></IconButton></span>
    <span class="side" bind:this={emojiButton}><IconButton label={m.composer.emoji} disabled={!editor} active={!!picker.request && picker.request.anchor === emojiButton} onclick={openPicker}><Smile size={22} /></IconButton></span>
    {#if touch}
      <span class="side">
        <IconButton label={m.composer.send} disabled={!editor || left < 0 || (!outgoing(text) && !chosen.length)} onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={send}>
          <SendHorizontal size={22} />
        </IconButton>
      </span>
    {/if}
  </div>
  {#if channel}<TypingIndicator {store} channel={channel.id} {server} />{/if}
  <GifPicker {store} anchor={gifButton} open={gifsOpen} onclose={() => (gifsOpen = false)} onpick={sendGif} />
  </div>
{/if}

<svelte:window {onkeydown} />

<style>
  .composer {
    display: flex; align-items: flex-start; gap: var(--space-3); min-height: var(--composer-h); margin: 0 var(--space-3) var(--space-3);
    padding: 0 var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-2);
  }
  .blocked { align-items: center; cursor: not-allowed; }
  .wrap { position: relative; display: flow-root; }
  .file-input { display: none; }
  .locked :global(.icon-button) { opacity: 0.4; cursor: not-allowed; }
  .tiles {
    display: flex; gap: var(--space-4); overflow-x: auto; margin: 0 var(--space-3); padding: var(--space-4); list-style: none;
    border: 1px solid var(--border-subtle); border-bottom: 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--surface-2);
  }
  .tiles.after-reply { border-radius: 0; }
  .tile {
    position: relative; display: flex; flex-direction: column; flex: none; width: 12rem; padding: var(--space-3);
    border-radius: var(--radius-md); background: var(--surface-1);
  }
  .tile img { width: 100%; height: 8rem; object-fit: contain; border-radius: var(--radius-xs); }
  .file-icon { display: grid; place-items: center; height: 8rem; color: var(--text-secondary); }
  .file-name { margin-top: var(--space-2); color: var(--text-normal); font: var(--text-sm) var(--font-sans); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-size { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .remove { position: absolute; top: var(--space-1); right: var(--space-1); border-radius: var(--radius-md); background: var(--surface-3); }
  .suggestions {
    position: absolute; left: var(--space-3); right: var(--space-3); bottom: 100%; z-index: 10; margin: 0 0 var(--space-2); padding: var(--space-2);
    list-style: none; border: 1px solid var(--border-default); border-radius: var(--radius-lg); background: var(--surface-1); box-shadow: var(--shadow-popover);
  }
  .suggestions li {
    display: flex; align-items: center; gap: var(--space-3); min-height: 2.25rem; padding: 0 var(--space-3); border-radius: var(--radius-md);
    color: var(--text-normal); font: 500 var(--text-md) var(--font-sans); cursor: pointer;
  }
  .suggestions li.active { background: var(--hover-overlay); color: var(--text-strong); }
  .suggestions img { width: 1.5rem; height: 1.5rem; object-fit: contain; flex: none; }
  .suggestions img.round { border-radius: 50%; }
  .sym { width: 1.5rem; text-align: center; color: var(--text-secondary); font-weight: 700; flex: none; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { margin-left: auto; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); white-space: nowrap; }
  .with-reply { border-top-left-radius: 0; border-top-right-radius: 0; }
  .reply-bar {
    display: flex; align-items: center; gap: var(--space-3); margin: 0 var(--space-3); padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
    border: 1px solid var(--border-subtle); border-bottom: 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--surface-1);
    color: var(--text-secondary); font: var(--text-sm) var(--font-sans);
  }
  .replying { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mention { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0; border: 0; background: none; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); cursor: pointer; }
  .mention.on { color: var(--link); }
  .side { display: grid; place-items: center; min-height: calc(var(--composer-h) - 2px); flex: none; }
  .editor { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; justify-content: center; }
  .editor :global(.cm-editor) { flex: 1; }
  .placeholder { min-width: 0; color: var(--text-muted); font: var(--text-md) var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .counter { align-self: center; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); font-variant-numeric: tabular-nums; }
  .counter.over { color: var(--danger); font-weight: 700; }
  .editor :global(.cm-token) {
    padding: 0 2px; border-radius: var(--radius-xs); background: var(--accent-subtle); color: var(--text-strong); font-weight: 500;
  }
  .editor :global(.cm-token-self) { background: var(--accent); color: var(--on-accent); }
  .editor :global(.cm-token-role[style*='--role']) { background: color-mix(in srgb, var(--role) 20%, transparent); }
  .editor :global(.cm-token-emoji) { display: inline-block; width: 1.375em; height: 1.375em; margin: 0 0.05em; vertical-align: -0.3em; object-fit: contain; }
</style>
