/** Share presets fitted to browsers and tiers (client.md section 10.6). */
import { describe, expect, it } from 'vitest';
import type { VideoLimit } from '@concord/domain';
import { sharePlan, shareBrowser } from './share.ts';

const OURS: VideoLimit = { enabled: true, area: 2560 * 1440, aspect: [0.3, 10] };
const STOCK_NEW: VideoLimit = { enabled: true, area: 1080 * 720, aspect: [0.3, 2.5] };

describe('shareBrowser', () => {
  it('tells Chromium, headless included, from Firefox', () => {
    expect(shareBrowser('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0 Safari/537.36')).toBe('chromium');
    expect(shareBrowser('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0')).toBe('chromium');
    expect(shareBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0')).toBe('firefox');
    expect(shareBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe('other');
  });
});

describe('sharePlan', () => {
  it('publishes 1080p60 from Chromium as H.264 with a VP8 backup and 720p30 and 360p15 under it', () => {
    const p = sharePlan('1080p60', OURS, 'chromium')!;
    expect(p).toMatchObject({ capture: { width: 1920, height: 1080 }, fps: 60, bitrate: 12_000_000, degradation: 'maintain-framerate', hint: 'motion', codec: 'h264', backup: true });
    expect(p.layers).toEqual([{ height: 720, fps: 30, bitrate: 2_500_000 }, { height: 360, fps: 15, bitrate: 600_000 }]);
  });

  it('publishes VP8 in one layer from Firefox', () => {
    expect(sharePlan('1080p30', OURS, 'firefox')).toMatchObject({ codec: 'vp8', backup: false, layers: [], fps: 30, bitrate: 8_000_000 });
  });

  it('keeps 720p30 to one layer under it, and Text at the source size, 5 fps, keeping resolution', () => {
    expect(sharePlan('720p30', OURS, 'chromium')!.layers.map((l) => l.height)).toEqual([360]);
    expect(sharePlan('text', OURS, 'chromium')).toMatchObject({ capture: null, fps: 5, bitrate: 3_000_000, degradation: 'maintain-resolution', hint: 'detail' });
    expect(sharePlan('text', OURS, 'chromium')!.layers.every((l) => l.fps === 5)).toBe(true);
  });

  it('fits the capture into a stricter tier, and refuses a tier without video', () => {
    const p = sharePlan('1080p60', STOCK_NEW, 'chromium')!;
    expect(p.capture!.width * p.capture!.height).toBeLessThanOrEqual(STOCK_NEW.area);
    expect(sharePlan('1080p60', { ...OURS, enabled: false }, 'chromium')).toBeNull();
    expect(sharePlan('text', { ...OURS, enabled: false }, 'chromium')).toBeNull();
  });
});
