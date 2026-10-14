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

**Open**: in 1 of 17 runs, headless Chromium's AudioContext reported device errors. There were no speaking rings, and the second browser's call ended without a click. It didn't reproduce in 10 runs with full logs.

## Task 2: probes, 2026-10-14

On the local stack with `dev`, `aino` and a third persona. The probe script is kept in the session scratchpad, not the repo.

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

**Bug, open: dead audio after a full restart.** In two of three runs of the 25 s cut, both clients said "Voice connected" afterwards, but no audio flowed either way for at least 20 s. In the third, audio flowed 12 s after the network returned. The SDK logs "failed to remove track" while republishing the microphone on the new connection. The failing runs took 30 to 40 s to come back, the good one 12 s. This is the Wi-Fi-switch case from milestone criterion 3, so task 9 fixes it.

**UI bugs, open**: during total loss the quality tooltip says "Ping 0 ms, packet loss 0 %". Missing figures should be left out, and the loss should come from received packets.

**Still to probe**: the members-left check after a LiveKit restart (the third persona couldn't join Pelaamo), H.264 in headless Chromium (task 7's agent), and the AudioContext flake.
