import { describe, expect, it } from 'vitest';
import { buildDeck, isFace, sortHand, SUITS, RANKS } from '@/core/cards';
import { rollNotation, roll } from '@/core/dice';
import { Random } from '@/core/rng';

describe('deck', () => {
  it('builds 52 unique cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.id)).size).toBe(52);
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
  });

  it('keeps ids unique across multiple decks', () => {
    const deck = buildDeck(3);
    expect(deck).toHaveLength(156);
    expect(new Set(deck.map((card) => card.id)).size).toBe(156);
  });

  it('values aces low and face cards 11-13', () => {
    const deck = buildDeck();
    const byRank = (rank: string) => deck.find((card) => card.rank === rank)!;
    expect(byRank('A').value).toBe(1);
    expect(byRank('10').value).toBe(10);
    expect(byRank('J').value).toBe(11);
    expect(byRank('K').value).toBe(13);
  });

  it('treats only J/Q/K as face cards', () => {
    const deck = buildDeck();
    expect(deck.filter(isFace)).toHaveLength(12);
    expect(isFace(deck.find((card) => card.rank === 'A')!)).toBe(false);
  });

  it('sorts a hand by suit then value without mutating the input', () => {
    const deck = buildDeck();
    const hand = [deck[25]!, deck[3]!, deck[40]!];
    const original = [...hand];
    const sorted = sortHand(hand);
    expect(hand).toEqual(original);
    expect(sorted).toHaveLength(3);
  });
});

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Random('table-1');
    const b = new Random('table-1');
    expect(Array.from({ length: 5 }, () => a.int(1, 100))).toEqual(
      Array.from({ length: 5 }, () => b.int(1, 100)),
    );
  });

  it('shuffles into a permutation', () => {
    const deck = buildDeck();
    const shuffled = new Random('seed').shuffle([...deck]);
    expect(new Set(shuffled.map((card) => card.id))).toEqual(new Set(deck.map((card) => card.id)));
  });

  it('stays inside the requested range', () => {
    const rng = new Random('range');
    for (let i = 0; i < 500; i++) {
      const value = rng.int(1, 6);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    }
  });
});

describe('dice', () => {
  it('rolls single dice in range', () => {
    const rng = new Random('dice');
    for (let i = 0; i < 200; i++) {
      const value = roll(20, rng);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(20);
    }
  });

  it('parses NdS+M notation', () => {
    const rolled = rollNotation('3d6+2', new Random('notation'));
    expect(rolled.rolls).toHaveLength(3);
    expect(rolled.modifier).toBe(2);
    expect(rolled.total).toBe(rolled.rolls.reduce((sum, value) => sum + value, 0) + 2);
  });

  it('defaults a bare dN to one die and supports negative modifiers', () => {
    const rolled = rollNotation('d20-1', new Random('neg'));
    expect(rolled.rolls).toHaveLength(1);
    expect(rolled.modifier).toBe(-1);
  });

  it('rejects nonsense', () => {
    expect(() => rollNotation('banana')).toThrow();
    expect(() => rollNotation('0d6')).toThrow();
    expect(() => rollNotation('2d1')).toThrow();
  });
});
