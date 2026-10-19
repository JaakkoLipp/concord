# M5 plan: desktop apps for Windows and Linux

Status: draft for Jaakko's sign-off, revised after a Sonnet challenger review. Implements the M5 section of [milestones.md](milestones.md), to architecture.md section 6. Results go in `docs/m5-results.md`.

**Platforms**: Windows 10 and 11, and Linux on Wayland through Flatpak. Changed on 2026-10-19 at Jaakko's request: global push-to-talk, capture and testing are planned for Windows and Wayland only. X11 is not supported in M5; it may run through XWayland as-is, untested.

Working agreement, as in M4.8:
- **Light testing** (Jaakko, 2026-10-18): unit tests only for the risky core named in each task, `pnpm verify` right before every commit, and the real checks on Jaakko's Windows PC and Linux machine on Wayland.
- **Nothing is installed in WSL.** Windows builds, installers and the Flatpak come from GitHub Actions. Electron itself is an ordinary project dependency in `apps/desktop`, so the Linux shell can be started under WSLg for quick looks.
- Each finished task is committed and pushed. The hosted client's side is deployed to `/app` as usual. Desktop releases are drafts until Jaakko publishes them.
- Sonnet agents review the session's diff before each release Jaakko installs.

## What the platforms give

From what is known of Electron, Chromium, Windows and the XDG portals, with the challenger's lookups. Each line marked *probe* is confirmed in task 0 before the task that needs it is briefed.

| Item | State |
|---|---|
| Global keys, Windows | Electron's `globalShortcut` sees presses only, and takes the key from other apps. A low-level keyboard hook (`WH_KEYBOARD_LL`) sees press and release and passes the key on. It needs native code: `uiohook-napi` ships prebuilt N-API binaries. Raw Input with `RIDEV_INPUTSINK` is the other route, not a hook, and less likely to alarm antivirus. Either may miss keys while an **elevated** window (a game run as administrator) has focus. *Probe.* |
| Global keys, Wayland | No app may read keys globally. The XDG **GlobalShortcuts portal** is the only route: the app proposes shortcuts, the user confirms them, and the portal sends `Activated` and `Deactivated`. **Limits**: KDE Plasma 5.27+ and GNOME 48+ provide it. Ubuntu 24.04's GNOME 46 doesn't. Hyprland has no dialog: the user adds a `global` bind line to its config. Sway and other wlroots desktops have none. The user, not the app, has the final say on the key. Whether `Deactivated` arrives, whether the game still gets the key, and whether a fullscreen game blocks shortcuts are *probes*. Electron's own `globalShortcut` on Wayland goes through the same portal but reports presses only, so we never call it and talk to the portal over D-Bus ourselves. |
| Picker, Windows | `session.setDisplayMediaRequestHandler` plus `desktopCapturer.getSources` lists screens and windows with thumbnails, and our own picker chooses. Chromium uses Windows Graphics Capture for windows. Exclusive-fullscreen games may come out black, so games run borderless. |
| Picker, Wayland | Chromium captures through PipeWire and the ScreenCast portal. `getSources` opens the system's own picker and returns the one source chosen, so there is no in-app picker. How many dialogs the whole flow shows, and whether 60 fps arrives, are *probes*. PipeWire's frame rate follows the compositor and what changes on screen. |
| Share audio, Windows | Electron's `audio: 'loopback'` has recorded all system output, the call included. Chromium added a Windows loopback mode that leaves out Chrome's own audio in 2025 (`kLoopbackWithoutChromeId`). Whether our Electron's `loopback` uses it is a desk check of Electron's source, then a *probe*. `loopbackWithMute` mutes local output, which is not what we want. The sure route is the **process loopback API** with `EXCLUDE_TARGET_PROCESS_TREE` on Concord's main process, whose tree includes Chromium's audio process. It needs a small native addon. Microsoft's sample names build 20348, but OBS uses the same API on Windows 10 2004 and later, so we detect it by trying, not by build number. |
| Share audio, Linux | Not in M5. It needs a PipeWire virtual microphone that leaves out Concord's own nodes, as Vesktop's `venmic` does. Stays with architecture 5.2: may slip past the MVP. |
| Hardware encoding, Linux | Chromium's VA-API encoder is off by default and is turned on by command-line features before the app starts. The M0 spike used `VaapiVideoEncoder,VaapiVideoDecodeLinuxGL` with `ignore-gpu-blocklist`. Names drift between Chromium versions. Intel and AMD on Mesa may work, and Intel in a Flatpak needs the `org.freedesktop.Platform.VAAPI.Intel` extension. NVIDIA has no VA-API encoder. *Probe.* |
| Updates | electron-updater reads `latest.yml` from GitHub Releases. **The source repo is private**, and the updater can't read a private repo's releases without a token in the app. `releases/latest` is repo-wide, so desktop releases shouldn't share a repo with any other releases. |
| Windows trust | An unsigned installer shows SmartScreen's "Windows protected your PC" until the user clicks More info, then Run anyway. **Smart App Control**, on some fresh Windows 11 installs, blocks unsigned programs with no way past. Unsigned Electron with a keyboard hook may also trip Defender's heuristics. An EV certificate no longer skips SmartScreen since 2024. Prices are in decision 12. |

