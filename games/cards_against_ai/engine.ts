/**
 * Cards Against AI engine.
 *
 * Rules: ./RULES.md   Gap-filling defaults: ./HOUSE_RULES.md
 *
 * Unlike the other games here, nobody has a turn: a round waits on every player
 * at once, first for a face-down card and then for a vote. The engine tracks who
 * it is still waiting on rather than whose turn it is.
 *
 * Nothing in `state.log` may name a card while it is face down.
 */

import { Random } from '@/core/rng';
import { INPUT_CARDS, OUTPUT_CARDS, type InputCard, type OutputCard } from './cards';
import {
  HAND_SIZE,
  TARGET_SCORE,
  type ActionResult,
  type CaaAction,
  type CaaPlayer,
  type CaaState,
  type CreateGameOptions,
  type LegalAction,
  type RoundStanding,
  type Submission,
} from './types';

export function createGame({ players, seed, targetScore }: CreateGameOptions): CaaState {
  // Two players would each have to vote for the other, tying every round.
  if (!players || players.length < 3) throw new Error('Cards Against AI needs at least 3 players.');
  if (players.length > 8) throw new Error('Cards Against AI tops out at 8 players.');
  const rng = new Random(seed);

  const inputDeck = rng.shuffle([...INPUT_CARDS]);
  const prompt = inputDeck.pop();
  if (!prompt) throw new Error('The Input deck is empty.');

  const state: CaaState = {
    rng,
    seed: rng.seed,
    inputDeck,
    inputDiscard: [],
    outputDeck: rng.shuffle([...OUTPUT_CARDS]),
    outputDiscard: [],
    players: players.map((player, index) => ({
      index,
      name: player.name,
      isBot: Boolean(player.isBot),
      hand: [],
      score: 0,
      hasSubmitted: false,
      votedFor: null,
    })),
    round: 1,
    prompt,
    submissions: [],
    phase: 'submit',
    targetScore: targetScore ?? TARGET_SCORE,
    lastRound: null,
    winners: [],
    log: [],
  };

  for (const player of state.players) refillHand(state, player);
  log(state, `Round 1 — the input reads: “${prompt.text}”`);
  return state;
}

/* ---------------------------------------------------------------- the decks */

function drawOutput(state: CaaState): OutputCard | null {
  if (state.outputDeck.length === 0) {
    if (state.outputDiscard.length === 0) return null;
    state.outputDeck = state.rng.shuffle(state.outputDiscard);
    state.outputDiscard = [];
    log(state, 'The Output discard pile is shuffled into a fresh deck.');
  }
  return state.outputDeck.pop() ?? null;
}

function drawInput(state: CaaState): InputCard | null {
  if (state.inputDeck.length === 0) {
    if (state.inputDiscard.length === 0) return null;
    state.inputDeck = state.rng.shuffle(state.inputDiscard);
    state.inputDiscard = [];
    log(state, 'The Input discard pile is shuffled into a fresh deck.');
  }
  return state.inputDeck.pop() ?? null;
}

function refillHand(state: CaaState, player: CaaPlayer): void {
  while (player.hand.length < HAND_SIZE) {
    const card = drawOutput(state);
    if (!card) return;
    player.hand.push(card);
  }
}

/* ------------------------------------------------------------- who we await */

export function seatAt(state: CaaState, index: number): CaaPlayer | undefined {
  return state.players[index];
}

/** Whether this seat can still vote for anything that is not their own card. */
function hasSomeoneToVoteFor(state: CaaState, seat: number): boolean {
  return state.submissions.some((entry) => entry.playerIndex !== seat);
}

/** Seats the round is still waiting on. Empty in `results` and `over`. */
export function pendingSeats(state: CaaState): number[] {
  if (state.phase === 'submit') {
    return state.players.filter((player) => !player.hasSubmitted).map((player) => player.index);
  }
  if (state.phase === 'vote') {
    return state.players
      .filter((player) => player.votedFor === null && hasSomeoneToVoteFor(state, player.index))
      .map((player) => player.index);
  }
  return [];
}

export function isWaitingOn(state: CaaState, seat: number): boolean {
  return pendingSeats(state).includes(seat);
}

/* ------------------------------------------------------------------ actions */

export function legalActions(state: CaaState, seat: number): LegalAction[] {
  const player = seatAt(state, seat);
  if (!player) return [];

  if (state.phase === 'submit' && isWaitingOn(state, seat)) {
    return player.hand.map((card) => ({
      type: 'submit' as const,
      cardId: card.id,
      label: card.text,
    }));
  }

  if (state.phase === 'vote' && isWaitingOn(state, seat)) {
    return state.submissions
      .filter((entry) => entry.playerIndex !== seat)
      .map((entry) => ({ type: 'vote' as const, submissionId: entry.id, label: entry.card.text }));
  }

  if (state.phase === 'results') {
    return [{ type: 'nextRound', label: 'Deal the next input' }];
  }

  return [];
}

