/** The microphone gate over level frames (m4-plan.md task 5): voice activity, push-to-talk and auto sensitivity. */
import { describe, expect, it } from 'vitest';
import { AUTO_MARGIN_DB, AUTO_MAX_DB, AUTO_MIN_DB, GainRamp, Gate, Meter, NoiseFloor, PTT_TAIL_MS, SILENCE_DB, VOICE_HOLD_MS, type GateConfig } from './gate.ts';

/** One 128-sample block at 48 kHz. */
const FRAME = (128 / 48000) * 1000;
const manual: GateConfig = { mode: 'voice', auto: false, threshold: -40 };
const ptt: GateConfig = { mode: 'ptt', auto: false, threshold: -40 };

/** Steps the gate at one level for `ms`, returning whether it was open after each frame. */
function run(gate: Gate, level: number, ms: number): boolean[] {
  const out: boolean[] = [];
  for (let t = 0; t < ms; t += FRAME) out.push(gate.step(level, FRAME));
  return out;
}

describe('voice activity, manual threshold', () => {
  it('stays closed below the threshold', () => {
    const gate = new Gate(manual);
    expect(run(gate, -45, 1000).some(Boolean)).toBe(false);
  });

  it('opens on the first frame over the threshold', () => {
    const gate = new Gate(manual);
    run(gate, -60, 100);
    expect(gate.step(-30, FRAME)).toBe(true);
  });

  it('holds 300 ms after the level falls back, then closes', () => {
    const gate = new Gate(manual);
    run(gate, -20, 200);
    const after = run(gate, -60, 500);
    const closedAt = after.indexOf(false) * FRAME;
    expect(closedAt).toBeGreaterThanOrEqual(VOICE_HOLD_MS - FRAME);
    expect(closedAt).toBeLessThan(VOICE_HOLD_MS + FRAME);
    expect(after.slice(after.indexOf(false)).some(Boolean)).toBe(false);
  });

  it('a short dip between words keeps it open', () => {
    const gate = new Gate(manual);
    run(gate, -20, 200);
    expect(run(gate, -60, 200).every(Boolean)).toBe(true);
    expect(run(gate, -20, 100).every(Boolean)).toBe(true);
    expect(run(gate, -60, 250).every(Boolean)).toBe(true);
  });

  it('a new threshold applies at once', () => {
    const gate = new Gate(manual);
    expect(gate.step(-45, FRAME)).toBe(false);
    gate.configure({ ...manual, threshold: -50 });
    expect(gate.step(-45, FRAME)).toBe(true);
  });

  it('silence and NaN never break it', () => {
    const gate = new Gate({ mode: 'voice', auto: true, threshold: -40 });
    expect(gate.step(-Infinity, FRAME)).toBe(false);
    expect(gate.step(Number.NaN, FRAME)).toBe(false);
    expect(Number.isFinite(gate.threshold())).toBe(true);
  });
});

describe('push-to-talk', () => {
  it('ignores the level and opens only while the key is held', () => {
    const gate = new Gate(ptt);
    expect(run(gate, -10, 100).some(Boolean)).toBe(false);
    gate.pushToTalk(true);
    expect(run(gate, -90, 1000).every(Boolean)).toBe(true);
  });

  it('closes 200 ms after release', () => {
    const gate = new Gate(ptt);
    gate.pushToTalk(true);
    run(gate, -20, 100);
    gate.pushToTalk(false);
    const after = run(gate, -20, 400);
    const closedAt = after.indexOf(false) * FRAME;
    expect(closedAt).toBeGreaterThanOrEqual(PTT_TAIL_MS - FRAME);
    expect(closedAt).toBeLessThan(PTT_TAIL_MS + FRAME);
  });

  it('pressing again within the tail keeps it open', () => {
    const gate = new Gate(ptt);
    gate.pushToTalk(true);
    run(gate, -20, 100);
    gate.pushToTalk(false);
    run(gate, -20, 100);
    gate.pushToTalk(true);
    expect(run(gate, -20, 500).every(Boolean)).toBe(true);
  });

  it('closes at once on blur, without the tail, and stays closed', () => {
    const gate = new Gate(ptt);
    gate.pushToTalk(true);
    run(gate, -20, 100);
    gate.blur();
    expect(gate.isOpen()).toBe(false);
    expect(run(gate, -20, 400).some(Boolean)).toBe(false);
  });

  it('a key up after blur does not reopen it', () => {
    const gate = new Gate(ptt);
    gate.pushToTalk(true);
    run(gate, -20, 50);
    gate.blur();
    gate.pushToTalk(false);
    expect(gate.step(-20, FRAME)).toBe(false);
  });

  it('switching to push-to-talk without the key closes at once', () => {
    const gate = new Gate(manual);
    run(gate, -20, 100);
    gate.configure(ptt);
    expect(gate.step(-20, FRAME)).toBe(false);
  });

  it('blur leaves voice activity alone', () => {
    const gate = new Gate(manual);
    run(gate, -20, 100);
    gate.blur();
    expect(gate.step(-20, FRAME)).toBe(true);
  });
});