## Decisions (recommended defaults)

Each is a recommendation that sign-off accepts unless Jaakko says otherwise.

1. **Shell: Electron**, the current stable major at task 1 (the M0 spike ran 44.7.0), with electron-builder. A Tauri or system-webview shell would mean WebView2 on Windows and WebKitGTK on Linux: two engines, no `desktopCapturer`, and different WebRTC. Electron is one Chromium everywhere, the same engine the client is tested on. Electron supports its last three majors, about 24 weeks, so **a shell release is due at least every 16 weeks** for security fixes even when nothing else changes.

2. **The hosted client is loaded**, as architecture 6 says: `https://concord.jaalip.com/app` in one window, in a persistent session partition. The token stays in IndexedDB, as in the browser.
   - **Offline**: only the shell runs. A bundled offline page says "Can't reach Concord", retries on the `online` event and every 15 s with backoff, and has a Retry button. The tray and the updater work offline. No copy of the client is bundled: Stoat needs the network anyway, and one copy means no version skew. M7's service worker may later make the start faster; the shell doesn't depend on it.
   - **Development**: an unpackaged build reads `CONCORD_URL` so it can load `http://localhost/app`. Packaged builds ignore it.

3. **Security.** The client renders other people's content and, from M4.9, their card CSS, so the plan assumes script may one day be injected into the page. The bridge must give such script nothing worth having.
   - **Window**: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `webviewTag`, `webSecurity` on. Electron fuses set at packaging:
     - off: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` and `GrantFileProtocolExtraPrivileges`,
     - on: `OnlyLoadAppFromAsar`, asar integrity, cookie encryption.
   - **Preload bridge**: one frozen object, `window.concordDesktop`, built with `contextBridge`. It exposes named functions only, never `ipcRenderer` or a generic `invoke(channel)`. Every IPC handler in main checks that `senderFrame` exists, is the main frame and has our origin, and validates its arguments by shape and size. The bridge can't read files, run programs, open arbitrary URLs or see the screen. The full list is in task 3.
   - **Keys** (decision 4): at most three global binds, events only for those binds, never a stream of keys, and a native confirmation from main whenever the binds change. So injected script can't turn the hook into a keylogger.
   - **Navigation**: `will-navigate` and `will-redirect` on the main frame allow only `https://concord.jaalip.com` (and `localhost` in development). Subframes are left to the page's CSP. `setWindowOpenHandler` denies every new window. Links that leave are opened with `shell.openExternal` only if they are `https:`, `http:` or `mailto:`. Links to our own `/invite/<code>` stay in the app and go to the client's invite route. `will-attach-webview` is refused.
   - **Permissions**: `setPermissionRequestHandler` and `setPermissionCheckHandler` grant only to our origin, and only these:
     - `media` (microphone and camera) and `display-capture`,
     - `notifications`, `fullscreen` and `clipboard-sanitized-write`,
     - `speaker-selection`.

     Everything else is denied: geolocation, MIDI, HID, serial, USB, Bluetooth and `openExternal`. `setDevicePermissionHandler` denies all.
   - **CSP**: the page keeps the server's policy (client.md section 13). The shell adds none to remote pages. The shell's own local pages (offline, picker) have `default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:`. The client's `connect-src` needs nothing new.
   - **Deep links** are parsed by a strict pattern and only navigate (decision 9).
   - **Releases**: third-party GitHub Actions in the release workflow are pinned by commit hash. The release job runs in a GitHub environment that needs Jaakko's approval, because it holds the update-signing key and the release token.

