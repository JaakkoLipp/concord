/**
 * The voice controller (client.md section 10, m4-plan.md task 4): one per session. It holds what the UI shows
 * about the call, keeps mute and deafen between calls, and runs the rejoin machine in ./rejoin.ts.
 *
 * Only `./call.ts` imports livekit-client at runtime, and it is loaded with `import()` on the first join, so
 * the SDK stays out of the main bundle. Everything here imports it as types only.
 */
import { untrack } from 'svelte';
import { isFinalJoinFailure, joinFailure, memberKey, type Id, type JoinFailure, type Session, type VoiceMoved } from '@concord/domain';
import { callRights, type CallRights } from '$lib/view/channels.ts';
import { permissionTime } from '$lib/view/clock.svelte.ts';
import { toasts } from '$lib/view/toast.svelte.ts';
import { m } from '$lib/i18n/index.ts';
import { webAudioOutput } from './audio/output.ts';
import type { Call, CallSink, Feed, MicMeter, Quality } from './call.ts';
import { CONTROLS, clampVolume, toggleDeafen, toggleMute, type Controls } from './controls.ts';
import { VideoLimitError } from './limits.ts';
import { mutedForMe, setMutedForMe, setUserVolume, userVolumes, type SharePreset } from './settings.ts';
import { sharePlan, shareBrowser } from './share.ts';
import { endCause, initial, movedElsewhere, rejoining, shown, step, type CallEvent, type CallState, type Shown } from './rejoin.ts';
import { movesThisCall, tokenUsable } from './move.ts';
import { play } from './sounds.ts';

