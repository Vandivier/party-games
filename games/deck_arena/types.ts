import type { Card } from '@/core/cards';
import type { Random } from '@/core/rng';

export const BOARD_SIZE = 6;
export const MAX_HP = 6;
export const MAX_SHIELD = 6;
export const HAND_LIMIT = 3;

export type Direction = 'north' | 'south' | 'east' | 'west';

export interface Position {
  /** 1–6, west to east. */
  x: number;
  /** 1–6, north to south. */
  y: number;
}

export interface EquippedWeapon {
  card: Card;
  /** False once it has been shot, until it is reloaded. */
  loaded: boolean;
  /** Face down until the first shot; then everyone can see what it is. */
  revealed: boolean;
}

export interface ArenaPlayer extends Position {
  index: number;
  name: string;
  isBot: boolean;
  hp: number;
  shield: number;
  hand: Card[];
  weapon: EquippedWeapon | null;
  out: boolean;
}

export interface TurnState {
  /** The 1d6 that set this turn's action budget. */
  roll: number;
  actionsLeft: number;
  freeSearchUsed: boolean;
}

export type ArenaPhase = 'play' | 'over';

export interface ArenaState {
  rng: Random;
  seed: string;
  /** 36 cells, row-major: index = (y - 1) * 6 + (x - 1). */
  board: (Card | null)[];
  /** The face-down pile: the 16 unused cards plus everything discarded since. */
  pile: Card[];
  players: ArenaPlayer[];
  /** Seat indices in turn order. */
  order: number[];
  /** Position within `order`. */
  orderIndex: number;
  round: number;
  turn: TurnState;
  phase: ArenaPhase;
  winnerIndex: number | null;
  log: string[];
}

export type ArenaAction =
  | { type: 'move'; direction: Direction }
  | { type: 'search' }
  | { type: 'activateCard'; cardId: string }
  | { type: 'shoot'; targetIndex: number }
  | { type: 'reload' }
  | { type: 'discard'; cardId: string }
  | { type: 'endTurn' };

export type LegalAction = ArenaAction & { label: string; cost: number };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateGameOptions {
  players: { name: string; isBot?: boolean }[];
  seed?: string | number;
}