4. **Global push-to-talk, mute and deafen.** The bridge takes the keybinds the client already stores (`KeyboardEvent.code` plus modifiers) and sends `down` and `up` for those binds only. The page's own listener stays on, and the gate is open while either source holds the key. A focused window then can't fire twice, and focused push-to-talk still works if the system chose another key.
   - **Windows**: `uiohook-napi`'s low-level hook in the main process, unless probe 0.4 shows Raw Input does as well, which would be preferred. It is a Windows-only optional dependency, never shipped in the Flatpak. Keys pass through to the game. If the game runs as administrator, push-to-talk works only if Concord does too, and settings say so. Mouse side buttons are left for later: the keybind store can't express them yet.
   - **Wayland**: our own small client for the GlobalShortcuts portal, on a maintained pure-JavaScript D-Bus library chosen at task 6 by its release history (`dbus-next` itself is stale). Plain D-Bus to the portal needs no Flatpak permission.
     - The shell proposes the three shortcuts with the client's keys as `preferred_trigger`. In Voice settings, "Set up in system settings" calls `BindShortcuts`, and the settings show the key the system actually chose (`trigger_description`).
     - On Hyprland, settings show the exact `bind = …, global, com.jaalip.Concord:ptt` line to add.
     - If the portal is missing, or sends no `Deactivated`, push-to-talk works only while the window has focus, and settings say so plainly. Mute and deafen still work as toggles on press.
   - **X11**: not supported in M5; may run through XWayland as-is, untested.

5. **Screen and window picker.**
   - **Windows**: the picker is drawn **by the shell**, in a small child window from a local page with its own preload, styled like Concord's dialogs, with Screens and Windows tabs and thumbnails.
     - The page calls `getDisplayMedia`, which needs a click.
     - Main's handler opens the picker, and the user's choice completes the request.
     - Thumbnails and window titles never reach the remote page, so injected script can't choose a screen or read what's on it.
     - The picker ships with shell releases, not web deploys. The client's share dialog (preset, Share audio) comes first, unchanged.
   - **Wayland**: the handler calls `getSources` once and the system's portal dialog chooses. The client shows no picker of its own.
   - Chrome's own picker options in client.md 10.6 (`selfBrowserSurface`, `surfaceSwitching`) do nothing in Electron, and the client skips them there.

6. **Share audio on Windows leaves out the call.**
   - **First**, Electron's `loopback` with the client's `restrictOwnAudio` and `suppressLocalAudioPlayback`, if task 0's desk check and probe 0.3 show the call is left out. Then that is all.
   - **Otherwise**, a native addon of our own: C++ with `node-addon-api`, following Microsoft's ApplicationLoopback sample, built and prebuilt in CI on the Windows runner.
     - It captures everything except Concord's process tree as 48 kHz stereo float.
     - Main sends it over a `MessagePort` to the page.
     - There an AudioWorklet with a small ring buffer feeds a `MediaStreamDestination`. The buffer absorbs clock drift and plays silence when WASAPI sends nothing, which it does while the system is quiet.
     - That track is published as screen-share audio with the M4 settings.
   - **Where the API is missing**, found by trying it: no "Share audio" switch.
   - **Window shares** use the same "everything but Concord" audio in M5. Audio from only the shared app, as Discord does it, is a small later step on the same addon.
   - **Linux**: none in M5.

7. **Linux hardware encoding**: a "Hardware video encoding (VA-API)" switch in the desktop settings, stored in the shell's own config file, because Chromium reads it only at start. Changing it offers a restart.
   - **Default off.** It turns on by default only on Intel or AMD, and only if probe 0.6 shows a hardware encoder in the stats overlay and a steady 1080p60.
   - NVIDIA always starts off.
   - The stats overlay already names the encoder, so a user can see whether it took.

8. **Tray, notifications, flash and badge.**
   - **Tray**: Open, Mute, Deafen, Quit. **Close to tray** is on by default on Windows and off on Linux, because GNOME shows no tray without an extension, and a hidden window with no tray icon is a lost app.
   - **Notifications**: the client's existing `Notification` calls become native toasts. Windows needs the AppUserModelID `com.jaalip.Concord`, set by main and the installer. A click calls `concordDesktop.focus()` and the client goes to the message as it does today.
   - **Flash**: `flashFrame` on Windows for a new notification while unfocused, cleared on focus. On Wayland it does nothing, which is fine.
   - **Badge**: the client sends the count it already puts in the tab's title. Windows shows a taskbar overlay: a dot for unread, a number for mentions, 9+ above nine. On Linux, `app.setBadgeCount` only where probe 0.7 shows it works in the Flatpak.
   - **Single instance**: a second launch focuses the first and hands it its deep link.
   - **Start on login is left for later.** On Linux it needs the Background portal, and nothing in the milestone asks for it.

