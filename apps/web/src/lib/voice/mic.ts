/**
 * The microphone chain's contract (client.md section 10.4), and a stand-in until the real chain in ./audio/
 * lands: plain getUserMedia with the browser's own processing, no gate and no push-to-talk. At that merge,
 * this file re-exports the chain from ./audio/ instead, and the call keeps the same calls.
 */

/** What the chain is built from. The voice settings (client.md section 10.9) fill this in at merge. */
export interface MicSettings {
  inputDevice?: string;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}

export interface MicChain {
  /** The processed track to publish. */
  track: MediaStreamTrack;
  /** Input level, 0 to 1. */
  level(): number;
  /** Whether the gate lets sound through now. */
  gateOpen(): boolean;
  update(settings: MicSettings): Promise<void>;
  setPushToTalk(down: boolean): void;
  stop(): void;
}

/** The settings the next chain is built with. */
export const micSettings = (): MicSettings => ({});

export async function createMicChain(settings: MicSettings): Promise<MicChain> {
  const constraints = (s: MicSettings): MediaTrackConstraints => ({
    ...(s.inputDevice ? { deviceId: { ideal: s.inputDevice } } : {}),
    echoCancellation: s.echoCancellation ?? true,
    autoGainControl: s.autoGainControl ?? true,
    noiseSuppression: true,
  });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints(settings) });
  const track = stream.getAudioTracks()[0]!;
  return {
    track,
    level: () => 0,
    gateOpen: () => true,
    update: (next) => track.applyConstraints(constraints(next)),
    setPushToTalk: () => {},
    stop: () => track.stop(),
  };
}
