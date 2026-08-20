import { describe, expect, it } from 'vitest';
import { OUTPUT_CARDS } from '@games/cards_against_ai/cards';
import { act, createGame } from '@games/cards_against_ai/engine';
import { toView } from '@games/cards_against_ai/view';
import type { CaaState } from '@games/cards_against_ai/types';

const table = (seed = 'view'): CaaState =>
  createGame({ players: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }], seed });

const submitAll = (state: CaaState) => {
  for (const player of state.players) {
    act(state, player.index, { type: 'submit', cardId: player.hand[0]!.id });
  }
};

describe('per-seat view', () => {
  it('shows your own hand and nothing of anyone else’s', () => {
    const state = table();
    const view = toView(state, 0, 't');
    expect(view.you.hand).toHaveLength(5);
    const others = JSON.stringify(view.players);
    for (const card of state.players[1]!.hand) {
      expect(others).not.toContain(card.text);
    }
  });

  it('keeps face-down cards to a bare count', () => {
    const state = table();
    act(state, 1, { type: 'submit', cardId: state.players[1]!.hand[0]!.id });
    const view = toView(state, 0, 't');
    expect(view.faceDownCount).toBe(1);
    expect(view.table).toEqual([]);
    const serialized = JSON.stringify({ table: view.table, players: view.players, log: view.log });
    expect(OUTPUT_CARDS.some((card) => serialized.includes(card.text))).toBe(false);
  });

  it('reveals the cards for voting without saying who played them', () => {
    const state = table();
    submitAll(state);
    const view = toView(state, 0, 't');

    expect(view.phase).toBe('vote');
    expect(view.table).toHaveLength(3);
    expect(view.table.filter((card) => card.yours)).toHaveLength(1);
    // Nothing in the payload maps a card to a player until the votes are counted.
    expect(JSON.stringify(view.table)).not.toContain('playerIndex');
    expect(view.result).toBeNull();
    expect(view.legalActions.filter((action) => action.type === 'vote')).toHaveLength(2);
  });

  it('names the authors once the votes are counted', () => {
    const state = table();
    submitAll(state);
    const cardOf = (seat: number) => state.submissions.find((entry) => entry.playerIndex === seat)!;
    act(state, 0, { type: 'vote', submissionId: cardOf(1).id });
    act(state, 1, { type: 'vote', submissionId: cardOf(2).id });
    act(state, 2, { type: 'vote', submissionId: cardOf(1).id });

    const view = toView(state, 2, 't');
    expect(view.phase).toBe('results');
    expect(view.result?.winners).toEqual([1]);
    expect(view.result?.standings.map((entry) => entry.playerName)).toContain('Bo');
    expect(view.standings[0]?.score).toBe(1);
  });

  it('reports who the round is still waiting on', () => {
    const state = table();
    act(state, 0, { type: 'submit', cardId: state.players[0]!.hand[0]!.id });
    const view = toView(state, 0, 't');
    expect(view.isWaitingOnYou).toBe(false);
    expect(view.waitingOn.map((entry) => entry.name).sort()).toEqual(['Bo', 'Cy']);
    expect(view.legalActions).toEqual([]);
  });

  it('rejects a seat that is not at the table', () => {
    expect(() => toView(table(), 9, 't')).toThrow(/Seat 9/);
  });
});