9. **Deep links.**
   - **Shapes**: `concord://invite/<code>` and `concord://channel/<id>[/<message>]`, matched by strict patterns (Stoat's ID and invite code shapes). Anything else is dropped.
   - **Windows arguments** are parsed strictly: only one argument that matches the pattern is taken, and other switches are ignored.
   - **Routing**: main turns a match into a route on our own origin. A deep link is never turned into an arbitrary URL. It only navigates: an invite link shows the invite, and joining still takes a click.
   - **Registration**: the NSIS installer writes the scheme for the user. The Flatpak's desktop file declares `x-scheme-handler/concord`.
   - **`https://concord.jaalip.com/invite/<code>` can't open the app by itself.** Windows lets only MSIX packages claim web links, and Linux has no such claim.
     - The invite page gets an "Open in the desktop app" button linking to `concord://invite/<code>`.
     - Opening in the browser stays the default, with no automatic redirect attempt, which would show a confusing dialog to anyone without the app.
     - M6 owns the invite page; until then the button goes on the client's current invite screen.
   - **Inside the app**, invite links in chat stay in the app (decision 3).

10. **Updates.**
    - **Windows**: NSIS, **per-user one-click install** (no administrator, no UAC on update), electron-updater against GitHub Releases.
      - It checks at start and every 4 hours, downloads in the background, and installs on quit. The client shows "Restart to update" through the bridge.
      - **The updater ships in the very first build Jaakko installs**, or there is no path to the next one.
      - **Integrity without a certificate**: CI signs each installer with an Ed25519 key kept in the approval-gated environment. The shell checks the detached signature against a public key built into it, through electron-updater's `verifyUpdateCodeSignature` hook, before installing.
      - When a code-signing certificate arrives, `publisherName` lists every publisher name we will use, so a later change of certificate doesn't strand installs.
    - **Artifact names without a version**, such as `Concord-Setup-x64.exe`, so M6's download page can link `releases/latest/download/…` for good.
    - **Linux**: the updater is off inside Flatpak. Testers install the `.flatpak` bundle from GitHub Releases and reinstall to update; after Flathub, `flatpak update` and the software centres do it.
    - **Releases are drafts** until Jaakko publishes, and only published releases reach the updater.

11. **Desktop releases live in a public releases-only repo**, `JaakkoLipp/concord-releases`.
    - **The release job writes there** with a fine-grained token limited to that repo's contents, held in the approval-gated environment.
    - **Why there**: it works whether or not the source is public, and nothing else in it can become "latest". It also keeps CI away from the production VPS.
    - **Making `JaakkoLipp/concord` public is a separate choice.** SignPath (decision 12) and Flathub (decision 13) need it.
      - Before that, a scan of the history: secrets, personal data, and what the docs reveal about infrastructure, hostnames and the community.
      - While the source stays private, AGPL's offer of source to users is met by attaching a source archive to each release.

12. **Code signing on Windows: unsigned for the closed beta.** Apply to SignPath Foundation once the project qualifies.
    - **Unsigned**: free.
      - Users click past SmartScreen once per new download, and the install guide on the download page says how.
      - Testers with Smart App Control on can't install it at all; the guide says how to check, and task 2 checks it once.
      - Updates install without a prompt.
    - **SignPath Foundation**: free, with the publisher shown as "SignPath Foundation". It needs:
      - an OSI licence and a public repo,
      - a released, documented project with a code-signing policy on its home page,
      - binaries built in CI.

      So the application waits for a public repo, M6's download page and a first public release. Approval depends on reputation, and an invite-only community app may be turned down.
    - **Azure Trusted Signing**: about $10 a month, and it works from GitHub Actions. As of its general availability in January 2026 (secondary sources), individuals must be in the United States or Canada; organisations may also be in the EU or the UK. Whether a Finnish sole trader (toiminimi) counts as an organisation is for Jaakko to check.
    - **A paid OV certificate on a cloud key that CI can use**, such as SSL.com's eSigner: about €150 to €400 a year, estimated. Hardware-token certificates (Certum's cheap open-source card, around €50 to €100 a year) can't sign from a GitHub runner.
    - **The decision itself** comes before M8: SignPath if it accepts, else Azure if a toiminimi qualifies, else the cloud OV certificate. If Smart App Control or antivirus trouble shows up in the beta, it moves forward.
    - The pipeline has a signing step that does nothing until a key exists.
    - A signed release reaches SmartScreen's trust only after enough downloads, which for 200 people may take weeks either way.

