/**
 * client.md section 9, motion: only transform, opacity and colours animate, and timings come from tokens.
 * Checks transition and animation declarations and @keyframes in .svelte, .css and .ts files. tokens.css,
 * which defines the timings, is the one file allowed raw durations and curves.
 * Usage: node tools/lint/motion.ts [dir ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web/src', 'packages/ui/src'];
/** What may move. clip-path is the level meter's and the rail pill's. */
const ALLOWED = new Set([
  'opacity', 'transform', 'translate', 'scale', 'rotate',
  'color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke', 'clip-path',
]);
const COLOURS = new Set(['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke']);
const EASINGS = /\b(ease|ease-in|ease-out|ease-in-out|step-start|step-end)\b|steps\(/;
const DURATION = /(^|[\s(*/,+-])(\d*\.?\d+)(ms|s)\b/g;

function* files(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) yield* files(path);
    else if (/\.(svelte|css|ts)$/.test(e.name) && !/\.test\.ts$/.test(e.name) && e.name !== 'tokens.css') yield path;
  }
}

/** Splits on commas outside parentheses. */
function items(value: string): string[] {
  const out: string[] = [];
  let depth = 0, from = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) { out.push(value.slice(from, i)); from = i + 1; }
  }
  out.push(value.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A component's <style> and <script> blocks, with everything else blanked so offsets and line numbers hold. */
function onlyCode(source: string): string {
  let out = source.replace(/[^\n]/g, ' ');
  for (const m of source.matchAll(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/g)) {
    out = out.slice(0, m.index) + m[0] + out.slice(m.index + m[0].length);
  }
  return out;
}

/** A value with its var() references removed, so token names don't read as keywords. */
const bare = (value: string) => value.replace(/var\(--[\w-]+\)/g, 'VAR');

const problems: string[] = [];
for (const dir of dirs) {
  for (const file of files(join(ROOT, dir))) {
    const raw = readFileSync(file, 'utf8');
    // In components, only <style> and <script>: markup's transition: and in: directives are Svelte's, not CSS.
    const source = file.endsWith('.svelte') ? onlyCode(raw) : raw;
    const line = (pos: number) => source.slice(0, pos).split('\n').length;
    const report = (pos: number, what: string) => problems.push(`${relative(ROOT, file)}:${line(pos)}: ${what}`);

    if (/cubic-bezier\(/.test(source)) report(source.indexOf('cubic-bezier('), 'cubic-bezier outside tokens.css: use --ease-out or --ease-in-out');

    // transition: …; animation: …; and their longhands. In scripts, the strings that hold transitions instead.
    const script = file.endsWith('.ts');
    const decls = script
      ? [...source.matchAll(/'([^'\n]*var\(--(?:dur|ease)-[^'\n]*)'/g)].map((m) => ({ index: m.index, kind: 'transition', longhand: '', value: m[1]! }))
      : [...source.matchAll(/\b(transition|animation)(-[a-z-]+)?\s*:\s*([^;}\n]+)/g)].map((m) => ({ index: m.index, kind: m[1]!, longhand: m[2] ?? '', value: m[3]! }));
    for (const m of decls) {
      const { kind, longhand, value } = m;
      const v = bare(value);
      for (const d of v.matchAll(DURATION)) {
        if (Number(d[2]) !== 0) report(m.index, `raw duration ${d[2]}${d[3]} in ${kind}${longhand}: use a --dur- token`);
      }
      if (EASINGS.test(v)) report(m.index, `easing keyword in ${kind}${longhand}: use --ease-out or --ease-in-out`);
      if (kind === 'transition' && (longhand === '' || longhand === '-property')) {
        for (const item of items(v)) {
          const prop = item.split(/\s+/)[0]!;
          if (prop === 'none' || prop === 'VAR' || /^calc\(/.test(prop)) continue;
          if (COLOURS.has(prop) && !allowedToggleTrack(file, source, m.index, prop)) report(m.index, `colour transition of ${prop}: only toggle tracks may fade`);
          if (!ALLOWED.has(prop) && !allowedSettingsNavRows(file, source, m.index, prop)) report(m.index, `transition of ${prop}: only transform, opacity and colours animate`);
        }
      }
    }

    // Properties inside @keyframes.
    for (const k of source.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
      let depth = 1, i = k.index + k[0].length;
      while (depth && i < source.length) { if (source[i] === '{') depth++; else if (source[i] === '}') depth--; i++; }
      const body = source.slice(k.index + k[0].length, i - 1);
      for (const p of body.matchAll(/([a-z-]+)\s*:/g)) {
        if (!ALLOWED.has(p[1]!)) report(k.index, `@keyframes animates ${p[1]}: only transform, opacity and colours animate`);
      }
    }
  }
}

/** The one toggle's track may change colour with state (Toggle.svelte). Keep this exception separate from hover and speaking rings. */
function allowedToggleTrack(file: string, source: string, index: number, prop: string): boolean {
  if (prop !== 'background-color') return false;
  const path = relative(ROOT, file);
  if (path !== 'packages/ui/src/Toggle.svelte') return false;
  const open = source.lastIndexOf('{', index);
  const start = Math.max(source.lastIndexOf('}', open - 1), source.lastIndexOf('{', open - 1));
  return source.slice(start + 1, open).trim() === '.track';
}

/** The settings accordion alone may animate its grid rows. Keep the exemption tied to the file and selector. */
function allowedSettingsNavRows(file: string, source: string, index: number, prop: string): boolean {
  if (prop !== 'grid-template-rows' || relative(ROOT, file) !== 'apps/web/src/lib/settings/SettingsFrame.svelte') return false;
  const open = source.lastIndexOf('{', index);
  const close = source.lastIndexOf('}', index);
  const start = Math.max(close, source.lastIndexOf('{', open - 1));
  return open > close && source.slice(start + 1, open).trim() === '.subnav';
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`motion: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('motion: ok');
