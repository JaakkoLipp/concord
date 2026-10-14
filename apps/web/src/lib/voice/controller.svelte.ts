/**
 * The voice controller (client.md section 10, m4-plan.md task 4): one per session. It holds what the UI shows
 * about the call, keeps mute and deafen between calls, and runs the rejoin machine in ./rejoin.ts.
 *
 * Only `./call.ts` imports livekit-client at runtime, and it is loaded with `import()` on the first join, so
 * the SDK stays out of the main bundle. Everything here imports it as types only.
 */
import { Permission, has, isFinalJoinFailure, joinFailure, type Id, type JoinFailure, type Session } from '@concord/domain';
import { permissionsIn } from '$lib/view/channels.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { m } from '$lib/i18n/index.ts';
import type { Call, CallSink, Quality } from './call.ts';
import { CONTROLS, clampVolume, toggleDeafen, toggleMute, type Controls } from './controls.ts';
import { endCause, initial, movedElsewhere, rejoining, shown, step, type CallEvent, type CallState, type Shown } from './rejoin.ts';
import { play } from './sounds.ts';

/** Our own LiveKit, behind our origin. Never the URL Stoat returns. Local dev runs on plain http. */
const livekitUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/livekit`;
/** Web Audio mixing, for volumes above 100 %, only where it can still route to a chosen output: Chromium. */
const chromium = () => typeof navigator !== 'undefined' && /\bChrom(e|ium)\//.test(navigator.userAgent);
const DEFAULT_NODE = 'worldwide';

/** Why the panel shows a call as ended: another device took it, or anything else. */
export type Ended = 'elsewhere' | 'disconnected';

export class VoiceController {
  private readonly session: Session;
  private state = $state.raw<CallState>(initial);
  private controls = $state.raw<Controls>(CONTROLS);
  private call: Call | null = null;
  /** Bumped by every join and leave, so a superseded attempt's results and events are ignored. */
  private gen = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Our own voice state in Stoat when the server removed us, to tell another device from a kick. */
  private removedAs = $state.raw<{ joinedAt: number } | null>(null);
  readonly webAudioMix = chromium();

  /** Who is speaking in this call, by user ID, ourselves included. Empty outside a call. */
  speaking = $state.raw<ReadonlySet<Id>>(new Set());
  quality = $state<Quality>('unknown');
  /** Round-trip time in ms and packet loss in %, for the quality tooltip. */
  ping = $state<number | undefined>(undefined);
  loss = $state<number | undefined>(undefined);
  /** Per-user volume, 1 meaning 100 %. */
  volumes = $state.raw<ReadonlyMap<Id, number>>(new Map());

  readonly status: Shown = $derived(shown(this.state));
  readonly channel: Id | null = $derived(this.state.channel);
  /** The channel this client is rejoining by itself, if any: a ring for it is ignored (client.md section 10.8). */
  readonly rejoiningChannel: Id | null = $derived(rejoining(this.state));
  readonly muted = $derived(this.controls.muted);
  readonly deafened = $derived(this.controls.deafened);
  /** Volumes stop at 200 % with Web Audio mixing, and at 100 % without it. */
  readonly maxVolume = this.webAudioMix ? 2 : 1;
  /**
   * After a removal: "Joined from another device" while Stoat shows this account in a newer call, otherwise
   * "Disconnected". Stoat's events come about a second after LiveKit's, so this follows them as they arrive.
   */
  readonly ended: Ended | null = $derived.by(() => {
    if (this.state.phase !== 'disconnected') return null;
    if (this.state.reason !== 'removed') return 'disconnected';
    return movedElsewhere(this.removedAs, this.selfState()) ? 'elsewhere' : 'disconnected';
  });

  constructor(session: Session) {
    this.session = session;
  }

  /** Join a channel's call, or switch to it. Joining the call already joined does nothing. */
  join(channel: Id): void {
    const live = this.state.phase !== 'idle' && this.state.phase !== 'disconnected';
    if (live && this.state.channel === channel) return;
    this.dispatch({ type: 'join', channel });
  }

  /** Join again after a call ended without the user: the panel's Rejoin. */
  rejoin(): void {
    if (this.state.channel) this.dispatch({ type: 'join', channel: this.state.channel });
  }

  /** Leave the call, or dismiss an ended one. */
  leave(): void {
    if (this.state.phase === 'idle') return;
    const live = this.call !== null;
    this.gen++;
    this.dispatch({ type: 'leave' });
    void this.drop();
    if (live) play('leave');
  }

  toggleMute(): void {
    this.controls = toggleMute(this.controls);
    play(this.controls.muted ? 'mute' : 'unmute');
    this.applyControls();
  }

  toggleDeafen(): void {
    this.controls = toggleDeafen(this.controls);
    play(this.controls.deafened ? 'deafen' : 'undeafen');
    this.applyControls();
  }

  setVolume(user: Id, volume: number): void {
    const v = clampVolume(volume, this.maxVolume);
    this.volumes = new Map(this.volumes).set(user, v);
    this.call?.setVolume(user, v);
  }

  setPushToTalk(down: boolean): void {
    this.call?.setPushToTalk(down);
  }

  /** The session is ending. */
  destroy(): void {
    this.leave();
  }

  private selfState(): { joinedAt: number } | null {
    const self = this.session.store.selfId;
    const channel = self ? this.session.store.voiceChannelOf(self) : undefined;
    return (channel && self && this.session.store.voice.get(channel)?.[self]) || null;
  }

  private applyControls(): void {
    if (!this.call) return;
    this.call.setDeafened(this.controls.deafened);
    void this.call.setMuted(this.controls.muted).catch(() => {});
  }

  private dispatch(e: CallEvent): void {
    const [next, fx] = step(this.state, e, Date.now());
    this.state = next;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (fx?.type === 'connect') void this.connect();
    else if (fx?.type === 'wait') this.timer = setTimeout(() => this.dispatch({ type: 'retry' }), fx.ms);
  }

  /** Disconnect the current call, if any, without it reporting back. */
  private async drop(): Promise<void> {
    const call = this.call;
    this.call = null;
    this.speaking = new Set();
    this.quality = 'unknown';
    this.ping = this.loss = undefined;
    await call?.disconnect().catch(() => {});
  }

  private async connect(): Promise<void> {
    const gen = ++this.gen;
    const channel = this.state.channel;
    if (!channel) return;
    // A rejoin, or a switch while rejoining, makes no join sound: the call was never left.
    const rejoin = this.state.lostAt !== null;
    // Switching: leave the old call first, so `force_disconnect` doesn't end it as a removal.
    await this.drop();
    try {
      const voice = this.session.store.node?.voice;
      if (voice && !voice.enabled) throw new Unavailable();
      const node = voice?.nodes[0]?.name ?? DEFAULT_NODE;
      const c = this.session.store.channels.get(channel);
      const canSpeak = !c || has(permissionsIn(this.session.store, c), Permission.Speak);
      // Load the SDK before asking for the token, which lives 10 s.
      const { connect } = await import('./call.ts');
      if (gen !== this.gen) return;
      const { token } = await this.session.backend.joinCall(channel, node);
      if (gen !== this.gen) return;
      const { muted, deafened } = this.controls;
      const options = { muted, deafened, canSpeak, webAudioMix: this.webAudioMix, volumes: this.volumes };
      const call = await connect(livekitUrl(), token, options, this.sink(gen));
      // Superseded, or the room already ended, which the sink has handled.
      if (gen !== this.gen || this.state.phase !== 'connecting') return void call.disconnect();
      this.call = call;
      this.removedAs = null;
      this.dispatch({ type: 'connected' });
      if (!rejoin) play('join');
    } catch (e) {
      if (gen !== this.gen) return;
      const failure: JoinFailure = e instanceof Unavailable ? 'unavailable' : joinFailure(e);
      this.dispatch({ type: 'failed', final: isFinalJoinFailure(failure) });
      // A rejoin fails quietly: the panel already says it is reconnecting.
      if (!rejoin) toasts.show(m.voice.joinFailed[failure]);
    }
  }

  private sink(gen: number): CallSink {
    const current = () => gen === this.gen;
    return {
      reconnecting: () => { if (current()) this.dispatch({ type: 'reconnecting' }); },
      reconnected: () => { if (current()) this.dispatch({ type: 'reconnected' }); },
      ended: (reason) => {
        if (!current()) return;
        const cause = endCause(reason);
        if (cause === 'removed') this.removedAs = this.selfState();
        this.call = null;
        this.speaking = new Set();
        this.quality = 'unknown';
        this.ping = this.loss = undefined;
        this.dispatch({ type: 'ended', cause });
        // A lost connection is rejoined quietly; anything else has left the call.
        if (cause !== 'connection') play('leave');
      },
      speaking: (ids) => { if (current()) this.speaking = new Set(ids); },
      quality: (q) => { if (current()) this.quality = q; },
      stats: (s) => {
        if (!current()) return;
        this.ping = s.rtt;
        if (s.loss !== undefined) this.loss = s.loss;
      },
      peer: (change) => {
        if (current() && this.status === 'connected') play(change === 'join' ? 'peerJoin' : 'peerLeave');
      },
      micFailed: (e) => {
        if (!current()) return;
        const name = e instanceof DOMException ? e.name : '';
        toasts.show(name === 'NotAllowedError' || name === 'SecurityError' ? m.voice.micDenied : name === 'NotFoundError' ? m.voice.micMissing : m.voice.micFailed);
      },
    };
  }
}

/** Voice is switched off on this Stoat. */
class Unavailable extends Error {}
