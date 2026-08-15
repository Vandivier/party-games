import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import { act, createGame, resolveDefense } from '@games/hero_war/engine';
import { toView } from '@games/hero_war/view';

const REFERENCE_DECK = buildDeck();
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};
const cards = (...labels: string[]) => labels.map(card);

function staged() {
  const state = createGame({ players: [{ name: 'Ada' }, { name: 'Bo' }], seed: 'view' });
  state.players[0]!.hand = cards('K♠', '5♦', '2♥');
  state.players[1]!.hand = cards('J♥', '9♥', '4♣');
  act(state, { type: 'playHero', cardId: card('K♠').id });
  act(state, { type: 'playHero', cardId: card('J♥').id });
  return state;
}

describe('per-seat view', () => {
  it('shows your own hand and only counts for everyone else', () => {
    const view = toView(staged(), 0, 'table-1');
    expect(view.you.hand.map((entry) => entry.label).sort()).toEqual(['2♥', '5♦']);
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).toMatchObject({ name: 'Bo', handCount: 2 });
    expect(JSON.stringify(view.opponents)).not.toContain('9♥');
  });

  it('offers legal actions only to the seat on the clock', () => {
    const state = staged();
    expect(toView(state, 0, 't').legalActions.length).toBeGreaterThan(0);
    expect(toView(state, 0, 't').isYourInput).toBe(true);
    expect(toView(state, 1, 't').legalActions).toEqual([]);
    expect(toView(state, 1, 't').isYourInput).toBe(false);
    expect(toView(state, 1, 't').waitingOn).toMatchObject({ index: 0, kind: 'action' });
  });

  it('hands the defender its hearts, and nobody else', () => {
    const state = staged();
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });

    const defender = toView(state, 1, 't');
    expect(defender.isYourInput).toBe(true);
    expect(defender.pendingAttack).toMatchObject({ attackerName: 'Ada', damage: 13 });
    expect(defender.defenseOptions.map((entry) => entry.label)).toEqual(['9♥']);

    const attacker = toView(state, 0, 't');
    expect(attacker.defenseOptions).toEqual([]);
    expect(attacker.waitingOn).toMatchObject({ index: 1, kind: 'defense' });
  });

  it('reports the winner once the game is over', () => {
    const state = staged();
    state.players[1]!.hand = []; // no replacement hero to field
    state.players[0]!.equipment = cards('9♣');
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    expect(state.pendingAttack?.damage).toBe(22);

    resolveDefense(state, { cardId: null });
    const view = toView(state, 0, 't');
    expect(view.phase).toBe('over');
    expect(view.winner).toEqual({ index: 0, name: 'Ada' });
    expect(view.legalActions).toEqual([]);
    expect(view.waitingOn).toBeNull();
  });

  it('rejects a seat that is not at the table', () => {
    expect(() => toView(staged(), 7, 't')).toThrow(/Seat 7/);
  });
});
