/**
 * The stats overlay's figures (client.md section 10.3), from raw WebRTC stats reports. Counters are running
 * totals, so rates come from two reports in a row: frames per second from frames decoded or sent rather than
 * the browser's own smoothed `framesPerSecond`.
 */

type Stat = { type: string; id: string; [k: string]: unknown };
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** What a viewer's overlay shows. */
export interface ViewerStats {
  width: number;
  height: number;
  fps: number;
  /** Kilobits per second. */
  kbps: number;
  codec: string;
  decoder?: string | undefined;
  /** The layer being received, by its height against the published one: 'high', 'medium' or 'low'. */
  layer: 'high' | 'medium' | 'low';
  /** Percent, between the two reports. */
  loss: number;
  jitterMs?: number | undefined;
  rttMs?: number | undefined;
}

/** One encoding a sharer sends: a simulcast layer, or the only one. */
export interface SharerLayer { rid: string; width: number; height: number; fps: number; kbps: number; active: boolean }

/** What a sharer's overlay shows. */
export interface SharerStats {
  codec: string;
  encoder?: string | undefined;
  /** WebRTC's reason for sending less than asked: 'none', 'cpu', 'bandwidth' or 'other', from the top layer. */
  limitation: string;
  cpuLimited: boolean;
  layers: SharerLayer[];
  rttMs?: number | undefined;
}

export type Counters = Map<string, { at: number; frames: number; bytes: number; lost?: number; packets?: number }>;

function index(report: Iterable<Stat>): Map<string, Stat> {
  const out = new Map<string, Stat>();
  for (const s of report) out.set(s.id, s);
  return out;
}

const codecName = (all: Map<string, Stat>, s: Stat) => {
  const c = all.get(String(s.codecId ?? ''));
  return typeof c?.mimeType === 'string' ? c.mimeType.replace(/^video\//, '') : '';
};

function rtt(all: Map<string, Stat>): number | undefined {
  for (const s of all.values()) {
    if (s.type === 'candidate-pair' && (s.nominated || s.selected) && num(s.currentRoundTripTime) !== undefined) {
      return Math.round(num(s.currentRoundTripTime)! * 1000);
    }
  }
  return undefined;
}

/** A rate between the previous sample under `key` and this one, per second. Remembers this one. */
function rate(prev: Counters, key: string, at: number, frames: number, bytes: number, lost?: number, packets?: number) {
  const before = prev.get(key);
  prev.set(key, { at, frames, bytes, ...(lost !== undefined ? { lost } : {}), ...(packets !== undefined ? { packets } : {}) });
  const secs = before ? (at - before.at) / 1000 : 0;
  if (!before || secs <= 0) return { fps: 0, kbps: 0, loss: 0 };
  const dl = Math.max(0, (lost ?? 0) - (before.lost ?? 0));
  const dp = Math.max(0, (packets ?? 0) - (before.packets ?? 0));
  return {
    fps: Math.round(((frames - before.frames) / secs) * 10) / 10,
    kbps: Math.round(((bytes - before.bytes) * 8) / secs / 1000),
    loss: dl + dp > 0 ? Math.round((dl / (dl + dp)) * 1000) / 10 : 0,
  };
}

/** The layer a frame height is, against the published top height. */
export function layerOf(height: number, published: number | undefined): ViewerStats['layer'] {
  if (!published || height >= published * 0.85) return 'high';
  return height >= published * 0.4 ? 'medium' : 'low';
}

/** A viewer's figures from a receiver's report. `published` is the top layer's height. */
export function viewerStats(report: Iterable<Stat>, prev: Counters, published: number | undefined): ViewerStats | null {
  const all = index(report);
  const inbound = [...all.values()].find((s) => s.type === 'inbound-rtp' && s.kind === 'video');
  if (!inbound) return null;
  const at = num(inbound.timestamp) ?? Date.now();
  const lost = Math.max(0, num(inbound.packetsLost) ?? 0);
  const r = rate(prev, `in-${String(inbound.id)}`, at, num(inbound.framesDecoded) ?? 0, num(inbound.bytesReceived) ?? 0, lost, num(inbound.packetsReceived) ?? 0);
  const height = num(inbound.frameHeight) ?? 0;
  const jitter = num(inbound.jitter);
  return {
    width: num(inbound.frameWidth) ?? 0,
    height,
    fps: r.fps,
    kbps: r.kbps,
    codec: codecName(all, inbound),
    decoder: typeof inbound.decoderImplementation === 'string' ? inbound.decoderImplementation : undefined,
    layer: layerOf(height, published),
    loss: r.loss,
    jitterMs: jitter !== undefined ? Math.round(jitter * 1000) : undefined,
    rttMs: rtt(all),
  };
}

/** A sharer's figures from a sender's report, largest layer first. */
export function sharerStats(report: Iterable<Stat>, prev: Counters): SharerStats | null {
  const all = index(report);
  const out = [...all.values()].filter((s) => s.type === 'outbound-rtp' && s.kind === 'video');
  if (!out.length) return null;
  out.sort((a, b) => (num(b.frameHeight) ?? 0) - (num(a.frameHeight) ?? 0));
  const top = out[0]!;
  const layers = out.map((s) => {
    const r = rate(prev, `out-${String(s.id)}`, num(s.timestamp) ?? Date.now(), num(s.framesEncoded) ?? 0, num(s.bytesSent) ?? 0);
    return {
      rid: typeof s.rid === 'string' ? s.rid : '-', width: num(s.frameWidth) ?? 0, height: num(s.frameHeight) ?? 0,
      fps: r.fps, kbps: r.kbps, active: s.active !== false,
    };
  });
  const limitation = typeof top.qualityLimitationReason === 'string' ? top.qualityLimitationReason : 'none';
  return {
    codec: codecName(all, top),
    encoder: typeof top.encoderImplementation === 'string' ? top.encoderImplementation : undefined,
    limitation,
    cpuLimited: out.some((s) => s.qualityLimitationReason === 'cpu'),
    layers,
    rttMs: rtt(all),
  };
}
