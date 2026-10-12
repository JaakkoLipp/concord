import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Compiles runes in .svelte.ts modules (packages/domain).
  plugins: [svelte()],
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tools/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
  },
});
