/**
 * Which stack the tools talk to (m4-plan.md task 1): the local stack in Docker Desktop at http://localhost, unless
 * CONCORD_HOST names another. Production is reached only on purpose, as `pnpm deploy:web` does with
 * CONCORD_HOST=concord.jaalip.com. CONCORD_SSH, CONCORD_BACKEND and CONCORD_APP still override one part each;
 * sameHost() refuses a mix.
 */
import { homedir } from 'node:os';

export const LOCAL_HOST = 'localhost';
export const PRODUCTION_HOST = 'concord.jaalip.com';

export const HOST = process.env.CONCORD_HOST ?? LOCAL_HOST;
export const LOCAL = HOST === LOCAL_HOST;
/** Jaakko's login through the public hostname, so no address is written down. `local` runs commands on this machine. */
export const SSH = process.env.CONCORD_SSH ?? (LOCAL ? 'local' : `jaakko@${HOST}`);
export const BACKEND = process.env.CONCORD_BACKEND ?? `${LOCAL ? 'http' : 'https'}://${HOST}`;
export const APP = process.env.CONCORD_APP ?? `${BACKEND}/app`;

/** The program and arguments that run a shell command on the stack's machine: over SSH, or here for the local stack. */
export function onStack(command: string): [string, string[]] {
  return SSH === 'local' ? ['bash', ['-c', command]] : ['ssh', [SSH, command]];
}

/** An rsync destination for a path under the stack user's home directory. */
export const stackPath = (path: string) => (SSH === 'local' ? `${homedir()}/${path}` : `${SSH}:${path}`);

/** The host each part points at. A guard that checks one stack over SSH must know the others are the same. */
export function sameHost(): void {
  const ssh = SSH === 'local' ? LOCAL_HOST : SSH.replace(/^.*@/, '').replace(/:\d+$/, '');
  const hosts = { ssh, backend: new URL(BACKEND).hostname, app: new URL(APP).hostname };
  if (new Set(Object.values(hosts)).size !== 1) {
    throw new Error(`the tools point at more than one stack: ${JSON.stringify(hosts)}. Set CONCORD_HOST alone.`);
  }
}