13. **Flatpak**: app ID `com.jaalip.Concord`, on `org.electronjs.Electron2.BaseApp` and the matching `org.freedesktop.Platform` (25.08 or newer), with Chromium's sandbox through the base app's `zypak`.
    - **Two manifests from one file set.**
      - **The testers' bundle**, built in CI, repackages our own `.tar.gz` from electron-builder.
      - **The Flathub manifest builds from source**, because Flathub requires it of open-source apps: our tagged source, with npm dependencies vendored through `flatpak-node-generator`.
      - The Linux build has no native modules, which keeps that simple.
      - If the generator can't read pnpm's lockfile, `apps/desktop` keeps its own npm lockfile for this.
    - **Permissions**:
      - `--share=network`, `--share=ipc`, `--socket=wayland` and `--socket=fallback-x11`,
      - `--socket=pulseaudio`, for the microphone and speaker,
      - `--device=all`, for webcams, since Chromium's PipeWire camera is still behind a flag. It also covers the GPU.
      - `--talk-name=org.freedesktop.Notifications`, and `--talk-name=org.kde.StatusNotifierWatcher` for the tray.

      Files go through the file chooser portal, so there is no filesystem access at all. Portals need no permission.
    - **Electron picks Wayland by itself** on a Wayland session, and the shell sets `--ozone-platform-hint=auto` to be sure. `fallback-x11` lets it start on X11, untested.
    - **Flathub submission** (task 12):
      - **Files**: the manifest, a desktop file, AppStream metainfo (summary, description, screenshots, a release, OARS rating, AGPL-3.0-only, homepage), and 128 and 512 px icons.
      - **The pull request** goes to `flathub/flathub`'s `new-pr` branch, then reviewer changes.
      - **After the merge**, Jaakko owns `flathub/com.jaalip.Concord`. `flatpak-external-data-checker` there proposes each new release, so our CI holds no Flathub token.
      - **The domain** is verified with a token at `https://jaalip.com/.well-known/org.flathub.VerifiedApps.txt`.
    - **Flathub risk**: Flathub rejects simple web wrappers, and its reviewers must be able to test the app, which is invite-only.
      - The submission leads with what is native: global push-to-talk, the screen picker, share audio and the tray.
      - It gives reviewers a test account in a review server.
      - If Flathub still says no, the fallback is a small GPG-signed Flatpak repo with a `.flatpakrepo` file, so `flatpak update` still works. It is served by Caddy under `/flatpak/` on the VPS, and Jaakko uploads to it by hand.

14. **The name is settled before task 1.** "Concord" is a working name, and it is already a game's title. The name feeds:
    - the app ID, the Windows AppUserModelID, the install folder and the user-data folder,
    - the `concord://` scheme and the updater's identity.

    Renaming after testers install breaks their updates and data, and Flathub's reviewers check trademarks. The app ID keeps `com.jaalip.` and the final name.

15. **Idle memory is measured, not estimated.** The brief's budget is under 300 MB in total across Electron's processes, with one server open. An idle Electron app with a large client often lands between 250 and 400 MB, so this is a real risk.
    - **Windows**: the sum of private working sets of every Concord process: Task Manager's grouped "Memory" figure, and the shell's own `app.getAppMetrics()`.
    - **Linux**: the sum of PSS over the process tree, read from `/proc/<pid>/smaps_rollup`. RSS counts shared pages several times over.
    - **Conditions**: signed in, one server open, not in voice, after 5 minutes idle. The same with Discord's desktop app beside it for comparison.
    - **Reading it**: a hidden "Copy diagnostics" item in the tray menu copies the figures, the versions and the GPU feature status, so Jaakko can paste them.
    - **Levers, if over budget**, tried in order:
      - the spell checker off,
      - no second renderer: the picker window is closed, not hidden,
      - V8's heap limit for the renderer,
      - unused Chromium features off,
      - then the client's own heap in DevTools: the message cache, images and the store.

    Results go in m5-results.md.

16. **The web client detects the app by the bridge, never the user agent.** `apps/web/src/lib/desktop.ts` wraps `window.concordDesktop`: `{version, platform, capabilities}`, where capabilities are names such as `global-keys`, `share-audio`, `hw-encode`, `badge`, `update` and `deep-link`. The client feature-detects each, so an old shell with a new client degrades quietly. **What lights up**:
    - global push-to-talk, mute and deafen, with Wayland's "Set up in system settings",
    - "Share audio" on Windows where possible,
    - a **Desktop** settings section: close to tray, hardware encoding (Linux), the shell version, check for updates,
    - the taskbar badge and flash, and "Restart to update",
    - the session name: "Concord Desktop, Windows" or "Concord Desktop, Linux", through `session/device.ts`,
    - deep links routed into the client,
    - "Use the desktop app" hints and Firefox share warnings hidden.

    **The UA check in `voice/share.ts` still sees Chromium** in Electron, so volumes above 100 % keep working. Task 3 checks it.

    **M7's web push is skipped when the bridge is present.** Electron has no push service, and the desktop keeps its socket open anyway.

