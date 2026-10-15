/**
 * What a screen share captures and publishes (client.md section 10.6, architecture 5.2), as plain data so it can
 * be tested without a browser. ./call.ts turns a plan into LiveKit's capture and publish options.
 */
import type { VideoLimit } from '@concord/domain';
import { fitTier, type Size } from './limits.ts';
import type { SharePreset } from './settings.ts';

export type Degradation = 'maintain-framerate' | 'maintain-resolution';

export interface Preset {
  /** The capture size asked for, or null for the source's own size (the Text preset). */
  size: Size | null;
  fps: number;
  /** Bits per second for the top layer. */
  bitrate: number;
  degradation: Degradation;
  hint: 'motion' | 'detail';
}

export const PRESETS: Record<SharePreset, Preset> = {
  '1080p60': { size: { width: 1920, height: 1080 }, fps: 60, bitrate: 8_000_000, degradation: 'maintain-framerate', hint: 'motion' },
  '1080p30': { size: { width: 1920, height: 1080 }, fps: 30, bitrate: 5_000_000, degradation: 'maintain-framerate', hint: 'motion' },
  '720p30': { size: { width: 1280, height: 720 }, fps: 30, bitrate: 3_000_000, degradation: 'maintain-framerate', hint: 'motion' },
  text: { size: null, fps: 5, bitrate: 3_000_000, degradation: 'maintain-resolution', hint: 'detail' },
};

/** A lower simulcast layer: its height, frame rate and bitrate. The width follows the capture's shape. */
export interface Layer { height: number; fps: number; bitrate: number }

/** The layers under the top one for H.264 and VP8: 720p30 and 360p15, so throttled viewers step down. */
const LAYERS: Layer[] = [
  { height: 720, fps: 30, bitrate: 2_500_000 },
  { height: 360, fps: 15, bitrate: 600_000 },
];

export type ShareBrowser = 'chromium' | 'firefox' | 'other';

/** Which publishing path this browser takes. Headless Chromium says "HeadlessChrome", so no word boundary. */
export function shareBrowser(ua: string): ShareBrowser {
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrom(e|ium)\//.test(ua)) return 'chromium';
  return 'other';
}

/** Whether "Share audio" is offered: Chromium only captures tab and system audio. */
export const canShareAudio = (b: ShareBrowser) => b === 'chromium';

export interface SharePlan {
  /** What to ask getDisplayMedia for; null asks for the source's size. */
  capture: Size | null;
  fps: number;
  bitrate: number;
  degradation: Degradation;
  hint: 'motion' | 'detail';
  codec: 'h264' | 'vp8';
  /** The VP8 backup for viewers without H.264 (m4-plan.md decision 3). */
  backup: boolean;
  /** Lower layers under the top one, smallest last; empty for a single layer. */
  layers: Layer[];
}

/**
 * The plan for a preset in this browser, within the account's tier. Null when the tier allows no video.
 * Firefox publishes VP8 in one layer: its H.264 screen share fell to 180 x 240 in M0.
 */
export function sharePlan(preset: SharePreset, limit: VideoLimit | null, browser: ShareBrowser): SharePlan | null {
  const p = PRESETS[preset];
  let capture: Size | null = null;
  if (p.size) {
    capture = fitTier(p.size, limit);
    if (!capture) return null;
  } else if (limit && !limit.enabled) {
    return null;
  }
  const single = browser === 'firefox';
  const top = capture?.height ?? Infinity;
  return {
    capture,
    fps: p.fps,
    bitrate: p.bitrate,
    degradation: p.degradation,
    hint: p.hint,
    codec: single ? 'vp8' : 'h264',
    backup: !single,
    layers: single ? [] : LAYERS.filter((l) => l.height < top).map((l) => ({ ...l, fps: Math.min(l.fps, p.fps) })),
  };
}
