/** Seeded, reproducible randomness shared by every game. */

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(text: string | number): number {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Random {
  readonly seed: string;
  private state: number;

  /** @param seed omit for a fresh random seed */
  constructor(seed?: string | number) {
    this.seed = seed === undefined ? String(Math.floor(Math.random() * 2 ** 32)) : String(seed);
    this.state = hashSeed(this.seed);
  }

  /** mulberry32 — small, fast, and good enough for shuffling cards. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error('Cannot pick from an empty list.');
    return item;
  }

  /** Fisher-Yates, in place. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j] as T, items[i] as T];
    }
    return items;
  }
}
