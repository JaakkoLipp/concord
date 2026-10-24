// The probe page: buttons for each probe of docs/m5-plan.md task 0, and one log to copy back into m5-results.md.
const $ = (id) => document.getElementById(id);
const lines = [];

function show(kind, data) {
  const line = typeof kind === 'object' ? kind : { at: new Date().toISOString().slice(11, 23), kind, data };
  lines.push(line);
  $('log').textContent += `${line.at} ${line.kind} ${JSON.stringify(line.data)}\n`;
  $('log').scrollTop = $('log').scrollHeight;
}
window.probe.onLog(show);

async function run(kind, fn) {
  try {
    show(kind, await fn());
  } catch (error) {
    show(kind, { error: String(error?.message ?? error) });
  }
}
const on = (id, kind, fn) => $(id).addEventListener('click', () => run(kind, fn));

let info;
let chosen = null;
window.probe.info().then((i) => {
  info = i;
  document.body.classList.add(i.platform === 'win32' ? 'is-win' : 'is-linux');
  $('info').textContent = `Electron ${i.electron}, Chromium ${i.chromium}, ${i.platform} ${i.osRelease}${i.windowsBuild ? ` (build ${i.windowsBuild})` : ''}, session ${i.session.XDG_SESSION_TYPE ?? '-'} ${i.session.XDG_CURRENT_DESKTOP ?? ''}${i.session.FLATPAK_ID ? ', in Flatpak' : ''}`;
  $('flags-on').checked = i.config.enabled;
  $('flags-features').value = i.config.features;
  $('flags-blocklist').checked = i.config.ignoreGpuBlocklist;
  show('info', i);
});
$('restrict-supported').textContent = String(Boolean(navigator.mediaDevices.getSupportedConstraints().restrictOwnAudio));

$('copy-all').addEventListener('click', () => navigator.clipboard.writeText(JSON.stringify(lines, null, 1)));
$('clear').addEventListener('click', () => { lines.length = 0; $('log').textContent = ''; });

// 0.2, 0.3, 0.6
const choose = () => window.probe.choose(chosen, $('audio-mode').value);
$('audio-mode').addEventListener('change', choose);
on('sources', 'sources', async () => {
  const sources = await window.probe.sources();
  $('source-list').replaceChildren(...sources.map((s) => {
    const el = document.createElement('div');
    el.className = 'source';
    const img = document.createElement('img');
    img.src = s.thumbnail;
    const name = document.createElement('span');
    name.textContent = s.name;
    el.append(img, name);
    el.addEventListener('click', () => {
      chosen = s.id;
      document.querySelectorAll('.source').forEach((x) => x.classList.toggle('chosen', x === el));
      choose();
    });
    return el;
  }));
  return sources.map((s) => ({ id: s.id, name: s.name }));
});
on('open', 'open', () => window.probe.open($('url').value));
on('open-spike', 'open', () => window.probe.open('https://concord.jaalip.com/spike/'));

// 0.3: a tone from this page is "Concord's own audio"; the captured level says whether loopback left it out.
async function echoTest(restrictOwnAudio) {
  await window.probe.choose(chosen, 'loopback');
  const ctx = new AudioContext();
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  tone.frequency.value = 440;
  gain.gain.value = 0.2;
  tone.connect(gain).connect(ctx.destination);
  tone.start();
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { restrictOwnAudio, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      return { restrictOwnAudio, result: 'no audio track' };
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let sumSq = 0;
    let n = 0;
    let peak = 0;
    const until = performance.now() + 3000;
    while (performance.now() < until) {
      analyser.getFloatTimeDomainData(buf);
      for (const s of buf) {
        sumSq += s * s;
        n += 1;
        peak = Math.max(peak, Math.abs(s));
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    const settings = track.getSettings();
    stream.getTracks().forEach((t) => t.stop());
    const rmsDbfs = 20 * Math.log10(Math.sqrt(sumSq / n) || 1e-9);
    return {
      restrictOwnAudio,
      trackSettings: { restrictOwnAudio: settings.restrictOwnAudio, channelCount: settings.channelCount, sampleRate: settings.sampleRate },
      rmsDbfs: Number(rmsDbfs.toFixed(1)),
      peak: Number(peak.toFixed(3)),
      verdict: rmsDbfs > -50 ? 'tone captured: Concord is in the share' : 'silent: Concord is left out',
    };
  } finally {
    tone.stop();
    await ctx.close();
    await choose();
  }
}
on('echo-on', 'echo', () => echoTest(true));
on('echo-off', 'echo', () => echoTest(false));

// 0.4
on('hook-on', 'hook', () => window.probe.hook(true));
on('hook-off', 'hook', () => window.probe.hook(false));
on('raw-on', 'rawinput', () => window.probe.rawInput(true));
on('raw-off', 'rawinput', () => window.probe.rawInput(false));

// 0.5
on('portal-version', 'portal', () => window.probe.portalVersion());
on('portal-bind', 'portal', () => window.probe.portalBind({ ptt: $('t-ptt').value, mute: $('t-mute').value, deafen: $('t-deafen').value }));
on('portal-list', 'portal', () => window.probe.portalList());

// 0.6
on('flags-save', 'flags', () => window.probe.setFlags({ enabled: $('flags-on').checked, features: $('flags-features').value.trim(), ignoreGpuBlocklist: $('flags-blocklist').checked }));
on('gpu', 'gpu', async () => {
  const gpu = await window.probe.gpu();
  // On Linux, 'complete' carries only the basic fields; the share's stats overlay is the real encoder check.
  return { gpuDevice: gpu.gpuDevice, glRenderer: gpu.auxAttributes?.glRenderer, videoEncode: gpu.videoEncodeAcceleratorSupportedProfile, features: info?.gpuFeatures };
});

// 0.7
let media = null;
let levelTimer = null;
on('media-on', 'media', async () => {
  media = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  $('camera').srcObject = media;
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(media).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  levelTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
    $('mic-level').textContent = `mic ${(20 * Math.log10(rms || 1e-9)).toFixed(0)} dBFS`;
  }, 200);
  return media.getTracks().map((t) => ({ kind: t.kind, label: t.label, settings: t.getSettings() }));
});
on('media-off', 'media', () => {
  clearInterval(levelTimer);
  media?.getTracks().forEach((t) => t.stop());
  $('camera').srcObject = null;
  return 'stopped';
});
on('web-notification', 'notification', async () => {
  const permission = await Notification.requestPermission();
  const n = new Notification('Concord probe', { body: 'Web notification, as the client sends them' });
  n.addEventListener('click', () => show('notification', 'web notification clicked'));
  return { permission };
});
on('tray', 'tray', () => window.probe.tray());
on('badge', 'badge', () => window.probe.badge(Number($('badge-count').value)));
on('flash', 'flash', () => window.probe.flash());

// 0.8
on('memory', 'memory', () => window.probe.memory());
