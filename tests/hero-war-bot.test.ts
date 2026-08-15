import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import { act, createGame, currentActor, resolveDefense } from '@games/hero_war/engine';
import { botAction, botDefense } from '@games/hero_war/bot';
import type { HeroWarState } from '@games/hero_war/types';

const REFERENCE_DECK = buildDeck();
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};
const cards = (...labels: string[]) => labels.map(card);

/** Play a whole game with bots on every seat. */
function playOut(state: HeroWarState, maxSteps = 4000): number {
  let steps = 0;
  while (currentActor(state) !== null && steps < maxSteps) {
    steps++;
    if (state.pendingAttack) {
      const result = resolveDefense(state, botDefense(state));
      expect(result.ok).toBe(true);
      continue;
    }
    const action = botAction(state);
    expect(action).not.toBeNull();
    const result = act(state, action!);
    expect(result.ok, `${JSON.stringify(action)}: ${result.error}`).toBe(true);
  }
  return steps;
}

describe('bot', () => {
  it('fields the biggest hero it holds', () => {
    const state = createGame({ players: [{ name: 'A', isBot: true }, { name: 'B' }], seed: 'bot' });
    state.players[0]!.hand = cards('J♠', 'K♦', 'Q♥');
    const action = botAction(state);
    expect(action).toEqual({ type: 'playHero', cardId: card('K♦').id, label: expect.any(String) });
  });

  it('spends the fewest diamonds that finish a hero off', () => {
    const state = createGame({ players: [{ name: 'A', isBot: true }, { name: 'B' }], seed: 'boost' });
    state.players[0]!.hand = cards('J♠');
    state.players[1]!.hand = cards('K♥');
    act(state, { type: 'playHero', cardId: card('J♠').id });
    act(state, { type: 'playHero', cardId: card('K♥').id });
    state.players[0]!.hand = cards('9♦', '2♦', '7♦');
    state.turn.drawn = true;
    state.turn.played = true;

    const action = botAction(state);
    expect(action?.type).toBe('attack');
    // 11 from the hero needs 2 more to clear 13 hp: the biggest diamond alone does it.
    expect(action).toMatchObject({ targetIndex: 1, boostCardIds: [card('9♦').id] });
  });

  it('does not waste diamonds when the hit cannot kill', () => {
    const state = createGame({ players: [{ name: 'A', isBot: true }, { name: 'B' }], seed: 'nokill' });
    state.players[0]!.hand = cards('J♠');
    state.players[1]!.hand = cards('K♥');
    act(state, { type: 'playHero', cardId: card('J♠').id });
    act(state, { type: 'playHero', cardId: card('K♥').id });
    state.players[0]!.hand = cards('A♦'); // 11 + 1 is still short of 13
    state.turn.drawn = true;
    state.turn.played = true;

    expect(botAction(state)).toMatchObject({ type: 'attack', boostCardIds: [] });
  });

  it('burns a heart on a lethal hit and swallows a survivable one', () => {
    const state = createGame({ players: [{ name: 'A' }, { name: 'B', isBot: true }], seed: 'heal' });
    state.players[0]!.hand = cards('J♠');
    state.players[1]!.hand = cards('K♥');
    act(state, { type: 'playHero', cardId: card('J♠').id });
    act(state, { type: 'playHero', cardId: card('K♥').id });
    state.players[1]!.hand = cards('3♥');

    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    expect(botDefense(state)).toEqual({ cardId: null }); // 11 damage into 13 hp: survivable

    resolveDefense(state, { cardId: null });
    act(state, { type: 'endTurn' });
    act(state, { type: 'endTurn' });
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    expect(botDefense(state)).toEqual({ cardId: card('3♥').id }); // now it is lethal
  });

  it('plays a two-bot game to a winner without an illegal move', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const state = createGame({
        players: [
          { name: 'Bot 1', isBot: true },
          { name: 'Bot 2', isBot: true },
        ],
        seed,
      });
      playOut(state);
      expect(state.phase).toBe('over');
      expect(state.winnerIndex).not.toBeNull();
    }
  });

  it('plays a four-bot game to a winner', () => {
    const state = createGame({
      players: [
        { name: 'One', isBot: true },
        { name: 'Two', isBot: true },
        { name: 'Three', isBot: true },
        { name: 'Four', isBot: true },
      ],
      seed: 'four-way',
    });
    playOut(state);
    expect(state.phase).toBe('over');
    expect(state.players.filter((player) => !player.out)).toHaveLength(1);
  });
});
