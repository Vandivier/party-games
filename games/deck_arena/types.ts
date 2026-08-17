import type { Card } from '@/core/cards';
import type { Random } from '@/core/rng';

export const BOARD_SIZE = 6;
export const MAX_HP = 6;
export const MAX_SHIELD = 6;
export const HAND_LIMIT = 3;
/** The queen of hearts' regen may push health this far past the normal cap. */
export const OVERHEAL_CAP = 12;
/** Face-up aces needed to win outright. */
export const ACES_TO_WIN = 4;

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

/**
 * How a bot plays. Most fight; a few go looking for the four-ace win instead.
 * Hidden from the view — you find out by watching what they do.
 */
export type BotPersona = 'brawler' | 'collector';

export interface Regen {
  turnsLeft: number;
  /** 6 for the jack of hearts, 12 for the queen. */
  max: number;
}

export interface ArenaPlayer extends Position {
  index: number;
  name: string;
  isBot: boolean;
  hp: number;
  shield: number;
  /** Overshield from a face spade: absorbs a hit whole, never spills over. */
  overshield: number;
  hand: Card[];
  /** Aces played face up. They do not count against the hand limit. */
  aces: Card[];
  weapon: EquippedWeapon | null;
  regen: Regen | null;
  persona: BotPersona;
  out: boolean;
}

export interface TurnState {
  /** The 1d6 that set this turn's action budget. */
  roll: number;
  actionsLeft: number;
  freeSearchUsed: boolean;
  /** Blitzkrieg: reloads cost nothing for the rest of this turn. */
  freeReloads: boolean;
}

export type ArenaPhase = 'play' | 'over';

export interface ArenaState {
  rng: Random;
  seed: string;
  /** Jacks, queens and kings carry their special abilities. */
  faceCardAbilities: boolean;
  /** Aces collect face up, and four of them win the game. */
  aceVictory: boolean;
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
  /** A seat holding looted cards that must discard down to the hand limit. */
  pendingDiscard: number | null;
  phase: ArenaPhase;
  winnerIndex: number | null;
  log: string[];
}

export type ArenaAction =
  | { type: 'move'; direction: Direction }
  | { type: 'search' }
  | {
      type: 'activateCard';
      cardId: string;
      /** Super mobility: the step to take. */
      direction?: Direction;
      /** Teleport: where to land. */
      to?: Position;
    }
  | {
      type: 'shoot';
      /** Ordinary weapons and the exploding sniper name a target. */
      targetIndex?: number;
      /** The piercing sniper takes one direction, the dual shotguns two. */
      directions?: Direction[];
    }
  | { type: 'reload' }
  /** Lay an ace from hand face up on the field, toward the four-ace win. */
  | { type: 'playAce'; cardId: string }
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
  /** Both default to true, and are independent of each other. */
  faceCardAbilities?: boolean;
  aceVictory?: boolean;
}
