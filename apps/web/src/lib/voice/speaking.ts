/** Merge server speaker updates with immediate local microphone activity. */
export class Speaking {
  private remote = new Set<string>();
  private local = false;
  private lastActive = -Infinity;
  private shown = new Set<string>();

  private readonly self: () => string;
  private readonly emit: (ids: string[]) => void;

  constructor(self: () => string, emit: (ids: string[]) => void) {
    this.self = self;
    this.emit = emit;
  }

  speakers(ids: string[]): void {
    this.remote = new Set(ids);
    this.update();
  }

  /** Suppress silence with PTT held; a short tail keeps the ring steady between syllables. */
  microphone(enabled: boolean, gateOpen: boolean, level: number, now: number): void {
    if (!enabled) this.lastActive = -Infinity;
    else if (gateOpen && level > -60) this.lastActive = now;
    this.local = enabled && now - this.lastActive < 120;
    this.update();
  }

  private update(): void {
    const ids = new Set(this.remote);
    ids.delete(this.self());
    if (this.local) ids.add(this.self());
    if (ids.size === this.shown.size && [...ids].every((id) => this.shown.has(id))) return;
    this.shown = ids;
    this.emit([...ids]);
  }
}
