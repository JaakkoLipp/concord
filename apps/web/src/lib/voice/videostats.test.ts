/** The stats overlay's figures from two reports in a row. */
import { describe, expect, it } from 'vitest';
import { layerOf, sharerStats, viewerStats, type Counters } from './videostats.ts';

const codec = { type: 'codec', id: 'c1', mimeType: 'video/H264' };
const pair = { type: 'candidate-pair', id: 'p', nominated: true, currentRoundTripTime: 0.012 };

describe('viewerStats', () => {
  it('reads size, codec and layer, and rates between two reports', () => {
    const prev: Counters = new Map();
    const at = (t: number, frames: number, bytes: number, lost: number, packets: number) => [codec, pair, {
      type: 'inbound-rtp', id: 'in', kind: 'video', timestamp: t, codecId: 'c1', frameWidth: 1280, frameHeight: 720,
      framesDecoded: frames, bytesReceived: bytes, packetsLost: lost, packetsReceived: packets, jitter: 0.004, decoderImplementation: 'FFmpeg',
    }];
    expect(viewerStats(at(1000, 0, 0, 0, 0), prev, 1080)!.fps).toBe(0);
    const s = viewerStats(at(3000, 120, 1_000_000, 1, 99), prev, 1080)!;
    expect(s).toMatchObject({ width: 1280, height: 720, fps: 60, kbps: 4000, codec: 'H264', layer: 'medium', loss: 1, jitterMs: 4, rttMs: 12, decoder: 'FFmpeg' });
  });
});

describe('layerOf', () => {
  it('names layers by height against the published one', () => {
    expect(layerOf(1080, 1080)).toBe('high');
    expect(layerOf(720, 1080)).toBe('medium');
    expect(layerOf(360, 1080)).toBe('low');
    expect(layerOf(500, undefined)).toBe('high');
  });
});

describe('sharerStats', () => {
  it('lists layers largest first and reads the encoder and limitation from the top one', () => {
    const report = [codec, pair,
      { type: 'outbound-rtp', id: 'q', kind: 'video', rid: 'q', frameWidth: 640, frameHeight: 360, codecId: 'c1', qualityLimitationReason: 'none', timestamp: 0, framesEncoded: 0, bytesSent: 0 },
      { type: 'outbound-rtp', id: 'f', kind: 'video', rid: 'f', frameWidth: 1920, frameHeight: 1080, codecId: 'c1', qualityLimitationReason: 'cpu', encoderImplementation: 'OpenH264', timestamp: 0, framesEncoded: 0, bytesSent: 0 },
    ];
    const s = sharerStats(report, new Map())!;
    expect(s).toMatchObject({ codec: 'H264', encoder: 'OpenH264', limitation: 'cpu', cpuLimited: true, rttMs: 12 });
    expect(s.layers.map((l) => l.rid)).toEqual(['f', 'q']);
  });
});
