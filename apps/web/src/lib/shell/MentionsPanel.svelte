<script lang="ts">
  import { Dialog, Button } from '@concord/ui';
  import type { Message, Session } from '@concord/domain';
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onDestroy } from 'svelte';
  import { m } from '$lib/i18n/index.ts';
  import { shell } from '$lib/view/shell.svelte.ts';
  import { canView, channelName } from '$lib/view/channels.ts';
  import { notificationBody } from '$lib/notify/text.ts';
  import { shortDate, ulidTime } from '$lib/markdown/time.ts';

  let { session }: { session: Session } = $props();
  const store = $derived(session.store);
  const bodies = new SvelteMap<string, Message>();
  const pending = new SvelteSet<string>();
  const failed = new SvelteSet<string>();
  let limit = $state(50);

  const unread = $derived([...store.unreads.values()].flatMap((unread) => {
    const channel = store.channels.get(unread.channel);
    return channel && canView(store, channel)
      ? unread.mentions.filter((id) => !store.deleted.has(id)).map((id) => ({ id, channel })) : [];
  }).sort((a, b) => b.id.localeCompare(a.id)));
  const shown = $derived(unread.slice(0, limit));

  $effect(() => {
    const wanted = new Set(unread.map((row) => row.id));
    for (const id of bodies.keys()) if (!wanted.has(id)) bodies.delete(id);
    for (const id of failed) if (!wanted.has(id)) failed.delete(id);
  });
  $effect(() => {
    if (shell.mentions) {
      limit = 50;
      failed.clear();
    }
  });
  $effect(() => {
    if (!shell.mentions) return;
    for (const row of shown) {
      if (bodies.has(row.id) || pending.has(row.id) || failed.has(row.id)) continue;
      pending.add(row.id);
      void session.loadMention(row.channel.id, row.id)
        .then((message) => bodies.set(row.id, message), () => failed.add(row.id))
        .finally(() => pending.delete(row.id));
    }
  });
  onDestroy(() => { shell.mentions = false; });

  function jump(channel: string, id: string) {
    const c = store.channels.get(channel);
    if (!c) return;
    shell.mentions = false;
    void goto(c.kind === 'text'
      ? resolve('/(app)/app/channels/[server]/[channel]/[[message]]', { server: c.server, channel, message: id })
      : resolve('/(app)/app/channels/@me/[channel]/[[message]]', { channel, message: id }));
  }
</script>

<Dialog open={shell.mentions} still={shell.mentionsStill} title={m.mentions.title} onclose={() => (shell.mentions = false)} width="40rem">
  <div class="mentions-list">
    {#each shown as row (row.id)}
      {@const msg = store.messages.get(row.id) ?? bodies.get(row.id)}
      {@const server = row.channel.kind === 'text' ? row.channel.server : undefined}
      <article class="mention" data-id={row.id}>
        <div class="head">
          <strong>{server ? m.mentions.location(store.servers.get(server)?.name ?? '', channelName(store, row.channel)) : channelName(store, row.channel)}</strong>
          <time datetime={ulidTime(row.id).toISOString()}>{shortDate(ulidTime(row.id))}</time>
        </div>
        {#if msg}
          <span class="author">{store.displayName(msg.author, server)}</span>
          <p>{notificationBody(store, msg)}</p>
        {:else}
          <p>{failed.has(row.id) ? m.mentions.unavailable : m.app.loading}</p>
        {/if}
        <Button size="sm" variant="secondary" onclick={() => jump(row.channel.id, row.id)} disabled={failed.has(row.id)}>{m.find.jump}</Button>
      </article>
    {:else}
      <p class="empty">{m.mentions.empty}</p>
    {/each}
    {#if unread.length > limit}<Button variant="secondary" onclick={() => (limit += 50)}>{m.mentions.more}</Button>{/if}
  </div>
  {#snippet actions()}<Button variant="secondary" onclick={() => (shell.mentions = false)}>{m.mentions.close}</Button>{/snippet}
</Dialog>

<style>
  .mentions-list { display: flex; flex-direction: column; gap: var(--space-4); max-height: 60vh; overflow-y: auto; }
  .mention { padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-0); }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
  strong { color: var(--text-strong); font: 700 var(--text-sm) var(--font-sans); }
  time { color: var(--text-secondary); font: var(--text-xs) var(--font-sans); }
  .author { color: var(--text-strong); font-weight: 500; }
  .mention p { margin: var(--space-2) 0 var(--space-4); overflow-wrap: anywhere; color: var(--text-normal); }
  .empty { color: var(--text-secondary); }
</style>
