// Bare Electron shell for the M0 encoder runs (docs/dev-environment.md section 7): loads the test page and
// answers every screen-share request with the first screen. Nothing else, so the results reflect Electron itself.
const { app, BrowserWindow, desktopCapturer, session } = require('electron');

const url = process.env.CONCORD_SPIKE_URL || 'https://concord.jaalip.com/spike/';

// Linux only: CONCORD_VAAPI=1 asks Chromium for hardware encoding, matching the Chrome run with the same flags.
if (process.platform === 'linux' && process.env.CONCORD_VAAPI === '1') {
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoEncoder,VaapiVideoDecodeLinuxGL');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    callback({ video: sources[0] });
  });
  const win = new BrowserWindow({ width: 1400, height: 900, title: 'Concord M0 Electron', autoHideMenuBar: true });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.loadURL(url);
  console.log(`Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`);
  console.log('GPU features:', JSON.stringify(app.getGPUFeatureStatus()));
  win.setTitle(`Concord M0 Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`);
});

app.on('window-all-closed', () => app.quit());
