/**
 * The bridge (m5-plan.md decisions 3 and 16): one frozen object of named values and functions, never `ipcRenderer`.
 * The client feature-detects each capability, so an older shell under a newer client degrades quietly. Task 1 has
 * no capabilities yet.
 */
// A sandboxed preload must be CommonJS, where verbatimModuleSyntax forbids `import` and erasableSyntaxOnly `import =`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge } = require('electron') as typeof import('electron');

const FLAG = '--concord-shell=';
const version = process.argv.find((arg) => arg.startsWith(FLAG))?.slice(FLAG.length) ?? '0.0.0';

contextBridge.exposeInMainWorld('concordDesktop', Object.freeze({
  version,
  platform: process.platform === 'win32' ? 'windows' : 'linux',
  capabilities: Object.freeze([]),
}));