## Tasks

In order. Each ends committed, with `pnpm verify` passing. A task that changes the client deploys `/app`.

### 0. Probes

**Built**: `spikes/m5-probe/`, from `spikes/m0-electron`, plus a `workflow_dispatch` job that builds it for Windows (zip) and as a Flatpak bundle and attaches both to a draft release in the releases repo. The probe shell has a small page of buttons:
- list sources, and capture,
- loopback on and off,
- a key log from the hook and from Raw Input,
- a portal bind log,
- the encoder flags,
- memory figures.

Results go in m5-results.md as each comes back.

**Desk check, first**: in the source of the Electron version we pin, does `audio: 'loopback'` map to Chromium's loopback without Chrome's own audio? This decides probe 0.3's expectation and the biggest task.

**In CI**:
- 0.1 Electron with the features above builds on `windows-2025` with `uiohook-napi`, and in the Flatpak builder image with the D-Bus library.

**On Jaakko's Windows PC**:
- 0.2 A 1920 × 1080 screen at 60 fps through `setDisplayMediaRequestHandler`, published to the test page, with H.264 shown in the stats (M0 run 9 with the real flow). A borderless game window captures.
- 0.3 **Share audio**: in a call with a second person, share with `loopback`, `restrictOwnAudio` and `suppressLocalAudioPlayback`. Does the viewer hear the call echoed back? If so, does activating process loopback succeed on this Windows? Record the build number.
- 0.4 **Keys**: down and up from the hook and from Raw Input, while a game has focus and while an elevated window has focus. Does Defender complain about the probe?

**On Jaakko's Linux machine, Wayland, in the probe Flatpak**:
- 0.5 **Portal**:
  - the GlobalShortcuts version, and whether binding works,
  - whether `Deactivated` arrives on release,
  - whether the focused app still gets the key,
  - and all of this with a real game in fullscreen and borderless, not only another app.

  Record the desktop and its version.
- 0.6 **Capture**:
  - how many portal dialogs a share takes, and a re-share and a cancel,
  - whether 1080p60 arrives on moving content, and at what CPU,
  - with the VA-API flags, whether the encoder name changes to a hardware one.

  Record the GPU, the driver and the installed VA-API extensions.
- 0.7 **Basics**:
  - the app runs natively on Wayland, not XWayland,
  - the microphone and camera work,
  - a notification, the tray and the badge work.

**Both**: 0.8 the idle memory of the probe with production's `/app` loaded, measured as in decision 15.

**Done when** each answer is written down and the decisions that hang on 0.3 to 0.6 are settled: share audio's route, the Windows key source, Wayland push-to-talk, and the encoding default.

### 1. The shell

**Built**: `apps/desktop/` in TypeScript.
- `main/` holds the window, the session partition, the security rules of decision 3, the offline page, single instance and the shell config file.
- `preload.ts` holds the bridge with only `version`, `platform` and `capabilities` so far.
- `electron-builder.yml` with the fuses.
- `pnpm verify` typechecks and lints it. architecture.md section 6 is updated: no X11, the bridge, the picker window.

**Done when**:
- unit tests cover the URL allowlist (navigation, external links, our own invite links) and the IPC sender check, including a missing `senderFrame`,
- the Linux build starts under WSLg and loads production's `/app`,
- a link to another site opens outside, and with the network cut the offline page shows and recovers.

### 2. The release pipeline

**Built**: `.github/workflows/desktop.yml`, run on a `desktop-v*` tag, in an environment that needs Jaakko's approval:
- **Windows** on `windows-2025`:
  - install and build, then the NSIS installer,
  - the code-signing step, dormant until a key exists,
  - the Ed25519 update signature, `latest.yml` and the blockmap.
- **Linux** on `ubuntu-24.04`: the `.tar.gz`, then `flatpak/flatpak-github-actions` in the Freedesktop image builds the testers' `.flatpak` from it.
- **Everything goes to one draft release** in `concord-releases`. Actions are pinned by hash.
- **electron-updater with its signature check** is wired in from this first build (decision 10).

**Done when**:
- a tag produces a draft release with the installer, `latest.yml`, its signature and the `.flatpak`,
- Jaakko installs both, and the app opens and signs in on each,
- the installer is tried once on a Windows 11 with Smart App Control on, and the result goes into the install guide.

### 3. The bridge and the client's side

