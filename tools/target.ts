/**
 * Which stack the tools talk to (m4-plan.md task 1): the dev stack, unless CONCORD_HOST names another.
 * Production is reached only on purpose, as `pnpm deploy:web` does with CONCORD_HOST=concord.jaalip.com.
 * CONCORD_SSH, CONCORD_BACKEND and CONCORD_APP still override one part each; sameHost() refuses a mix.
 */
export const DEV_HOST = 'dev.concord.jaalip.com';
export const PRODUCTION_HOST = 'concord.jaalip.com';

export const HOST = process.env.CONCORD_HOST ?? DEV_HOST;
/** Jaakko's login through the public hostname, so no address is written down. */
export const SSH = process.env.CONCORD_SSH ?? `jaakko@${HOST}`;
export const BACKEND = process.env.CONCORD_BACKEND ?? `https://${HOST}`;
export const APP = process.env.CONCORD_APP ?? `${BACKEND}/app`;

/** The host each part points at. A guard that checks one stack over SSH must know the others are the same. */
export function sameHost(): void {
  const hosts = { ssh: SSH.replace(/^.*@/, '').replace(/:\d+$/, ''), backend: new URL(BACKEND).hostname, app: new URL(APP).hostname };
  if (new Set(Object.values(hosts)).size !== 1) {
    throw new Error(`the tools point at more than one stack: ${JSON.stringify(hosts)}. Set CONCORD_HOST alone.`);
  }
}
