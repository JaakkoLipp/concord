import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// The client always uses same-origin paths; in development Vite forwards them to the VPS stack
// without rewriting, because Caddy there strips the prefixes (docs/dev-environment.md section 3).
// The dev stack unless CONCORD_HOST or CONCORD_BACKEND names another (tools/target.ts).
const backend = process.env.CONCORD_BACKEND ?? `https://${process.env.CONCORD_HOST ?? 'dev.concord.jaalip.com'}`;
const rule = (ws = false) => ({ target: backend, changeOrigin: true, ws });
const key = (p: string) => `^/${p}(?:[/?]|$)`;

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      [key('api')]: rule(), [key('autumn')]: rule(), [key('january')]: rule(), [key('gifbox')]: rule(),
      [key('ws')]: rule(true), [key('livekit')]: rule(true),
    },
  },
});
