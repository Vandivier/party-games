import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import { describeCard } from '@games/deck_arena/card-info';

const DECK = buildDeck();
const card = (label: string): Card => {
  const found = DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};
const ON = { faceCardAbilities: true, aceVictory: true };
const OFF = { faceCardAbilities: false, aceVictory: false };

describe('card briefs', () => {
  it('names the face-card abilities', () => {
    expect(describeCard(card('J♣'), ON).name).toBe('Exploding sniper');
    expect(describeCard(card('Q♣'), ON).name).toBe('Piercing sniper');
    expect(describeCard(card('K♣'), ON).name).toBe('Dual shotguns');
    expect(describeCard(card('J♥'), ON).name).toBe('Regen');
    expect(describeCard(card('Q♥'), ON).name).toBe('Regen with overheal');
    expect(describeCard(card('K♥'), ON).name).toBe('Auto-revive');
    expect(describeCard(card('J♠'), ON).name).toBe('Overshield');
    expect(describeCard(card('J♦'), ON).name).toBe('Super mobility');
    expect(describeCard(card('Q♦'), ON).name).toBe('Teleport');
    expect(describeCard(card('K♦'), ON).name).toBe('Blitzkrieg');
  });

  it('always says what happens to the card itself', () => {
    for (const label of ['J♦', 'Q♦', 'K♦', 'J♥', '5♥', 'J♠', '3♠', '7♣', 'K♣', 'A♦']) {
      expect(describeCard(card(label), ON).fate.length).toBeGreaterThan(10);
    }
    // The two fates that differ: a weapon is carried, a spell is spent.
    expect(describeCard(card('J♦'), ON).fate).toMatch(/spends the card/i);
    expect(describeCard(card('K♣'), ON).fate).toMatch(/in front of you as your weapon/i);
  });

  it('falls back to the plain reading when the options are off', () => {
    expect(describeCard(card('J♦'), OFF)).toMatchObject({ name: 'Energy' });
    expect(describeCard(card('K♣'), OFF).detail).toContain('3 damage');
    expect(describeCard(card('J♠'), OFF)).toMatchObject({ name: 'Armor' });
    expect(describeCard(card('A♦'), OFF)).toMatchObject({ name: 'Energy' });
    expect(describeCard(card('A♦'), ON)).toMatchObject({ name: 'Ace' });
  });

  it('describes ordinary cards by their tier', () => {
    expect(describeCard(card('3♣'), ON).detail).toContain('1 damage');
    expect(describeCard(card('7♣'), ON).detail).toContain('range of 4');
    expect(describeCard(card('9♥'), ON).detail).toContain('Heals 2');
    expect(describeCard(card('10♠'), ON).detail).toContain('3 shield');
    expect(describeCard(card('8♦'), ON).detail).toContain('2 extra actions');
  });
});
