<script lang="ts">
  /**
   * User settings, Voice and video (client.md section 10.9, after docs/reference/discord-voice-settings.png):
   * devices, volumes, the mic test, input mode and sensitivity, processing, camera and screen share. Saved on
   * this device as they change. The mic test runs the call's own chain, loaded on the first test.
   */
  import { onMount } from 'svelte';
  import { Button } from '@concord/ui';
  import { m } from '$lib/i18n/index.ts';
  import { loadVoiceSettings, onVoiceSettings, saveVoiceSettings, type SharePreset, type VoiceSettings } from '$lib/voice/settings.ts';
  import { listDevices, maxOutputVolume, outputSelectable, playTrack, type Playback } from '$lib/voice/audio/output.ts';
  import { listenPushToTalk } from '$lib/voice/audio/ptt.ts';
  import type { MicChain } from '$lib/voice/audio/chain.ts';
  import { app } from '$lib/session/app.svelte.ts';

  const t = m.settings.voice;
  const PRESETS: SharePreset[] = ['1080p60', '1080p30', '720p30', 'text'];
  const canChooseOutput = outputSelectable();
  const maxOutput = maxOutputVolume();

  let s = $state<VoiceSettings>(loadVoiceSettings());
  onMount(() => onVoiceSettings((next) => (s = next)));

  /** Saves a change and applies it to whatever is running. */
  function set(change: Partial<VoiceSettings>) {
    s = saveVoiceSettings(change);
    void chain?.update(s).catch(() => (micError = t.micFailed));
    if ('outputVolume' in change) playback?.setVolume(s.outputVolume);
    if ('outputDevice' in change) void playback?.setDevice(s.outputDevice);
    if ('cameraDevice' in change && preview) void startCamera();
  }

  // Devices, listed again once a permission makes their names readable, and when one is plugged in or out.
  let devices = $state<{ input: MediaDeviceInfo[]; output: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({ input: [], output: [], video: [] });
  async function refreshDevices() {
    const [input, output, video] = await Promise.all([listDevices('audioinput'), listDevices('audiooutput'), listDevices('videoinput')]);
    devices = { input, output, video };
  }
  onMount(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  });
  /** The options for a device select: the default first, named after the device it is when the browser says. */
  function options(list: MediaDeviceInfo[]) {
    const fallback = list.find((d) => d.deviceId === 'default');
    const named = fallback?.label.replace(/^Default\s*-\s*/, '');
    return [
      { id: '', label: named ? t.defaultNamed(named) : t.systemDefault },
      ...list.filter((d) => d.deviceId !== 'default' && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || t.unnamed(i + 1) })),
    ];
  }

  // The mic test: the chain played back, with its level for the meters. During a call it shows the call's own
  // microphone instead, without playback, which would echo into the call, and without opening it a second time.
  let chain = $state<MicChain | null>(null);
  let meter = $state<{ level(): number; gateOpen(): boolean } | null>(null);
  let inCall = $state(false);
  let playback: Playback | null = null;
  let starting = $state(false);
  let micError = $state<string | undefined>();
  let level = $state(-100);
  let open = $state(false);
  let frame = 0;
  let stopKeys: (() => void) | null = null;
  /** Leaving settings while the microphone prompt is open must not leave a test running behind it. */
  let destroyed = false;

  async function startTest() {
    if (starting) return;
    starting = true;
    micError = undefined;
    try {
      const call = app.voice?.micMeter();
      if (call) {
        meter = call;
        inCall = true;
      } else {
        const { createMicChain } = await import('$lib/voice/audio/chain.ts');
        const c = await createMicChain(s);
        if (destroyed) return c.stop();
        chain = meter = c;
        const p = await playTrack(c.track, s.outputDevice, s.outputVolume);
        if (destroyed) return void p.stop();
        playback = p;
      }
      const source = meter;
      const tick = () => { level = source.level(); open = source.gateOpen(); frame = requestAnimationFrame(tick); };
      tick();
      void refreshDevices();
    } catch (e) {
      stopTest();
      micError = e instanceof DOMException && e.name === 'NotAllowedError' ? t.micBlocked : t.micFailed;
    } finally {
      starting = false;
    }
  }
  function stopTest() {
    cancelAnimationFrame(frame);
    playback?.stop();
    playback = null;
    chain?.stop();
    chain = meter = null;
    inCall = false;
    level = -100;
    open = false;
  }
  onMount(() => () => { destroyed = true; stopTest(); stopCamera(); });

  // Push-to-talk works in the test too, except while a new key is being recorded.
  let recording = $state(false);
  $effect(() => {
    const c = chain;
    const code = s.inputMode === 'ptt' && !recording ? s.pushToTalkKey?.code : undefined;
    if (!c || !code) return;
    stopKeys = listenPushToTalk(code, (down) => c.setPushToTalk(down));
    return () => { stopKeys?.(); stopKeys = null; };
  });

  /**
   * Records the next key as the push-to-talk key. Tab moves on and Escape cancels, so focus never gets stuck.
   * Listened for on the window, because Safari doesn't focus a clicked button, so its own keydown never comes.
   */
  function recordKey(e: KeyboardEvent) {
    if (e.key === 'Tab') { recording = false; return; }
    e.preventDefault();
    e.stopPropagation();
    if (e.key !== 'Escape') set({ pushToTalkKey: { code: e.code, label: e.key === ' ' ? e.code : e.key.length === 1 ? e.key.toUpperCase() : e.key } });
    recording = false;
  }
  $effect(() => {
    if (!recording) return;
    const stop = () => (recording = false);
    window.addEventListener('keydown', recordKey, true);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('keydown', recordKey, true); window.removeEventListener('blur', stop); };
  });

  // Levels as a share of the -100 to 0 dBFS scale, for the meters and the sensitivity slider.
  const pct = (db: number) => `${Math.min(100, Math.max(0, db + 100))}%`;

  // The camera preview.
  let preview = $state<MediaStream | null>(null);
  let video = $state<HTMLVideoElement>();
  let cameraError = $state<string | undefined>();
  async function startCamera() {
    stopCamera();
    cameraError = undefined;
    try {
      const constraints: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
      if (s.cameraDevice) constraints.deviceId = { ideal: s.cameraDevice };
      preview = await navigator.mediaDevices.getUserMedia({ video: constraints });
      void refreshDevices();
    } catch (e) {
      cameraError = e instanceof DOMException && e.name === 'NotAllowedError' ? t.cameraBlocked : t.cameraFailed;
    }
  }
  function stopCamera() {
    for (const track of preview?.getTracks() ?? []) track.stop();
    preview = null;
  }
  $effect(() => { if (video) video.srcObject = preview; });
