<script lang="ts">
  /** Fenced code, highlighted lazily with highlight.js core and a short language list (client.md section 2). */
  import SafeTree, { toSafe, type SafeNode } from './SafeTree.svelte';

  let { lang, code }: { lang: string; code: string } = $props();
  let tree = $state<SafeNode[] | null>(null);

  const LANGS: Record<string, () => Promise<{ default: unknown }>> = {
    js: () => import('highlight.js/lib/languages/javascript'), javascript: () => import('highlight.js/lib/languages/javascript'),
    ts: () => import('highlight.js/lib/languages/typescript'), typescript: () => import('highlight.js/lib/languages/typescript'),
    rust: () => import('highlight.js/lib/languages/rust'), rs: () => import('highlight.js/lib/languages/rust'),
    py: () => import('highlight.js/lib/languages/python'), python: () => import('highlight.js/lib/languages/python'),
    sh: () => import('highlight.js/lib/languages/bash'), bash: () => import('highlight.js/lib/languages/bash'), shell: () => import('highlight.js/lib/languages/bash'),
    json: () => import('highlight.js/lib/languages/json'), css: () => import('highlight.js/lib/languages/css'),
    html: () => import('highlight.js/lib/languages/xml'), xml: () => import('highlight.js/lib/languages/xml'),
    go: () => import('highlight.js/lib/languages/go'), java: () => import('highlight.js/lib/languages/java'),
    c: () => import('highlight.js/lib/languages/c'), cpp: () => import('highlight.js/lib/languages/cpp'),
    cs: () => import('highlight.js/lib/languages/csharp'), csharp: () => import('highlight.js/lib/languages/csharp'),
    sql: () => import('highlight.js/lib/languages/sql'), yaml: () => import('highlight.js/lib/languages/yaml'), yml: () => import('highlight.js/lib/languages/yaml'),
    toml: () => import('highlight.js/lib/languages/ini'), ini: () => import('highlight.js/lib/languages/ini'),
    diff: () => import('highlight.js/lib/languages/diff'), md: () => import('highlight.js/lib/languages/markdown'), markdown: () => import('highlight.js/lib/languages/markdown'),
    lua: () => import('highlight.js/lib/languages/lua'), kotlin: () => import('highlight.js/lib/languages/kotlin'), swift: () => import('highlight.js/lib/languages/swift'),
  };

  $effect(() => {
    const load = LANGS[lang];
    if (!load) return;
    let cancelled = false;
    void Promise.all([import('highlight.js/lib/core'), load()]).then(([core, language]) => {
      if (cancelled) return;
      const hljs = core.default;
      if (!hljs.getLanguage(lang)) hljs.registerLanguage(lang, language.default as never);
      const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      // highlight.js escapes the code; the result is parsed, never inserted, and only class spans survive.
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      tree = [...doc.body.firstChild!.childNodes].map(toSafe).filter((n): n is SafeNode => !!n);
    });
    return () => { cancelled = true; };
  });
</script>

<pre class="code"><code>{#if tree}<SafeTree nodes={tree} />{:else}{code}{/if}</code></pre>

<style>
  .code {
    margin: var(--space-2) 0; padding: var(--space-4); max-width: 100%; overflow-x: auto;
    background: var(--surface-1); border: 1px solid var(--border-default); border-radius: var(--radius-md);
    font: 0.875rem/1.125rem ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace; white-space: pre;
  }
  /* A small highlight palette on our surfaces. */
  .code :global(.hljs-keyword), .code :global(.hljs-selector-tag), .code :global(.hljs-built_in) { color: #c792ea; }
  .code :global(.hljs-string), .code :global(.hljs-attr) { color: #a5d6a7; }
  .code :global(.hljs-number), .code :global(.hljs-literal) { color: #f5b942; }
  .code :global(.hljs-comment) { color: var(--text-muted); font-style: italic; }
  .code :global(.hljs-title), .code :global(.hljs-function) { color: #82aaff; }
  .code :global(.hljs-type), .code :global(.hljs-class) { color: #4fcbe3; }
  .code :global(.hljs-meta), .code :global(.hljs-symbol) { color: #f78c6c; }
  .code :global(.hljs-addition) { color: var(--status-online); }
  .code :global(.hljs-deletion) { color: var(--danger); }
</style>
