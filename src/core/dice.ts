/** Dice for games that need them: d6, d20, or any `NdS+M` notation. */

import { Random } from './rng';

const defaultRandom = new Random();

export interface DiceRoll {
  readonly rolls: number[];
  readonly modifier: number;
  readonly total: number;
  readonly notation: string;
}

export function roll(sides: number, rng: Random = defaultRandom): number {
  return rng.int(1, sides);
}

export const d6 = (rng?: Random): number => roll(6, rng);
export const d20 = (rng?: Random): number => roll(20, rng);

/** Roll dice notation such as `d20`, `2d6`, or `3d6+2`. */
export function rollNotation(notation: string, rng: Random = defaultRandom): DiceRoll {
  const match = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(notation);
  if (!match) throw new Error(`Unrecognized dice notation: ${notation}`);
  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[3].replace(/\s+/g, '')) : 0;
  if (count < 1 || count > 100) throw new Error(`Unrollable dice count: ${notation}`);
  if (sides < 2) throw new Error(`Unrollable die size: ${notation}`);
  const rolls = Array.from({ length: count }, () => roll(sides, rng));
  return {
    rolls,
    modifier,
    total: rolls.reduce((sum, value) => sum + value, 0) + modifier,
    notation: notation.trim(),
  };
}
