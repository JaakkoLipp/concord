/**
 * The microphone gate's decisions (client.md section 10.4), as pure code over level frames so it can be
 * tested. The gate worklet (gate.worklet.ts) runs it on each 128-sample block: Meter turns samples into a
 * level, Gate decides open or closed, GainRamp fades the samples so opening and closing never click.
 */

/** The AudioWorklet processor's registered name. */
export const GATE_PROCESSOR = 'concord-gate';

/** Levels are dBFS, clamped here: silence is log10(0), which would be -Infinity. */
export const SILENCE_DB = -100;
/** Voice activity stays open this long after the level falls below the threshold, so word endings aren't cut. */
export const VOICE_HOLD_MS = 300;
/** Push-to-talk stays open this long after the key is released. */
export const PTT_TAIL_MS = 200;
/** Automatic sensitivity: the threshold sits this far above the noise floor, within these bounds. */
export const AUTO_MARGIN_DB = 15;
export const AUTO_MIN_DB = -55;
export const AUTO_MAX_DB = -25;
/**
 * The noise floor is the lowest level of the last few seconds, kept as per-bucket minimums. Speech always has
 * pauses within that window, so talking doesn't raise it, while a fan switched on raises it within the window.
 */
const FLOOR_BUCKET_MS = 250;
const FLOOR_BUCKETS = 20;

export interface GateConfig {
  mode: 'voice' | 'ptt';
  /** Voice activity: the threshold follows the noise floor, or is `threshold` in dBFS. */
  auto: boolean;
  threshold: number;
}

/** Messages to the worklet. */
export type GateMessage =
  | { type: 'config'; config: GateConfig }
  | { type: 'ptt'; down: boolean }
  | { type: 'blur' }
  | { type: 'stop' };

/** What the worklet reports, about 30 times a second: the loudest level since the last report, and the state. */
export interface GateReport { level: number; open: boolean }

export const clampDb = (db: number): number => (Number.isNaN(db) ? SILENCE_DB : Math.min(0, Math.max(SILENCE_DB, db)));

export class Gate {
  private config: GateConfig;
  /** The gate's own clock in ms, advanced by each frame. */
  private now = 0;
  private open = false;
  /** When the level was last at or over the threshold. */
  private lastAbove = -Infinity;
  private pttDown = false;
  private pttReleased = -Infinity;
  private readonly noise = new NoiseFloor();

  constructor(config: GateConfig) {
    this.config = { ...config };
  }

  configure(config: GateConfig): void {
    this.config = { ...config };
    // Into push-to-talk without the key held: closed at once, rather than through a voice hold.
    if (config.mode === 'ptt' && !this.pttDown) this.pttReleased = -Infinity;
  }

  /** The push-to-talk key went down or up. */
  pushToTalk(down: boolean): void {
    if (this.pttDown && !down) this.pttReleased = this.now;
    this.pttDown = down;
  }

  /** The window lost focus: keys can't be seen any more, so push-to-talk closes now, without the tail. */
  blur(): void {
    this.pttDown = false;
    this.pttReleased = -Infinity;
    if (this.config.mode === 'ptt') this.open = false;
  }

  /** The voice-activity threshold in dBFS. */
  threshold(): number {
    return this.config.auto ? this.noise.threshold() : clampDb(this.config.threshold);
  }

  isOpen(): boolean {
    return this.open;
  }

  /** One frame of `ms` milliseconds at `level` dBFS. Returns whether the gate is open after it. */
  step(level: number, ms: number): boolean {
    const db = clampDb(level);
    this.now += ms;
    if (this.config.auto) this.noise.step(db, ms);
    if (this.config.mode === 'ptt') {
      this.open = this.pttDown || this.now - this.pttReleased < PTT_TAIL_MS;
    } else if (db >= this.threshold()) {
      this.open = true;
      this.lastAbove = this.now;
    } else if (this.now - this.lastAbove >= VOICE_HOLD_MS) {
      this.open = false;
    }
    return this.open;
  }
}

/**
 * Automatic sensitivity, separable from the rest of the gate: the noise floor is the lowest level of the last
 * few seconds, and the threshold sits a margin above it.
 */
export class NoiseFloor {
  private buckets: number[] = [];
  private bucketMin = Infinity;
  private bucketMs = 0;

  step(db: number, ms: number): void {
    this.bucketMin = Math.min(this.bucketMin, db);
    this.bucketMs += ms;
    if (this.bucketMs < FLOOR_BUCKET_MS) return;
    this.buckets.push(this.bucketMin);
    if (this.buckets.length > FLOOR_BUCKETS) this.buckets.shift();
    this.bucketMin = Infinity;
    this.bucketMs = 0;
  }

  /** The lowest level of the last few seconds, or silence before any frame. */
  floor(): number {
    const min = Math.min(this.bucketMin, ...this.buckets);
    return Number.isFinite(min) ? min : SILENCE_DB;
  }

  threshold(): number {
    return Math.min(AUTO_MAX_DB, Math.max(AUTO_MIN_DB, this.floor() + AUTO_MARGIN_DB));
  }
}

/**
 * The level of a stream of sample blocks in dBFS: mean square power through an envelope that rises fast and
 * falls a little slower, so one quiet block between syllables doesn't drop it. The meter shows the same value
 * the gate compares, so the settings slider tells the truth.
 */
export class Meter {
  private power = 0;
  private readonly attackMs: number;
  private readonly releaseMs: number;

  constructor(attackMs = 5, releaseMs = 30) {
    this.attackMs = attackMs;
    this.releaseMs = releaseMs;
  }

  measure(samples: Float32Array, ms: number): number {
    let sum = 0;
    for (const s of samples) sum += s * s;
    const p = samples.length ? sum / samples.length : 0;
    const a = Math.exp(-ms / (p > this.power ? this.attackMs : this.releaseMs));
    this.power = p + (this.power - p) * a;
    return clampDb(10 * Math.log10(this.power));
  }
}

/** Fades gain towards open (1) or closed (0) by a linear ramp per sample: a few ms in, a little longer out. */
export class GainRamp {
  gain = 0;
  private readonly up: number;
  private readonly down: number;

  constructor(sampleRate: number, attackMs = 5, releaseMs = 20) {
    this.up = 1 / Math.max(1, (attackMs / 1000) * sampleRate);
    this.down = 1 / Math.max(1, (releaseMs / 1000) * sampleRate);
  }

  /** Multiplies the block in place. */
  apply(samples: Float32Array, open: boolean): void {
    for (let i = 0; i < samples.length; i++) {
      this.gain = open ? Math.min(1, this.gain + this.up) : Math.max(0, this.gain - this.down);
      samples[i] = samples[i]! * this.gain;
    }
  }
}
