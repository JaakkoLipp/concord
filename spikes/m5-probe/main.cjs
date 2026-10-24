// Probe shell for docs/m5-plan.md task 0. A local page of buttons drives each probe; remote pages (production's
// /app, the M0 test page) open in their own windows with no preload. Throwaway: the real shell is apps/desktop.
const { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, Menu, Notification, session, Tray, webContents } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_ID = 'com.jaalip.ConcordProbe';
const CONFIG = path.join(app.getPath('userData'), 'probe-config.json');
// Chromium 156 calls the Linux encoder feature AcceleratedVideoEncoder; M0's VaapiVideoEncoder no longer exists.
const DEFAULT_FLAGS = { enabled: false, features: 'AcceleratedVideoEncoder', ignoreGpuBlocklist: true };

function readConfig() {
  try {
    return { ...DEFAULT_FLAGS, ...JSON.parse(fs.readFileSync(CONFIG, 'utf8')) };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

// Probe 0.6: Chromium reads these only at start, so they come from the config file before `ready`.
const config = readConfig();
if (process.platform === 'linux' && config.enabled) {
  if (config.features) app.commandLine.appendSwitch('enable-features', config.features);
  if (config.ignoreGpuBlocklist) app.commandLine.appendSwitch('ignore-gpu-blocklist');
}
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
// Electron's badge and notifications on Linux name the app by its desktop file.
if (process.platform === 'linux') process.env.CHROME_DESKTOP = `${APP_ID}.desktop`;

let probe;
let tray;
// Probe 0.2: the source the next getDisplayMedia gets, and what audio it gets with it.
let nextSourceId = null;
let audioMode = 'none';

function log(kind, data) {
  const line = { at: new Date().toISOString().slice(11, 23), kind, data };
  console.log(JSON.stringify(line, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
  if (probe && !probe.isDestroyed()) probe.webContents.send('probe:log', line);
}

// A filled circle as a raw BGRA bitmap, for the tray and the taskbar overlay without shipping image files.
function dot(size, [r, g, b]) {
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - c) ** 2 + (y - c) ** 2 <= (size / 2) ** 2;
      buf.set(inside ? [b, g, r, 255] : [0, 0, 0, 0], (y * size + x) * 4);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function windowsBuild() {
  return process.platform === 'win32' ? Number(os.release().split('.')[2]) : null;
}

function info() {
  return {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: process.platform,
    osRelease: os.release(),
    windowsBuild: windowsBuild(),
    session: { XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE, XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, DISPLAY: process.env.DISPLAY, FLATPAK_ID: process.env.FLATPAK_ID },
    switches: { 'ozone-platform': app.commandLine.getSwitchValue('ozone-platform'), 'ozone-platform-hint': app.commandLine.getSwitchValue('ozone-platform-hint'), 'enable-features': app.commandLine.getSwitchValue('enable-features') },
    gpuFeatures: app.getGPUFeatureStatus(),
    config,
  };
}

// Probe 0.8: per process, Windows' private bytes, and on Linux the PSS from smaps_rollup (RSS counts shared pages
// more than once). Each renderer is labelled with the page it shows, so the probe page's own can be left out.
function memory() {
  const pages = new Map(webContents.getAllWebContents().map((wc) => [wc.getOSProcessId(), wc.getURL()]));
  const rows = app.getAppMetrics().map((m) => {
    let pssKb = null;
    if (process.platform === 'linux') {
      try {
        pssKb = Number(fs.readFileSync(`/proc/${m.pid}/smaps_rollup`, 'utf8').match(/^Pss:\s+(\d+)/m)[1]);
      } catch {
        // A process outside this sandbox's PID namespace; the host-side command in the README covers it.
      }
    }
    return { pid: m.pid, type: m.type, page: pages.get(m.pid) ?? null, privateKb: m.memory.privateBytes ?? null, workingSetKb: m.memory.workingSetSize, pssKb };
  });
  const sum = (key, filter = () => true) => rows.filter(filter).reduce((s, r) => s + (r[key] ?? 0), 0);
  const notProbePage = (r) => !(r.page ?? '').startsWith('file:');
  const key = process.platform === 'win32' ? 'privateKb' : 'pssKb';
  return {
    figure: key,
    totalMb: Math.round(sum(key) / 1024),
    withoutProbePageMb: Math.round(sum(key, notProbePage) / 1024),
    unreadable: rows.filter((r) => r[key] === null).length,
    rows,
  };
}

function openRemote(url) {
  const win = new BrowserWindow({ width: 1400, height: 900, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } });
  win.loadURL(url);
  log('window', `opened ${url}`);
}

function createProbe() {
  probe = new BrowserWindow({
    width: 1100,
    height: 900,
    title: `Concord probe, Electron ${process.versions.electron}`,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  probe.loadFile(path.join(__dirname, 'page', 'probe.html'));
  probe.webContents.on('console-message', (event) => log('console', { level: event.level, message: event.message }));
  probe.on('focus', () => probe.flashFrame(false));
  probe.on('closed', () => { probe = null; });
}

app.whenReady().then(() => {
  // Everything is granted: this shell only ever loads our own pages, and the probes need media and notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    log('permission', permission);
    callback(true);
  });

  // Probes 0.2, 0.3 and 0.6: Windows answers with the source chosen in the probe page; on Wayland, getSources opens
  // the portal's own picker and returns the one source chosen there.
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const t0 = Date.now();
    let sources;
    try {
      sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    } catch (error) {
      log('display-media', { error: String(error), ms: Date.now() - t0 });
      return callback(null);
    }
    const source = sources.find((s) => s.id === nextSourceId) ?? sources[0];
    log('display-media', { from: request.frame?.url, audioRequested: request.audioRequested, sources: sources.length, chose: source?.name, audioMode, ms: Date.now() - t0 });
    if (!source) return callback(null);
    callback(request.audioRequested && audioMode !== 'none' ? { video: source, audio: audioMode } : { video: source });
  });

  ipcMain.handle('probe:info', () => info());
  ipcMain.handle('probe:sources', async () => {
    const t0 = Date.now();
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 240, height: 135 } });
    log('sources', { count: sources.length, ms: Date.now() - t0 });
    return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('probe:choose', (_e, id, mode) => {
    nextSourceId = id;
    audioMode = mode;
    log('choose', { id, audioMode });
  });
  ipcMain.handle('probe:open', (_e, url) => openRemote(url));
  ipcMain.handle('probe:memory', () => memory());
  ipcMain.handle('probe:gpu', () => app.getGPUInfo('complete'));
  ipcMain.handle('probe:flags', (_e, next) => {
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    fs.writeFileSync(CONFIG, JSON.stringify({ ...DEFAULT_FLAGS, ...next }, null, 2));
    app.relaunch();
    app.exit(0);
  });

  // Probe 0.7 (and decision 8 on Windows): tray, badge, overlay, flash, native notification.
  ipcMain.handle('probe:tray', () => {
    if (tray) return 'tray already shown';
    tray = new Tray(dot(32, [88, 101, 242]));
    tray.setToolTip('Concord probe');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open', click: () => (probe ? probe.show() : createProbe()) },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', () => log('tray', 'clicked'));
    return 'tray shown';
  });
  ipcMain.handle('probe:badge', (_e, count) => {
    const result = { setBadgeCount: app.setBadgeCount(count) };
    if (process.platform === 'win32') {
      probe.setOverlayIcon(count ? dot(16, [237, 66, 69]) : null, count ? `${count} unread` : '');
      result.overlay = Boolean(count);
    }
    return result;
  });
  ipcMain.handle('probe:flash', () => {
    setTimeout(() => {
      probe.flashFrame(true);
      new Notification({ title: 'Concord probe', body: 'Native notification while unfocused' }).on('click', () => {
        log('notification', 'clicked');
        probe.show();
        probe.focus();
      }).show();
    }, 5000);
    return 'flashing and notifying in 5 s: focus another window now';
  });

  // Probe 0.4: Windows only, and loaded only there, so the Flatpak never touches uiohook-napi or koffi.
  if (process.platform === 'win32') {
    const keys = require('./keys-win.cjs');
    ipcMain.handle('probe:hook', (_e, on) => keys.hook(on, log));
    ipcMain.handle('probe:rawinput', (_e, on) => keys.rawInput(on, probe, log));
  }
  // Probe 0.5: Linux only.
  if (process.platform === 'linux') {
    const portal = require('./portal.cjs');
    ipcMain.handle('probe:portal-version', () => portal.version());
    ipcMain.handle('probe:portal-bind', (_e, triggers) => portal.bind(triggers, log));
    ipcMain.handle('probe:portal-list', () => portal.list());
  }

  log('start', info());
  createProbe();
});

app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
