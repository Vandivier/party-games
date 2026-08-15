/**
 * The serializable, per-seat picture of a game. Other players' hands never
 * leave the server — a seat sees its own cards and everyone's public board.
 */

import { sortHand, type Card } from '@/core/cards';
import { currentActor, damageBreakdown, legalActions, playerAt, waitingKind } from './engine';
import type { DamageBreakdown, HeroWarState, LegalAction } from './types';

export interface HeroView {
  card: Card;
  hp: number;
  maxHp: number;
}

export interface SelfView {
  index: number;
  name: string;
  hand: Card[];
  hero: HeroView | null;
  equipment: Card[];
  out: boolean;
  /** What an unboosted attack would deal right now. */
  damage: DamageBreakdown;
}

export interface OpponentView {
  index: number;
  name: string;
  isBot: boolean;
  out: boolean;
  handCount: number;
  hero: HeroView | null;
  equipment: Card[];
  damage: DamageBreakdown;
}

export interface PendingAttackView {
  attackerIndex: number;
  attackerName: string;
  defenderIndex: number;
  defenderName: string;
  damage: number;
  breakdown: DamageBreakdown;
  boosts: Card[];
}

export interface HeroWarView {
  gameId: string;
  seat: number;
  phase: HeroWarState['phase'];
  you: SelfView;
  opponents: OpponentView[];
  turnPlayerIndex: number;
  turnPlayerName: string;
  deckRemaining: number;
  discardCount: number;
  log: string[];
  winner: { index: number; name: string } | null;
  waitingOn: { index: number; name: string; kind: 'action' | 'defense' | 'hero' } | null;
  /** True when the game is waiting on this seat for anything. */
  isYourInput: boolean;
  /** Populated only when this seat is the one to act. */
  legalActions: LegalAction[];
  pendingAttack: PendingAttackView | null;
  /** Hearts this seat could spend on a pending attack against it. */
  defenseOptions: Card[];
}

export function toView(state: HeroWarState, seat: number, gameId: string): HeroWarView {
  const you = playerAt(state, seat);
  if (!you) throw new Error(`Seat ${seat} is not at this table.`);

  const actor = currentActor(state);
  const kind = waitingKind(state);
  const isYourInput = actor === seat;
  const actorPlayer = actor === null ? null : playerAt(state, actor);
  const turnPlayer = playerAt(state, state.turn.playerIndex);
  const winner = state.winnerIndex === null ? null : playerAt(state, state.winnerIndex);

  return {
    gameId,
    seat,
    phase: state.phase,
    you: {
      index: you.index,
      name: you.name,
      hand: sortHand(you.hand),
      hero: you.hero,
      equipment: [...you.equipment],
      out: you.out,
      damage: damageBreakdown(you),
    },
    opponents: state.players
      .filter((player) => player.index !== seat)
      .map((player) => ({
        index: player.index,
        name: player.name,
        isBot: player.isBot,
        out: player.out,
        handCount: player.hand.length,
        hero: player.hero,
        equipment: [...player.equipment],
        damage: damageBreakdown(player),
      })),
    turnPlayerIndex: state.turn.playerIndex,
    turnPlayerName: turnPlayer?.name ?? '',
    deckRemaining: state.deck.length,
    discardCount: state.discard.length,
    log: [...state.log],
    winner: winner ? { index: winner.index, name: winner.name } : null,
    waitingOn:
      actorPlayer && kind
        ? { index: actorPlayer.index, name: actorPlayer.name, kind }
        : null,
    isYourInput,
    legalActions: isYourInput ? legalActions(state) : [],
    pendingAttack: toPendingAttackView(state),
    defenseOptions:
      isYourInput && state.pendingAttack
        ? sortHand(you.hand.filter((card) => card.suit === 'hearts'))
        : [],
  };
}

function toPendingAttackView(state: HeroWarState): PendingAttackView | null {
  const attack = state.pendingAttack;
  if (!attack) return null;
  return {
    attackerIndex: attack.attackerIndex,
    attackerName: playerAt(state, attack.attackerIndex)?.name ?? '',
    defenderIndex: attack.defenderIndex,
    defenderName: playerAt(state, attack.defenderIndex)?.name ?? '',
    damage: attack.damage,
    breakdown: attack.breakdown,
    boosts: [...attack.boosts],
  };
}