**Built**:
- **The bridge**: `focus()`, `setBadge(count, mentions)`, `onDeepLink(cb)`, the update status and `restartToUpdate()`, get and set for the shell's own options, and `diagnostics()`, each with its main-side checks.
- **The client**: `lib/desktop.ts`, the Desktop settings section, the desktop session name, and the badge fed from the title count.

**Done when**:
- unit tests cover argument validation,
- the client in a plain browser shows nothing new,
- in the app, the Desktop section shows the shell version, and a new login shows "Concord Desktop, Linux" in the session list,
- a volume above 100 % works in the app.

### 4. Screen and window picker

**Built**: the flow of decision 5. Main's handler, the shell's picker window on Windows, and the portal path on Wayland. Capture settings and presets are unchanged from client.md 10.6.

**Done when**:
- unit tests show the handler accepts only a source ID from the pending request, and a request with no answer cancels after 60 s,
- Jaakko shares a window on Windows through the picker and a screen on Wayland through the portal, and the viewer's overlay shows the expected size and rate.

### 5. Global keys on Windows

**Built**:
- the hook (or Raw Input, by probe 0.4) and the mapping from `KeyboardEvent.code` to its key codes,
- the bridge's `setKeybinds` and `onKey`, with the limits and the native confirmation of decision 3,
- the gate taking either source,
- a note in Voice settings about games run as administrator.

**Done when**:
- unit tests cover the key mapping, the three-bind cap, and the press and release state, including modifiers released in a different order and focus moving between the app and a game,
- Jaakko talks with push-to-talk while a game has focus, and mute and deafen toggle from the game.

### 6. Global keys on Wayland

**Built**:
- the D-Bus portal client, with its session kept alive and reopened if the portal restarts,
- `BindShortcuts`, and the chosen trigger shown in Voice settings,
- the Hyprland bind line,
- the focused-window fallback with its message.

**Done when**:
- unit tests cover the trigger string mapping and the state machine (bound, unbound, portal missing),
- Jaakko binds push-to-talk in the system dialog and talks while a game has focus,
- on a desktop without the portal, settings say so and focused push-to-talk works.

### 7. Share audio on Windows

**Built**, by the desk check and probe 0.3:
- **(a) If Chromium leaves the call out**: the handler passes `audio: 'loopback'`, and "Share audio" shows on Windows.
- **(b) Otherwise**: the native addon of decision 6, prebuilt in CI, the `MessagePort` to the page, and the AudioWorklet with its ring buffer, published as screen-share audio. "Share audio" shows only where activating process loopback succeeds.

**Done when**:
- for (b), unit tests cover the ring buffer's drift handling, underrun, and silence while WASAPI sends nothing,
- in a call with a second person, Jaakko shares with music playing: the viewer hears the music and not the call's own voices.

### 8. Tray, notifications, flash and badge

**Built**: decision 8. Overlay icons are drawn at build time for the dot, 1 to 9 and 9+.

**Done when** on Windows and Wayland, Jaakko sees:
- a mention arrive as a native notification whose click opens the message,
- the taskbar flash and show the count on Windows,
- close to tray, and Quit from the tray.

### 9. Deep links

**Built**: decision 9:
- the scheme in the installer and the desktop file,
- the single-instance hand-off,
- the client's route for both link shapes,
- the "Open in the desktop app" button on the invite screen.

**Done when**:
- unit tests cover the parser and the Windows argument handling, including hostile inputs (`concord://invite/../`, other hosts, very long strings, extra switches),
- clicking `concord://invite/<code>` in a browser opens the app on the invite, whether the app was running or not, on both systems.

### 10. Linux hardware encoding

**Built**: decision 7's switch and default, the restart prompt, and the flags applied before `ready`.

**Done when** Jaakko turns it on, restarts, and the share's stats overlay names a hardware encoder. Or, if the GPU can't, the switch stays off by default and the result is written down.

### 11. The update check

**Built**: nothing new unless the check finds a fault. Two releases, `desktop-v0.1.0` and `desktop-v0.1.1`.

**Done when**:
- with 0.1.0 installed, Jaakko sees "Restart to update" after 0.1.1 is published, restarts, and the Desktop section shows 0.1.1, with no UAC prompt and no reinstall,
- a 0.1.2 whose signature doesn't match is refused.

This is the milestone's criterion.

### 12. Flatpak polish and Flathub

**Built**:
- the metainfo, desktop file and icons,
- the from-source Flathub manifest with its generated npm sources,
- `flatpak-builder-lint` passing in CI, and the screenshots,
- the reviewers' test account and server.

