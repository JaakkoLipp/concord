/**
 * CSS colour literals live in tokens.css. This checks .css files and Svelte <style> blocks, so prose,
 * JavaScript data and markup such as a Stoat name#1234 are outside the rule.
 * Usage: node tools/lint/colours.ts [dir ...]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/web/src', 'packages/ui/src'];

function* files(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.endsWith('.css') || entry.name.endsWith('.svelte')) yield path;
  }
}

/** Keep only Svelte style blocks while retaining source offsets for useful diagnostics. */
function styleSource(source: string): string {
  let out = source.replace(/[^\n]/g, ' ');
  for (const match of source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g)) {
    const start = match.index! + match[0].indexOf('>') + 1;
    const end = match.index! + match[0].lastIndexOf('</style>');
    out = out.slice(0, start) + source.slice(start, end) + out.slice(end);
  }
  return out;
}

/** Comments and quoted strings are not CSS colour declarations. Preserve offsets and line breaks. */
function withoutCommentsAndStrings(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (part) => part.replace(/[^\n]/g, ' '));
}

const HEX = /(?<![\w#])#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})(?![\w-])/i;
const FUNCTION = /\b(?:rgba?|hsla?)\s*\(/i;
const problems: string[] = [];

for (const dir of dirs) {
  for (const file of files(join(ROOT, dir))) {
    if (file.endsWith('.css') && relative(ROOT, file) === 'packages/ui/src/tokens.css') continue;
    const raw = readFileSync(file, 'utf8');
    const css = withoutCommentsAndStrings(file.endsWith('.svelte') ? styleSource(raw) : raw);
    const line = (pos: number) => css.slice(0, pos).split('\n').length;

    // Only inspect declaration values: #123abc in a selector is an ID, not a colour value.
    for (const declaration of css.matchAll(/(?:^|[;{])\s*([-\w]+)\s*:\s*([^;{}]*)/gm)) {
      const valueOffset = declaration.index! + declaration[0].lastIndexOf(':') + 1;
      const property = declaration[1]!.toLowerCase();
      const value = declaration[2]!;
      const avatarMask = relative(ROOT, file) === 'packages/ui/src/Avatar.svelte' && property === 'mask';
      const matches = [...value.matchAll(new RegExp(HEX.source, 'gi')), ...value.matchAll(new RegExp(FUNCTION.source, 'gi'))];
      for (const match of matches) {
        // Avatar's black mask notch is structural data; its selector and property are both constrained.
        if (avatarMask && match[0].toLowerCase() === '#000') continue;
        const offset = valueOffset + match.index!;
        problems.push(`${relative(ROOT, file)}:${line(offset)}: colour literal ${match[0]} in CSS; use a token from packages/ui/src/tokens.css`);
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`colours: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('colours: ok');
