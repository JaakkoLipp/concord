import { sveltekit } from '@sveltejs/kit/vite';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

// The client always uses same-origin paths; in development Vite forwards them to the VPS stack
// without rewriting, because Caddy there strips the prefixes (docs/dev-environment.md section 3).
// The local stack unless CONCORD_HOST or CONCORD_BACKEND names another (tools/target.ts).
const host = process.env.CONCORD_HOST ?? 'localhost';
const backend = process.env.CONCORD_BACKEND ?? `${host === 'localhost' ? 'http' : 'https'}://${host}`;
const rule = (ws = false) => ({ target: backend, changeOrigin: true, ws });
const key = (p: string) => `^/${p}(?:[/?]|$)`;

/** The build's version for the settings sidebar (m4.6-plan.md task 17): the commit and the build's date. */
function version(): string {
  let commit = 'dev';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // Built outside a checkout.
  }
  return `${commit} · ${new Date().toISOString().slice(0, 10)}`;
}

export default defineConfig({
  plugins: [sveltekit()],
  define: { __CONCORD_VERSION__: JSON.stringify(version()) },
  // ES modules, so the dev server prefixes the gate AudioWorklet (voice/audio/gate.worklet.ts) with an
  // import rather than importScripts, which a worklet doesn't have.
  worker: { format: 'es' },
  server: {
    proxy: {
      [key('api')]: rule(), [key('autumn')]: rule(), [key('january')]: rule(), [key('gifbox')]: rule(),
      [key('ws')]: rule(true), [key('livekit')]: rule(true),
    },
  },
});
