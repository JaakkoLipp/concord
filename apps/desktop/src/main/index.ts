/**
 * The desktop shell (m5-plan.md task 1): one window on the hosted client, locked down as decision 3 says, with a
 * local offline page while the client can't be reached.
 */
import { app, BrowserWindow, session, shell, type Session } from 'electron';
import { join } from 'node:path';
import { clientUrl, route } from './links.ts';

const client = clientUrl(app.isPackaged, process.env.CONCORD_URL);
const ORIGIN = client.origin;
// The client keeps its token in IndexedDB, so this partition is the signed-in state.
const PARTITION = 'persist:concord';
// What the client may ask for, and only from its own origin. Everything else is denied.
const PERMISSIONS = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);
const OFFLINE_PAGE = join(app.getAppPath(), 'static', 'offline.html');
// Chromium's ERR_ABORTED: a navigation replaced by another one, not a failure.
const ERR_ABORTED = -3;

let win: BrowserWindow | null = null;
let failures = 0;

function lockDown(ses: Session) {
  const fromClient = (url: string) => URL.parse(url)?.origin === ORIGIN;
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => callback(PERMISSIONS.has(permission) && fromClient(details.requestingUrl)));
  // Electron passes the checking origin as a URL ("http://localhost/"), not always as a bare origin.
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => PERMISSIONS.has(permission) && fromClient(requestingOrigin));
  ses.setDevicePermissionHandler(() => false);
}

// A failed load of the client already shows the offline page, through did-fail-load.
const ignore = () => {};

// A link the page opens, or a navigation the shell turned down: the client's own pages load in the window, the web
// opens in the system browser.
function follow(url: string) {
  const link = route(url, ORIGIN);
  if (link.kind === 'app') win?.loadURL(link.url).catch(ignore);
  else if (link.kind === 'external') void shell.openExternal(link.url);
}

// The offline page retries by navigating back to the client, with a longer wait after each failure.
function showOffline() {
  failures += 1;
  win?.loadFile(OFFLINE_PAGE, { query: { url: client.href, attempt: String(failures) } }).catch(ignore);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 500,
    // tokens.css --surface-0, so the window never flashes white before the client paints.
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '..', 'preload.cjs'),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      additionalArguments: [`--concord-shell=${app.getVersion()}`],
    },
  });
  const contents = win.webContents;
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== ERR_ABORTED && route(url, ORIGIN).kind === 'app') showOffline();
  });
  // A server that answers 502 while the stack restarts is as unreachable as no network.
  contents.on('did-navigate', (_event, url, status) => {
    if (route(url, ORIGIN).kind !== 'app') return;
    if (status >= 500) showOffline();
    else failures = 0;
  });
  win.on('closed', () => { win = null; });
  win.loadURL(client.href).catch(ignore);
}

// Every web contents, including any window added later: no webviews, no new windows, and main-frame navigation only
// to the client's own pages. Subframes are left to the page's own CSP.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    follow(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => {
    const link = route(event.url, ORIGIN);
    if (link.kind === 'app' && link.url === event.url) return;
    event.preventDefault();
    follow(event.url);
  });
  contents.on('will-redirect', (event) => {
    if (event.isMainFrame && route(event.url, ORIGIN).kind !== 'app') event.preventDefault();
  });
});

app.enableSandbox();
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch brings the first window forward.
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(() => {
    lockDown(session.defaultSession);
    lockDown(session.fromPartition(PARTITION));
    createWindow();
  });
}