describe('automatic sensitivity', () => {
  /** Noise around a mean: ±4 dB of wobble frame by frame, deterministic. */
  const noisy = (mean: number, i: number) => mean + 4 * Math.sin(i * 1.7);

  it('sets the threshold a margin above a steady noise floor', () => {
    const floor = new NoiseFloor();
    for (let i = 0; i < 3000; i++) floor.step(noisy(-60, i), FRAME);
    expect(floor.floor()).toBeGreaterThanOrEqual(-64.1);
    expect(floor.floor()).toBeLessThanOrEqual(-60);
    expect(floor.threshold()).toBeCloseTo(floor.floor() + AUTO_MARGIN_DB, 5);
  });

  it('keeps the threshold within its bounds', () => {
    const quiet = new NoiseFloor();
    for (let i = 0; i < 2000; i++) quiet.step(SILENCE_DB, FRAME);
    expect(quiet.threshold()).toBe(AUTO_MIN_DB);
    const loud = new NoiseFloor();
    for (let i = 0; i < 3000; i++) loud.step(-15, FRAME);
    expect(loud.threshold()).toBe(AUTO_MAX_DB);
  });

  it('follows louder noise within a few seconds', () => {
    const floor = new NoiseFloor();
    for (let i = 0; i < 2000; i++) floor.step(noisy(-65, i), FRAME);
    const before = floor.threshold();
    for (let i = 0; i < Math.ceil(6000 / FRAME); i++) floor.step(noisy(-50, i), FRAME);
    expect(floor.threshold()).toBeGreaterThan(before + 10);
  });

  it('follows quieter noise at once', () => {
    const floor = new NoiseFloor();
    for (let i = 0; i < 2000; i++) floor.step(-45, FRAME);
    for (let i = 0; i < 100; i++) floor.step(-70, FRAME);
    expect(floor.floor()).toBe(-70);
  });

  it('talking with pauses does not raise it', () => {
    const floor = new NoiseFloor();
    for (let i = 0; i < 1000; i++) floor.step(noisy(-60, i), FRAME);
    const before = floor.threshold();
    // Ten seconds of speech: 1.5 s phrases at -25 dBFS with 300 ms pauses back to the noise.
    for (let t = 0, i = 0; t < 10_000; t += FRAME, i++) floor.step(t % 1800 < 1500 ? noisy(-25, i) : noisy(-60, i), FRAME);
    expect(floor.threshold()).toBeCloseTo(before, 0);
  });

  it('opens on speech over the noise and closes on the noise alone', () => {
    const gate = new Gate({ mode: 'voice', auto: true, threshold: -40 });
    for (let i = 0; i < 2000; i++) gate.step(noisy(-60, i), FRAME);
    expect(gate.isOpen()).toBe(false);
    expect(gate.step(-30, FRAME)).toBe(true);
    for (let i = 0; i < 200; i++) gate.step(noisy(-60, i), FRAME);
    expect(gate.isOpen()).toBe(false);
  });

  it('the manual threshold ignores the floor', () => {
    const gate = new Gate({ mode: 'voice', auto: false, threshold: -33 });
    for (let i = 0; i < 2000; i++) gate.step(-70, FRAME);
    expect(gate.threshold()).toBe(-33);
  });
});

describe('meter and ramp', () => {
  it('measures a full-scale sine near -3 dBFS and silence as the floor', () => {
    const meter = new Meter();
    const sine = Float32Array.from({ length: 128 }, (_, i) => Math.sin((i / 128) * 2 * Math.PI * 4));
    let level = SILENCE_DB;
    for (let i = 0; i < 50; i++) level = meter.measure(sine, FRAME);
    expect(level).toBeCloseTo(-3, 0);
    const silence = new Float32Array(128);
    for (let i = 0; i < 500; i++) level = meter.measure(silence, FRAME);
    expect(level).toBe(SILENCE_DB);
  });

  it('ramps the gain in over a few ms instead of jumping', () => {
    const ramp = new GainRamp(48000, 5, 20);
    const block = new Float32Array(128).fill(1);
    ramp.apply(block, true);
    expect(block[0]).toBeLessThan(0.01);
    expect(block[127]).toBeGreaterThan(0.5);
    expect(block[127]).toBeLessThan(0.6);
    const next = new Float32Array(128).fill(1);
    ramp.apply(next, true);
    expect(next[127]).toBe(1);
    const out = new Float32Array(128).fill(1);
    ramp.apply(out, false);
    expect(out[0]).toBeGreaterThan(0.99);
    expect(out[127]).toBeGreaterThan(0.8);
  });
});