/** Our own LiveKit, behind our origin. Never the URL Stoat returns. Local dev runs on plain http. */
const livekitUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/livekit`;
/** Web Audio mixing, for volumes above 100 %, only where it can still route to a chosen output: Chromium. */
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
  /**
   * This connection's own voice state in Stoat, taken at the first stats tick that sees it, two seconds after
   * connecting. Not taken at the removal: another device's join can reach us before LiveKit's removal does, and
   * would then look like our own.
   */
  private ownState: { joinedAt: number } | null = null;
  /** The token of a move being followed, for the join that follows it. Consumed by `connect`. */
  private pendingMove: { channel: Id; token: string } | null = null;
  /** The channel left by a followed move that hasn't connected yet: a second move before then still names it as `from`. */
  private leaving: Id | null = null;
  private readonly stopMoves: () => void;
  /** Web Audio mixing, for volumes above 100 %, only where it can also play to the chosen speaker (output.ts). */
  readonly webAudioMix = webAudioOutput();

  /** Who is speaking in this call, by user ID, ourselves included. Empty outside a call. */
  speaking = $state.raw<ReadonlySet<Id>>(new Set());
  quality = $state<Quality>('unknown');
  /** Round-trip time in ms and packet loss in %, for the quality tooltip. */
  ping = $state<number | undefined>(undefined);
  loss = $state<number | undefined>(undefined);
  /** Per-user volume, 1 meaning 100 %, saved on this device (m4-plan.md decision 6). */
  volumes = $state.raw<ReadonlyMap<Id, number>>(new Map(Object.entries(userVolumes()).map(([id, percent]) => [id, percent / 100])));
  /** Users muted for this device only, also saved. */
  mutedForMe = $state.raw<ReadonlySet<Id>>(new Set(mutedForMe()));
  /** The call's video, cameras and screen shares, our own included. Empty outside a call. */
  feeds = $state.raw<Feed[]>([]);
  /** Whether our camera is on, or starting. Off again after every call. */
  camera = $state(false);
  /** Whether our screen share is on, or its picker open. Off again after every call. */
  sharing = $state(false);

  readonly status: Shown = $derived(shown(this.state));
  readonly channel: Id | null = $derived(this.state.channel);
  /** The channel this client is rejoining by itself, if any: a ring for it is ignored (client.md section 10.8). */
  readonly rejoiningChannel: Id | null = $derived(rejoining(this.state));
  readonly muted = $derived(this.controls.muted);
  readonly deafened = $derived(this.controls.deafened);
  /**
   * Whether a moderator has server muted or deafened us in this call's server (m4.7-plan.md task 3). Stoat stores the flags
   * on the member and enforces nothing, so this client does: a server mute takes the microphone off the call like losing Speak
   * does, a server deafen stops what we hear, and both lock their buttons. Never true in a DM call.
   */
  private readonly selfMember = $derived.by(() => {
    const c = this.state.channel ? this.session.store.channels.get(this.state.channel) : undefined;
    const self = this.session.store.selfId;
    return c?.kind === 'text' && self ? this.session.store.members.get(memberKey(c.server, self)) : undefined;
  });
  readonly serverMuted: boolean = $derived(!!this.selfMember && !this.selfMember.canPublish);
  readonly serverDeafened: boolean = $derived(!!this.selfMember && !this.selfMember.canReceive);
  /**
   * Speak, Video and Listen in this call's channel (m4.7-plan.md task 5). A server mute or deafen takes them away too, as
   * in Stoat. Without Speak and Video Stoat's token restricts nothing (m4.7-results.md task 1), so this client stops the
   * microphone, camera and screen share itself.
   */
  readonly rights: CallRights = $derived.by(() => callRights(this.session.store, this.state.channel ? this.session.store.channels.get(this.state.channel) : undefined));
  /** Why the microphone button is locked, for its tooltip, or null when it works. */
  readonly micLock: string | null = $derived(this.serverMuted ? m.voiceMod.youServerMuted : this.rights.speak ? null : m.voice.cantSpeak);
  /** Why the camera and share buttons are locked, or null. */
  readonly videoLock: string | null = $derived(this.rights.video ? null : m.voice.cantVideo);
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
    this.stopMoves = session.onVoiceMoved((move) => this.followMove(move));
    // Speak gained or lost mid-call, by a role or an override: the call publishes the microphone once allowed.
    this.stopWatching = $effect.root(() => {
      $effect(() => {
        const can = this.rights.speak && !this.serverMuted;
        untrack(() => this.call?.setCanSpeak(can));
      });
      // A timeout doesn't end a call in Stoat (m4.7-results.md task 1); "can only read" means leaving it (task 6).
      $effect(() => {
        const until = this.selfMember?.timeout;
        if (!until || Date.parse(until) <= permissionTime(until).getTime()) return;
        untrack(() => {
          if (this.state.phase === 'idle' || this.state.phase === 'disconnected') return;
          this.leave();
          toasts.show(m.moderation.selfTimedOut, 'info');
        });
      });
      $effect(() => {
        if (this.rights.video) return;
        untrack(() => {
          if (this.camera) this.toggleCamera();
          if (this.sharing) this.stopShare();
        });
      });
      $effect(() => {
        const server = this.serverDeafened;
        untrack(() => this.call?.setDeafened(this.controls.deafened || server));
      });
    });
  }
  private readonly stopWatching: () => void;

  /** Join a channel's call, or switch to it. Joining the call already joined does nothing. */
  join(channel: Id): void {
    const live = this.state.phase !== 'idle' && this.state.phase !== 'disconnected';
    if (live && this.state.channel === channel) return;
    // Stoat would refuse it: say so rather than trying.
    if (!callRights(this.session.store, this.session.store.channels.get(channel)).connect) return void toasts.show(m.voice.cantJoin);
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
    this.pendingMove = this.leaving = null;
    this.dispatch({ type: 'leave' });
    void this.drop();
    if (live) play('leave');
  }

  toggleMute(): void {
    if (this.serverMuted || !this.rights.speak) return;
    this.controls = toggleMute(this.controls);
    play(this.controls.muted ? 'mute' : 'unmute');
    this.applyControls();
  }

  toggleDeafen(): void {
    if (this.serverDeafened) return;
    this.controls = toggleDeafen(this.controls);
    play(this.controls.deafened ? 'deafen' : 'undeafen');
    this.applyControls();
  }

  setVolume(user: Id, volume: number): void {
    const v = clampVolume(volume, this.maxVolume);
    this.volumes = new Map(this.volumes).set(user, v);
    setUserVolume(user, v * 100);
    this.call?.setVolume(user, v);
  }

  /** A user's volume, 1 meaning 100 %. */
  volumeOf(user: Id): number {
    return this.volumes.get(user) ?? 1;
  }

  /** "Mute for me": silences a user on this device only, keeping their volume. */
  toggleMutedForMe(user: Id): void {
    const on = !this.mutedForMe.has(user);
    const next = new Set(this.mutedForMe);
    if (on) next.add(user);
    else next.delete(user);
    this.mutedForMe = next;
    setMutedForMe(user, on);
    this.call?.setMutedForMe(user, on);
  }

  /** Turns our camera on or off. Only in a call. */
  toggleCamera(): void {
    const call = this.call;
    if (!call) return;
    const on = !this.camera;
    if (on && !this.rights.video) return void toasts.show(m.voice.cantVideo);
    this.camera = on;
    call.setCamera(on, this.session.videoLimit()).catch((e: unknown) => {
      if (this.call !== call) return;
      this.camera = false;
      const name = e instanceof DOMException ? e.name : '';
      toasts.show(e instanceof VideoLimitError ? m.voice.videoLimit : name === 'NotAllowedError' || name === 'SecurityError' ? m.voice.cameraDenied : m.voice.cameraFailed);
    });
  }

  /**
   * Shares the screen with a preset, fitted into the tier (client.md section 10.6). Call it from the share
   * dialog's click, so the browser's picker has the user's gesture. Cancelling the picker is not an error.
   */
  startShare(preset: SharePreset, audio: boolean): void {
    const call = this.call;
    if (!call || this.sharing) return;
    if (!this.rights.video) return void toasts.show(m.voice.cantVideo);
    const limit = this.session.videoLimit();
    const plan = sharePlan(preset, limit, shareBrowser(navigator.userAgent));
    if (!plan) return void toasts.show(m.voice.videoLimit);
    this.sharing = true;
    call.startShare(plan, audio, limit).catch((e: unknown) => {
      if (this.call !== call) return;
      this.sharing = false;
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      toasts.show(e instanceof VideoLimitError ? m.voice.videoLimit : m.voice.shareFailed);
    });
  }

  stopShare(): void {
    this.sharing = false;
    void this.call?.stopShare().catch(() => {});
  }

  /**
   * The call's own microphone meter, while it has one. The mic test uses it during a call rather than opening the
   * microphone again and playing it back, which would echo into the call.
   */
  micMeter(): MicMeter | null {
    return this.call?.mic() ?? null;
  }

  setPushToTalk(down: boolean): void {
    this.call?.setPushToTalk(down);
  }

  /** The session is ending. */
  destroy(): void {
    this.leave();
    this.stopWatching();
    this.stopMoves();
  }

  /**
   * A moderator moved us (m4.7-plan.md task 2). Stoat's event arrives before LiveKit removes us from the old room, which
   * is what tells a move from a kick: connect to the new room with the token it sent, keeping mute, deafen and volumes. A
   * token too old to use, or refused, falls back to an ordinary join (in `connect`).
   */
  private followMove(move: VoiceMoved): void {
    if (!movesThisCall(move.from, this.state.channel, this.leaving)) return;
    const usable = tokenUsable(move.token, Date.now());
    // A removal that LiveKit delivered first is still a move, but only while its token is fresh: an old one means the call
    // ended some other way, and a rejoin would undo it.
    if (!usable && this.state.phase === 'disconnected') return;
    this.pendingMove = usable ? { channel: move.to, token: move.token } : null;
    this.leaving = move.from;
    this.dispatch({ type: 'moved', channel: move.to });
    const to = this.session.store.channels.get(move.to);
    if (to && 'name' in to) toasts.show(m.voice.moved(to.name), 'info');
  }

  private selfState(): { joinedAt: number } | null {
    const self = this.session.store.selfId;
    const channel = self ? this.session.store.voiceChannelOf(self) : undefined;
    return (channel && self && this.session.store.voice.get(channel)?.[self]) || null;
  }

  private applyControls(): void {
    if (!this.call) return;
    this.call.setDeafened(this.controls.deafened || this.serverDeafened);
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
    this.feeds = [];
    this.camera = false;
    this.sharing = false;
    this.quality = 'unknown';
    this.ping = this.loss = undefined;
    await call?.disconnect().catch(() => {});
  }

  private async connect(): Promise<void> {
    const gen = ++this.gen;
    this.ownState = null;
    const channel = this.state.channel;
    if (!channel) return;
    const moved = this.pendingMove?.channel === channel ? this.pendingMove : null;
    this.pendingMove = null;
    // A rejoin, or a switch while rejoining, makes no join sound and fails quietly: the call was never left. A move
    // makes no sound either, but its failure is told.
    const rejoin = this.state.lostAt !== null;
    // Switching: leave the old call first, so `force_disconnect` doesn't end it as a removal.
    await this.drop();
    try {
      const voice = this.session.store.node?.voice;
      if (voice && !voice.enabled) throw new Unavailable();
      const node = voice?.nodes[0]?.name ?? DEFAULT_NODE;
      const canSpeak = this.rights.speak && !this.serverMuted;
      // Load the SDK before asking for the token, which lives 10 s.
      const { connect } = await import('./call.ts');
      if (gen !== this.gen) return;
      const controls = () => ({ muted: this.controls.muted, deafened: this.controls.deafened || this.serverDeafened });
      const options = {
        current: () => gen === this.gen && this.state.phase === 'connecting',
        // Joining can wait on a token and the network. Read the current choices when the room is ready.
        get muted() { return controls().muted; },
        get deafened() { return controls().deafened; },
        canSpeak, webAudioMix: this.webAudioMix, volumes: this.volumes, mutedForMe: this.mutedForMe,
      };
      let call: Call;
      try {
        const token = moved ? moved.token : (await this.session.backend.joinCall(channel, node)).token;
        if (gen !== this.gen) return;
        call = await connect(livekitUrl(), token, options, this.sink(gen));
      } catch (e) {
        if (!moved || gen !== this.gen) throw e;
        // The move's token was refused or ran out on the way: join as anyone would.
        const { token } = await this.session.backend.joinCall(channel, node);
        if (gen !== this.gen) return;
        call = await connect(livekitUrl(), token, options, this.sink(gen));
      }
      // Superseded, or the room already ended, which the sink has handled.
      if (gen !== this.gen || this.state.phase !== 'connecting') return void call.disconnect();
      this.call = call;
      this.applyControls();
      this.leaving = null;
      this.removedAs = null;
      this.dispatch({ type: 'connected' });
      if (!rejoin && !moved) play('join');
    } catch (e) {
      if (gen !== this.gen) return;
      this.leaving = null;
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
        if (cause === 'removed') this.removedAs = this.ownState ?? this.selfState();
        this.call = null;
        this.speaking = new Set();
        this.feeds = [];
        this.camera = false;
        this.sharing = false;
        this.quality = 'unknown';
        this.ping = this.loss = undefined;
        this.dispatch({ type: 'ended', cause });
        // A lost connection is rejoined quietly; anything else has left the call.
        if (cause !== 'connection') play('leave');
      },
      speaking: (ids) => { if (current()) this.speaking = new Set(ids); },
      feeds: (feeds) => { if (current()) this.feeds = feeds; },
      sharing: (on) => { if (current()) this.sharing = on; },
      quality: (q) => { if (current()) this.quality = q; },
      stats: (s) => {
        if (!current()) return;
        this.ownState ??= this.selfState();
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
