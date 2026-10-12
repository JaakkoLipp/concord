/**
 * client.md section 12: no user-visible string literals in components. Text in markup, and the text of
 * aria-label, title, placeholder, alt and label attributes, must come from the message catalogue.
 * Usage: node tools/lint/no-literals.ts [dir ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';

const ROOT = join(import.meta.dirname, '..', '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web/src', 'packages/ui/src'];
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);
const LETTER = /\p{L}/u;

function* svelteFiles(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) yield* svelteFiles(path);
    else if (e.name.endsWith('.svelte')) yield path;
  }
}

interface Node { type: string; start: number; data?: string; name?: string; value?: unknown; [k: string]: unknown }

const problems: string[] = [];
for (const dir of dirs) {
  for (const file of svelteFiles(join(ROOT, dir))) {
    const source = readFileSync(file, 'utf8');
    const ast = parse(source, { modern: true });
    const line = (pos: number) => source.slice(0, pos).split('\n').length;
    const report = (pos: number, what: string) => problems.push(`${relative(ROOT, file)}:${line(pos)}: ${what}`);
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      const n = node as Node;
      if (n.type === 'Text' && typeof n.data === 'string' && LETTER.test(n.data)) report(n.start, `text "${n.data.trim().slice(0, 40)}"`);
      if (n.type === 'Attribute' || n.type === 'StyleDirective') {
        // Only attributes people read can hold user-visible text; class names and the like are not.
        const parts = Array.isArray(n.value) ? (n.value as Node[]) : [];
        for (const part of parts) {
          if (part.type === 'Text') {
            if (n.name && TEXT_ATTRIBUTES.has(n.name) && LETTER.test(part.data ?? '')) report(part.start, `${n.name}="${part.data}"`);
          } else visit(part);
        }
        if (!Array.isArray(n.value)) visit(n.value);
        return;
      }
      for (const [k, v] of Object.entries(n)) if (k !== 'parent' && typeof v === 'object') visit(v);
    };
    visit(ast.fragment);
  }
}
if (problems.length) {
  console.error(`String literals in components; move them to the message catalogue:\n${problems.join('\n')}`);
  process.exit(1);
}
