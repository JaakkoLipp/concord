/**
 * `pnpm deploy:spike:dev`: build the M0 screen-share test page and copy it to the stack's concord/spike/, which Caddy
 * serves at /spike/ (docs/dev-environment.md section 7). M4's probes and voice checks join calls through it.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKEND, sameHost, stackPath } from '../target.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPIKE = join(ROOT, 'spikes', 'm0-screenshare');
const run = (cmd: string, args: string[], cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

sameHost();
run(join(SPIKE, 'node_modules', '.bin', 'vite'), ['build'], SPIKE);
run('rsync', ['-a', '--delete', `${SPIKE}/dist/`, `${stackPath('stoat/concord/spike')}/`]);
console.log(`deployed to ${BACKEND}/spike/`);
