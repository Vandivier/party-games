import { describe, expect, it } from 'vitest';
import { INPUT_CARDS, OUTPUT_CARDS } from '@games/cards_against_ai/cards';
import { act, createGame, isWaitingOn, legalActions, pendingSeats } from '@games/cards_against_ai/engine';
import { HAND_SIZE, TARGET_SCORE, type CaaState } from '@games/cards_against_ai/types';

function table(names = ['Ada', 'Bo', 'Cy'], seed = 'caa'): CaaState {
  return createGame({ players: names.map((name) => ({ name })), seed });
}

/** Everyone plays their first card. */
function everyoneSubmits(state: CaaState): void {
  for (const seat of [...pendingSeats(state)]) {
    const card = state.players[seat]!.hand[0]!;
    expect(act(state, seat, { type: 'submit', cardId: card.id }).ok).toBe(true);
  }
}

/** Everyone votes for the first card that is not their own. */
function everyoneVotes(state: CaaState): void {
  for (const seat of [...pendingSeats(state)]) {
    const option = state.submissions.find((entry) => entry.playerIndex !== seat)!;
    expect(act(state, seat, { type: 'vote', submissionId: option.id }).ok).toBe(true);
  }
}

describe('the decks', () => {
  it('ship both decks with unique ids and no blanks', () => {
    expect(INPUT_CARDS.length).toBeGreaterThanOrEqual(40);
    expect(OUTPUT_CARDS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(INPUT_CARDS.map((card) => card.id)).size).toBe(INPUT_CARDS.length);
    expect(new Set(OUTPUT_CARDS.map((card) => card.id)).size).toBe(OUTPUT_CARDS.length);
    for (const card of [...INPUT_CARDS, ...OUTPUT_CARDS]) {
      expect(card.text.trim().length).toBeGreaterThan(2);
    }
  });

  it('mixes silly prompts with mundane and academic ones', () => {
    const tones = new Set(INPUT_CARDS.map((card) => card.tone));
    expect([...tones].sort()).toEqual(['academic', 'mundane', 'silly']);
    const silly = INPUT_CARDS.filter((card) => card.tone === 'silly').length;
    expect(silly / INPUT_CARDS.length).toBeGreaterThan(0.4); // "emphasize funny and dumb"
    expect(INPUT_CARDS.filter((card) => card.tone === 'mundane').length).toBeGreaterThan(4);
    expect(INPUT_CARDS.filter((card) => card.tone === 'academic').length).toBeGreaterThan(4);
  });

  it('never repeats a card text', () => {
    expect(new Set(OUTPUT_CARDS.map((card) => card.text)).size).toBe(OUTPUT_CARDS.length);
    expect(new Set(INPUT_CARDS.map((card) => card.text)).size).toBe(INPUT_CARDS.length);
  });
});

describe('setup', () => {
  it('deals five Output Cards each and turns up an Input Card', () => {
    const state = table();
    for (const player of state.players) {
      expect(player.hand).toHaveLength(HAND_SIZE);
      expect(player.score).toBe(0);
    }
    expect(state.prompt.text.length).toBeGreaterThan(2);
    expect(state.phase).toBe('submit');
    expect(state.round).toBe(1);
    expect(state.targetScore).toBe(TARGET_SCORE);
  });

  it('waits on everybody at once — there are no turns', () => {
    const state = table();
    expect(pendingSeats(state).sort()).toEqual([0, 1, 2]);
    act(state, 1, { type: 'submit', cardId: state.players[1]!.hand[0]!.id });
    expect(pendingSeats(state).sort()).toEqual([0, 2]);
    expect(isWaitingOn(state, 1)).toBe(false);
  });

  it('refuses a two-player table, where every round would tie', () => {
    expect(() => table(['Ada', 'Bo'])).toThrow(/at least 3 players/);
  });
});

