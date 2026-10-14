/**
 * Writes where only the latest value matters, such as an order (m2c-plan.md tasks 3 and 4). While one is
 * on its way, newer values replace each other, and the newest goes next. `holding` stays true a moment
 * after the last write, so its echo, or an older one, isn't taken for a newer change.
 */
export const HOLD_MS = 1_500;

export class Latest<T> {
  private want: { value: T } | null = null;
  private running = false;
  private holds = 0;
  private waiting: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  private readonly write: (value: T) => Promise<void>;

  constructor(write: (value: T) => Promise<void>) {
    this.write = write;
  }

  get holding(): boolean {
    return this.running || this.holds > 0;
  }

  /** Resolves once this value, or a newer one, is written, and rejects if that write fails. */
  set(value: T): Promise<void> {
    this.want = { value };
    const done = new Promise<void>((resolve, reject) => this.waiting.push({ resolve, reject }));
    if (!this.running) void this.drain();
    return done;
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.want) {
        const next = this.want.value;
        this.want = null;
        const batch = this.waiting.splice(0);
        try {
          await this.write(next);
          for (const w of batch) w.resolve();
        } catch (e) {
          for (const w of batch) w.reject(e);
        }
      }
    } finally {
      this.running = false;
      this.holds++;
      setTimeout(() => this.holds--, HOLD_MS);
    }
  }
}
