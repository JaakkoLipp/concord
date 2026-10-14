/** Fitting camera and share sizes into the video tiers, with Stoat's stock tiers as well as ours. */
import { describe, expect, it } from 'vitest';
import type { VideoLimit } from '@concord/domain';
import { fitTier, withinTier } from './limits.ts';

// Stoat's stock tiers, stricter than ours: 1280 x 720 is over the new-user area.
const NEW_USER: VideoLimit = { enabled: true, area: 1080 * 720, aspect: [0.3, 2.5] };
const OURS: VideoLimit = { enabled: true, area: 2560 * 1440, aspect: [0.30000001192092896, 10] };

describe('fitTier', () => {
  it('keeps a size that fits', () => {
    expect(fitTier({ width: 1920, height: 1080 }, OURS)).toEqual({ width: 1920, height: 1080 });
    expect(fitTier({ width: 1280, height: 720 }, null)).toEqual({ width: 1280, height: 720 });
  });

  it('scales a camera down into the new-user area, keeping its shape', () => {
    const s = fitTier({ width: 1280, height: 720 }, NEW_USER)!;
    expect(s.width * s.height).toBeLessThanOrEqual(NEW_USER.area);
    expect(s.width % 2 + s.height % 2).toBe(0);
    expect(s.width / s.height).toBeCloseTo(16 / 9, 1);
    expect(withinTier(s, NEW_USER)).toBe(true);
  });

  it('scales an ultrawide 1440p screen into our area', () => {
    const s = fitTier({ width: 5120, height: 1440 }, OURS)!;
    expect(s.width * s.height).toBeLessThanOrEqual(OURS.area);
    expect(s.width / s.height).toBeCloseTo(32 / 9, 1);
  });

  it('refuses a shape outside the aspect range, and a tier without video', () => {
    expect(fitTier({ width: 3440 * 2, height: 1440 }, NEW_USER)).toBeNull();
    expect(fitTier({ width: 1280, height: 720 }, { ...OURS, enabled: false })).toBeNull();
  });

  it('treats a zero area and equal aspect ends as no limit', () => {
    const open: VideoLimit = { enabled: true, area: 0, aspect: [1, 1] };
    expect(fitTier({ width: 7680, height: 1080 }, open)).toEqual({ width: 7680, height: 1080 });
    expect(withinTier({ width: 7680, height: 1080 }, open)).toBe(true);
  });
});
