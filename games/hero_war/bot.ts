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

/** With hearts to spare, nullify anything that takes half a hero or more. */
const SPARE_HEARTS = 3;
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

  // Equipping costs this turn's attack, so a kill on the table always wins out.
  const attack = planAttack(state, me, actions);
  if (attack?.lethal) return attack.action;

  const equip = byCardValueDesc(me, actions.filter(is('equip')))[0];
  if (equip && worthTheLostAttack(state, me, equip.cardId)) return equip;

  if (attack) return attack.action;

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
): { action: HeroWarAction; lethal: boolean } | null {
  const attacks = actions.filter(is('attack'));
  if (attacks.length === 0) return null;

  const base = attackDamage(me);
  const targets = attacks
    .map((action) => ({ action, hp: playerAt(state, action.targetIndex)?.hero?.hp ?? Infinity }))
    .sort((a, b) => a.hp - b.hp);

  const finisher = targets.find((target) => base >= target.hp);
  if (finisher) return { action: { ...finisher.action, boostCardIds: [] }, lethal: true };

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
  const lethal = damage >= weakest.hp;
  return {
    action: { ...weakest.action, boostCardIds: lethal ? boosts.map((card) => card.id) : [] },
    lethal,
  };
}

/** Only give up an attack for gear that makes the next swing a killing one. */
function worthTheLostAttack(state: HeroWarState, me: HeroWarPlayer, cardId: string): boolean {
  const club = me.hand.find((card) => card.id === cardId);
  if (!club) return false;
  const liveHeroes = state.players
    .filter((player) => !player.out && player.index !== me.index && player.hero)
    .map((player) => player.hero!.hp);
  if (liveHeroes.length === 0) return true; // nothing to swing at anyway
  const weakest = Math.min(...liveHeroes);
  const base = attackDamage(me);
  return base < weakest && base + club.value >= weakest;
}

/** Nullify anything lethal; otherwise spend a heart only when they are cheap. */
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
  const worthBurning =
    hearts.length >= SPARE_HEARTS && attack.damage * 2 >= defender.hero.maxHp;
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
