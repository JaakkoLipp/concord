# M4 results

Plan: [m4-plan.md](m4-plan.md). Written task by task.

## Task 1: the dev stack, on this machine, 2026-10-14

Jaakko chose a local stack over a CX23. It runs in Docker Desktop at `http://localhost`, laid out like production's `~/stoat`, with every port on `127.0.0.1`. Nothing was installed in WSL. dev-environment.md's appendix has the setup.

| Check | Result |
|---|---|
| `GET /api/` | 0.15.5, both video tiers 2560 × 1440, LiveKit node `ws://localhost/livekit` |
| `pnpm seed --reset` | 24 personas, 669 messages in 221 s |
| `m2c.ts` | The built server matches the seeded one, and the non-admin is refused. 107 s, as in M2c. |
| `invite.ts`, `welcome.ts`, `routes.ts` | All pass |
| `pnpm live:prod tools/live/src/routes.ts` | Production still passes |

**Docker Desktop quirks**, fixed in `deploy/`:
- It never passes on the end of a container's stdin, so `create-account.sh` hung. It now mounts the request body.
- A single-file bind mount follows the file it first saw. After `sed -i` replaced `Revolt.toml`, `api` couldn't restart. Scripts now edit it in place, which also keeps running containers on the VPS from reading a stale copy.

## Tasks 3 to 5, first live run, 2026-10-14

`tools/live/src/voice.ts`, with `dev` and `aino` in Pelaamo through our client:
- both join, see each other with the timer and speaking rings,
- a mute shows on the other side within 2 s,
- a second browser for `aino` ends the first call with "Joined from another device", one `join_call` each,
- leaving clears the sidebar.

**Bug found and fixed**: Stoat sends the old session's `VoiceChannelLeave` and then the new session's `VoiceChannelJoin` about 50 ms later. They could reach the old device before LiveKit's removal, which then read the new join as its own and said "Disconnected". The controller now keeps its own voice state from about a second after connecting.

**Flaky speaking rings**: in 1 of 17 runs there were no speaking rings. The cause was the test source, not the client, as task 5's check found on 2026-10-15.

## Task 2: probes, 2026-10-14

On the local stack with `dev`, `aino` and a third persona. The probe scripts were throwaway, and the scratchpad holding them was cleared when WSL restarted.

| Question | Answer |
|---|---|
| Media path through Docker Desktop | UDP, straight to `127.0.0.1:500xx`. No TCP fallback was needed. |
| `join_call` rate limit | 15 per 10 s per channel, its own count |
| RNNoise under our CSP | The SIMD wasm loads (200), with no CSP errors |
| Deafen with `setEnabled(false)` | Incoming audio fell from about 27 KB per 3 s to 0. The server stops sending. |
| Server voice channels ring? | No. A watcher socket saw only Join, Leave and state updates for a server channel, never `VoiceCallUpdate`. |
| Second device, event order | Old session's leave, then the new join 50 ms later. A fresh `Ready` lists the user once. |
| `voice_quality: 16000` in `GET /api/` | Reported only. Neither Stoat's backend nor its client uses it. We ignore it. |
| Playwright's offline mode | **Doesn't reach WebRTC.** The call stays connected on the same UDP path. |
| Throttling and cutting media | `tc` (`netem` and `tbf`) and `iptables` work in LiveKit's network namespace, from a short-lived `nicolaka/netshoot:v0.14` container. The checks use that. It shapes every client at once, since all arrive through Docker's NAT. |
| Media cut for 15 or 40 s, signalling kept | No reconnect. The panel says "Voice connected", the quality icon turns "Poor" after about 15 s, and audio resumes by itself when media returns. |
| Signalling and media cut for 25 s | Both clients show "Reconnecting…" after 15 to 30 s. The server drops the participants, and LiveKit does a full restart into a new room session when the network returns. They are back 12 to 40 s later, without a new `join_call`. |

**Dead audio after a full restart: most likely the local stack, not the client.** In 3 of 6 runs of the 25 s cut, both clients said "Voice connected" afterwards, but no audio flowed either way for at least 20 s. In the others, audio flowed 12 s after the network returned.
- **In every failing run**, the selected ICE pair led to a peer-reflexive remote on a port outside LiveKit's 50000 to 50100, such as `:50433`. Every good run went straight to `127.0.0.1:500xx`.
- So after the cut, Docker Desktop's UDP forwarding rewrote LiveKit's source port, and the browser settled on a path that goes nowhere.
- The microphone was republished on the new connection in every run: a live audio sender, 7 receivers.
- Production's Docker on Linux does plain NAT on fixed ports, so this is not expected there. It is still the Wi-Fi-switch case from milestone criterion 3, so Jaakko's Wi-Fi switch on production and the voice evening decide it.
- Task 9's check uses the media-only cut, which recovers reliably here.

