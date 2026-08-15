import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAction,
  applyDefense,
  createSession,
  GameError,
  getView,
  resetSessions,
} from '@/server/hero-war-store';
import { parseAction, parseNewGame, parseSeat } from '@/server/validate';

const humanVsBot = () =>
  createSession({ players: [{ name: 'Ada' }, { name: 'Bot', isBot: true }], seed: 'server' });

beforeEach(() => resetSessions());

describe('session store', () => {
  it('deals a table and hands back the first human seat', () => {
    const { view, seats } = humanVsBot();
    expect(view.seat).toBe(0);
    expect(view.you.hand).toHaveLength(5);
    expect(seats).toEqual([
      { index: 0, name: 'Ada', isBot: false },
      { index: 1, name: 'Bot', isBot: true },
    ]);
  });

  it('runs the bot seats as soon as they are on the clock', () => {
    const { view } = humanVsBot();
    const play = view.legalActions.find((action) => action.type === 'playHero');
    expect(play).toBeDefined();

    const next = applyAction(view.gameId, 0, play!);
    // The bot fielded its own hero without another round trip.
    expect(next.opponents[0]!.hero).not.toBeNull();
    expect(next.phase).toBe('play');
    expect(next.isYourInput).toBe(true);
  });

  it('refuses moves from the wrong seat', () => {
    const { view } = humanVsBot();
    expect(() => applyAction(view.gameId, 1, { type: 'draw' })).toThrow(GameError);
    try {
      applyAction(view.gameId, 1, { type: 'draw' });
    } catch (error) {
      expect((error as GameError).status).toBe(403); // seat 1 is a bot
    }
  });

  it('refuses an illegal action with a helpful message', () => {
    const { view } = humanVsBot();
    expect(() => applyAction(view.gameId, 0, { type: 'draw' })).toThrow(/hero/i);
  });

  it('404s an unknown table', () => {
    expect(() => getView('nope', 0)).toThrow(GameError);
    try {
      getView('nope', 0);
    } catch (error) {
      expect((error as GameError).status).toBe(404);
    }
  });

  it('needs a human at the table', () => {
    expect(() =>
      createSession({ players: [{ name: 'A', isBot: true }, { name: 'B', isBot: true }] }),
    ).toThrow(/human/i);
  });

  it('needs at least two players', () => {
    expect(() => createSession({ players: [{ name: 'Solo' }] })).toThrow(/2 players/);
  });

  it('rejects a defense when no attack is pending', () => {
    const { view } = humanVsBot();
    expect(() => applyDefense(view.gameId, 0, null)).toThrow(/No attack/);
  });

  it('plays a whole game against the bot without an illegal move', () => {
    const { view } = humanVsBot();
    let current = view;
    for (let step = 0; step < 400 && current.phase !== 'over'; step++) {
      if (current.pendingAttack && current.isYourInput) {
        current = applyDefense(current.gameId, current.seat, current.defenseOptions[0]?.id ?? null);
        continue;
      }
      const action =
        current.legalActions.find((entry) => entry.type === 'attack') ??
        current.legalActions.find((entry) => entry.type === 'playHero') ??
        current.legalActions[0];
      if (!action) break;
      current = applyAction(current.gameId, current.seat, action);
    }
    expect(current.phase).toBe('over');
    expect(current.winner).not.toBeNull();
  });
});

describe('request parsing', () => {
  it('accepts a well-formed new game', () => {
    const parsed = parseNewGame({ players: [{ name: 'A' }, { name: 'B', isBot: true }], seed: 'x' });
    expect(parsed.players).toHaveLength(2);
    expect(parsed.seed).toBe('x');
  });

  it('names unnamed seats', () => {
    const parsed = parseNewGame({ players: [{ name: '  ' }, { name: 'B' }] });
    // The store applies the fallback name.
    const { seats } = createSession(parsed);
    expect(seats[0]!.name).toBe('Player 1');
  });

  it('rejects malformed payloads', () => {
    expect(() => parseNewGame(null)).toThrow(GameError);
    expect(() => parseNewGame({ players: 'nope' })).toThrow(GameError);
    expect(() => parseNewGame({ players: [{ name: 'A' }], deckCount: 9 })).toThrow(/decks/);
    expect(() => parseSeat('abc')).toThrow(GameError);
    expect(() => parseAction({ type: 'nuke' })).toThrow(/Unknown action/);
    expect(() => parseAction({ type: 'equip' })).toThrow(/card/);
    expect(() => parseAction({ type: 'attack', targetIndex: 'x' })).toThrow(/target/);
  });

  it('normalizes an attack without boosts', () => {
    expect(parseAction({ type: 'attack', targetIndex: 1 })).toEqual({
      type: 'attack',
      targetIndex: 1,
      boostCardIds: [],
    });
  });
});
