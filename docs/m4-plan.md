# M4 plan: voice and screen share in the browser

Status: signed off by Jaakko on 2026-10-14. Implements the M4 section of [milestones.md](milestones.md) to the spec in [client.md](client.md) section 10. Results go in `docs/m4-results.md`.

Working agreement, as in M3:
- Each finished task is committed and pushed, with `pnpm verify` run right before the commit.
- Probes run in the scratchpad first, and their side effects are listed.
- Agents work on the dev stack. On production they only deploy `/app` and run `pnpm live:prod tools/live/src/routes.ts` afterwards.
- Every task ends deployed to the dev stack's `/app`, and from task 4 on, also to production's for Jaakko's review.
- Device checks are collected, not waited for. The exception is the voice evening.

## Checked while planning

Two Sonnet research agents read Stoat 0.15.5's source (backend `v0.15.5`, self-hosted `9af5e90`, Stoat's client `4017c18`) and `livekit-client` 2.22.4 with LiveKit server 1.13.4. Nothing was run against a stack. Task 2 confirms what matters.

| Question | Answer |
|---|---|
| Voice events | `VoiceChannelJoin`, `VoiceChannelLeave`, `VoiceChannelMove` and `UserVoiceStateUpdate`, sent to everyone who can see the channel. `Ready.voice_states` lists occupied channels. Join and leave come from LiveKit's webhooks through voice-ingress, never from the API. Details in client.md 10.1. |
| `join_call` | Body `{node, force_disconnect, recipients}`, all optional, but a JSON body is required. Answers `{token, url}`. Errors: `AlreadyConnected`, `CannotJoinCall` (full), `NotAVoiceChannel`, `LiveKitUnavailable`, missing Connect. It shares the `channels` rate-limit bucket: 15 per 10 s per user and channel. |
| Tokens and reconnects | Stoat's LiveKit sends a refreshed token right after joining and every 5 minutes, valid for 10. The SDK uses it for resume and full restart. So the 10-second join token only matters for the first connect. |
| DM calls | No separate start call. The first to join rings everyone else in the DM or group with `VoiceCallUpdate {ended: false}` on their own topic, and `{ended: true}` goes out when the last one leaves. `end_ring` only sends a push. There is no decline. **Stoat's own client has no ringing screen**: it ignores the event. |
| Voice moderation | Server mute and deafen are the member's `can_publish` and `can_receive`. **Bug**: when a moderator mutes, deafens, moves or disconnects someone else, 0.15.5 applies the voice side to the moderator's own account. Self-targeted edits work. Present on Stoat's main branch too. |
| Flags | `is_publishing` is "microphone published and unmuted". Screen video and screen audio share `screensharing`. `is_receiving` never changes, so a deafen can't be shown to others. |
| Video limit | voice-ingress checks only width × height and aspect ratio at publish, against the user's tier in `GET /api/`. Ours allow 2560 × 1440 in both tiers. Stoat's own default for new accounts is lower, so the client clamps to the tier rather than assuming. |
| Data | Nothing in `livekit-client` sends data unless called. The calls to avoid are `publishData`, chat, RPC, text and file streams, DTMF and data tracks. |
| Deafen | `setEnabled(false)` on remote audio publications stops the server sending audio and keeps speaking indicators. It needs reapplying after a full restart. |
| Input sensitivity and push-to-talk | Muting the track sends an event to every client each time, so the gate is a gain node in our own AudioWorklet instead. |
| RNNoise | `@sapphi-red/web-noise-suppressor` 0.4.1: MIT, no dependencies, about 220 KB of wasm and worklet, about 40 lines of glue. Stoat's client uses `livekit-rnnoise-processor`, which needs the wasm hosted separately. Needs `'wasm-unsafe-eval'` in the CSP. |
| Screen share defaults | LiveKit's defaults are 30 fps capture and 15 fps encoding with a VP8 backup, so every one of them is set explicitly (client.md 10.6). VP9 and AV1 can't simulcast on LiveKit 1.13.4, only single-layer SVC. |
| Output device and volume | Output selection works in Chromium and Firefox, not Safari. Volume above 100 % needs Web Audio mixing, which only Chromium can route to a chosen device. |
| `livekit-client` size | About 144 KB gzipped, not tree-shakeable. Loaded on first join. |

## Tasks

Each task lists what is built and its done-check. The live checks run with Playwright's fake microphone and camera, which play a tone and a test pattern.

### 1. The dev stack

