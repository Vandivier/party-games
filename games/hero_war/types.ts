import type { Card } from '@/core/cards';
import type { Random } from '@/core/rng';

export interface Hero {
  card: Card;
  hp: number;
  maxHp: number;
}

export interface HeroWarPlayer {
  index: number;
  name: string;
  isBot: boolean;
  hand: Card[];
  hero: Hero | null;
  /** Equipped clubs. Belongs to the player, not the hero. */
  equipment: Card[];
  out: boolean;
}

export interface DamageBreakdown {
  hero: number;
  equipment: number;
  boost: number;
  total: number;
}

export interface PendingAttack {
  attackerIndex: number;
  defenderIndex: number;
  damage: number;
  breakdown: DamageBreakdown;
  boosts: Card[];
}

export interface TurnState {
  playerIndex: number;
  drawn: boolean;
  played: boolean;
  /** Equipping locks out this turn's attack, and vice versa. */
  equipped: boolean;
  attacked: boolean;
}

export type HeroWarPhase = 'setup' | 'play' | 'over';

export interface HeroWarState {
  rng: Random;
  seed: string;
  deckCount: number;
  deck: Card[];
  discard: Card[];
  players: HeroWarPlayer[];
  turn: TurnState;
  pendingAttack: PendingAttack | null;
  /** Seat that must field a replacement hero before play continues. */
  pendingHero: number | null;
  phase: HeroWarPhase;
  winnerIndex: number | null;
  log: string[];
}

export type HeroWarAction =
  | { type: 'playHero'; cardId: string }
  | { type: 'draw' }
  | { type: 'equip'; cardId: string }
  | { type: 'spadeTrade'; cardId: string }
  | { type: 'spadeSabotage'; cardId: string; targetIndex: number; clubId: string }
  | { type: 'attack'; targetIndex: number; boostCardIds: string[] }
  | { type: 'endTurn' };

export type LegalAction = HeroWarAction & { label: string };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface DefenseChoice {
  /** A heart to discard for a full nullify, or null to take the hit. */
  cardId: string | null;
}

export interface CreateGameOptions {
  players: { name: string; isBot?: boolean }[];
  seed?: string | number;
  deckCount?: number;
}