**UI bugs, open**: during total loss the quality tooltip says "Ping 0 ms, packet loss 0 %". Missing figures should be left out, and the loss should come from received packets.

**Still to probe**: the members-left check after a LiveKit restart (the third persona couldn't join Pelaamo). H.264 in headless Chromium works (task 7).

## Task 5: the gate's check, 2026-10-15

`voice.ts` now covers task 5's done-check, and all of `voice.ts`, `callview.ts` and `dm-call.ts` pass.

**The fake microphone was the problem.** Chromium's fake device beeps in short pulses.
- Noise suppression, echo cancellation and gain control learn to remove a steady beep within seconds, whichever of them is on. Aino's level fell from -20 to -50 dBFS in under a minute.
- LiveKit's speaking detection rarely counted the beep as speech. Later in a call, rings stopped, which made every ring check flaky.
- `tools/live/src/media.ts` now writes a speech-like WAV, syllable-length bursts of a harmonic tone at changing pitch, which the checks play as the microphone. With it, speaking registered in 30 of 30 samples both ways, at the default settings.

**The gate is checked by what leaves the browser**: with aino's threshold at 0 dBFS, her outgoing audio fell from about 12 KB/s to 15 B/s, Opus's silence frames, and her ring went. Back at -100 dBFS, about 12 KB/s and the ring returned. The meter moves and RNNoise loads under the CSP.

**Changed: the mic test during a call** now shows the call's own microphone level, without playing it back. Playback would echo into the call, and a second microphone chain is not needed. The settings say so while in a call.

**Tried and dropped: an AudioContext with no speaker** (Chromium's `sinkId: {type: 'none'}`), meant to keep the chain alive when the audio device fails. With it, LiveKit registered no speaking at all, though audio left the browser, so it stays out.

## Task 8: DM and group calls, 2026-10-15

`tools/live/src/dm-call.ts` with `sanna`, `lauri` and `maija`: 20 of 20 pass.

| Check | Result |
|---|---|
| A call rings the other side | The ringing card showed 0.4 s after the call button was clicked |
| Ignore, and the caller leaving | Ignore stops the ring for good. The caller leaving clears it within 21 ms. |
| Hidden tab | "Sanna Korhonen: Calling you…" as a browser notification. The ring timed out at 30.3 s and the notification closed. |
| Join from the card | Both connected 0.6 s after the call button was clicked |
| Group | Both others rang. One joined from the card. The other ignored, then joined from the "started a call" line, whose Join went away when the call ended. |

**How Stoat's ring events behaved**:
- `VoiceCallUpdate {ended: false}` reaches only the other members, 2 to 6 ms after the caller's `VoiceChannelJoin`, once per call. The caller never gets it.
- `{ended: true}` reaches everyone, the caller included, as the last person leaves, with `started_at: null`.
- `started_at` has whole seconds only, so two calls in the same second look alike. The client tells them apart by the end in between.

A ring for a call this client is rejoining stays silent. A unit test covers it in `rejoin.test.ts`.

## Task 6: call view, participants and camera, 2026-10-15

`tools/live/src/callview.ts`, with `ben`, `eetu` and `emma` in Olohuone:
- before joining, emma's call view lists the two already in and offers Join,
- all three see three tiles, and the others see ben's camera playing,
- a volume set in eetu's participant menu for ben is still there after a reload, read from the sidebar row's menu.

**Headless Chromium caps volumes at 100 %**: its user agent says `HeadlessChrome`, which the controller's Chromium test doesn't match, so it gets no Web Audio mixing. Real Chrome and Edge are matched. The check sets 60 %.

**Bug found and fixed**: a remote camera or share that was turned off stayed as a tile. LiveKit announces the unsubscribe before it lets go of the track.

`dm-call.ts` wasn't rerun after the DM call view was added, because its personas were outside this run's set.

## Task 7: screen share, 2026-10-15

`tools/live/src/share.ts`, with `ben` sharing a 1920 × 1080 canvas at 60 fps through the app's dialog and publish path, and `eetu` watching with the share focused at device scale 2. Figures come from the viewer's stats overlay.

| Check | Result |
|---|---|
| Codec | H.264 at both ends. Headless Chromium 156 sends it with `SimulcastEncoderAdapter (OpenH264 ×3)`. |
| Sharer | `f` 1920 × 1080 at 60 fps and 7.7 Mbps, `h` 1280 × 720 at 30 fps, `q` 640 × 360 at 15 fps. Not CPU-limited. |
| Viewer | 1920 × 1080 within a few seconds. Frame rate ramps 11, 13, 19, 28, 30, 35 and reaches 60 after about 9 s, while the bandwidth estimate grows. |
| Sharer's upload policed to 1.5 Mbit/s | `tc` ingress police on LiveKit's incoming UDP. The sharer reports `bandwidth` and keeps only `q`. The viewer stalls for about 3 s, then gets 360p at 15 fps. **1080p is back 6 s after the policing ends.** |
| Viewer's downlink shaped to 1.5 Mbit/s | `tbf` on what LiveKit sends. The viewer stalls for about 3 s, then gets 360p at 15 fps. **1080p didn't come back in 4 minutes**, although the sharer sent all three layers at full rate throughout. |

**Why the downlink doesn't recover**: LiveKit 1.13.4 estimates each subscriber's bandwidth from the browser's REMB by default. Its log shows:
- `channel congestion detected`, with the estimate down from 100 Mbps to about 1.17 Mbps,
- probes every 2 minutes that end `INCONCLUSIVE`, because the estimate stays exactly at 1,168,112 bps,
- the stream allocator settling into `STABLE` at that estimate.

Chrome's receive-side estimate only grows when traffic approaches it, so a viewer held at 500 kbps never shows more room.

**What it means**: after a Wi-Fi blip, a viewer may stay at 360p for minutes. LiveKit has a send-side (TWCC) estimate, off by default: `rtc.congestion_control.use_send_side_bwe: true` in `livekit.yml`. Turning it on is Jaakko's decision. It should be tried on the local stack with `share.ts` first. The upload case recovers either way.

**Not checked headless**:
- share audio, because the fake capture has none,
- Firefox's single VP8 layer,
- the real 1080p60 on Jaakko's Windows machine.

**Quality menu**: with adaptive streaming, `setVideoQuality` can only lower the layer that the tile's size asks for. So "1080p" behaves like Auto, and a small tile can't be forced up to 1080p.


## Task 9: reconnects, 2026-10-15

`tools/live/src/voice-restart.ts`, on the local stack only, with `dev`, `aino` and `ben`. It passes.

| Check | Result |
|---|---|
| Media into LiveKit dropped for 15 s | Audio fell from about 12 KB/s to 0. The call stayed up, and audio was back at about 9.5 KB/s 5 s later, without a click. |
| LiveKit restarted | Both showed "Reconnecting…", then "Voice connected" 0 to 8 s later, through LiveKit's own reconnect with no new `join_call`, and audio flowed again |

**Stoat's voice state after a LiveKit restart is unreliable.** This is decision gate criterion 5 evidence: the problems are in voice-ingress, not LiveKit or our client.
- **A ghost**: `ben` closed his browser just before the restart. In some runs he stayed listed in the channel indefinitely, to fresh clients too, even after everyone else left. His next call clears it.
- **People missing**: in other runs, the sidebar listed nobody 30 s after the restart, though `dev` and `aino` were talking.
- **Delays**: joins and leaves showed up to 30 s late, and a join right after an earlier restart took 36 s.
- **Why, from Stoat 0.15.5's source** (a Sonnet agent read it):
  - Voice state lives only in Redis, with no expiry, and nothing reconciles it with LiveKit.
  - voice-ingress handles each webhook by user identity alone, so an old session's late leave can remove someone who is back.
  - When room metadata is missing, it answers 500 without logging why. After a restart LiveKit probably recreates the room without Stoat's metadata (unconfirmed).
  - LiveKit retries failed webhooks, but drops events older than 30 s and loses its queue in a restart, so a lost leave is never redone.
  - Unchanged on Stoat's main branch.
- **What this means in practice**: a restart is the trigger. Without one, leaving and closing the browser work, as tasks 3 and 4 showed.

**Changed, in the repo, not yet on production**: `restart-livekit.sh` checks weekly but restarts LiveKit only when the TURN certificate is newer than the running LiveKit, about every two months instead of every week.
