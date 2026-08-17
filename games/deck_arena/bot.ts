/**
 * A serviceable arena opponent: shoot what it can reach, patch itself up when
 * hurt, upgrade its weapon, loot the cell it stands on, and otherwise walk
 * toward the nearest player.
 *
 * It understands the face-card abilities well enough to use them: it values a
 * sniper over a pistol, spends a teleport to line up a shot, and burns
 * blitzkrieg when it has run out of actions.
 */

import type { Card } from '@/core/cards';
import {
  cardAt,
  clubAbility,
  currentActor,
  diamondAbility,
  firstTargets,
  heartAbility,
  inBounds,
  legalActions,
  playerAt,
  scatterTargets,
  seatAt,
  shotsAvailable,
  spadeAbility,
  step,
  tierOf,
  weaponRange,
} from './engine';
import {
  BOARD_SIZE,
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
  // Face-up aces are worth more as a set than as a one-point heal, so bots only
  // ever play cards out of hand.
  const actions = legalActions(state).filter(
    (action) => action.type !== 'activateCard' || me.hand.some((card) => card.id === action.cardId),
  );
  if (actions.length === 0) return null;

  // Forced to shed looted cards: drop the least useful one.
  if (state.pendingDiscard === me.index) {
    const worst = [...me.hand].sort((a, b) => usefulness(state, me, a) - usefulness(state, me, b))[0];
    const drop = worst && actions.filter(is('discard')).find((action) => action.cardId === worst.id);
    return drop ?? actions[0] ?? null;
  }

  // Laying an ace out is free and never wrong.
  const layAce = actions.find(is('playAce'));
  if (layAce) return layAce;

  if (me.persona === 'collector') {
    const move = collectorAction(state, me, actions);
    if (move) return move;
  }

  // A shot in hand is worth everything else on the turn.
  const shot = bestShot(state, me, actions);
  if (shot) return shot;

  const reload = actions.find(is('reload'));
  if (reload && (reload.cost === 0 || (state.turn.actionsLeft >= 2 && wouldHaveShot(state, me)))) {
    return reload;
  }

  const heal = actions
    .filter(is('activateCard'))
    .find((action) => suitOf(me, action) === 'hearts');
  if (heal && me.hp <= HURT) return heal;

  const upgrade = actions
    .filter(is('activateCard'))
    .filter((action) => suitOf(me, action) === 'clubs')
    .sort((a, b) => weaponWorth(state, cardFor(me, b)) - weaponWorth(state, cardFor(me, a)))[0];
  if (upgrade && weaponWorth(state, cardFor(me, upgrade)) > weaponWorth(state, me.weapon?.card)) {
    return upgrade;
  }

  const armor = actions
    .filter(is('activateCard'))
    .filter((action) => suitOf(me, action) === 'spades')
    .sort(
      (a, b) =>
        Number(Boolean(spadeAbility(state, cardFor(me, b) ?? unknownCard))) -
        Number(Boolean(spadeAbility(state, cardFor(me, a) ?? unknownCard))),
    )[0];
  if (armor && me.shield + me.overshield <= 2) return armor;

  const search = actions.find(is('search'));
  if (search && search.cost === 0) return search;

  // Full hand on a loaded cell: drop the least useful card and loot instead.
  if (me.hand.length >= HAND_LIMIT && cardAt(state, me)) {
    const worst = [...me.hand].sort((a, b) => usefulness(state, me, a) - usefulness(state, me, b))[0];
    const drop = worst && actions.filter(is('discard')).find((action) => action.cardId === worst.id);
    if (drop) return drop;
  }

  const blink = teleportIntoPosition(state, me, actions);
  if (blink) return blink;

  const energy = actions
    .filter(is('activateCard'))
    .filter((action) => suitOf(me, action) === 'diamonds')
    .find((action) => diamondAbility(state, cardFor(me, action) ?? unknownCard) !== 'teleport');
  if (energy && state.turn.actionsLeft === 0 && (cardAt(state, me) || me.weapon)) return energy;

  const move = chooseMove(state, me, actions);
  if (move) return move;

  if (search) return search;
  return actions.find(is('endTurn')) ?? actions[0] ?? null;
}

/**
 * The ace hunter. It still shoots — killing an ace holder is the fastest way to
 * a set — but its time goes into turning over cards rather than trading fire.
 */