Then the Flathub pull request and the domain token.

**Needs**: the public source repo (decision 11), and Jaakko's Flathub login.

**Done when** the pull request is open with lint passing. Flathub's merge isn't waited for (milestones: submission). If Flathub refuses, the VPS repo fallback is built instead.

### 13. Memory and start time

**Built**: nothing, unless the figures are over budget. Then decision 15's levers.

**Done when**:
- Jaakko's figures from "Copy diagnostics" are in m5-results.md for both systems, against the 300 MB budget, with Discord's beside them,
- a cold start to a usable channel is timed for M7's 2-second budget.

### 14. Review

A Sonnet agent reviews the whole diff against decision 3. Then come the device tests below. The results and Jaakko's part go in m5-results.md.

## Jaakko's part

Before building:
1. Sign off this plan and its decisions.
2. **The final name** (decision 14).
3. **Create `JaakkoLipp/concord-releases`**, and the release environment with yourself as the approver (decision 11). Whether to make the source repo public can wait until task 12.
4. **Tell us the Linux machine**: the distribution, the desktop and its version (KDE Plasma or GNOME), and the GPU. **And the Windows build** (`winver`), and whether Smart App Control is on. These settle decisions 4, 6 and 7.
5. **Agree to an unsigned beta** (decision 12), and check whether a toiminimi would qualify for Azure Trusted Signing.

During M5:
6. Run probe 0 on both machines, with a second person or device for 0.3.
7. Install each draft release and run its task's device check.
8. **Before task 12**: the `jaalip.com` well-known file, a Flathub login, and a reviewers' account.
9. **Device tests**, on the Windows PC and on the Linux machine on Wayland:
   - a fresh install, log in, join voice, share a window, and push-to-talk while a game has focus,
   - then idle memory,
   - and on Windows, the update from 0.1.0 to 0.1.1.

Still open from M4, and needed here: encoder runs 1 to 4 and the voice evening. M5's share checks assume voice works on production.

## Coordination

- **M4.9 (supporter cards)**: card CSS runs in the same page under the same CSP and can't reach the bridge. Decision 3's key limits assume the page may be hostile anyway. Both milestones touch `en.ts` and the settings sections: rebase before each commit.
- **M6**: the download page links `releases/latest/download/Concord-Setup-x64.exe` in `concord-releases`, the `.flatpak`, and later Flathub. M6's invite page gets the "Open in the desktop app" button from task 9. SignPath's application follows M6's download page.
- **M7**:
  - It skips web push in the app (decision 16).
  - Its performance pass owns the cold-start budget, using task 13's figure.
  - It translates the shell's few strings: the tray, the offline page, the picker and the update prompt. They sit in a small catalogue in `apps/desktop`.

## Acceptance

From milestones.md, with the check for each:
- **Fresh install on Windows and on Linux on Wayland through Flatpak, log in, join voice, share a window, use push-to-talk while a game has focus**: tasks 2, 4, 5 and 6, and Jaakko's device test.
- **Idle memory within the brief's budget, measured**: task 13.
- **An auto-update on Windows from one shell version to the next**: task 11.
- **Also**: share audio without the call on Windows (task 7), and the Flathub submission open (task 12).

## Challenger review, 2026-10-19

A Sonnet challenger checked feasibility, security, order, costs and scope. Folded in:
- the name settled before task 1,
- a keylogger-proof key bridge and a shell-drawn picker,
- a from-source Flathub manifest, with a reviewers' account,
- a releases-only public repo instead of making the source public first,
- Ed25519 update signatures,
- Smart App Control and Raw Input,
- the portal's real coverage (Ubuntu 24.04, Hyprland, fullscreen games),
- a maintained D-Bus library, and `uiohook-napi` kept out of the Flatpak,
- Windows 10 share audio detected by trying, and the Chromium desk check first,
- SignPath's conditions and Azure's eligibility,
- start on login cut,
- main-frame navigation only, and a further fuse,
- no filesystem permission,
- silence in the ring buffer, and memory levers named.

Rejected:
- **Self-hosted Flatpak repo as the testers' main channel**: about 20 testers can reinstall a bundle, and it would give CI a route to the VPS. It stays the fallback if Flathub refuses.
- **Cutting the badge, flash, diagnostics and Desktop settings as scope creep**: the badge and flash were asked for, diagnostics is how memory gets measured, and the settings section holds the encoding switch and the updates.
- **Mouse-button push-to-talk now**: the keybind store can't express it, so it waits for a later step.
- **Electron's `generic` update provider on the VPS**: it puts a production write credential in CI. The releases repo gives the same stable links.
