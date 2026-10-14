import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

/**
 * client.md section 10.2: voice-ingress disconnects anyone who sends LiveKit data, so the web app never
 * calls the SDK's data, chat, text and byte stream, file, RPC or DTMF APIs, nor publishes data tracks.
 */
const LIVEKIT_DATA = [
  'publishData', 'publishDtmf', 'sendChatMessage', 'editChatMessage', 'sendText', 'streamText', 'sendFile', 'streamBytes',
  'registerRpcMethod', 'performRpc', 'publishDataTrack',
];
const LIVEKIT_DATA_MESSAGE = 'Never send LiveKit data: voice-ingress disconnects anyone who does (client.md section 10.2).';

export default ts.config(
  { ignores: ['**/node_modules/', '**/build/', '**/dist/', '**/.svelte-kit/', 'packages/stoat/fixtures/', 'spikes/', '.claude/'] },
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // client.md section 13: user content never goes through innerHTML.
      'svelte/no-at-html-tags': 'error',
      // Reactive state is declared explicitly with SvelteMap; local Sets and Maps in computations are not state.
      'svelte/prefer-svelte-reactivity': 'off',
      // Internal links go through resolve() by convention; external links (embeds, markdown) can't.
      'svelte/no-navigation-without-resolve': ['error', { ignoreLinks: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.ts', 'apps/web/**/*.svelte'],
    rules: {
      'no-restricted-properties': ['error', ...LIVEKIT_DATA.map((property) => ({ property, message: LIVEKIT_DATA_MESSAGE }))],
      'no-restricted-imports': ['error', { paths: [{ name: 'livekit-client', importNames: ['LocalDataTrack', 'RemoteDataTrack'], message: LIVEKIT_DATA_MESSAGE }] }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } },
  },
);