function collectorAction(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  const holders = state.players.filter(
    (player) => !player.out && player.index !== me.index && player.aces.length > 0,
  );

  // Anyone sitting on aces is the priority target, whatever their health.
  const raid = actions
    .filter(is('shoot'))
    .find((action) => holders.some((holder) => holder.index === action.targetIndex));
  if (raid) return raid;

  const heal = actions
    .filter(is('activateCard'))
    .find((action) => suitOf(me, action) === 'hearts');
  if (heal && me.hp <= HURT) return heal;

  // Turning over cards is the whole plan: pay for a second search if need be.
  const search = actions.find(is('search'));
  if (search && me.hand.length < HAND_LIMIT) return search;

  if (me.hand.length >= HAND_LIMIT && cardAt(state, me)) {
    const worst = [...me.hand].sort((a, b) => usefulness(state, me, a) - usefulness(state, me, b))[0];
    const drop = worst && actions.filter(is('discard')).find((action) => action.cardId === worst.id);
    if (drop) return drop;
  }

  const blink = teleportOntoLoot(state, me, actions);
  if (blink) return blink;

  // Diamonds are free actions, and free actions are more searching.
  if (state.turn.actionsLeft === 0) {
    const energy = actions
      .filter(is('activateCard'))
      .find((action) => {
        const card = cardFor(me, action);
        return card?.suit === 'diamonds' && diamondAbility(state, card) !== 'teleport';
      });
    if (energy) return energy;
  }

  const hunt = walkToward(state, me, actions, holders[0] ?? nearestLoot(state, me));
  if (hunt) return hunt;

  return null; // fall through to the ordinary play
}

