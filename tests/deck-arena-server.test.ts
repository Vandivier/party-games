import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAction,
  createSession,
  getView,
  resetSessions,
} from '@/server/deck-arena-store';
import { GameError } from '@/server/game-error';
import { parseArenaAction, parseNewArena } from '@/server/deck-arena-validate';

const humanVsBot = () =>
  createSession({ players: [{ name: 'Ada' }, { name: 'Bot', isBot: true }], seed: 'server' });

beforeEach(() => resetSessions());

describe('arena store', () => {
  it('deals an arena and hands back the first human seat', () => {
    const { view, seats } = humanVsBot();
    expect(view.seat).toBe(0);
    expect(view.cells).toHaveLength(36);
    expect(view.you.hand).toHaveLength(1);
    expect(seats).toEqual([
      { index: 0, name: 'Ada', isBot: false },
      { index: 1, name: 'Bot', isBot: true },
    ]);
  });

  it('plays the bot seats out before answering', () => {
    const { view } = humanVsBot();
    expect(view.isYourTurn).toBe(true);
    expect(view.turnPlayerIndex).toBe(0);
  });

  it('refuses moves from a bot seat or out of turn', () => {
    const { view } = humanVsBot();
    try {
      applyAction(view.gameId, 1, { type: 'endTurn' });
      expect.unreachable('a bot seat should not be playable');
    } catch (error) {
      expect((error as GameError).status).toBe(403);
    }
  });

  it('404s an unknown arena', () => {
    try {
      getView('nope', 0);
      expect.unreachable('an unknown arena should 404');
    } catch (error) {
      expect((error as GameError).status).toBe(404);
    }
  });

  it('needs two to eight players, at least one human', () => {
    expect(() => createSession({ players: [{ name: 'Solo' }] })).toThrow(/2 players/);
    expect(() =>
      createSession({ players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }] }),
    ).toThrow(/human/i);
    expect(() =>
      createSession({ players: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })) }),
    ).toThrow(/tops out/);
  });

  it('plays a whole arena against bots without an illegal action', () => {
    const { view } = createSession({
      players: [{ name: 'Ada' }, { name: 'Bot 1', isBot: true }, { name: 'Bot 2', isBot: true }],
      seed: 'full-run',
    });
    let current = view;
    for (let step = 0; step < 3000 && current.phase !== 'over'; step++) {
      if (current.you.out) break;
      const shoot = current.legalActions.find((action) => action.type === 'shoot');
      const search = current.legalActions.find((action) => action.type === 'search');
      const move = current.legalActions.find((action) => action.type === 'move');
      const action = shoot ?? search ?? move ?? current.legalActions[0];
      if (!action) break;
      current = applyAction(current.gameId, current.seat, action);
    }
    expect(current.phase === 'over' || current.you.out).toBe(true);
  });
});

describe('arena request parsing', () => {
  it('accepts the actions the client can send', () => {
    expect(parseArenaAction({ type: 'move', direction: 'north' })).toEqual({
      type: 'move',
      direction: 'north',
    });
    expect(parseArenaAction({ type: 'search' })).toEqual({ type: 'search' });
    expect(parseArenaAction({ type: 'shoot', targetIndex: 2 })).toEqual({
      type: 'shoot',
      targetIndex: 2,
    });
    expect(parseArenaAction({ type: 'discard', cardId: 'K♠' })).toEqual({
      type: 'discard',
      cardId: 'K♠',
    });
  });

  it('rejects malformed payloads', () => {
    expect(() => parseNewArena(null)).toThrow(GameError);
    expect(() => parseNewArena({ players: 'nope' })).toThrow(GameError);
    expect(() => parseArenaAction({ type: 'move', direction: 'up' })).toThrow(/direction/i);
    expect(() => parseArenaAction({ type: 'teleport' })).toThrow(/Unknown action/);
    expect(() => parseArenaAction({ type: 'shoot' })).toThrow(/target/i);
    expect(() => parseArenaAction({ type: 'activateCard' })).toThrow(/card/i);
  });
});