export function act(state: CaaState, seat: number, action: CaaAction): ActionResult {
  const player = seatAt(state, seat);
  if (!player) return fail('You are not at this table.');
  if (state.phase === 'over') return fail('The game is over.');

  switch (action.type) {
    case 'submit': {
      if (state.phase !== 'submit') return fail('The answers are already in.');
      if (!isWaitingOn(state, seat)) return fail('You have already played your card.');
      const index = player.hand.findIndex((card) => card.id === action.cardId);
      if (index === -1) return fail('That card is not in your hand.');
      const [card] = player.hand.splice(index, 1);
      if (!card) return fail('That card is not in your hand.');
      state.submissions.push({ id: '', card, playerIndex: seat, votes: [] });
      player.hasSubmitted = true;
      log(state, `${player.name} plays a card face down.`);
      if (pendingSeats(state).length === 0) revealSubmissions(state);
      return ok();
    }

    case 'vote': {
      if (state.phase !== 'vote') return fail('It is not time to vote.');
      if (!isWaitingOn(state, seat)) return fail('You have already voted.');
      const target = state.submissions.find((entry) => entry.id === action.submissionId);
      if (!target) return fail('No such card on the table.');
      if (target.playerIndex === seat) return fail('You cannot vote for your own card.');
      player.votedFor = target.id;
      log(state, `${player.name} has voted.`);
      if (pendingSeats(state).length === 0) countVotes(state);
      return ok();
    }

    case 'nextRound': {
      if (state.phase !== 'results') return fail('The round is still running.');
      return startRound(state);
    }

    default:
      return fail(`Unknown action: ${(action as { type: string }).type}`);
  }
}

/** Shuffle the face-down cards together, then letter them and turn them over. */
function revealSubmissions(state: CaaState): void {
  state.rng.shuffle(state.submissions);
  state.submissions.forEach((entry, index) => {
    entry.id = String.fromCharCode(65 + index); // A, B, C…
  });
  state.phase = 'vote';
  log(
    state,
    `${state.submissions.length} answers are shuffled and turned over. Vote for your favourite — not your own.`,
  );
}

function countVotes(state: CaaState): void {
  for (const player of state.players) {
    if (!player.votedFor) continue;
    const target = state.submissions.find((entry) => entry.id === player.votedFor);
    target?.votes.push(player.index);
  }

  const best = Math.max(...state.submissions.map((entry) => entry.votes.length));
  const winning = state.submissions.filter((entry) => entry.votes.length === best && best > 0);
  const winners = [...new Set(winning.map((entry) => entry.playerIndex))];

  for (const seat of winners) {
    const player = seatAt(state, seat);
    if (player) player.score++;
  }

  const standings: RoundStanding[] = [...state.submissions]
    .sort((a, b) => b.votes.length - a.votes.length)
    .map((entry) => ({
      submissionId: entry.id,
      card: entry.card,
      playerIndex: entry.playerIndex,
      playerName: seatAt(state, entry.playerIndex)?.name ?? '',
      votes: entry.votes.length,
    }));

  state.lastRound = { round: state.round, prompt: state.prompt, standings, winners };
  state.phase = 'results';

  const names = winners.map((seat) => seatAt(state, seat)?.name).filter(Boolean);
  log(
    state,
    winners.length === 0
      ? 'Nobody got a vote. Brutal.'
      : winners.length === 1
        ? `${names[0]} takes the round with “${winning[0]?.card.text}”.`
        : `A tie — ${names.join(' and ')} each take a point.`,
  );

  const done = state.players.filter((player) => player.score >= state.targetScore);
  if (done.length > 0) {
    state.winners = done.map((player) => player.index);
    state.phase = 'over';
    log(
      state,
      done.length === 1
        ? `${done[0]?.name} reaches ${state.targetScore} points and wins!`
        : `${done.map((player) => player.name).join(' and ')} reach ${state.targetScore} together and share the win!`,
    );
  }
}

function startRound(state: CaaState): ActionResult {
  state.inputDiscard.push(state.prompt);
  for (const entry of state.submissions) state.outputDiscard.push(entry.card);
  state.submissions = [];

  const prompt = drawInput(state);
  if (!prompt) return fail('The Input deck is empty.');
  state.prompt = prompt;
  state.round++;
  state.phase = 'submit';

  for (const player of state.players) {
    player.hasSubmitted = false;
    player.votedFor = null;
    refillHand(state, player);
  }

  log(state, `Round ${state.round} — the input reads: “${prompt.text}”`);
  return ok();
}

/* ---------------------------------------------------------------- helpers */

export function scoreboard(state: CaaState): { index: number; name: string; score: number }[] {
  return [...state.players]
    .map((player) => ({ index: player.index, name: player.name, score: player.score }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function log(state: CaaState, text: string): void {
  state.log.push(text);
}

const ok = (): ActionResult => ({ ok: true });
const fail = (error: string): ActionResult => ({ ok: false, error });

export { HAND_SIZE, TARGET_SCORE };