/** The closest cell with a card still on it. */
function nearestLoot(state: ArenaState, me: ArenaPlayer): { x: number; y: number } | undefined {
  let best: { x: number; y: number } | undefined;
  let bestDistance = Infinity;
  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      if (!cardAt(state, { x, y })) continue;
      const away = distance(me, { x, y });
      if (away > 0 && away < bestDistance) {
        bestDistance = away;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Blink onto a loaded cell when one is out of walking reach. */
function teleportOntoLoot(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  const teleport = actions
    .filter(is('activateCard'))
    .find((action) => diamondAbility(state, cardFor(me, action) ?? unknownCard) === 'teleport');
  if (!teleport || me.hand.length >= HAND_LIMIT) return null;
  if (cardAt(state, me)) return null; // already standing on loot

  const loot = nearestLoot(state, me);
  if (!loot || distance(me, loot) <= 2) return null;
  if (playerAt(state, loot)) return null;
  return { ...teleport, to: loot };
}

/** One step (paid or free) toward a spot on the board. */
function walkToward(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
  goal: { x: number; y: number } | undefined,
): ArenaAction | null {
  if (!goal) return null;
  const steps = [
    ...actions.filter(is('move')),
    ...actions.filter(is('activateCard')).filter((action) => action.direction),
  ];
  const scored: { action: ArenaAction; score: number }[] = [];
  for (const action of steps) {
    const direction = 'direction' in action ? action.direction : undefined;
    if (!direction) continue;
    const to = step(me, direction);
    if (!inBounds(to)) continue;
    const closer = distance(goal, me) - distance(goal, to);
    const loot = cardAt(state, to) ? 1 : 0;
    const free = action.type === 'activateCard' ? 1 : 0;
    scored.push({ action, score: closer * 3 + loot * 2 + free });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score > 0 ? best.action : null;
}

/** Pick the shot that takes the most out of the arena. */
function bestShot(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  const shots = actions.filter(is('shoot'));
  if (shots.length === 0) return null;

  const scored = shots.map((action) => {
    if (action.directions && action.directions.length === 1) {
      const direction = action.directions[0];
      const targets = direction ? firstTargets(state, me, direction, 2) : [];
      // The piercing sniper kills anyone without protection outright.
      const score = targets.reduce(
        (sum, target) => sum + (target.overshield + target.shield > 0 ? 2 : 10),
        0,
      );
      return { action, score };
    }
    if (action.directions && action.directions.length === 2) {
      const targets = scatterTargets(state, me, action.directions);
      return { action, score: targets.length * 8 };
    }
    const target = state.players.find((player) => player.index === action.targetIndex);
    if (!target) return { action, score: 0 };
    return { action, score: 12 - effectiveHp(target) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.action ?? null;
}

/** Blink somewhere that opens a shot, if a teleport is in hand. */
function teleportIntoPosition(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  if (!me.weapon?.loaded) return null;
  const teleport = actions
    .filter(is('activateCard'))
    .find((action) => diamondAbility(state, cardFor(me, action) ?? unknownCard) === 'teleport');
  if (!teleport) return null;
  if (shotsAvailable(state, me).length > 0) return null; // no need

  const range = weaponRange(me.weapon.card);
  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      if (playerAt(state, { x, y })) continue;
      const from: ArenaPlayer = { ...me, x, y };
      const shots = shotsAvailable(state, from).filter((shot) => shot.distance <= range);
      if (shots.length > 0) return { ...teleport, to: { x, y } };
    }
  }
  return null;
}

/** Walk toward the nearest player, preferring a step that lines up a shot. */
function chooseMove(
  state: ArenaState,
  me: ArenaPlayer,
  actions: LegalAction[],
): ArenaAction | null {
  const moves = actions.filter(is('move'));
  const steps: (Extract<LegalAction, { type: 'move' }> | Extract<LegalAction, { type: 'activateCard' }>)[] =
    [...moves, ...actions.filter(is('activateCard')).filter((action) => action.direction)];
  if (steps.length === 0) return null;

  const prey = state.players
    .filter((player) => !player.out && player.index !== me.index)
    .sort((a, b) => distance(me, a) - distance(me, b))[0];
  if (!prey) return null;

  const scored: { action: ArenaAction; score: number }[] = [];
  for (const action of steps) {
    const direction = 'direction' in action ? action.direction : undefined;
    if (!direction) continue;
    const to = step(me, direction);
    if (!inBounds(to)) continue;
    const closer = distance(prey, me) - distance(prey, to);
    const lines = to.x === prey.x || to.y === prey.y ? 1 : 0;
    const loot = cardAt(state, to) && me.hand.length < HAND_LIMIT ? 1 : 0;
    // A free step from super mobility is worth taking over a paid one.
    const free = action.type === 'activateCard' ? 1 : 0;
    scored.push({ action, score: closer * 3 + lines * 2 + loot + free });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.action ?? null;
}

/** Would a loaded weapon have a target from here? */
function wouldHaveShot(state: ArenaState, me: ArenaPlayer): boolean {
  if (!me.weapon) return false;
  const pretend: ArenaPlayer = { ...me, weapon: { ...me.weapon, loaded: true } };
  if (shotsAvailable(state, pretend).length > 0) return true;
  const ability = clubAbility(state, me.weapon.card);
  if (!ability) return false;
  return (['north', 'south', 'east', 'west'] as const).some(
    (direction) => firstTargets(state, me, direction, 1).length > 0,
  );
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const effectiveHp = (player: ArenaPlayer): number =>
  player.hp + player.shield + player.overshield;

/** A stand-in for lookups that miss, so ability checks stay total. */
const unknownCard = { id: '', rank: '2', suit: 'clubs', symbol: '♣', value: 2, label: '2♣' } as Card;

function cardFor(player: ArenaPlayer, action: { cardId: string }): Card | undefined {
  return (
    player.hand.find((card) => card.id === action.cardId) ??
    player.aces.find((card) => card.id === action.cardId)
  );
}

function suitOf(player: ArenaPlayer, action: { cardId: string }): string | undefined {
  return cardFor(player, action)?.suit;
}

/** Face clubs beat any pip weapon; otherwise the tier decides. */
function weaponWorth(state: ArenaState, card: Card | undefined): number {
  if (!card) return 0;
  const ability = clubAbility(state, card);
  if (ability === 'shotgun') return 7;
  if (ability === 'piercing') return 6;
  if (ability === 'exploding') return 5;
  return tierOf(card);
}

/** Rough keep-or-drop score for a card in hand. */
function usefulness(state: ArenaState, player: ArenaPlayer, card: Card): number {
  switch (card.suit) {
    case 'clubs':
      return weaponWorth(state, card) > weaponWorth(state, player.weapon?.card)
        ? 10 + weaponWorth(state, card)
        : 1;
    case 'hearts':
      if (heartAbility(state, card) === 'auto-revive') return 12;
      if (heartAbility(state, card)) return 9;
      return player.hp < MAX_HP ? 6 + tierOf(card) : 3;
    case 'spades':
      return spadeAbility(state, card) ? 8 + tierOf(card) : 5 + tierOf(card);
    default:
      return diamondAbility(state, card) ? 7 : 4;
  }
}

/** Narrow a legal action list to one action type, keeping its payload typed. */
function is<T extends ArenaAction['type']>(type: T) {
  return (action: LegalAction): action is Extract<LegalAction, { type: T }> => action.type === type;
}
