<script lang="ts">
  /**
   * The message list (client.md section 6.1): a bounded win loaded in pages of 100 at either edge,
   * grouping within 7 minutes, day and "new messages" dividers, and scroll anchoring. When the user is at
   * the bottom, new content keeps them there. Otherwise the message at the top of the view stays put while
   * history loads above it or media and late embeds change height.
   */
  import { Permission, ULID_PATTERN, has, type Message, type PendingMessage, type Session } from '@concord/domain';
  import { customEmojiUrl, twemojiUrl } from '$lib/markdown/emoji.ts';
  import type { QuickEmoji } from './menu.ts';
  import { resolve } from '$app/paths';
  import { permissionsIn } from '$lib/view/channels.ts';
  import { compose } from '$lib/view/compose.svelte.ts';
  import { toasts } from '$lib/view/toast.svelte.ts';
  import type { MessageActions } from './actions.ts';
  import DeleteDialog from './DeleteDialog.svelte';
  import { reactionKey } from '$lib/emoji/data.ts';
  import { picker } from '$lib/emoji/picker.svelte.ts';
  import { tick, untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import { setMarkdownContext } from '$lib/markdown/context.ts';
  import { dayLabel, sameDay, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import MessageItem from './MessageItem.svelte';
  import { copyImage, saveImage } from './images.ts';

  interface Props { session: Session; channel: string; target?: string | undefined; onjump: (id: string) => void }
  let { session, channel, target, onjump }: Props = $props();
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const server = $derived(info?.kind === 'text' ? info.server : undefined);
  setMarkdownContext(() => ({ store, server }));

  const win = $derived(store.windows.get(channel));
  const messages = $derived((win?.ids ?? []).map((id) => store.messages.get(id)).filter((x): x is Message => !!x));

  // What this account may do with messages here (m2a-plan.md task 3).
  const perms = $derived(info ? permissionsIn(store, info) : 0n);
  let selected = $state<string | null>(null);
  let confirming = $state<Message | null>(null);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toasts.show(m.actions.copied, 'info');
    } catch {
      // Clipboard blocked: nothing to do.
    }
  }
  const linkTo = (msg: Message) => location.origin + (info?.kind === 'text'
    ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: info.server, channel, message: msg.id })
    : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel, message: msg.id }));
  const reactWith = (msg: Message, key: string) => void session.backend.reactionEmoji().then((form) => {
    const current = store.messages.get(msg.id);
    const emoji = form(key);
    if (!current || !emoji) return;
    // Stoat's spelling, or the key already on the message, so ❤ and ❤️ count as one (m2a-plan.md, checked live).
    actions.toggleReaction(current, reactionKey(Object.keys(current.reactions), emoji));
  });
  // The context menu's quick reactions: the most used, then Discord's usual four (m4.5-plan.md task 2).
  const DEFAULT_QUICK = ['👍', '❤️', '😂', '😮'];
  const CUSTOM = new RegExp(`^${ULID_PATTERN}$`);
  const quick = $derived.by((): QuickEmoji[] => {
    const used = Object.entries(store.emojiPrefs.usage).sort((a, b) => b[1] - a[1]).map(([k]) => k)
      .filter((k) => !CUSTOM.test(k) || store.emojis.has(k));
    return [...new Set([...used, ...DEFAULT_QUICK])].slice(0, 4).map((key) => CUSTOM.test(key)
      ? { key, label: `:${store.emojis.get(key)!.name}:`, image: customEmojiUrl(key) }
      : { key, label: key, image: twemojiUrl(key) });
  });
  // One message at a time is reached by Tab: the last one focused, else the newest. Up and Down move between them.
  let focusId = $state<string | null>(null);
  function rove(e: KeyboardEvent) {
    const el = e.target as HTMLElement;
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !el.matches('article.message')) return;
    const all = [...(scroller?.querySelectorAll<HTMLElement>('article.message') ?? [])];
    const next = all[all.indexOf(el) + (e.key === 'ArrowUp' ? -1 : 1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
  function focused(e: FocusEvent) {
    const id = (e.target as HTMLElement).closest<HTMLElement>('article.message')?.dataset.id;
    if (id) focusId = id;
  }
  const remove = (msg: Message) => void session.deleteMessage(channel, msg.id).catch(() => toasts.show(m.actions.deleteFailed));
  const actions: MessageActions = $derived({
    send: has(perms, Permission.SendMessage),
    manage: has(perms, Permission.ManageMessages),
    react: has(perms, Permission.React),
    toggleReaction: (msg, emoji) => void session.react(channel, msg.id, emoji)
      .catch((e: unknown) => toasts.show(e instanceof Error && e.message === 'reaction limit' ? m.emoji.reactionLimit : m.emoji.reactFailed)),
    // The picker counts its own use for "frequently used"; the menu's quick reactions count here.
    pickReaction: (msg, anchor) => picker.open(anchor, 'react', (e) => reactWith(msg, e.value)),
    quickReact: (msg, key) => { session.useEmoji(key); reactWith(msg, key); },

    reply: (msg) => { compose.reply(channel, msg.id); compose.focus(); },
    edit: (msg) => { compose.editing = msg.id; },
    saveEdit: (msg, text) => {
      compose.editing = null;
      compose.focus();
      // Saving an empty edit offers to delete, as on Discord.
      if (!text) { confirming = msg; return; }
      void session.editMessage(channel, msg.id, text).catch(() => toasts.show(m.actions.editFailed));
    },
    cancelEdit: () => { compose.editing = null; compose.focus(); },
    delete: (msg, skip) => { if (skip) remove(msg); else confirming = msg; },
    pin: (msg) => void session.pinMessage(channel, msg.id, !msg.pinned).catch(() => toasts.show(m.actions.pinFailed)),
    copyLink: (msg) => void copy(linkTo(msg)),
    copyId: (msg) => void copy(msg.id),
    select: (id) => (selected = id),
    markUnread: (msg) => {
      const ids = win?.ids ?? [];
      const i = ids.indexOf(msg.id);
      const before = i > 0 ? ids[i - 1] : undefined;
      session.markUnread(channel, before);
      unreadFrom = before ?? '0';
    },
    copyText: (msg) => void copy(msg.content ?? ''),
    openUrl: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
    copyUrl: (url) => void copy(url),
    copyImage: (src) => void copyImage(src).then(() => toasts.show(m.actions.copied, 'info'), () => toasts.show(m.actions.copyImageFailed)),
    saveImage: (src, name) => void saveImage(src, name).catch(() => toasts.show(m.actions.saveImageFailed)),
  });

  // Messages sent from here and not yet confirmed, shown after the newest message (client.md section 4.3).
  const pending = $derived(win?.atNewest ? store.pendingIn(channel) : []);
  const asMessage = (p: PendingMessage): Message => ({
    id: p.key, channel: p.channel, author: store.selfId ?? '', content: p.content, attachments: [], embeds: [],
    mentions: [], roleMentions: [], replies: p.replies.map((r) => r.id), reactions: {}, pinned: false,
  });

  // The "new messages" line sits after the last acknowledged message as it was when the channel opened,
  // once the connection is up. Reading the channel afterwards doesn't move or remove it.
  let unreadFrom = $state<string | undefined>(undefined);
  let dividerFor: string | null = null;
  $effect.pre(() => {
    const c = channel;
    const ready = store.connection === 'ready';
    untrack(() => {
      if (dividerFor === c) return;
      unreadFrom = undefined;
      if (!ready) return;
      dividerFor = c;
      unreadFrom = store.isUnread(c) ? (store.unreads.get(c)?.lastId ?? '0') : undefined;
    });
  });

  /** A run of consecutive messages from blocked users, collapsed until shown (m2b-plan.md decision 5). */
  interface BlockedRun { first: string; count: number; ids: string[] }
  interface Row { key: string; message: Message; pending?: PendingMessage; continuation: boolean; day: Date | null; unread: boolean; blocked?: BlockedRun }
  const shownBlocked = new SvelteSet<string>();
  /** Shown when opened, or when a jump or a search hit lands on one of its messages. */
  const runOpen = (run: BlockedRun) => shownBlocked.has(run.first) || (!!target && run.ids.includes(target)) || (!!highlighted && run.ids.includes(highlighted));
  const isBlocked = (msg: Message) => !msg.system && store.users.get(msg.author)?.relationship === 'Blocked';
  const rows = $derived.by(() => {
    const out: Row[] = [];
    let prev: Message | undefined;
    let unreadShown = false;
    const all: { message: Message; pending?: PendingMessage }[] = [...messages.map((message) => ({ message })), ...pending.map((p) => ({ message: asMessage(p), pending: p }))];
    for (const { message: msg, pending: p } of all) {
      const t = ulidTime(msg.id);
      const pt = prev ? ulidTime(prev.id) : null;
      const day = !pt || !sameDay(pt, t) ? t : null;
      const unread = !unreadShown && !!unreadFrom && msg.id > unreadFrom && msg.author !== store.selfId;
      if (unread) unreadShown = true;
      const continuation = !!prev && !day && !unread && !msg.system && !prev.system && !msg.replies.length
        && prev.author === msg.author && (prev.masquerade?.name ?? '') === (msg.masquerade?.name ?? '')
        && t.getTime() - pt!.getTime() < 7 * 60_000;
      // A confirmed message keeps its pending row's key, so the swap doesn't remount or move anything.
      const key = p ? p.key : msg.nonce && store.ownNonces.has(msg.nonce) ? msg.nonce : msg.id;
      out.push({ key, message: msg, ...(p ? { pending: p } : {}), continuation, day, unread });
      prev = msg;
    }
    // Group blocked authors' messages into runs, which share one object so the first row can count it.
    let run: BlockedRun | null = null;
    for (const row of out) {
      if (!isBlocked(row.message)) { run = null; continue; }
      if (!run || row.day || row.unread) run = { first: row.message.id, count: 0, ids: [] };
      run.count++;
      run.ids.push(row.message.id);
      row.blocked = run;
    }
    return out;
  });

  let scroller = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLDivElement | null>(null);
  let stuck = $state(true);
  let anchor: { id: string; top: number } | null = null;
  let highlighted = $state<string | null>(null);
  let loadingOlder = false;
  let loadingNewer = false;

  function measureAnchor() {
    if (!scroller || !content) return;
    const top = scroller.getBoundingClientRect().top;
    for (const el of content.querySelectorAll<HTMLElement>('[data-id]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > top) { anchor = { id: el.dataset.id!, top: r.top - top }; return; }
    }
    anchor = null;
  }

  function restore() {
    if (!scroller || !content) return;
    if (stuck && win?.atNewest) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    if (!anchor) return;
    const el = content.querySelector<HTMLElement>(`[data-id="${anchor.id}"]`);
    if (!el) return;
    const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
  }

  function onscroll() {
    if (!scroller) return;
    stuck = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 8;
    measureAnchor();
    if (scroller.scrollTop < 800) void older();
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 800) void newer();
  }

  async function older() {
    if (loadingOlder || !win || win.atOldest) return;
    loadingOlder = true;
    measureAnchor();
    try {
      await session.loadOlder(channel);
      await tick();
      restore();
    } finally {
      loadingOlder = false;
    }
  }

  async function newer() {
    if (loadingNewer || !win || win.atNewest) return;
    loadingNewer = true;
    measureAnchor();
    try {
      await session.loadNewer(channel);
      await tick();
      restore();
    } finally {
      loadingNewer = false;
    }
  }

  async function present() {
    stuck = true;
    if (!win?.atNewest) await session.jumpToPresent(channel);
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  // Sending takes the list to the present, as the session takes the window there (m2a-plan.md task 2).
  $effect(() => {
    if (!compose.presentRequest) return;
    untrack(() => {
      stuck = true;
      void tick().then(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; });
    });
  });


  // Opening a channel starts at the bottom; a jump starts at the target, centred and briefly highlighted.
  // Each target is scrolled to once: later messages, edits and reactions must not pull the view back.
  let scrolledTo: string | null = null;
  $effect(() => {
    void channel;
    stuck = !target;
    anchor = null;
    scrolledTo = null;
  });
  $effect(() => {
    if (!target || !content || target === scrolledTo || !messages.some((x) => x.id === target)) return;
    scrolledTo = target;
    void tick().then(() => {
      const el = content?.querySelector<HTMLElement>(`[data-id="${target}"]`);
      if (!el || !scroller) return;
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight / 3;
      highlighted = target;
      stuck = false;
      measureAnchor();
    });
  });

  // Declared after the jump effects, so a channel switch sets `stuck` for the new channel before this runs.
  // Read when the newest message is in view in a visible, focused window (m2a-plan.md decision 5).
  let active = $state(typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus());
  $effect(() => {
    const update = () => (active = document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  });
  $effect(() => {
    if (active && stuck && win?.atNewest && store.connection === 'ready' && store.isUnread(channel) && !session.heldUnread.has(channel)) session.markRead(channel);
  });
  // "Mark unread" holds while the channel stays open; leaving it lets the next visit read it.
  $effect(() => {
    const c = channel;
    return () => session.releaseUnread(c);
  });

  // Any change in content height (new messages, images, late embeds) keeps the view where it was.
  $effect(() => {
    if (!content) return;
    const ro = new ResizeObserver(() => restore());
    ro.observe(content);
    return () => ro.disconnect();
  });
  $effect(() => {
    void rows.length;
    void tick().then(restore);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="scroller" bind:this={scroller} {onscroll} onkeydown={rove} onfocusin={focused} role="log" aria-live={stuck ? 'polite' : 'off'} aria-label={m.conversation.messages} tabindex="-1">
  <div class="content" bind:this={content}>
    {#if win?.atOldest}
      <div class="start">
        <h2>{info?.kind === 'group' ? m.conversation.welcomeGroup(info.name) : m.conversation.welcome(info?.kind === 'text' ? info.name : '')}</h2>
        <p>{m.conversation.start}</p>
      </div>
    {:else if win}
      <div class="loading" aria-hidden="true">{m.app.loading}</div>
    {/if}
    {#each rows as row (row.key)}
      {#if row.day}
        <div class="divider day" role="separator"><span>{dayLabel(row.day)}</span></div>
      {/if}
      {#if row.unread}
        <div class="divider new" role="separator"><span>{m.conversation.newMessages}</span></div>
      {/if}
      {#if row.blocked?.first === row.message.id}
        {@const open = runOpen(row.blocked)}
        {@const first = row.blocked.first}
        <div class="blocked-run" data-id={first}>
          <span>{m.conversation.blockedRun(row.blocked.count)}</span>
          <button onclick={() => (open ? shownBlocked.delete(first) : shownBlocked.add(first))} aria-expanded={open}>{open ? m.conversation.hideBlocked : m.conversation.showBlocked}</button>
        </div>
      {/if}
      {#if !row.blocked || runOpen(row.blocked)}
        <MessageItem message={row.message} pending={row.pending} {store} {server} continuation={row.continuation && row.blocked?.first !== row.message.id} highlighted={highlighted === row.message.id} {onjump}
          onretry={(key) => void session.retry(key)} ondiscard={(key) => session.discard(key)}
          actions={row.pending || row.message.system ? undefined : actions} editing={compose.editing === row.message.id} selected={selected === row.message.id}
          {quick} tabbable={row.message.id === (focusId && messages.some((x) => x.id === focusId) ? focusId : messages.at(-1)?.id)} />
      {/if}
    {/each}
    <div class="end"></div>
  </div>
</div>
<DeleteDialog message={confirming} author={confirming ? store.displayName(confirming.author, server) : ''}
  onconfirm={() => { const msg = confirming; confirming = null; if (msg) remove(msg); }} oncancel={() => (confirming = null)} />
{#if win && (!win.atNewest || !stuck)}
  <button class="present" onclick={present}>{m.conversation.jumpToPresent}<ArrowDown size={16} /></button>
{/if}

<style>
  .scroller { flex: 1; min-height: 0; overflow-y: auto; overflow-anchor: none; }
  .content { display: flex; flex-direction: column; min-height: 100%; justify-content: flex-end; padding-bottom: var(--space-7); }
  .start { padding: var(--space-8) var(--space-5) var(--space-5); }
  .start h2 { margin: 0 0 var(--space-2); color: var(--text-strong); font: 700 var(--text-xl) var(--font-sans); }
  .start p { margin: 0; color: var(--text-secondary); }
  .loading { padding: var(--space-6); text-align: center; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .divider { display: flex; align-items: center; margin: var(--space-6) var(--space-5) 0; height: 0; border-top: 1px solid var(--border-default); }
  .divider span { margin: 0 auto; padding: 0 var(--space-2); background: var(--surface-0); color: var(--text-secondary); font: 500 var(--text-xs) var(--font-sans); translate: 0 -50%; }
  .divider.new { border-color: var(--danger); }
  .divider.new span { margin: 0 0 0 auto; color: var(--danger); background: var(--surface-0); font-weight: 700; }
  .end { height: 1px; }
  .blocked-run {
    display: flex; align-items: center; gap: var(--space-3); margin: var(--space-4) var(--space-5) 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); background: var(--surface-2); color: var(--text-secondary); font: var(--text-sm) var(--font-sans);
  }
  .blocked-run button { padding: 0; border: 0; background: none; color: var(--link); font: 500 var(--text-sm) var(--font-sans); }
  @media (hover: hover) { .blocked-run button:hover { text-decoration: underline; } }
  .present {
    position: absolute; left: 50%; bottom: calc(var(--composer-h) + var(--space-8)); translate: -50% 0; z-index: 5;
    display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-5);
    border: 1px solid var(--border-default); border-radius: var(--radius-full); background: var(--surface-4);
    color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); box-shadow: var(--shadow-popover);
  }
</style>
