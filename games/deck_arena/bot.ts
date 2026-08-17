/**
 * A serviceable arena opponent: shoot what it can reach, patch itself up when
 * hurt, upgrade its weapon, loot the cell it stands on, and otherwise walk
 * toward the nearest player.
 */

import type { Card } from '@/core/cards';
import {
  cardAt,
  currentActor,
  inBounds,
  legalActions,
  seatAt,
  shotsAvailable,
  step,
  tierOf,
} from './engine';
import {
  HAND_LIMIT,
  MAX_HP,
  type ArenaAction,
  type ArenaPlayer,
  type ArenaState,
  type LegalAction,
} from './types';

/** Patch up at or below this much health. */
const HURT = 3;

export function botAction(state: ArenaState): ArenaAction | null {
  const index = currentActor(state);
  if (index === null) return null;
  const me = seatAt(state, index);
  if (!me) return null;
  const actions = legalActions(state);
  if (actions.length === 0) return null;

  // A shot in hand is worth everything else on the turn.
  const shots = actions.filter(is('shoot'));
  if (shots.length > 0) {
    const weakest = shots
      .map((action) => ({ action, target: seatAt(state, action.targetIndex) }))
      .filter((entry) => entry.target)
      .sort((a, b) => effectiveHp(a.target!) - effectiveHp(b.target!))[0];
    if (weakest) return weakest.action;
  }

  // Reloading only pays if there is still an action left to fire with.
  const reload = actions.find(is('reload'));
  if (reload && state.turn.actionsLeft >= 2 && wouldHaveShot(state, me)) return reload;

  const heal = actions.filter(is('activateCard')).find((action) => suitOf(me, action) === 'hearts');
  if (heal && me.hp <= HURT) return heal;

  const upgrade = actions
    .filter(is('activateCard'))
    .filter((action) => suitOf(me, action) === 'clubs')
    .sort((a, b) => tierOfCard(me, b) - tierOfCard(me, a))[0];
  if (upgrade && tierOfCard(me, upgrade) > (me.weapon ? tierOf(me.weapon.card) : 0)) return upgrade;

  const shield = actions
    .filter(is('activateCard'))
    .find((action) => suitOf(me, action) === 'spades');
  if (shield && me.shield <= 2) return shield;

  const search = actions.find(is('search'));
  if (search && search.cost === 0) return search;

  // Full hand on a loaded cell: drop the least useful card and loot instead.
  if (me.hand.length >= HAND_LIMIT && cardAt(state, me)) {
    const worst = [...me.hand].sort((a, b) => usefulness(me, a) - usefulness(me, b))[0];
    const drop = worst && actions.filter(is('discard')).find((action) => action.cardId === worst.id);
    if (drop) return drop;
  }

  const energy = actions
    .filter(is('activateCard'))
    .find((action) => suitOf(me, action) === 'diamonds');
  if (energy && state.turn.actionsLeft === 0 && (cardAt(state, me) || me.weapon)) return energy;

  const move = chooseMove(state, me, actions);
  if (move) return move;

  if (search) return search;
  return actions.find(is('endTurn')) ?? actions[0] ?? null;
}

/** Walk toward the nearest player, preferring a step that lines up a shot. */
function chooseMove(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  const moves = actions.filter(is('move'));
  if (moves.length === 0) return null;

  const prey = state.players
    .filter((player) => !player.out && player.index !== me.index)
    .sort((a, b) => distance(me, a) - distance(me, b))[0];
  if (!prey) return null;

  const scored: { action: Extract<LegalAction, { type: 'move' }>; score: number }[] = [];
  for (const action of moves) {
    const to = step(me, action.direction);
    if (!inBounds(to)) continue;
    const closer = distance(prey, me) - distance(prey, to);
    const lines = to.x === prey.x || to.y === prey.y ? 1 : 0;
    const loot = cardAt(state, to) && me.hand.length < HAND_LIMIT ? 1 : 0;
    scored.push({ action, score: closer * 3 + lines * 2 + loot });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.action ?? null;
}

/** Would a loaded weapon have a target from here? */
function wouldHaveShot(state: ArenaState, me: ArenaPlayer): boolean {
  if (!me.weapon) return false;
  const pretend: ArenaPlayer = { ...me, weapon: { ...me.weapon, loaded: true } };
  return shotsAvailable(state, pretend).length > 0;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const effectiveHp = (player: ArenaPlayer): number => player.hp + player.shield;

function cardInHand(player: ArenaPlayer, cardId: string): Card | undefined {
  return player.hand.find((card) => card.id === cardId);
}

function suitOf(player: ArenaPlayer, action: { cardId: string }): string | undefined {
  return cardInHand(player, action.cardId)?.suit;
}

function tierOfCard(player: ArenaPlayer, action: { cardId: string }): number {
  const card = cardInHand(player, action.cardId);
  return card ? tierOf(card) : 0;
}

/** Rough keep-or-drop score for a card in hand. */
function usefulness(player: ArenaPlayer, card: Card): number {
  switch (card.suit) {
    case 'clubs':
      return tierOf(card) > (player.weapon ? tierOf(player.weapon.card) : 0) ? 10 + tierOf(card) : 1;
    case 'hearts':
      return player.hp < MAX_HP ? 6 + tierOf(card) : 3;
    case 'spades':
      return 5 + tierOf(card);
    default:
      return 4;
  }
}

/** Narrow a legal action list to one action type, keeping its payload typed. */
function is<T extends ArenaAction['type']>(type: T) {
  return (action: LegalAction): action is Extract<LegalAction, { type: T }> => action.type === type;
}
