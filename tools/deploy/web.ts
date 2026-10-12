/**
 * `pnpm deploy:web`: build apps/web and run it on the VPS as concord-web, served by Caddy at /app.
 *
 * Old hashed assets are kept, so a browser still holding the previous version can load its lazy chunks.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = join(ROOT, 'apps', 'web');
const SSH = process.env.CONCORD_SSH ?? 'jaakko@concord.jaalip.com';
const REMOTE = 'stoat/concord/web';
const run = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run(process.execPath, [join(ROOT, 'tools', 'assets', 'twemoji.ts')]);
run(join(WEB, 'node_modules', '.bin', 'vite'), ['build'], WEB);
// adapter-node emits ES modules; Node needs this to read them as such.
writeFileSync(join(WEB, 'build', 'package.json'), '{"type":"module"}\n');
run('ssh', [SSH, `mkdir -p ~/${REMOTE}`]);
run('rsync', ['-a', `${WEB}/build`, `${SSH}:${REMOTE}/`]);
run('ssh', [SSH, 'cd ~/stoat && concord/dc up -d concord-web && concord/dc restart concord-web']);
// Wait for the restarted server, so whatever runs next doesn't meet Caddy's 502.
for (let i = 0; i < 60; i++) {
  const ok = await fetch('https://concord.jaalip.com/app').then((r) => r.ok, () => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('deployed to https://concord.jaalip.com/app');
