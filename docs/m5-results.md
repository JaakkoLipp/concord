# M5 results

## 0. Probes

The probe shell is `spikes/m5-probe/` on Electron 45.0.0 (Chromium 156.0.8078.48), the current stable major since 2026-10-21. How to run each probe is in its [README](../spikes/m5-probe/README.md). The `m5-probe` workflow builds the Windows zip and the Flatpak bundle into a draft release.

### Desk check: share audio leaves out the call on Windows 11

Read in Electron 45.0.0's and Chromium 156.0.8078.48's source on 2026-10-24.

- **Electron** (`shell/browser/electron_browser_context.cc`): when the handler answers `audio: 'loopback'` and the page asked for `restrictOwnAudio`, Electron swaps in Chromium's `loopbackWithoutChrome` device on Windows. That came in Electron's "support `restrictOwnAudio` constraint" change of 2026-07-29 (#52455).
- **Chromium** (`media/audio/win/audio_low_latency_input_win.cc`): `loopbackWithoutChrome` is the process loopback API with `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE` on the audio service's own process. Every sound Concord plays, the call included, is rendered by that process, so the share should leave it out.
- **Windows 11 only.** Chromium allows `restrictOwnAudio` only where `IsWindowsProcessLoopbackCaptureSupported()`, which is `GetVersion() >= WIN11` (build 22000).
  - On Windows 10, Blink drops the constraint silently, and Electron then sends plain `loopback`, so the call would be shared too.
- **The constraint can't be feature-detected.** `getSupportedConstraints().restrictOwnAudio` is true wherever Blink's `RestrictOwnAudio` feature is on (status stable), whether or not the platform honours it. It even says true on Linux, where it does nothing.
  - So the client's `screenAudio()` in `voice/call.ts` can't tell. In the app, the shell's `share-audio` capability has to be the signal (decision 16), decided in main by the Windows build.
  - In Chrome on Windows 10, today's web client probably shares the call along with system audio, for the same reason. Not checked.

**Expected for probe 0.3**: the call left out on Windows 11. If so, task 7 is path (a), and the native addon isn't built.

**Recommended for Windows 10**: no "Share audio" switch, rather than the addon. Windows 10 is past its end of support, consumer extended updates included (October 2026), and probe 0.3 would only confirm what the source already says. Jaakko to confirm.

### Already seen on the Linux machine, outside the Flatpak

Arch, KDE Plasma 6.8.1 on Wayland, AMD Radeon RX 9070 (Navi 48) on Mesa 26.2.5, with Intel UHD 770 as a second GPU, xdg-desktop-portal 1.22.1 with its KDE backend 6.8.1. The probe was run from `npm start` and from its packaged `linux-unpacked`, not yet as the Flatpak.

- **Wayland**: Electron chose `ozone-platform=wayland` by itself.
- **Portal**: GlobalShortcuts is there, version 2. Binding needs the system dialog, so 0.5 proper is still Jaakko's.
- **Encoding**: Chromium 156 renamed the encoder feature. `AcceleratedVideoEncoder` is the name now. M0's `VaapiVideoEncoder` no longer exists and is ignored without a word, and decoding is on by default.
  - With `--enable-features=AcceleratedVideoEncoder --ignore-gpu-blocklist`, `video_encode` goes from `disabled_software` to `enabled` on the RX 9070.
  - Whether a share really uses it is the stats overlay's call (0.6). Decision 7 and task 10 should use the new name.
- **Memory**: 162 to 170 MB PSS in total for the shell's own processes (browser, GPU, network service) with no remote page loaded, and about 53 MB more for the probe page's renderer.
  - So `/app`'s renderer has about 130 MB left of the 300 MB budget. The real figure is 0.8.
- **Badge**: `app.setBadgeCount` returns true on Plasma, unpackaged.
- **Libraries**:
  - `dbus-native` 0.16.2 talked to the portal on the first try. It is maintained again since mid-2026, with releases from August to October, one dependency, promises and plain values, so it is the candidate for task 6.
  - koffi 3 ships its binaries as per-platform packages, and npm 12 blocks install scripts by default. The probe needs none.
- **For later**: Chromium 156 has a `PulseaudioLoopbackForScreenShare` feature, off by default. Linux share audio stays out of M5, but this may be a cheaper start than a PipeWire virtual microphone. It probably includes Concord's own audio.

### Still to run

| Probe | Where | Result |
|---|---|---|
| 0.1 Builds: Windows zip with `uiohook-napi` and koffi, Flatpak on the 26.08 base app | `m5-probe` workflow | |
| 0.2 1080p60 screen and a borderless game window, H.264 in the stats | Windows | |
| 0.3 Share audio: echo test, then a call with a second person | Windows, with its build number | |
| 0.4 Hook and Raw Input with a game focused and an elevated window focused, and Defender | Windows | |
| 0.5 Portal: bind, `Deactivated`, does the game still get the key, fullscreen and borderless | Plasma 6.8.1, Flatpak | |
| 0.6 Portal dialogs per share, 1080p60 and CPU, the encoder with the flag | Plasma 6.8.1, Flatpak, RX 9070 | |
| 0.7 Native Wayland, microphone and camera, notification, tray, badge | Plasma 6.8.1, Flatpak | |
| 0.8 Idle memory with `/app` signed in, and Discord beside it | Both | |

Also needed from Jaakko: the Windows build (`winver`) and whether Smart App Control is on.
