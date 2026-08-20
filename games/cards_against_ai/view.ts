/**
 * The serializable, per-seat picture of a game.
 *
 * While cards are face down the view carries a count and nothing else. Once they
 * are turned over it carries the text but never the author — authorship arrives
 * only with the result, after the voting closes.
 */

import { isWaitingOn, legalActions, pendingSeats, scoreboard, seatAt } from './engine';
import type { InputCard, OutputCard } from './cards';
import { HAND_SIZE, type CaaState, type LegalAction, type RoundResult } from './types';

export interface PlayerView {
  index: number;
  name: string;
  isBot: boolean;
  score: number;
  /** Whether this player's card is already face down this round. */
  hasSubmitted: boolean;
  hasVoted: boolean;
}

export interface TableCard {
  id: string;
  text: string;
  /** True for the cards this seat played — the UI greys them out for voting. */
  yours: boolean;
}

export interface CaaView {
  gameId: string;
  seat: number;
  phase: CaaState['phase'];
  round: number;
  targetScore: number;
  handSize: number;
  prompt: InputCard;
  you: {
    index: number;
    name: string;
    score: number;
    hand: OutputCard[];
    hasSubmitted: boolean;
    votedFor: string | null;
  };
  players: PlayerView[];
  /** How many cards are face down, while they still are. */
  faceDownCount: number;
  /** The shuffled cards, once they are turned over. Authorless until results. */
  table: TableCard[];
  result: RoundResult | null;
  waitingOn: { index: number; name: string }[];
  isWaitingOnYou: boolean;
  legalActions: LegalAction[];
  winners: { index: number; name: string }[];
  standings: { index: number; name: string; score: number }[];
  log: string[];
}

export function toView(state: CaaState, seat: number, gameId: string): CaaView {
  const you = seatAt(state, seat);
  if (!you) throw new Error(`Seat ${seat} is not at this table.`);

  const revealed = state.phase === 'vote' || state.phase === 'results' || state.phase === 'over';

  return {
    gameId,
    seat,
    phase: state.phase,
    round: state.round,
    targetScore: state.targetScore,
    handSize: HAND_SIZE,
    prompt: state.prompt,
    you: {
      index: you.index,
      name: you.name,
      score: you.score,
      hand: [...you.hand],
      hasSubmitted: you.hasSubmitted,
      votedFor: you.votedFor,
    },
    players: state.players.map((player) => ({
      index: player.index,
      name: player.name,
      isBot: player.isBot,
      score: player.score,
      hasSubmitted: player.hasSubmitted,
      hasVoted: player.votedFor !== null,
    })),
    faceDownCount: state.submissions.length,
    table: revealed
      ? state.submissions.map((entry) => ({
          id: entry.id,
          text: entry.card.text,
          yours: entry.playerIndex === seat,
        }))
      : [],
    result: state.phase === 'results' || state.phase === 'over' ? state.lastRound : null,
    waitingOn: pendingSeats(state).map((index) => ({
      index,
      name: seatAt(state, index)?.name ?? '',
    })),
    isWaitingOnYou: isWaitingOn(state, seat),
    legalActions: legalActions(state, seat),
    winners: state.winners.map((index) => ({
      index,
      name: seatAt(state, index)?.name ?? '',
    })),
    standings: scoreboard(state),
    log: [...state.log],
  };
}
