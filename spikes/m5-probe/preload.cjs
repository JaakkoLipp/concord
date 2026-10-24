// The probe page's bridge. Only the local probe page gets it; remote windows run with no preload.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('probe', {
  info: call('probe:info'),
  sources: call('probe:sources'),
  choose: call('probe:choose'),
  open: call('probe:open'),
  memory: call('probe:memory'),
  gpu: call('probe:gpu'),
  setFlags: call('probe:flags'),
  tray: call('probe:tray'),
  badge: call('probe:badge'),
  flash: call('probe:flash'),
  hook: call('probe:hook'),
  rawInput: call('probe:rawinput'),
  portalVersion: call('probe:portal-version'),
  portalBind: call('probe:portal-bind'),
  portalList: call('probe:portal-list'),
  onLog: (cb) => ipcRenderer.on('probe:log', (_e, line) => cb(line)),
});
