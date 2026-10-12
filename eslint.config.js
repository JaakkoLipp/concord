import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['**/node_modules/', '**/build/', '**/dist/', '**/.svelte-kit/', 'packages/stoat/fixtures/', 'spikes/'] },
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // client.md section 13: user content never goes through innerHTML.
      'svelte/no-at-html-tags': 'error',
      // Reactive state is declared explicitly with SvelteMap; local Sets and Maps in computations are not state.
      'svelte/prefer-svelte-reactivity': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } },
  },
);
