import { describe, expect, it } from 'vitest';
import { SPRING_OMEGA, springAt } from './spring.ts';

describe('critically damped spring', () => {
  it.each([600, 1200])('reaches 99 percent of a %i px move in 490 to 550 ms', (distance) => {
    const start = { position: 0, velocity: 0 };
    let reachedAt = 0;
    for (let elapsed = 1; elapsed <= 1000; elapsed++) {
      if (springAt(start, distance, elapsed).position >= distance * 0.99) {
        reachedAt = elapsed;
        break;
      }
    }
    expect(reachedAt).toBeGreaterThanOrEqual(490);
    expect(reachedAt).toBeLessThanOrEqual(550);
  });

  it('keeps position and velocity continuous when retargeted mid-scroll', () => {
    const first = springAt({ position: 100, velocity: 0 }, 900, 310);
    expect(Math.abs(first.velocity)).toBeGreaterThan(100);

    const secondAtRetarget = springAt(first, 350, 0);
    expect(secondAtRetarget.position).toBe(first.position);
    expect(secondAtRetarget.velocity).toBe(first.velocity);

    // A very short finite difference follows the inherited velocity at the retarget instant.
    const afterRetarget = springAt(first, 350, 0.01);
    const observedVelocity = (afterRetarget.position - secondAtRetarget.position) * 1000 / 0.01;
    expect(observedVelocity).toBeCloseTo(first.velocity, 0);
  });

  it('uses the specified critically damped frequency', () => {
    expect(SPRING_OMEGA).toBe(12.75);
  });
});
