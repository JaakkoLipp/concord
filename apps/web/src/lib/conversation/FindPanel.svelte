<script lang="ts">
  /**
   * Pinned messages and per-channel search results (client.md section 6.5), in the side column. Results
   * read newer copies from the store, so edits show, and unpinned or deleted messages drop out while open.
   */
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { Message, Session } from '@concord/domain';
  import { Avatar, IconButton } from '@concord/ui';
  import X from '@lucide/svelte/icons/x';
  import Markdown from '$lib/markdown/Markdown.svelte';
  import { setMarkdownContext } from '$lib/markdown/context.ts';
  import { fullDate, shortDate, ulidTime } from '$lib/markdown/time.ts';
  import { m } from '$lib/i18n/index.ts';
  import { avatarUrl } from '$lib/view/users.ts';
  import { shell } from '$lib/view/shell.svelte.ts';

  const PAGE = 50;
  let { session, channel, mode, query }: { session: Session; channel: string; mode: 'pins' | 'search'; query: string } = $props();
  const store = $derived(session.store);
  const info = $derived(store.channels.get(channel));
  const server = $derived(info?.kind === 'text' ? info.server : undefined);
  setMarkdownContext(() => ({ store, server }));

  let found = $state<Message[]>([]);
  let status = $state<'loading' | 'done' | 'failed'>('loading');
  let more = $state(false);

  async function load(before?: string) {
    status = 'loading';
    try {
      const q = mode === 'pins' ? { pinned: true } : { query };
      const page = await session.search(channel, before ? { ...q, before } : q, PAGE);
      found = before ? [...found, ...page] : page;
      more = page.length === PAGE;
      status = 'done';
    } catch {
      status = 'failed';
    }
  }
  $effect(() => {
    void channel; void mode; void query;
    found = [];
    void load();
  });

  const shown = $derived(found
    .map((f) => store.messages.get(f.id) ?? f)
    .filter((msg) => !store.deleted.has(msg.id) && (mode !== 'pins' || msg.pinned)));

  function jump(id: string) {
    void goto(info?.kind === 'text'
      ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: info.server, channel, message: id })
      : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel, message: id }));
  }
</script>

<section class="find" aria-labelledby="find-title">
  <header>
    <h2 id="find-title">{mode === 'pins' ? m.find.pins : m.find.results(shown.length, more)}</h2>
    <IconButton size="sm" placement="bottom" label={m.find.close} onclick={() => (shell.find = null)}><X size={18} /></IconButton>
  </header>
  <div class="list">
    {#each shown as msg (msg.id)}
      {@const sent = ulidTime(msg.id)}
      <article class="result">
        <div class="head">
          <Avatar src={avatarUrl(store.users.get(msg.author) ?? { id: msg.author })} size={24} />
          <strong style:color={server ? store.roleColour(msg.author, server) : undefined}>{store.displayName(msg.author, server)}</strong>
          <time datetime={sent.toISOString()} title={fullDate(sent)}>{shortDate(sent)}</time>
          <button class="jump" onclick={() => jump(msg.id)}>{m.find.jump}</button>
        </div>
        {#if msg.content}<div class="content"><Markdown source={msg.content} /></div>{/if}
        {#if msg.attachments.length}<p class="files">{msg.attachments.map((a) => a.filename).join(', ')}</p>{/if}
      </article>
    {:else}
      {#if status === 'done'}<p class="empty">{mode === 'pins' ? m.find.noPins : m.find.noResults}</p>{/if}
    {/each}
    {#if status === 'loading'}<p class="empty">{m.find.searching}</p>{/if}
    {#if status === 'failed'}<p class="empty">{m.find.failed}</p>{/if}
    {#if status === 'done' && more}<button class="more" onclick={() => load(found.at(-1)?.id)}>{m.find.loadMore}</button>{/if}
  </div>
</section>

<style>
  .find { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--surface-1); }
  header { display: flex; align-items: center; justify-content: space-between; min-height: var(--header-h); padding: 0 var(--space-4); border-bottom: 1px solid var(--border-subtle); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-md) var(--font-sans); }
  .list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); }
  .result { position: relative; padding: var(--space-3) var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-0); }
  .head { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
  strong { color: var(--text-strong); font: 500 var(--text-sm) var(--font-sans); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  time { flex: none; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); white-space: nowrap; }
  .jump {
    margin-left: auto; flex: none; padding: var(--space-1) var(--space-3); border: 0; border-radius: var(--radius-xs);
    background: var(--surface-3); color: var(--text-normal); font: 500 var(--text-xs) var(--font-sans); cursor: pointer; opacity: 0;
  }
  .result:hover .jump, .jump:focus-visible { opacity: 1; }
  .content { margin-top: var(--space-2); color: var(--text-normal); font: var(--text-sm) var(--font-sans); line-height: 1.25rem; overflow-wrap: anywhere; }
  .files { margin: var(--space-2) 0 0; color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .empty { margin: var(--space-6) 0; text-align: center; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .more { align-self: center; padding: var(--space-2) var(--space-4); border: 0; border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-normal); font: 500 var(--text-sm) var(--font-sans); cursor: pointer; }
  @media (hover: none) { .jump { opacity: 1; } }
</style>
