/** Seeded random numbers (mulberry32), so content and order are the same on every run. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
