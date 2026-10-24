import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles runes in .svelte.ts modules (packages/domain).
  plugins: [svelte()],
  // SvelteKit's `$lib`, for the web app's modules that import through it.
  resolve: { alias: { $lib: fileURLToPath(new URL('./apps/web/src/lib', import.meta.url)) } },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tools/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts', 'deploy/guard/*.test.ts'],
  },
});
