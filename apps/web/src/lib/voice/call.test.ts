import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallOptions, CallSink } from './call.ts';

const fake = vi.hoisted(() => ({
  ready: Promise.resolve(),
  published: vi.fn(),
  receiving: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('./mic.ts', () => ({
  openMic: async () => ({ track: {}, stop: fake.stop, gateOpen: () => false, level: () => -100 }),
}));
vi.mock('livekit-client', () => {
  class LocalAudioTrack {
    isMuted = false;
    async mute() { this.isMuted = true; }
    async unmute() { this.isMuted = false; }
    stop() {}
  }
  class Room {
    state = 'connecting';
    localParticipant = {
      identity: 'self', videoTrackPublications: new Map(),
      publishTrack: async (track: LocalAudioTrack) => { fake.published(track.isMuted); },
    };
    remoteParticipants = new Map([['peer', {
      identity: 'peer', setVolume() {}, videoTrackPublications: new Map(), trackPublications: new Map(),
      audioTrackPublications: new Map([['audio', { setEnabled: fake.receiving }]]),
    }]]);
    on() { return this; }
    async connect() { await fake.ready; this.state = 'connected'; }
    async startAudio() {}
    async disconnect() { this.state = 'disconnected'; }
  }
  return {
    Room, LocalAudioTrack, RoomEvent: {},
    Track: { Source: { Microphone: 'microphone', ScreenShare: 'screen', ScreenShareAudio: 'screen-audio' } },
    VideoQuality: {}, VideoPreset: class {}, createLocalVideoTrack: vi.fn(),
  };
});

import { connect } from './call.ts';

const sink = (): CallSink => ({
  reconnecting: vi.fn(), reconnected: vi.fn(), ended: vi.fn(), speaking: vi.fn(), quality: vi.fn(),
  stats: vi.fn(), peer: vi.fn(), micFailed: vi.fn(), feeds: vi.fn(), sharing: vi.fn(),
});
const options = (muted = false, deafened = false): CallOptions => ({
  current: () => true, muted, deafened, canSpeak: true, webAudioMix: false,
  volumes: new Map(), mutedForMe: new Set(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fake.ready = Promise.resolve();
  vi.stubGlobal('document', { createElement: () => ({ remove() {} }), body: { append() {} } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('joining with voice controls', () => {
  it.each([[true, false], [true, true], [false, false]])('preserves mute=%s and deafen=%s before publishing', async (muted, deafened) => {
    const callbacks = sink();
    const call = await connect('url', 'token', options(muted, deafened), callbacks);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.published).toHaveBeenCalledExactlyOnceWith(muted);
    expect(fake.receiving).toHaveBeenLastCalledWith(!deafened);
    expect(callbacks.micFailed).not.toHaveBeenCalled();
    await call.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([true, false])('uses controls changed while the room connects: muted=%s', async (muted) => {
    let ready!: () => void;
    fake.ready = new Promise<void>((resolve) => { ready = resolve; });
    const controls = options(!muted, !muted);
    const joining = connect('url', 'token', controls, sink());
    controls.muted = muted;
    controls.deafened = muted;
    ready();
    const call = await joining;
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.published).toHaveBeenCalledExactlyOnceWith(muted);
    expect(fake.receiving).toHaveBeenLastCalledWith(!muted);
    await call.disconnect();
  });
});
