import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import { act, createGame } from '@games/deck_arena/engine';
import { toView } from '@games/deck_arena/view';
import type { ArenaState } from '@games/deck_arena/types';

const REFERENCE_DECK = buildDeck();
const LABELS = REFERENCE_DECK.map((entry) => entry.label);
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};

function arena(seed = 'view'): ArenaState {
  return createGame({ players: [{ name: 'Ada' }, { name: 'Bo' }], seed, specialAbilities: false });
}

describe('per-seat view', () => {
  it('reports the floor as face-down cards and nothing more', () => {
    const view = toView(arena(), 0, 'arena-1');
    expect(view.cells).toHaveLength(36);
    expect(view.cells.filter((cell) => cell.hasCard).length).toBeGreaterThan(0);
    expect(LABELS.some((label) => JSON.stringify(view.cells).includes(label))).toBe(false);
  });

  it('shows your own hand and only a count for everyone else', () => {
    const state = arena();
    state.players[1]!.hand = [card('K♠'), card('2♥')];
    const view = toView(state, 0, 'a');

    expect(view.you.hand.length).toBe(state.players[0]!.hand.length);
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).toMatchObject({ name: 'Bo', handCount: 2 });
    expect(JSON.stringify(view.opponents)).not.toContain('K♠');
  });

  it('hides an equipped weapon until it is fired', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    state.board.fill(null);
    Object.assign(state.players[them]!, { x: 1, y: 1 });
    Object.assign(state.players[me]!, { x: 1, y: 3 });
    state.players[them]!.weapon = { card: card('10♣'), loaded: true, revealed: false };
    state.orderIndex = state.order.indexOf(them);
    state.turn = { roll: 5, actionsLeft: 2, freeSearchUsed: false, freeReloads: false };

    const hidden = toView(state, me, 'a').opponents.find((entry) => entry.index === them);
    expect(hidden?.weapon).toMatchObject({ revealed: false, card: null, loaded: true });
    expect(JSON.stringify(hidden)).not.toContain('10♣');

    act(state, { type: 'shoot', targetIndex: me });
    const shown = toView(state, me, 'a').opponents.find((entry) => entry.index === them);
    expect(shown?.weapon).toMatchObject({ revealed: true, loaded: false, damage: 3, range: 6 });
    expect(shown?.weapon?.card?.label).toBe('10♣');
  });

  it('offers legal actions only to the seat on the clock', () => {
    const state = arena();
    const [first, second] = [state.order[0]!, state.order[1]!];
    expect(toView(state, first, 'a').isYourTurn).toBe(true);
    expect(toView(state, first, 'a').legalActions.length).toBeGreaterThan(0);
    expect(toView(state, second, 'a').isYourTurn).toBe(false);
    expect(toView(state, second, 'a').legalActions).toEqual([]);
  });

  it('carries the turn budget and the arena bookkeeping', () => {
    const state = arena();
    const view = toView(state, state.order[0]!, 'a');
    expect(view.round).toBe(1);
    expect(view.actionsLeft).toBe(state.turn.actionsLeft);
    expect(view.actionRoll).toBe(state.turn.roll);
    expect(view.freeSearchAvailable).toBe(true);
    expect(view.pileCount).toBe(16);
    expect(view.boardSize).toBe(6);
  });

  it('rejects a seat that is not in the arena', () => {
    expect(() => toView(arena(), 5, 'a')).toThrow(/Seat 5/);
  });
});
