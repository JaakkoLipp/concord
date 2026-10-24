# M5 probe shell

The probe of [docs/m5-plan.md](../../docs/m5-plan.md) task 0. Results go in [docs/m5-results.md](../../docs/m5-results.md). Throwaway: the real shell is `apps/desktop`.

**Builds**: run the `m5-probe` workflow by hand (Actions, m5-probe, Run workflow, or `gh workflow run m5-probe.yml`). It leaves a draft release, "M5 probe N", with `Concord-Probe-win-x64.zip` and `Concord-Probe.flatpak`. Never publish it.

**Locally**: `npm ci`, then `npm start`. It has its own npm lockfile and is not in the pnpm workspace.

Every probe writes to the log at the bottom of the window. **Copy everything** puts the whole log on the clipboard for m5-results.md.

## Windows

Unzip anywhere and run `Concord Probe.exe`. SmartScreen asks once: More info, then Run anyway.

- **0.2 Capture**: List sources, pick a screen, then Open test page. Publish 1920 × 1080 at 60 fps and read the encoder and frame rate in the test page's stats. Repeat with a borderless game window as the source.
- **0.3 Share audio**:
  1. Pause other audio, then press both echo test buttons. "silent" with restrictOwnAudio on, and "tone captured" with it off, means Chromium leaves Concord out.
  2. Then the real check: Audio to `loopback`, Open `/app`, join a call with a second person, play music, and share a screen with Share audio on. Ask whether they hear the music, and whether they hear their own voice come back.
  3. Record the Windows build shown at the top.
- **0.4 Keys**: Start hook and Start Raw Input, then hold and release a key:
  - with a game focused,
  - with an administrator Command Prompt focused (right-click, Run as administrator).

  Each source logs `down` and `up`, and Raw Input marks `background: true` when another window had focus. Note whether the game still got the key, and whether Defender said anything.
- **0.8 Memory**: Open `/app`, sign in, open one server, stay out of voice, wait 5 minutes, then Measure. `withoutProbePageMb` leaves out the probe page's own renderer. Note Task Manager's grouped figure too, and Discord's beside it.

## Linux on Wayland

```bash
flatpak install --user flathub org.electronjs.Electron2.BaseApp//26.08
```

```bash
flatpak install --user ./Concord-Probe.flatpak
```

```bash
flatpak run com.jaalip.ConcordProbe
```

- **0.5 Portal**:
  1. Portal version.
  2. Bind: the system dialog opens. Accept, or pick other keys.
  3. Hold and release the push-to-talk key, first with another app focused, then with a game in fullscreen and in borderless.

  The log shows `Activated` and `Deactivated` with `ours: true`. Note whether the focused app or game still got the key. On Hyprland the log prints the `bind` line to add instead. Record the desktop and its version.
- **0.6 Capture and encoding**:
  1. Share a screen in `/app` or the test page, and note how many system dialogs one share takes, then a re-share and a cancel.
  2. Watch frame rate and CPU on moving content.
  3. Then tick apply (the default feature is `AcceleratedVideoEncoder`, Chromium 156's name for it), Save and restart, share again, and read the encoder name in the stats.
  4. Record the GPU, the driver and `flatpak list | grep -i vaapi`.
- **0.7 Basics**:
  - Microphone and camera.
  - Web notification, Show tray, Set badge, and Flash and native notification in 5 s.
  - That it runs natively on Wayland: `xlsclients` should not list `concord-probe`.
- **0.8 Memory**: as on Windows. If `unreadable` isn't 0, measure from the host instead. This sums PSS over the app's systemd scope, the probe page included:

```bash
for p in $(cat /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/app-flatpak-com.jaalip.ConcordProbe-*.scope/cgroup.procs); do awk '/^Pss:/ {print $2}' /proc/$p/smaps_rollup; done | awk '{s+=$1} END {printf "%.0f MB\n", s/1024}'
```
