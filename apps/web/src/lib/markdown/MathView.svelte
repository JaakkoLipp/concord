<script lang="ts">
  /** Math, rendered lazily with KaTeX (client.md section 2), through the whitelisting tree renderer. */
  import SafeTree, { toSafe, type SafeNode } from './SafeTree.svelte';

  let { tex, display = false }: { tex: string; display?: boolean } = $props();
  let tree = $state<SafeNode[] | null>(null);

  $effect(() => {
    let cancelled = false;
    void Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([katex]) => {
      if (cancelled) return;
      const html = katex.default.renderToString(tex, { throwOnError: false, displayMode: display, output: 'htmlAndMathml', trust: false, maxSize: 20, maxExpand: 200 });
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      tree = [...doc.body.firstChild!.childNodes].map(toSafe).filter((n): n is SafeNode => !!n);
    });
    return () => { cancelled = true; };
  });
</script>

{#if display}
  <div class="math display">{#if tree}<SafeTree nodes={tree} />{:else}<code>{tex}</code>{/if}</div>
{:else}
  <span class="math">{#if tree}<SafeTree nodes={tree} />{:else}<code>{tex}</code>{/if}</span>
{/if}

<style>
  .display { margin: var(--space-3) 0; overflow-x: auto; }
</style>
