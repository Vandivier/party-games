import { beforeEach, describe, expect, it } from 'vitest';
import { OUTPUT_CARDS } from '@games/cards_against_ai/cards';
import {
  applyAction,
  createSession,
  getView,
  resetSessions,
} from '@/server/cards-against-ai-store';
import { GameError } from '@/server/game-error';
import { parseAction, parseNewGame } from '@/server/cards-against-ai-validate';

const humanVsBots = (targetScore?: number) =>
  createSession({
    players: [{ name: 'Ada' }, { name: 'Bot 1', isBot: true }, { name: 'Bot 2', isBot: true }],
    seed: 'server',
    ...(targetScore ? { targetScore } : {}),
  });

beforeEach(() => resetSessions());

describe('table store', () => {
  it('deals a table and answers for the first human seat', () => {
    const { view, seats } = humanVsBots();
    expect(view.seat).toBe(0);
    expect(view.you.hand).toHaveLength(5);
    expect(seats).toHaveLength(3);
    expect(view.prompt.text.length).toBeGreaterThan(2);
  });

  it('plays the bots straight away, leaving only the human to answer', () => {
    const { view } = humanVsBots();
    expect(view.phase).toBe('submit');
    expect(view.isWaitingOnYou).toBe(true);
    expect(view.waitingOn.map((entry) => entry.index)).toEqual([0]);
    expect(view.faceDownCount).toBe(2);
    // Two cards are down but nothing about them has leaked.
    expect(view.table).toEqual([]);
    expect(OUTPUT_CARDS.some((card) => JSON.stringify(view.log).includes(card.text))).toBe(false);
  });

  it('walks a whole round: answer, reveal, vote, result', () => {
    const { view } = humanVsBots();
    const answer = view.legalActions.find((action) => action.type === 'submit')!;
    let current = applyAction(view.gameId, 0, answer);

    // Everyone has answered, so the cards are face up and the bots have voted.
    expect(current.phase).toBe('vote');
    expect(current.table).toHaveLength(3);
    expect(current.table.filter((card) => card.yours)).toHaveLength(1);
    expect(current.isWaitingOnYou).toBe(true);

    const vote = current.legalActions.find((action) => action.type === 'vote')!;
    current = applyAction(current.gameId, 0, vote);
    expect(current.phase).toBe('results');
    expect(current.result?.standings).toHaveLength(3);
    expect(current.result?.standings.every((entry) => entry.playerName.length > 0)).toBe(true);

    current = applyAction(current.gameId, 0, { type: 'nextRound' });
    expect(current.round).toBe(2);
    expect(current.phase).toBe('submit');
    expect(current.you.hand).toHaveLength(5);
  });

  it('plays a whole game out to a winner', () => {
    const { view } = humanVsBots(3);
    let current = view;
    for (let step = 0; step < 400 && current.phase !== 'over'; step++) {
      const action = current.legalActions[0];
      if (!action) break;
      current = applyAction(current.gameId, 0, action);
    }
    expect(current.phase).toBe('over');
    expect(current.winners.length).toBeGreaterThan(0);
    expect(Math.max(...current.standings.map((entry) => entry.score))).toBeGreaterThanOrEqual(3);
  });

  it('refuses a bot seat, an unknown table, and an illegal action', () => {
    const { view } = humanVsBots();
    try {
      applyAction(view.gameId, 1, { type: 'nextRound' });
      expect.unreachable('a bot seat should not be playable');
    } catch (error) {
      expect((error as GameError).status).toBe(403);
    }
    try {
      getView('nope', 0);
      expect.unreachable('an unknown table should 404');
    } catch (error) {
      expect((error as GameError).status).toBe(404);
    }
    expect(() => applyAction(view.gameId, 0, { type: 'vote', submissionId: 'A' })).toThrow(
      /not time to vote/i,
    );
  });

  it('needs three to eight players and at least one human', () => {
    expect(() => createSession({ players: [{ name: 'Solo' }] })).toThrow(/at least 3 players/);
    expect(() => createSession({ players: [{ name: 'A' }, { name: 'B' }] })).toThrow(
      /at least 3 players/,
    );
    expect(() =>
      createSession({
        players: [
          { name: 'A', isBot: true },
          { name: 'B', isBot: true },
          { name: 'C', isBot: true },
        ],
      }),
    ).toThrow(/human/i);
    expect(() =>
      createSession({ players: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })) }),
    ).toThrow(/tops out/);
  });
});

describe('request parsing', () => {
  it('accepts the three actions a client can send', () => {
    expect(parseAction({ type: 'submit', cardId: 'out-001' })).toEqual({
      type: 'submit',
      cardId: 'out-001',
    });
    expect(parseAction({ type: 'vote', submissionId: 'B' })).toEqual({
      type: 'vote',
      submissionId: 'B',
    });
    expect(parseAction({ type: 'nextRound' })).toEqual({ type: 'nextRound' });
  });

  it('rejects malformed payloads', () => {
    expect(() => parseNewGame(null)).toThrow(GameError);
    expect(() => parseNewGame({ players: 'nope' })).toThrow(GameError);
    expect(() => parseNewGame({ players: [{ name: 'A' }], targetScore: 99 })).toThrow(/points/);
    expect(() => parseAction({ type: 'submit' })).toThrow(/card/i);
    expect(() => parseAction({ type: 'shout' })).toThrow(/Unknown action/);
  });
});
