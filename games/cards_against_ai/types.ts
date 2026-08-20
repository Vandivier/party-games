import type { Random } from '@/core/rng';
import type { InputCard, OutputCard } from './cards';

export const HAND_SIZE = 5;
export const TARGET_SCORE = 7;

export type CaaPhase = 'submit' | 'vote' | 'results' | 'over';

export interface Submission {
  /** Assigned only when the cards are shuffled and turned over, so the id
   *  cannot betray who played first. */
  id: string;
  card: OutputCard;
  playerIndex: number;
  /** Seats that voted for this card. Kept back until the votes are counted. */
  votes: number[];
}

export interface CaaPlayer {
  index: number;
  name: string;
  isBot: boolean;
  hand: OutputCard[];
  score: number;
  /** Whether this player's card is already face down this round. */
  hasSubmitted: boolean;
  votedFor: string | null;
}

export interface RoundStanding {
  submissionId: string;
  card: OutputCard;
  playerIndex: number;
  playerName: string;
  votes: number;
}

export interface RoundResult {
  round: number;
  prompt: InputCard;
  standings: RoundStanding[];
  /** Seats that scored — more than one on a tie. */
  winners: number[];
}

export interface CaaState {
  rng: Random;
  seed: string;
  inputDeck: InputCard[];
  inputDiscard: InputCard[];
  outputDeck: OutputCard[];
  outputDiscard: OutputCard[];
  players: CaaPlayer[];
  round: number;
  prompt: InputCard;
  submissions: Submission[];
  phase: CaaPhase;
  targetScore: number;
  lastRound: RoundResult | null;
  /** Filled when somebody reaches the target — more than one on a tie. */
  winners: number[];
  log: string[];
}

export type CaaAction =
  | { type: 'submit'; cardId: string }
  | { type: 'vote'; submissionId: string }
  | { type: 'nextRound' };

export type LegalAction = CaaAction & { label: string };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateGameOptions {
  players: { name: string; isBot?: boolean }[];
  seed?: string | number;
  /** Points needed to win. Defaults to seven. */
  targetScore?: number;
}
