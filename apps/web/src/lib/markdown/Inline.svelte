<script lang="ts">
  import Self from './Inline.svelte';
  import MathView from './MathView.svelte';
  import { markdownContext } from './context.ts';
  import { customEmojiUrl, twemojiUrl } from './emoji.ts';
  import type { Inline } from './parse.ts';
  import { formatStyle, fullDate } from './time.ts';
  import { m } from '$lib/i18n/index.ts';

  let { nodes, big = false }: { nodes: Inline[]; big?: boolean } = $props();
  const ctx = $derived(markdownContext());
  let revealed = $state<Record<number, boolean>>({});
  let failedEmoji = $state<Record<string, boolean>>({});

  const channelName = (id: string) => { const c = ctx.store.channels.get(id); return c && (c.kind === 'text' || c.kind === 'group') ? c.name : null; };
  const role = (id: string) => (ctx.server ? ctx.store.servers.get(ctx.server)?.roles[id] : undefined);
  const emojiName = (id: string) => ctx.store.emojis.get(id)?.name ?? id;
</script>

{#each nodes as n, i (i)}
  {#if n.t === 'text'}{n.v}{:else if n.t === 'br'}<br />{:else if n.t === 'strong'}<strong><Self nodes={n.c} /></strong>{:else if n.t === 'em'}<em><Self nodes={n.c} /></em>{:else if n.t === 'strike'}<s><Self nodes={n.c} /></s>{:else if n.t === 'code'}<code class="inline-code">{n.v}</code>{:else if n.t === 'spoiler'}<button
      class="spoiler" class:revealed={revealed[i]} aria-expanded={!!revealed[i]} aria-label={revealed[i] ? undefined : m.markdown.spoiler}
      onclick={() => (revealed = { ...revealed, [i]: true })}><span aria-hidden={!revealed[i]}><Self nodes={n.c} /></span></button>{:else if n.t === 'link'}<a
      href={n.href} target="_blank" rel="noopener noreferrer"><Self nodes={n.c} /></a>{:else if n.t === 'user'}{@const name = ctx.store.users.has(n.id) ? ctx.store.displayName(n.id, ctx.server) : null}<span
      class="mention" class:self={n.id === ctx.store.selfId}>@{name ?? m.markdown.unknownUser}</span>{:else if n.t === 'role'}{@const r = role(n.id)}<span
      class="mention role" style:--role={r?.colour}>@{r?.name ?? m.markdown.unknownRole}</span>{:else if n.t === 'channel'}<span
      class="mention">#{channelName(n.id) ?? m.markdown.unknownChannel}</span>{:else if n.t === 'mass'}<span class="mention">@{n.v}</span>{:else if n.t === 'emoji'}<img
      class="emoji" class:big src={customEmojiUrl(n.id)} alt=":{emojiName(n.id)}:" title=":{emojiName(n.id)}:" draggable="false" loading="lazy" />{:else if n.t === 'unicode'}{#if failedEmoji[n.v]}{n.v}{:else}<img
      class="emoji" class:big src={twemojiUrl(n.v)} alt={n.v} draggable="false" loading="lazy" onerror={() => (failedEmoji = { ...failedEmoji, [n.v]: true })} />{/if}{:else if n.t === 'time'}{@const d = new Date(n.unix * 1000)}<time
      class="timestamp" datetime={d.toISOString()} title={fullDate(d)}>{formatStyle(d, n.style)}</time>{:else if n.t === 'math'}<MathView tex={n.v} />{/if}
{/each}

<style>
  .inline-code {
    padding: 0.1em 0.3em; border-radius: var(--radius-xs); background: var(--surface-4); color: var(--text-strong);
    font: 0.85em ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace;
  }
  .spoiler {
    padding: 0 2px; border: 0; border-radius: var(--radius-xs); background: var(--surface-6); color: transparent; font: inherit; cursor: pointer;
  }
  .spoiler > span { visibility: hidden; }
  .spoiler.revealed { background: var(--surface-4); color: inherit; cursor: text; }
  .spoiler.revealed > span { visibility: visible; }
  .mention {
    padding: 0 2px; border-radius: var(--radius-xs); background: var(--accent-subtle); color: var(--text-strong); font-weight: 500;
  }
  .mention.self { background: var(--accent); color: var(--on-accent); }
  .role[style*='--role'] { background: color-mix(in srgb, var(--role) 20%, transparent); color: var(--text-strong); }
  .emoji { display: inline-block; width: 1.375em; height: 1.375em; margin: 0 0.05em; vertical-align: -0.3em; object-fit: contain; }
  .emoji.big { width: 3rem; height: 3rem; }
  .timestamp { padding: 0 2px; border-radius: var(--radius-xs); background: var(--surface-4); }
  a { color: var(--link); word-break: break-word; }
</style>
