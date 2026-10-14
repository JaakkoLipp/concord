/**
 * `pnpm verify`: everything CI checks, run with the workspace's own binaries so it works without a
 * pnpm on the PATH. Typecheck, lint, the no-literals and no-personal-email checks, unit and contract tests, svelte-check, build.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const WEB = join(ROOT, 'apps', 'web');
const bin = (dir: string, name: string) => join(dir, 'node_modules', '.bin', name);
const steps: [string, string, string[], string][] = [
  ['assets', process.execPath, ['tools/assets/twemoji.ts'], ROOT],
  // Generates apps/web/.svelte-kit, which the app's tsconfig and its tests extend.
  ['svelte sync', bin(WEB, 'svelte-kit'), ['sync'], WEB],
  ['typecheck', bin(ROOT, 'tsc'), ['-p', 'tsconfig.json', '--noEmit'], ROOT],
  ['lint', bin(ROOT, 'eslint'), ['.'], ROOT],
  ['no literals', process.execPath, ['tools/lint/no-literals.ts'], ROOT],
  ['no personal email', process.execPath, ['tools/lint/no-personal-email.ts'], ROOT],
  ['tests', bin(ROOT, 'vitest'), ['run'], ROOT],
  ['svelte-check', bin(WEB, 'svelte-check'), ['--tsconfig', './tsconfig.json', '--fail-on-warnings'], WEB],
  ['svelte-check ui', bin(WEB, 'svelte-check'), ['--workspace', join(ROOT, 'packages', 'ui'), '--tsconfig', join(ROOT, 'packages', 'ui', 'tsconfig.json'), '--fail-on-warnings'], WEB],
  ['build', bin(WEB, 'vite'), ['build', '--logLevel', 'warn'], WEB],
];
for (const [name, cmd, args, cwd] of steps) {
  console.log(`\n== ${name}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}
console.log('\nverify: all passed');
