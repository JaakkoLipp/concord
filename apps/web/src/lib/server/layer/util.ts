/** Small pieces the layer's core shares: its error, a bounded cache and a rate limiter. The clock is passed in for tests. */

export type Clock = () => number;

/** A refusal, answered as `{ type, ...extra }` with this status, as Stoat's errors are. */
export class LayerError extends Error {
  readonly status: number;
  readonly type: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, type: string, extra: Record<string, unknown> = {}) {
    super(`${status} ${type}`);
    this.status = status;
    this.type = type;
    this.extra = extra;
  }
}

/** A cache with a time limit per entry and a size limit, dropping the oldest entries first. */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; until: number }>();
  private readonly max: number;
  private readonly now: Clock;

  constructor(max: number, now: Clock) {
    this.max = max;
    this.now = now;
  }

  get(key: K): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.until <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: K, value: V, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, until: this.now() + ttlMs });
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as K);
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** A fixed-window limit per key, such as a user or an address. Bounded like TtlCache. */
export class RateLimiter {
  private readonly windows: TtlCache<string, { count: number; resetAt: number }>;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: Clock;

  constructor(limit: number, windowMs: number, now: Clock, maxKeys = 10_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.windows = new TtlCache(maxKeys, now);
  }

  /** Counts a request: 0 when allowed, or the milliseconds until the key may try again. */
  take(key: string): number {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w) {
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w, this.windowMs);
    }
    if (w.count >= this.limit) return Math.max(1, w.resetAt - now);
    w.count++;
    return 0;
  }
}

/** One promise per key while it runs, so concurrent callers share one lookup. */
export class InFlight<K, V> {
  private readonly running = new Map<K, Promise<V>>();

  run(key: K, start: () => Promise<V>): Promise<V> {
    const existing = this.running.get(key);
    if (existing) return existing;
    const p = start().finally(() => this.running.delete(key));
    this.running.set(key, p);
    return p;
  }
}
