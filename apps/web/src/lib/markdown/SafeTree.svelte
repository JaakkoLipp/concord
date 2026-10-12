<script lang="ts" module>
  /**
   * Renders a DOM tree produced by a trusted library (highlight.js, KaTeX) as Svelte elements, keeping only
   * whitelisted tags and attributes. Text stays text. Nothing is ever assigned to innerHTML.
   */
  export interface SafeNode { tag?: string; attrs?: Record<string, string>; text?: string; children?: SafeNode[]; ns?: string }

  const TAGS = new Set([
    'span', 'div', 'br', 'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mtext',
    'annotation', 'mspace', 'mtable', 'mtr', 'mtd', 'mover', 'munder', 'munderover', 'mpadded', 'mstyle', 'menclose', 'svg', 'path', 'line', 'g',
  ]);
  const ATTRS = new Set([
    'class', 'style', 'aria-hidden', 'encoding', 'viewBox', 'width', 'height', 'd', 'preserveAspectRatio', 'mathvariant', 'stretchy', 'fence',
    'separator', 'lspace', 'rspace', 'accent', 'accentunder', 'display', 'columnalign', 'rowspacing', 'columnspacing', 'scriptlevel',
    'displaystyle', 'x1', 'x2', 'y1', 'y2', 'stroke-width', 'notation', 'minsize', 'maxsize', 'linethickness', 'depth', 'voffset',
  ]);

  export function toSafe(node: Node): SafeNode | null {
    if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.localName;
    const children = [...el.childNodes].map(toSafe).filter((n): n is SafeNode => !!n);
    if (!TAGS.has(tag)) return { children };
    const attrs: Record<string, string> = {};
    for (const a of el.attributes) if (ATTRS.has(a.name) && !/url\s*\(|expression/i.test(a.value)) attrs[a.name] = a.value;
    return { tag, attrs, children, ...(el.namespaceURI && el.namespaceURI !== 'http://www.w3.org/1999/xhtml' ? { ns: el.namespaceURI } : {}) };
  }
</script>

<script lang="ts">
  import Self from './SafeTree.svelte';
  let { nodes }: { nodes: SafeNode[] } = $props();
</script>

{#each nodes as n, i (i)}
  {#if n.text !== undefined}{n.text}{:else if n.tag}<svelte:element this={n.tag} xmlns={n.ns} {...n.attrs}>{#if n.children}<Self nodes={n.children} />{/if}</svelte:element>{:else if n.children}<Self nodes={n.children} />{/if}
{/each}
