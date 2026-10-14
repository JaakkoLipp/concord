/**
 * Personal mail addresses never go into the repo (Jaakko's admin address and testers' addresses stay on the
 * server). Fails on any address at a consumer mail provider in a tracked file. Fixture and persona addresses use
 * domains of our own, which this doesn't match.
 * Usage: node tools/lint/no-personal-email.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const PERSONAL = /[\w.%+-]+@(?:gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|me|proton|protonmail|pm)\.[a-z]{2,}/gi;
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|zip|gz|br)$/i;

const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter((f) => f && !BINARY.test(f));
const found: string[] = [];
for (const file of files) {
  let text: string;
  try {
    text = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  for (const [n, line] of text.split('\n').entries()) {
    // Report where, never the address itself, so CI logs don't repeat it.
    if (line.match(PERSONAL)) found.push(`${file}:${n + 1}`);
  }
}
if (found.length) {
  console.error(`personal mail address in ${found.length} place(s):\n${found.join('\n')}`);
  process.exit(1);
}
console.log(`no personal mail addresses in ${files.length} files`);
