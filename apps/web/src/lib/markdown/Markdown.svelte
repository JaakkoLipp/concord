<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import Inline from './Inline.svelte';
  import MathView from './MathView.svelte';
  import Self from './Markdown.svelte';
  import { onlyEmoji, parse, type Block } from './parse.ts';

  let { source, blocks: given }: { source?: string; blocks?: Block[] } = $props();
  const blocks = $derived(given ?? parse(source ?? ''));
  const big = $derived(!given && onlyEmoji(blocks));
</script>

{#each blocks as b, i (i)}
  {#if b.t === 'p'}
    <p><Inline nodes={b.c} {big} /></p>
  {:else if b.t === 'h'}
    <svelte:element this={`h${Math.min(b.level, 3)}`} class="heading"><Inline nodes={b.c} /></svelte:element>
  {:else if b.t === 'quote'}
    <blockquote><Self blocks={b.c} /></blockquote>
  {:else if b.t === 'list'}
    {#if b.ordered}
      <ol start={b.start}>{#each b.items as item, j (j)}<li><Self blocks={item} /></li>{/each}</ol>
    {:else}
      <ul>{#each b.items as item, j (j)}<li><Self blocks={item} /></li>{/each}</ul>
    {/if}
  {:else if b.t === 'code'}
    <CodeBlock lang={b.lang} code={b.v} />
  {:else if b.t === 'table'}
    <div class="table-wrap">
      <table>
        <thead><tr>{#each b.head as cell, j (j)}<th style:text-align={b.align[j] ?? undefined}><Inline nodes={cell} /></th>{/each}</tr></thead>
        <tbody>{#each b.rows as row, r (r)}<tr>{#each row as cell, j (j)}<td style:text-align={b.align[j] ?? undefined}><Inline nodes={cell} /></td>{/each}</tr>{/each}</tbody>
      </table>
    </div>
  {:else if b.t === 'hr'}
    <hr />
  {:else if b.t === 'math'}
    <MathView tex={b.v} display />
  {/if}
{/each}

<style>
  p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .heading { margin: var(--space-3) 0 var(--space-2); color: var(--text-strong); font-family: var(--font-sans); }
  h1.heading { font: 700 var(--text-xl) var(--font-sans); }
  h2.heading { font: 700 var(--text-lg) var(--font-sans); }
  h3.heading { font: 700 var(--text-md) var(--font-sans); }
  blockquote { margin: var(--space-2) 0; padding: 0 0 0 var(--space-4); border-left: 4px solid var(--border-control); border-radius: 2px; }
  ul, ol { margin: var(--space-2) 0; padding-left: var(--space-7); }
  li > :global(p) { white-space: pre-wrap; }
  .table-wrap { max-width: 100%; overflow-x: auto; margin: var(--space-2) 0; }
  table { border-collapse: collapse; font: var(--text-sm) var(--font-sans); }
  th, td { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); }
  th { background: var(--surface-2); color: var(--text-strong); font-weight: 700; }
  hr { border: 0; border-top: 1px solid var(--border-default); margin: var(--space-4) 0; }
</style>
