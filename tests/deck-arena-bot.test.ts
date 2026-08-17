import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import { act, createGame, currentActor } from '@games/deck_arena/engine';
import { botAction } from '@games/deck_arena/bot';
import { MAX_HP, type ArenaState } from '@games/deck_arena/types';

const REFERENCE_DECK = buildDeck();
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};

function botArena(count: number, seed: string): ArenaState {
  return createGame({
    players: Array.from({ length: count }, (_, i) => ({ name: `Bot ${i + 1}`, isBot: true })),
    seed,
  });
}

/** Run a whole arena with bots on every seat. Returns the actions taken. */
function playOut(state: ArenaState, maxActions = 20000): number {
  let steps = 0;
  while (currentActor(state) !== null && steps < maxActions) {
    steps++;
    const action = botAction(state);
    expect(action).not.toBeNull();
    const result = act(state, action!);
    expect(result.ok, `${JSON.stringify(action)}: ${result.error}`).toBe(true);
  }
  return steps;
}

describe('bot', () => {
  it('shoots the weakest target it has a line on', () => {
    const state = createGame({
      players: [
        { name: 'Bot', isBot: true },
        { name: 'Healthy' },
        { name: 'Hurt' },
      ],
      seed: 'aim',
    });
    const [me, healthy, hurt] = [state.order[0]!, state.order[1]!, state.order[2]!];
    state.orderIndex = 0;
    state.turn = { roll: 5, actionsLeft: 2, freeSearchUsed: false };
    Object.assign(state.players[me]!, { x: 1, y: 1 });
    Object.assign(state.players[healthy]!, { x: 4, y: 1, hp: MAX_HP });
    Object.assign(state.players[hurt]!, { x: 1, y: 4, hp: 1 });
    state.players[me]!.weapon = { card: card('K♣'), loaded: true, revealed: false };

    expect(botAction(state)).toMatchObject({ type: 'shoot', targetIndex: hurt });
  });

  it('loots the cell it is standing on for free', () => {
    const state = createGame({
      players: [{ name: 'Bot', isBot: true }, { name: 'Other' }],
      seed: 'loot',
    });
    state.orderIndex = 0;
    state.turn = { roll: 5, actionsLeft: 2, freeSearchUsed: false };
    const me = state.players[state.order[0]!]!;
    me.hand = [];
    state.board[(me.y - 1) * 6 + (me.x - 1)] = card('9♣');

    expect(botAction(state)).toMatchObject({ type: 'search' });
  });

  it('walks toward the nearest player when it cannot shoot', () => {
    const state = createGame({
      players: [{ name: 'Bot', isBot: true }, { name: 'Prey' }],
      seed: 'hunt',
    });
    state.board.fill(null);
    state.orderIndex = 0;
    state.turn = { roll: 5, actionsLeft: 2, freeSearchUsed: false };
    const me = state.players[state.order[0]!]!;
    const prey = state.players[state.order[1]!]!;
    me.hand = [];
    Object.assign(me, { x: 1, y: 1 });
    Object.assign(prey, { x: 6, y: 1 });

    expect(botAction(state)).toMatchObject({ type: 'move', direction: 'east' });
  });

  it('patches itself up when hurt', () => {
    const state = createGame({
      players: [{ name: 'Bot', isBot: true }, { name: 'Other' }],
      seed: 'heal',
    });
    state.board.fill(null);
    state.orderIndex = 0;
    state.turn = { roll: 5, actionsLeft: 2, freeSearchUsed: false };
    const me = state.players[state.order[0]!]!;
    me.hp = 2;
    me.hand = [card('J♥')];

    expect(botAction(state)).toMatchObject({ type: 'activateCard', cardId: card('J♥').id });
  });

  it('plays whole arenas out to a winner without an illegal action', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const state = botArena(2, seed);
      playOut(state);
      expect(state.phase).toBe('over');
      expect(state.winnerIndex).not.toBeNull();
      expect(state.players.filter((player) => !player.out)).toHaveLength(1);
    }
  });

  it('plays an eight-bot arena out to a winner', () => {
    const state = botArena(8, 'eight');
    playOut(state);
    expect(state.phase).toBe('over');
    expect(state.players.filter((player) => !player.out)).toHaveLength(1);
  });
});