describe('a round', () => {
  it('keeps cards face down until the last one is played', () => {
    const state = table();
    act(state, 0, { type: 'submit', cardId: state.players[0]!.hand[0]!.id });
    expect(state.phase).toBe('submit');
    expect(state.submissions.every((entry) => entry.id === '')).toBe(true);

    act(state, 1, { type: 'submit', cardId: state.players[1]!.hand[0]!.id });
    act(state, 2, { type: 'submit', cardId: state.players[2]!.hand[0]!.id });
    expect(state.phase).toBe('vote');
    expect(state.submissions.map((entry) => entry.id)).toEqual(['A', 'B', 'C']);
  });

  it('refuses a second card, a card you do not hold, and a vote before the reveal', () => {
    const state = table();
    const card = state.players[0]!.hand[0]!;
    act(state, 0, { type: 'submit', cardId: card.id });
    expect(act(state, 0, { type: 'submit', cardId: state.players[0]!.hand[0]!.id }).ok).toBe(false);
    expect(act(state, 1, { type: 'submit', cardId: 'out-999' }).ok).toBe(false);
    expect(act(state, 1, { type: 'vote', submissionId: 'A' }).ok).toBe(false);
  });

  it('will not let you vote for your own card', () => {
    const state = table();
    everyoneSubmits(state);
    const mine = state.submissions.find((entry) => entry.playerIndex === 0)!;
    const result = act(state, 0, { type: 'vote', submissionId: mine.id });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/your own/);
    const options = legalActions(state, 0).filter((action) => action.type === 'vote');
    expect(options.every((action) => action.submissionId !== mine.id)).toBe(true);
    expect(options).toHaveLength(2);
  });

  it('scores the most-voted card and reveals who played what', () => {
    const state = table();
    everyoneSubmits(state);
    const target = state.submissions.find((entry) => entry.playerIndex === 2)!;
    act(state, 0, { type: 'vote', submissionId: target.id });
    act(state, 1, { type: 'vote', submissionId: target.id });
    const other = state.submissions.find((entry) => entry.playerIndex !== 2)!;
    act(state, 2, { type: 'vote', submissionId: other.id });

    expect(state.phase).toBe('results');
    expect(state.players[2]!.score).toBe(1);
    expect(state.players[0]!.score + state.players[1]!.score).toBe(0);
    expect(state.lastRound?.winners).toEqual([2]);
    expect(state.lastRound?.standings[0]).toMatchObject({ playerIndex: 2, votes: 2 });
  });

  it('gives every tied player a point', () => {
    const state = table();
    everyoneSubmits(state);
    // A voting cycle: each player backs the next one along, so all three tie.
    const cardOf = (seat: number) => state.submissions.find((entry) => entry.playerIndex === seat)!;
    act(state, 0, { type: 'vote', submissionId: cardOf(1).id });
    act(state, 1, { type: 'vote', submissionId: cardOf(2).id });
    act(state, 2, { type: 'vote', submissionId: cardOf(0).id });

    expect(state.phase).toBe('results');
    expect(state.players.map((player) => player.score)).toEqual([1, 1, 1]);
    expect(state.lastRound?.winners.sort()).toEqual([0, 1, 2]);
    expect(state.log.some((line) => line.includes('A tie'))).toBe(true);
  });

  it('deals a new prompt, refills hands, and recycles the played cards', () => {
    const state = table();
    const firstPrompt = state.prompt;
    everyoneSubmits(state);
    everyoneVotes(state);
    expect(act(state, 0, { type: 'nextRound' }).ok).toBe(true);

    expect(state.round).toBe(2);
    expect(state.phase).toBe('submit');
    expect(state.prompt.id).not.toBe(firstPrompt.id);
    expect(state.inputDiscard).toContain(firstPrompt);
    expect(state.outputDiscard).toHaveLength(3);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(HAND_SIZE);
      expect(player.hasSubmitted).toBe(false);
      expect(player.votedFor).toBeNull();
    }
  });

  it('refuses to deal on while the round is still running', () => {
    const state = table();
    expect(act(state, 0, { type: 'nextRound' }).ok).toBe(false);
  });
});

describe('winning', () => {
  it('ends the game at the target score', () => {
    const state = createGame({
      players: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }],
      seed: 'win',
      targetScore: 2,
    });
    for (let round = 0; round < 2; round++) {
      everyoneSubmits(state);
      const target = state.submissions.find((entry) => entry.playerIndex === 1)!;
      act(state, 0, { type: 'vote', submissionId: target.id });
      act(state, 2, { type: 'vote', submissionId: target.id });
      const other = state.submissions.find((entry) => entry.playerIndex !== 1)!;
      act(state, 1, { type: 'vote', submissionId: other.id });
      if (state.phase === 'results') act(state, 0, { type: 'nextRound' });
    }
    expect(state.players[1]!.score).toBe(2);
    expect(state.phase).toBe('over');
    expect(state.winners).toEqual([1]);
    expect(act(state, 0, { type: 'nextRound' }).ok).toBe(false);
  });

  it('never names a face-down card in the log', () => {
    const state = table();
    const texts = OUTPUT_CARDS.map((card) => card.text);
    act(state, 0, { type: 'submit', cardId: state.players[0]!.hand[0]!.id });
    for (const line of state.log) {
      expect(texts.some((text) => line.includes(text))).toBe(false);
    }
  });
});
