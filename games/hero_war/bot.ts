/**
 * A straightforward Hero War opponent: equip up, sabotage real threats, spend
 * diamonds only when they buy a kill, and save hearts for hits that matter.
 */

import type { Card } from '@/core/cards';
import {
  attackDamage,
  currentActor,
  legalActions,
  playerAt,
  SABOTAGE_THRESHOLD,
} from './engine';
import type { DefenseChoice, HeroWarAction, HeroWarPlayer, HeroWarState, LegalAction } from './types';

/** A hit this big is worth a heart even when the hero would survive it. */
const HEART_THRESHOLD = 12;
/** Below this many cards, cycling a spade beats holding it. */
const THIN_HAND = 4;

/** The bot's next action for whatever the engine is waiting on. */
export function botAction(state: HeroWarState): HeroWarAction | null {
  const index = currentActor(state);
  if (index === null) return null;
  const me = playerAt(state, index);
  if (!me) return null;
  const actions = legalActions(state);
  if (actions.length === 0) return null;

  // Must field a hero: take the biggest one available.
  const heroPlays = byCardValueDesc(me, actions.filter(is('playHero')));
  if (heroPlays[0]) return heroPlays[0];

  const draw = actions.find(is('draw'));
  if (draw) return draw;

  // Break up an opponent's stack once it is worth a spade.
  const sabotage = actions
    .filter(is('spadeSabotage'))
    .map((action) => ({ action, value: clubValue(state, action.targetIndex, action.clubId) }))
    .sort((a, b) => b.value - a.value)[0];
  const spadeCount = me.hand.filter((card) => card.suit === 'spades').length;
  if (sabotage && (sabotage.value >= SABOTAGE_THRESHOLD || spadeCount >= 2)) return sabotage.action;

  const equip = byCardValueDesc(me, actions.filter(is('equip')))[0];
  if (equip) return equip;

  const attack = planAttack(state, me, actions);
  if (attack) return attack;

  // Nothing better to do with a spade than cycle it into a live card.
  const trade = actions.find(is('spadeTrade'));
  if (trade && me.hand.length < THIN_HAND) return trade;

  return actions.find(is('endTurn')) ?? actions[0] ?? null;
}

/** Hit the weakest hero, adding the fewest diamonds that turn it into a kill. */
function planAttack(
  state: HeroWarState,
  me: HeroWarPlayer,
  actions: LegalAction[],
): HeroWarAction | null {
  const attacks = actions.filter(is('attack'));
  if (attacks.length === 0) return null;

  const base = attackDamage(me);
  const targets = attacks
    .map((action) => ({ action, hp: playerAt(state, action.targetIndex)?.hero?.hp ?? Infinity }))
    .sort((a, b) => a.hp - b.hp);

  const finisher = targets.find((target) => base >= target.hp);
  if (finisher) return { ...finisher.action, boostCardIds: [] };

  const weakest = targets[0];
  if (!weakest) return null;

  const diamonds = me.hand
    .filter((card) => card.suit === 'diamonds')
    .sort((a, b) => b.value - a.value);
  const boosts: Card[] = [];
  let damage = base;
  for (const diamond of diamonds) {
    if (damage >= weakest.hp) break;
    boosts.push(diamond);
    damage += diamond.value;
  }
  const worthIt = damage >= weakest.hp;
  return { ...weakest.action, boostCardIds: worthIt ? boosts.map((card) => card.id) : [] };
}

/** Nullify anything lethal; otherwise spend a heart only on a big hit. */
export function botDefense(state: HeroWarState): DefenseChoice {
  const attack = state.pendingAttack;
  if (!attack) return { cardId: null };
  const defender = playerAt(state, attack.defenderIndex);
  if (!defender?.hero) return { cardId: null };

  const hearts = defender.hand
    .filter((card) => card.suit === 'hearts')
    .sort((a, b) => a.value - b.value);
  const cheapest = hearts[0];
  if (!cheapest) return { cardId: null };

  const lethal = attack.damage >= defender.hero.hp;
  const worthBurning = attack.damage >= HEART_THRESHOLD && hearts.length >= 2;
  return lethal || worthBurning ? { cardId: cheapest.id } : { cardId: null };
}

/** Narrow a legal action list to one action type, keeping its payload typed. */
function is<T extends HeroWarAction['type']>(type: T) {
  return (action: LegalAction): action is Extract<LegalAction, { type: T }> => action.type === type;
}

function byCardValueDesc<T extends { cardId: string }>(player: HeroWarPlayer, actions: T[]): T[] {
  const valueOf = (cardId: string) => player.hand.find((card) => card.id === cardId)?.value ?? 0;
  return [...actions].sort((a, b) => valueOf(b.cardId) - valueOf(a.cardId));
}

function clubValue(state: HeroWarState, targetIndex: number, clubId: string): number {
  const target = playerAt(state, targetIndex);
  return target?.equipment.find((card) => card.id === clubId)?.value ?? 0;
}
