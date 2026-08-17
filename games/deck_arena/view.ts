/**
 * The serializable, per-seat picture of an arena.
 *
 * Hidden information stays on the server: face-down floor cards are reported as
 * "a card is here" and nothing more, opponents' hands as a count, and an
 * equipped weapon only names its card once it has been fired.
 */

import type { Card } from '@/core/cards';
import { currentActor, legalActions, seatAt, shotsAvailable, weaponDamage, weaponRange } from './engine';
import {
  BOARD_SIZE,
  HAND_LIMIT,
  MAX_HP,
  MAX_SHIELD,
  type ArenaState,
  type LegalAction,
  type Regen,
} from './types';

export interface CellView {
  x: number;
  y: number;
  /** A face-down card lies here. Its identity is never sent. */
  hasCard: boolean;
  /** Seat standing on this cell, if any. */
  playerIndex: number | null;
}

export interface WeaponView {
  /** Present only once the weapon has been fired and turned face up. */
  card: Card | null;
  loaded: boolean;
  revealed: boolean;
  damage: number | null;
  range: number | null;
}

export interface SelfView {
  index: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  shield: number;
  overshield: number;
  regen: Regen | null;
  /** Aces played face up: public, and outside the hand limit. */
  aces: Card[];
  hand: Card[];
  weapon: WeaponView | null;
  out: boolean;
  /** Seats this player could shoot right now. */
  shotsOn: number[];
}

export interface OpponentView {
  index: number;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  hp: number;
  shield: number;
  overshield: number;
  regen: Regen | null;
  aces: Card[];
  handCount: number;
  weapon: WeaponView | null;
  out: boolean;
}

export interface ArenaView {
  gameId: string;
  seat: number;
  phase: ArenaState['phase'];
  round: number;
  faceCardAbilities: boolean;
  aceVictory: boolean;
  boardSize: number;
  maxHp: number;
  maxShield: number;
  handLimit: number;
  cells: CellView[];
  you: SelfView;
  opponents: OpponentView[];
  turnPlayerIndex: number | null;
  turnPlayerName: string;
  actionRoll: number;
  actionsLeft: number;
  freeSearchAvailable: boolean;
  freeReloads: boolean;
  /** True while this seat must discard looted cards before anything else. */
  mustDiscard: boolean;
  pileCount: number;
  log: string[];
  winner: { index: number; name: string } | null;
  isYourTurn: boolean;
  /** Populated only when this seat is the one to act. */
  legalActions: LegalAction[];
}

export function toView(state: ArenaState, seat: number, gameId: string): ArenaView {
  const you = seatAt(state, seat);
  if (!you) throw new Error(`Seat ${seat} is not in this arena.`);

  const actor = currentActor(state);
  const isYourTurn = actor === seat;
  const turnPlayer = actor === null ? null : seatAt(state, actor);
  const winner = state.winnerIndex === null ? null : seatAt(state, state.winnerIndex);

  const cells: CellView[] = [];
  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      const standing = state.players.find(
        (player) => !player.out && player.x === x && player.y === y,
      );
      cells.push({
        x,
        y,
        hasCard: Boolean(state.board[(y - 1) * BOARD_SIZE + (x - 1)]),
        playerIndex: standing ? standing.index : null,
      });
    }
  }

  return {
    gameId,
    seat,
    phase: state.phase,
    round: state.round,
    faceCardAbilities: state.faceCardAbilities,
    aceVictory: state.aceVictory,
    boardSize: BOARD_SIZE,
    maxHp: MAX_HP,
    maxShield: MAX_SHIELD,
    handLimit: HAND_LIMIT,
    cells,
    you: {
      index: you.index,
      name: you.name,
      x: you.x,
      y: you.y,
      hp: you.hp,
      shield: you.shield,
      overshield: you.overshield,
      regen: you.regen ? { ...you.regen } : null,
      aces: [...you.aces],
      hand: [...you.hand],
      weapon: you.weapon
        ? {
            card: you.weapon.card,
            loaded: you.weapon.loaded,
            revealed: you.weapon.revealed,
            damage: weaponDamage(you.weapon.card),
            range: weaponRange(you.weapon.card),
          }
        : null,
      out: you.out,
      shotsOn: you.out ? [] : shotsAvailable(state, you).map((shot) => shot.target.index),
    },
    opponents: state.players
      .filter((player) => player.index !== seat)
      .map((player) => ({
        index: player.index,
        name: player.name,
        isBot: player.isBot,
        x: player.x,
        y: player.y,
        hp: player.hp,
        shield: player.shield,
        overshield: player.overshield,
        regen: player.regen ? { ...player.regen } : null,
        aces: [...player.aces],
        handCount: player.hand.length,
        weapon: player.weapon
          ? {
              card: player.weapon.revealed ? player.weapon.card : null,
              loaded: player.weapon.loaded,
              revealed: player.weapon.revealed,
              damage: player.weapon.revealed ? weaponDamage(player.weapon.card) : null,
              range: player.weapon.revealed ? weaponRange(player.weapon.card) : null,
            }
          : null,
        out: player.out,
      })),
    turnPlayerIndex: actor,
    turnPlayerName: turnPlayer?.name ?? '',
    actionRoll: state.turn.roll,
    actionsLeft: state.turn.actionsLeft,
    freeSearchAvailable: !state.turn.freeSearchUsed,
    freeReloads: state.turn.freeReloads,
    mustDiscard: state.pendingDiscard === seat,
    pileCount: state.pile.length,
    log: [...state.log],
    winner: winner ? { index: winner.index, name: winner.name } : null,
    isYourTurn,
    legalActions: isYourTurn ? legalActions(state) : [],
  };
}