**Built**:
- A CX23 at `dev.concord.jaalip.com`, with the same layout as production. It runs `server-setup.sh`, Stoat's repo at `9af5e90`, `generate_config.sh` for the dev host, and our `deploy/` files with `.allow-wipe`.
- Settings:
  - **Mail**: Mailpit, so the seed's email verification works.
  - **Video**: the same limits as production.
  - **LiveKit**: the key id `2c2e5918ca20` with its own secret.
  - **`host.env`**: no floating IP, and `TURN=off`.
- **Tool defaults** point at the dev stack (`tools/target.ts`):
  - production only through `pnpm deploy:web`, `pnpm deploy:stack:prod` and `pnpm live:prod <check>`,
  - `deploy:web` runs `routes.ts` on the stack it deployed to,
  - the seed refuses a mix of hosts.
- **The client's CSP** names the host it is built for.
- **Docs**: dev-environment.md describes the two stacks.

**Done when**:
- `pnpm seed --reset` runs.
- `m2c.ts`, `invite.ts`, `welcome.ts` and `routes.ts` pass against the dev stack.
- `pnpm live:prod tools/live/src/routes.ts` still passes.

### 2. Probes

On the dev stack, in the scratchpad, with personas.

**What they confirm**:
- the order and content of the voice events,
- the refreshed token after joining,
- a reconnect after 30 s offline,
- what device A sees when device B joins,
- `VoiceCallUpdate` in a DM and in a group,
- whether server channels ring,
- `setEnabled(false)` deafen on Stoat's LiveKit image,
- which codecs the server enables,
- what `voice_quality: 16000` in `GET /api/` does,
- RNNoise loading under our CSP,
- `join_call`'s rate limit,
- members left showing after a LiveKit restart.

**Done when** each has a recorded answer in m4-results.md, and client.md section 10 is corrected where it was wrong.

### 3. Voice state from Stoat

**Built**:
- voice states in the store,
- the sidebar participants, green icon and timer from client.md 10.3,
- the DM list's call marker,
- "In voice" on friends,
- server mute and deafen icons.

**Done when**:
- unit tests cover the event handling: join, leave, move, a missed leave, and a flag update,
- a new `voice.ts` check passes: a persona joining through the test page appears in another persona's sidebar in our client within 3 s, with the timer and mute icon, and disappears on leave.

### 4. Joining, leaving and the voice panel

**Built**:
- the lazily loaded voice module and its controller,
- `join_call` and connect,
- the voice panel, with mute and deafen in the dock,
- speaking rings and sounds,
- switching channels,
- the second-device rule,
- idle counting,
- the lint rule against LiveKit's data calls.

**Done when** `voice.ts` covers two personas in our client, both joined to one channel:
- each sees the other's speaking ring,
- a mute shows in the other's sidebar within 2 s,
- deafen stops incoming audio bytes,
- switching channels moves the persona,
- a second browser for the same persona ends the first one's call with the right message.

`m2c.ts` still passes.

### 5. Microphone pipeline and settings

**Built**:
- the chain from client.md 10.4: RNNoise, input volume and the gate with automatic and manual sensitivity, and push-to-talk,
- output device and volume,
- the Voice and video settings section with the mic test.

**Done when**:
- unit tests cover the gate's open, hold and close over level frames, and the automatic threshold,
- a live check covers the settings page: the meter moves, a threshold above the tone keeps the other persona's speaking ring off, and RNNoise loads with no CSP errors,
- **Jaakko** checks it on a real microphone in Windows Chrome.

### 6. Call view, participants and camera

**Built**:
- the call view with tiles, focus and fullscreen,
- the voice channel's chat panel,
- the participant menu with per-user volume and "Mute for me",
- camera with clamping,
- the connection-quality icon.

**Done when**:
- review screenshots show the call view with three personas, one with a camera,
- a per-user volume survives a reload.

### 7. Screen share

Needs Jaakko's encoder runs 1 to 4, and run 11 if possible.

**Built**:
- the share dialog and presets,
- clamping to the tier,
- the codec, layers and backup setting the runs pick,
- share audio,
- the viewer's quality menu,
- the stats overlay.

**Done when** a new `share.ts` passes:
- a fake 1080p60 share reaches the viewer at 1920 × 1080 and over 50 fps, read from the overlay's stats,
- throttling the sharer's upload to 1.5 Mbps moves the viewer to a lower layer while frames keep arriving, and lifting the throttle brings 1080p back.

### 8. DM and group calls

**Built**:
- the call button,
- "Calling…",
- the ringing card with ringtone and notification,
- the ring's stop rules,
- Join on the `call_started` message.

