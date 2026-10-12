import { defineConfig } from 'vite';

// Served by Caddy at https://concord.jaalip.com/spike/ (docs/dev-environment.md section 7).
const backend = process.env.CONCORD_BACKEND ?? 'https://concord.jaalip.com';
const rule = (ws = false) => ({ target: backend, changeOrigin: true, ws });

export default defineConfig({
  base: '/spike/',
  build: { target: 'es2022', sourcemap: true },
  server: {
    proxy: { '^/api(?:[/?]|$)': rule(), '^/ws(?:[/?]|$)': rule(true), '^/livekit(?:[/?]|$)': rule(true) },
  },
});