</script>

{#snippet toggle(id: string, label: string, help: string | undefined, checked: boolean, change: (on: boolean) => void)}
  <div class="row">
    <div class="text">
      <span class="name" id={id}>{label}</span>
      {#if help}<span class="help">{help}</span>{/if}
    </div>
    <label class="switch">
      <input type="checkbox" role="switch" aria-labelledby={id} {checked} onchange={(e) => change(e.currentTarget.checked)} />
      <span class="track" aria-hidden="true"></span>
    </label>
  </div>
{/snippet}

{#snippet deviceSelect(label: string, list: MediaDeviceInfo[], value: string, change: (id: string) => void)}
  <label class="field">
    <span class="label">{label}</span>
    <select {value} onchange={(e) => change(e.currentTarget.value)}>
      {#each options(list) as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet volume(label: string, value: number, max: number, change: (v: number) => void)}
  <label class="field">
    <span class="label">{label}<span class="value">{t.percent(value)}</span></span>
    <input class="slider" type="range" min="0" {max} step="1" {value} style:--fill={`${(value / max) * 100}%`}
      aria-valuetext={t.percent(value)} oninput={(e) => change(Number(e.currentTarget.value))} />
  </label>
{/snippet}

<section aria-labelledby="voice-heading">
  <h2 id="voice-heading">{t.voice}</h2>
  <div class="pair">
    {@render deviceSelect(t.microphone, devices.input, s.inputDevice, (id) => set({ inputDevice: id }))}
    {#if canChooseOutput}{@render deviceSelect(t.speaker, devices.output, s.outputDevice, (id) => set({ outputDevice: id }))}{/if}
  </div>
  <div class="pair">
    {@render volume(t.inputVolume, s.inputVolume, 200, (v) => set({ inputVolume: v }))}
    {@render volume(t.outputVolume, Math.min(s.outputVolume, maxOutput), maxOutput, (v) => set({ outputVolume: v }))}
  </div>

  <div class="test">
    {#if meter}
      <Button variant="secondary" onclick={stopTest}>{t.micTestStop}</Button>
    {:else}
      <Button onclick={startTest} busy={starting}>{t.micTest}</Button>
    {/if}
    <div class="meter" role="meter" aria-label={t.level} aria-valuemin={-100} aria-valuemax={0} aria-valuenow={Math.round(level)}
      aria-valuetext={t.decibels(Math.round(level))} class:open style:--level={pct(level)}>
      <span class="lit"></span>
    </div>
  </div>
  {#if micError}<p class="error" role="alert">{micError}</p>{:else}<p class="help">{inCall ? t.micTestInCall : t.micTestHelp}</p>{/if}
</section>

<div class="separator" role="separator"></div>

<section aria-label={t.inputMode}>
  <fieldset class="group">
    <legend class="label">{t.inputMode}</legend>
    <label class="option"><input type="radio" name="input-mode" checked={s.inputMode === 'voice'} onchange={() => set({ inputMode: 'voice' })} />{t.voiceActivity}</label>
    <label class="option"><input type="radio" name="input-mode" checked={s.inputMode === 'ptt'} onchange={() => set({ inputMode: 'ptt' })} />{t.pushToTalk}</label>
  </fieldset>

  {#if s.inputMode === 'ptt'}
    <div class="field">
      <span class="label" id="ptt-key">{t.shortcut}</span>
      <div class="key">
        <kbd class:empty={!s.pushToTalkKey}>{recording ? t.recording : (s.pushToTalkKey?.label ?? t.noShortcut)}</kbd>
        <Button variant="secondary" size="sm" aria-describedby="ptt-key" onclick={() => (recording = !recording)} onblur={() => (recording = false)}>
          {recording ? t.recordHelp : t.recordShortcut}
        </Button>
      </div>
      <p class="help">{t.pttHelp}</p>
    </div>
  {:else}
    {@render toggle('auto-sensitivity', t.autoSensitivity, t.autoSensitivityHelp, s.autoSensitivity, (on) => set({ autoSensitivity: on }))}
    {#if !s.autoSensitivity}
      <label class="field">
        <span class="label">{t.sensitivity}<span class="value">{t.decibels(s.threshold)}</span></span>
        <span class="sensitivity" style:--threshold={pct(s.threshold)} style:--level={pct(meter ? level : -100)}>
          <span class="zone" aria-hidden="true"></span>
          <span class="zone live" aria-hidden="true"></span>
          <input class="slider bare" type="range" min="-100" max="0" step="1" value={s.threshold}
            aria-valuetext={t.decibels(s.threshold)} oninput={(e) => set({ threshold: Number(e.currentTarget.value) })} />
        </span>
        <span class="help">{t.sensitivityHelp}</span>
      </label>
    {/if}
  {/if}

  <div class="row">
    <div class="text">
      <span class="name" id="noise-suppression">{t.noiseSuppression}</span>
      <span class="help">{t.noiseSuppressionHelp}</span>
    </div>
    <select aria-labelledby="noise-suppression" value={s.noiseSuppression} onchange={(e) => set({ noiseSuppression: e.currentTarget.value === 'off' ? 'off' : 'rnnoise' })}>
      <option value="rnnoise">{t.suppression.rnnoise}</option>
      <option value="off">{t.suppression.off}</option>
    </select>
  </div>
  {@render toggle('echo-cancellation', t.echoCancellation, undefined, s.echoCancellation, (on) => set({ echoCancellation: on }))}

  <details class="advanced">
    <summary>{t.advanced}</summary>
    {@render toggle('auto-gain', t.autoGain, t.autoGainHelp, s.autoGainControl, (on) => set({ autoGainControl: on }))}
  </details>
</section>

<div class="separator" role="separator"></div>

<section aria-labelledby="video-heading">
  <h2 id="video-heading">{t.video}</h2>
  {@render deviceSelect(t.camera, devices.video, s.cameraDevice, (id) => set({ cameraDevice: id }))}
  <div class="camera">
    {#if preview}
      <video bind:this={video} autoplay muted playsinline aria-label={t.cameraPreview}></video>
      <Button variant="secondary" onclick={stopCamera}>{t.cameraTestStop}</Button>
    {:else}
      <Button onclick={startCamera}>{t.cameraTest}</Button>
    {/if}
  </div>
  {#if cameraError}<p class="error" role="alert">{cameraError}</p>{/if}
</section>

<div class="separator" role="separator"></div>

<section aria-labelledby="share-heading">
  <h2 id="share-heading">{t.screenShare}</h2>
  <label class="field">
    <span class="label">{t.sharePreset}</span>
    <select value={s.sharePreset} onchange={(e) => set({ sharePreset: e.currentTarget.value as SharePreset })}>
      {#each PRESETS as p (p)}<option value={p}>{t.presets[p]}</option>{/each}
    </select>
  </label>
  {@render toggle('stats-overlay', t.statsOverlay, t.statsOverlayHelp, s.statsOverlay, (on) => set({ statsOverlay: on }))}
</section>

<style>
  section { display: grid; gap: var(--space-6); }
  h2 { margin: 0; color: var(--text-strong); font: 700 var(--text-lg) var(--font-sans); }
  .separator { height: 1px; margin: var(--space-8) 0; background: var(--border-default); }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--space-6); }
  .field { display: grid; gap: var(--space-3); min-width: 0; }
  .label { display: flex; justify-content: space-between; gap: var(--space-3); padding: 0; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; }
  .value { color: var(--text-normal); font-variant-numeric: tabular-nums; text-transform: none; }
  .help { margin: 0; color: var(--text-secondary); font: var(--text-sm) var(--font-sans); }
  .error { margin: 0; color: var(--danger); font: var(--text-sm) var(--font-sans); }
  select { min-height: var(--control-h); padding: 0 var(--space-4); background: var(--surface-0); color: var(--text-strong); border: 1px solid var(--border-control); border-radius: var(--radius-md); font: var(--text-md) var(--font-sans); min-width: 0; text-overflow: ellipsis; }
  select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* Sliders: the native range input, so keys and screen readers work, drawn with tokens. */
  .slider { appearance: none; width: 100%; height: var(--icon-md); margin: 0; background: transparent; cursor: pointer; }
  .slider::-webkit-slider-runnable-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-moz-range-track { height: var(--space-2); border-radius: var(--radius-full); background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--surface-5) var(--fill, 0%)); }
  .slider::-webkit-slider-thumb { appearance: none; width: var(--icon-sm); height: var(--icon-sm); margin-top: calc((var(--space-2) - var(--icon-sm)) / 2); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider::-moz-range-thumb { width: var(--icon-sm); height: var(--icon-sm); border: 0; border-radius: var(--radius-full); background: var(--text-strong); }
  .slider:focus-visible { outline: none; }
  .slider:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }
  .slider:focus-visible::-moz-range-thumb { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* The sensitivity slider over the live level: yellow below the threshold, green above, brighter where the level reaches. */
  .sensitivity { position: relative; display: block; height: var(--icon-md); }
  .zone {
    position: absolute; inset: calc((var(--icon-md) - var(--space-2)) / 2) 0; border-radius: var(--radius-full);
    background: linear-gradient(to right, var(--status-idle) var(--threshold), var(--status-online) var(--threshold)); opacity: 0.35;
  }
  .zone.live { opacity: 1; clip-path: inset(0 calc(100% - var(--level)) 0 0); transition: clip-path var(--dur-press) linear; }
  .slider.bare { position: relative; }
  .slider.bare::-webkit-slider-runnable-track { background: transparent; }
  .slider.bare::-moz-range-track { background: transparent; }

  /* The mic test's meter: segments lit up to the level, green while the gate lets sound through. */
  .test { display: flex; align-items: center; gap: var(--space-5); }
  .meter {
    --segments: repeating-linear-gradient(to right, var(--text-strong) 0 var(--space-2), transparent var(--space-2) var(--space-3));
    position: relative; flex: 1; height: var(--icon-lg); background: var(--surface-5); mask: var(--segments);
  }
  .lit { position: absolute; inset: 0; background: var(--text-secondary); clip-path: inset(0 calc(100% - var(--level)) 0 0); transition: clip-path var(--dur-press) linear; }
  .meter.open .lit { background: var(--status-online); }

  .group { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
  .option { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); cursor: pointer; }
  .option input { accent-color: var(--accent); }
  .key { display: flex; align-items: center; gap: var(--space-4); }
  kbd { min-width: var(--control-h); padding: var(--space-2) var(--space-4); border: 1px solid var(--border-control); border-radius: var(--radius-md); background: var(--surface-3); color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); text-align: center; }
  kbd.empty { color: var(--text-secondary); }

  .row { display: flex; align-items: center; gap: var(--space-5); }
  .text { flex: 1; display: grid; gap: var(--space-1); }
  .name { color: var(--text-strong); font: 500 var(--text-md) var(--font-sans); }
  .switch { position: relative; flex: none; display: inline-flex; cursor: pointer; }
  .switch input { position: absolute; inset: 0; z-index: 1; opacity: 0; margin: 0; cursor: inherit; }
  .track { width: 2.5rem; height: 1.5rem; border-radius: var(--radius-full); background: var(--surface-5); position: relative; }
  .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 1.125rem; height: 1.125rem; border-radius: var(--radius-full); background: var(--text-strong); transition: translate var(--dur-hover) var(--ease-out); }
  .switch input:checked + .track { background: var(--status-online); }
  .switch input:checked + .track::after { translate: 1rem 0; }
  .switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }

  .advanced { display: grid; gap: var(--space-5); }
  .advanced summary { width: fit-content; color: var(--text-secondary); font: 700 var(--text-xs) var(--font-sans); letter-spacing: 0.02em; text-transform: uppercase; cursor: pointer; }
  .advanced summary:hover { color: var(--text-strong); }
  .advanced summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-xs); }
  .advanced[open] summary { margin-bottom: var(--space-5); }

  .camera { display: flex; align-items: flex-end; gap: var(--space-5); flex-wrap: wrap; }
  video { width: min(100%, var(--popout-w)); aspect-ratio: 16 / 9; border-radius: var(--radius-lg); background: var(--surface-2); object-fit: cover; }
  @media (prefers-reduced-motion: reduce) { .zone.live, .lit { transition: none; } }
</style>