**Done when** `dm-call.ts` passes:
- persona A calls B, and B's ringing card shows within 2 s,
- Ignore stops it,
- A leaving clears it,
- B joining connects both,
- the same works in a group.

### 9. Reconnects

**Built**: the rejoin rule and the "Reconnecting" and "Disconnected" states from client.md 10.7.

**Done when** `voice.ts` covers:
- 15 s offline, after which the call comes back without the user doing anything and audio flows again,
- a LiveKit restart on the dev stack, after which both personas are back within 30 s with no members left showing.

**Jaakko** switches Wi-Fi networks during a call on a laptop or phone (milestone criterion 3).

### 10. Production and the voice evening

**Built**:
- deploy to production,
- remove the "Voice arrives later" strings,
- after the evening: m4-results.md, decision gate part B, and `/spike/` removed from production.

**Done when** milestone M4's criteria pass on the evening:
- 1080p60 from Windows Chrome reaches a viewer at 1080p60 when bandwidth allows,
- a throttled sharer steps down layers,
- voice survives a Wi-Fi switch.

The evening also covers M3's criteria 2 to 4:
- 30 minutes of voice with four or more people on different networks,
- a forced relay with UDP 3478 closed.

`dc stats` is taken under load, which decides the resize to a CX33.

### 11. Restore drill, any time after task 1

**Built**: vps-runbook.md section 7's drill on a temporary CX23 with `drill.concord`. From the same machine, the IPv6 checks M3 carried over: the IPv6 firewall, and whether Docker makes every IPv6 client one address to Stoat's rate limits.

**Done when**:
- accounts, messages, attachments and avatars come back on the drill machine,
- the IPv6 answers are recorded.

The machine is deleted afterwards.

## Jaakko's part, in order

1. **Now**: the dev stack's CX23 and DNS, as in the session's first message. €5.49 a month.
2. **Before task 7**: encoder runs 1 to 4 on the test page, Windows Chrome, with your two production accounts (m0-results.md section 3). Run 11 too if a Linux Firefox is at hand.
3. **After task 5**: a real-microphone check in Windows Chrome: RNNoise on and off, both sensitivity modes and push-to-talk.
4. **After task 9**: device tests:
   - Windows Chrome and Firefox,
   - Linux Chrome and Firefox,
   - the phone,
   - a Wi-Fi switch during a call.
5. **The voice evening**: five or more people for 30 minutes on different networks, including:
   - a game share from Windows Chrome,
   - a Firefox sharer and a Firefox viewer.

   You close UDP 3478 in the Hetzner firewall for the forced-relay run, then reopen it.
6. **Any time**: the restore drill's CX23 and the `drill.concord` record (task 11).
7. **Carried from M3**:
   - M2's device checks on production with your two accounts and a tester,
   - before the 21st, delete `~/stoat/data-dev-2026-10-14/` on the VPS,
   - save the restic password in your password manager.

## Decisions

Each one is a recommendation. Sign-off accepts them unless you say otherwise.

1. **A deafen shows to others as muted**, not as deafened. Stoat has no field for it. The alternative, LiveKit participant attributes, would reach only people in the same call and needs a token permission Stoat may not grant.
2. **Input sensitivity and push-to-talk gate the audio inside our pipeline** rather than muting the track. Nobody's sidebar flickers with every word, and the mute icon means a real mute, as on Discord.
3. **Codec**:
   - H.264 for Chromium sharers, final after your encoder runs.
   - The VP8 backup codec stays on unless Linux Firefox decodes H.264. One viewer without H.264 drops every viewer to VP8.
4. **No voice moderation in M4**, because of Stoat's bug above. The client shows server mute and deafen set elsewhere. The bug goes to the upstream list in architecture section 9.
5. **Clicking a voice channel joins it** and opens the call view, as on Discord.
6. **Voice settings and per-user volumes stay on each device**, not synced, because microphones and speakers differ.
7. **New dependencies**:
   - `livekit-client` 2.22.4,
   - `@sapphi-red/web-noise-suppressor` 0.4.1,
   - `'wasm-unsafe-eval'` added to the CSP.

   Both load on first join only.
8. **One call per account**: joining from a second device moves the call there. The first device says why and doesn't rejoin. A reload doesn't rejoin either.
9. **A DM call rings everyone else** in the DM or group, which is Stoat's default, for 30 seconds, with a browser notification when the tab is hidden.
10. **Sounds are generated tones**, not files, so there is nothing to license. Proper sounds can come in M7's polish.
