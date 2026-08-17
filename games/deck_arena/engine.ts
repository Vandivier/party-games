/**
 * Deck Arena engine.
 *
 * Rules: ./RULES.md   Gap-filling defaults: ./HOUSE_RULES.md
 *
 * The engine owns all state, every legality check, and every die roll. It never
 * prompts and never renders: a caller drives it with `legalActions` -> `act`.
 *
 * Nothing written to `state.log` may name a card that is not public knowledge —
 * the log is shown to every seat, while floor cards and hands are hidden.
 */

import { buildDeck, type Card } from '@/core/cards';
import { roll as rollDie } from '@/core/dice';
import { Random } from '@/core/rng';
import {
  ACES_TO_WIN,
  BOARD_SIZE,
  HAND_LIMIT,
  MAX_HP,
  MAX_SHIELD,
  OVERHEAL_CAP,
  type ActionResult,
  type ArenaAction,
  type ArenaPlayer,
  type ArenaState,
  type CreateGameOptions,
  type Direction,
  type LegalAction,
  type Position,
} from './types';

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
/** How many rolled spawns to reject before falling back to a legal cell. */
const MAX_SPAWN_ROLLS = 200;

export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

const STEP: Record<Direction, Position> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/* --------------------------------------------------------- the value table */

/** A card's tier: A–4 = 1, 5–9 = 2, 10–K = 3. Drives every number in the game. */
export function tierOf(card: Card): number {
  if (card.value <= 4) return 1;
  if (card.value <= 9) return 2;
  return 3;
}

export const weaponDamage = tierOf;
export const healAmount = tierOf;
export const shieldAmount = tierOf;
/** Range in cells: 2, 4, or 6. */
export const weaponRange = (card: Card): number => tierOf(card) * 2;
/** Diamonds are the exception: their energy comes from the authored rules. */
export const energyFrom = (card: Card): number => (card.value >= 7 ? 2 : 1);
/** Overshield points on a face spade. */
export const overshieldValue = (card: Card): number =>
  card.rank === 'J' ? 2 : card.rank === 'Q' ? 4 : 6;

/* ------------------------------------------------------------- abilities */

export type ClubAbility = 'exploding' | 'piercing' | 'shotgun' | null;
export type HeartAbility = 'regen' | 'overheal-regen' | 'auto-revive' | null;
export type SpadeAbility = 'overshield' | null;
export type DiamondAbility = 'mobility' | 'teleport' | 'blitzkrieg' | null;

const isFaceRank = (card: Card): boolean => ['J', 'Q', 'K'].includes(card.rank);

export function clubAbility(state: ArenaState, card: Card): ClubAbility {
  if (!state.specialAbilities || card.suit !== 'clubs' || !isFaceRank(card)) return null;
  return card.rank === 'J' ? 'exploding' : card.rank === 'Q' ? 'piercing' : 'shotgun';
}

export function heartAbility(state: ArenaState, card: Card): HeartAbility {
  if (!state.specialAbilities || card.suit !== 'hearts' || !isFaceRank(card)) return null;
  return card.rank === 'J' ? 'regen' : card.rank === 'Q' ? 'overheal-regen' : 'auto-revive';
}

export function spadeAbility(state: ArenaState, card: Card): SpadeAbility {
  return state.specialAbilities && card.suit === 'spades' && isFaceRank(card) ? 'overshield' : null;
}

export function diamondAbility(state: ArenaState, card: Card): DiamondAbility {
  if (!state.specialAbilities || card.suit !== 'diamonds' || !isFaceRank(card)) return null;
  return card.rank === 'J' ? 'mobility' : card.rank === 'Q' ? 'teleport' : 'blitzkrieg';
}

/** Aces collect face up instead of sitting in hand — with abilities switched on. */
export const acesCollect = (state: ArenaState): boolean => state.specialAbilities;

/* -------------------------------------------------------------- the board */

export const cellIndex = ({ x, y }: Position): number => (y - 1) * BOARD_SIZE + (x - 1);
export const inBounds = ({ x, y }: Position): boolean =>
  x >= 1 && x <= BOARD_SIZE && y >= 1 && y <= BOARD_SIZE;

export function cardAt(state: ArenaState, at: Position): Card | null {
  return inBounds(at) ? (state.board[cellIndex(at)] ?? null) : null;
}

export function playerAt(state: ArenaState, at: Position): ArenaPlayer | undefined {
  return state.players.find((player) => !player.out && player.x === at.x && player.y === at.y);
}

export function seatAt(state: ArenaState, index: number): ArenaPlayer | undefined {
  return state.players[index];
}

export function livingPlayers(state: ArenaState): ArenaPlayer[] {
  return state.players.filter((player) => !player.out);
}

export const hasProtection = (player: ArenaPlayer): boolean =>
  player.overshield > 0 || player.shield > 0;

/* ------------------------------------------------------------------ setup */

export function createGame({ players, seed, specialAbilities }: CreateGameOptions): ArenaState {
  if (!players || players.length < 2) throw new Error('Deck Arena needs at least 2 players.');
  if (players.length > 8) throw new Error('Deck Arena tops out at 8 players.');

  const rng = new Random(seed);
  const deck = rng.shuffle(buildDeck(1));

  const state: ArenaState = {
    rng,
    seed: rng.seed,
    specialAbilities: specialAbilities ?? true,
    board: deck.slice(0, CELL_COUNT),
    pile: deck.slice(CELL_COUNT),
    players: players.map((player, index) => ({
      index,
      name: player.name,
      isBot: Boolean(player.isBot),
      hp: MAX_HP,
      shield: 0,
      overshield: 0,
      x: 0,
      y: 0,
      hand: [],
      aces: [],
      weapon: null,
      regen: null,
      out: false,
    })),
    order: [],
    orderIndex: 0,
    round: 1,
    turn: { roll: 0, actionsLeft: 0, freeSearchUsed: false, freeReloads: false },
    pendingDiscard: null,
    phase: 'play',
    winnerIndex: null,
    log: [],
  };

  log(
    state,
    state.specialAbilities
      ? 'Special abilities are on: face cards carry abilities and aces collect face up.'
      : 'Special abilities are off.',
  );

  state.order = rollTurnOrder(state);
  spawnPlayers(state);
  const first = seatAt(state, state.order[0] as number);
  if (first) beginTurn(state, first);
  return state;
}

/** Highest 1d6 goes first; tied players re-roll among themselves. */
function rollTurnOrder(state: ArenaState): number[] {
  const scores = new Map<number, number[]>();
  for (const player of state.players) {
    const first = die(state);
    scores.set(player.index, [first]);
    log(state, `${player.name} rolls ${first} for turn order.`);
  }

  for (let pass = 0; pass < 10; pass++) {
    const groups = new Map<string, number[]>();
    for (const [index, rolls] of scores) {
      const key = rolls.join(',');
      groups.set(key, [...(groups.get(key) ?? []), index]);
    }
    const tied = [...groups.values()].filter((group) => group.length > 1);
    if (tied.length === 0) break;
    for (const group of tied) {
      for (const index of group) {
        const extra = die(state);
        scores.get(index)?.push(extra);
        log(state, `${seatAt(state, index)?.name} re-rolls ${extra} to break the tie.`);
      }
    }
  }

  const order = [...state.players]
    .map((player) => player.index)
    .sort((a, b) => compareRolls(scores.get(b) ?? [], scores.get(a) ?? []));
  log(state, `Turn order: ${order.map((index) => seatAt(state, index)?.name).join(', ')}.`);
  return order;
}

function compareRolls(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 2d6 for x,y, re-rolling onto anything occupied or orthogonally next to it. */
function spawnPlayers(state: ArenaState): void {
  for (const seat of state.order) {
    const player = seatAt(state, seat);
    if (!player) continue;

    let rerolls = 0;
    let spot: Position | null = null;
    for (let attempt = 0; attempt < MAX_SPAWN_ROLLS; attempt++) {
      const candidate = { x: die(state), y: die(state) };
      if (isLegalSpawn(state, candidate)) {
        spot = candidate;
        break;
      }
      rerolls++;
    }
    if (spot) {
      log(
        state,
        `${player.name} rolls ${spot.x},${spot.y} to spawn` +
          `${rerolls > 0 ? ` (after ${rerolls} re-roll${rerolls === 1 ? '' : 's'})` : ''}.`,
      );
    } else {
      spot = state.rng.pick(legalSpawns(state));
      log(state, `${player.name} cannot roll a legal spawn and takes ${spot.x},${spot.y}.`);
    }

    player.x = spot.x;
    player.y = spot.y;

    const card = state.board[cellIndex(spot)];
    if (card) {
      state.board[cellIndex(spot)] = null;
      log(state, `${player.name} picks up the card at ${spot.x},${spot.y}.`);
      giveCard(state, player, card);
    }
  }
}

function isLegalSpawn(state: ArenaState, at: Position): boolean {
  if (!inBounds(at)) return false;
  if (playerAt(state, at)) return false;
  return DIRECTIONS.every((direction) => !playerAt(state, step(at, direction)));
}

function legalSpawns(state: ArenaState): Position[] {
  const spots: Position[] = [];
  for (let y = 1; y <= BOARD_SIZE; y++) {
    for (let x = 1; x <= BOARD_SIZE; x++) {
      if (isLegalSpawn(state, { x, y })) spots.push({ x, y });
    }
  }
  if (spots.length === 0) throw new Error('The arena has no legal spawn left.');
  return spots;
}

/* ------------------------------------------------------------------ turns */

export function currentActor(state: ArenaState): number | null {
  if (state.phase === 'over') return null;
  if (state.pendingDiscard !== null) return state.pendingDiscard;
  return state.order[state.orderIndex] ?? null;
}

function beginTurn(state: ArenaState, player: ArenaPlayer): void {
  const roll = die(state);
  const actions = roll <= 3 ? 1 : 2;
  state.turn = { roll, actionsLeft: actions, freeSearchUsed: false, freeReloads: false };
  log(state, `--- ${player.name}'s turn — rolled ${roll}, ${actions} action${actions === 1 ? '' : 's'} ---`);
  tickRegen(state, player);
}

function tickRegen(state: ArenaState, player: ArenaPlayer): void {
  if (!player.regen) return;
  if (player.hp < player.regen.max) {
    player.hp++;
    log(state, `${player.name} regenerates 1 (${player.hp} hp).`);
  }
  player.regen.turnsLeft--;
  if (player.regen.turnsLeft <= 0) {
    player.regen = null;
    log(state, `${player.name}'s regen runs out.`);
  }
}

function advanceTurn(state: ArenaState): void {
  const total = state.order.length;
  for (let attempt = 0; attempt < total * 2 + 1; attempt++) {
    state.orderIndex++;
    if (state.orderIndex >= total) {
      state.orderIndex = 0;
      endOfRound(state);
      if (state.phase === 'over') return;
    }
    const player = seatAt(state, state.order[state.orderIndex] as number);
    if (player && !player.out) {
      beginTurn(state, player);
      return;
    }
  }
}

/** Empty cells replenish face down from the pile, as far as it stretches. */
function endOfRound(state: ArenaState): void {
  const empties: number[] = [];
  for (let index = 0; index < CELL_COUNT; index++) {
    if (!state.board[index]) empties.push(index);
  }
  state.rng.shuffle(empties);
  state.rng.shuffle(state.pile);

  let filled = 0;
  while (empties.length > 0 && state.pile.length > 0) {
    const index = empties.pop() as number;
    state.board[index] = state.pile.pop() as Card;
    filled++;
  }

  log(
    state,
    `Round ${state.round} ends. ${filled} cell${filled === 1 ? '' : 's'} replenish from the pile` +
      `${empties.length > 0 ? `, ${empties.length} left empty` : ''}.`,
  );
  state.round++;
}

/* ---------------------------------------------------------------- actions */

export function legalActions(state: ArenaState): LegalAction[] {
  const index = currentActor(state);
  if (index === null) return [];
  const player = seatAt(state, index);
  if (!player || player.out) return [];

  // Looted cards first: nothing else happens until the hand is legal again.
  if (state.pendingDiscard === player.index) {
    return player.hand.map((card) => ({
      type: 'discard' as const,
      cardId: card.id,
      cost: 0,
      label: `Discard ${card.label}`,
    }));
  }

  const actions: LegalAction[] = [];
  const { actionsLeft, freeSearchUsed } = state.turn;
  const affordable = (cost: number) => cost === 0 || actionsLeft >= cost;

  if (affordable(1)) {
    for (const direction of DIRECTIONS) {
      const target = step(player, direction);
      if (!inBounds(target) || playerAt(state, target)) continue;
      actions.push({
        type: 'move',
        direction,
        cost: 1,
        label: `Move ${direction}${cardAt(state, target) ? ' — card there' : ''}`,
      });
    }
  }

  const searchCost = freeSearchUsed ? 1 : 0;
  if (cardAt(state, player) && player.hand.length < HAND_LIMIT && affordable(searchCost)) {
    actions.push({
      type: 'search',
      cost: searchCost,
      label: searchCost === 0 ? 'Search this cell — free' : 'Search this cell again',
    });
  }

  for (const card of [...player.hand, ...player.aces]) {
    actions.push(...cardOptions(state, player, card, affordable));
  }

  if (player.weapon && affordable(1)) {
    if (player.weapon.loaded) {
      actions.push(...shotOptions(state, player));
    } else {
      const cost = state.turn.freeReloads ? 0 : 1;
      if (affordable(cost)) {
        actions.push({
          type: 'reload',
          cost,
          label: cost === 0 ? 'Reload — free' : 'Reload',
        });
      }
    }
  }

  for (const card of player.hand) {
    actions.push({ type: 'discard', cardId: card.id, cost: 0, label: `Discard ${card.label}` });
  }

  actions.push({ type: 'endTurn', cost: 0, label: 'End turn' });
  return actions;
}

/**
 * What a single card in hand (or a face-up ace) could do right now.
 * Teleport comes back as a template: the caller fills in `to`.
 */
function cardOptions(
  state: ArenaState,
  player: ArenaPlayer,
  card: Card,
  affordable: (cost: number) => boolean,
): LegalAction[] {
  const options: LegalAction[] = [];
  const base = { type: 'activateCard' as const, cardId: card.id };

  switch (card.suit) {
    case 'clubs': {
      if (!affordable(1)) break;
      const ability = clubAbility(state, card);
      const description = ability
        ? ability === 'exploding'
          ? 'exploding sniper'
          : ability === 'piercing'
            ? 'piercing sniper'
            : 'dual shotguns'
        : `${weaponDamage(card)} damage, range ${weaponRange(card)}`;
      options.push({ ...base, cost: 1, label: `Equip ${card.label} — ${description}` });
      break;
    }

    case 'hearts': {
      if (!affordable(1)) break;
      const ability = heartAbility(state, card);
      if (ability === 'auto-revive') break; // fires by itself when you die
      if (ability === 'regen') {
        options.push({ ...base, cost: 1, label: `Play ${card.label} — full heal, then regen` });
      } else if (ability === 'overheal-regen') {
        options.push({ ...base, cost: 1, label: `Play ${card.label} — full heal, then overheal regen` });
      } else if (player.hp < MAX_HP) {
        options.push({ ...base, cost: 1, label: `Play ${card.label} — heal ${healAmount(card)}` });
      }
      break;
    }

    case 'spades': {
      if (!affordable(1)) break;
      if (spadeAbility(state, card)) {
        options.push({
          ...base,
          cost: 1,
          label: `Play ${card.label} — overshield ${overshieldValue(card)}`,
        });
      } else if (player.shield < MAX_SHIELD) {
        options.push({ ...base, cost: 1, label: `Play ${card.label} — +${shieldAmount(card)} shield` });
      }
      break;
    }

    case 'diamonds': {
      const ability = diamondAbility(state, card);
      if (ability === 'mobility') {
        for (const direction of DIRECTIONS) {
          const target = step(player, direction);
          if (!inBounds(target) || playerAt(state, target)) continue;
          options.push({
            ...base,
            direction,
            cost: 0,
            label: `Play ${card.label} — free step ${direction}`,
          });
        }
      } else if (ability === 'teleport') {
        options.push({ ...base, cost: 0, label: `Play ${card.label} — teleport anywhere` });
      } else if (ability === 'blitzkrieg') {
        options.push({ ...base, cost: 0, label: `Play ${card.label} — +1 action, free reloads` });
      } else {
        options.push({
          ...base,
          cost: 0,
          label: `Play ${card.label} — +${energyFrom(card)} action${energyFrom(card) === 1 ? '' : 's'}`,
        });
      }
      break;
    }
  }
  return options;
}

/** Every shot the equipped weapon could take from here. */
function shotOptions(state: ArenaState, player: ArenaPlayer): LegalAction[] {
  const weapon = player.weapon;
  if (!weapon) return [];
  const ability = clubAbility(state, weapon.card);

  if (ability === 'piercing') {
    return DIRECTIONS.filter((direction) => firstTargets(state, player, direction, 2).length > 0).map(
      (direction) => ({
        type: 'shoot' as const,
        directions: [direction],
        cost: 1,
        label: `Pierce ${direction} — ${firstTargets(state, player, direction, 2)
          .map((target) => target.name)
          .join(' and ')}`,
      }),
    );
  }

  if (ability === 'shotgun') {
    const options: LegalAction[] = [];
    for (let i = 0; i < DIRECTIONS.length; i++) {
      for (let j = i + 1; j < DIRECTIONS.length; j++) {
        const pair = [DIRECTIONS[i] as Direction, DIRECTIONS[j] as Direction];
        const hits = scatterTargets(state, player, pair);
        if (hits.length === 0) continue;
        options.push({
          type: 'shoot',
          directions: pair,
          cost: 1,
          label: `Shotgun ${pair[0]} + ${pair[1]} — hits ${hits.map((hit) => hit.name).join(', ')}`,
        });
      }
    }
    return options;
  }

  if (ability === 'exploding') {
    return DIRECTIONS.flatMap((direction) => {
      const target = firstTargets(state, player, direction, 1)[0];
      if (!target) return [];
      return [
        {
          type: 'shoot' as const,
          targetIndex: target.index,
          cost: 1,
          label: `Snipe ${target.name} (${direction}) — wipes shields, 1d6 damage`,
        },
      ];
    });
  }

  return shotsAvailable(state, player).map((shot) => ({
    type: 'shoot' as const,
    targetIndex: shot.target.index,
    cost: 1,
    label: `Shoot ${shot.target.name} for ${weaponDamage(weapon.card)}`,
  }));
}

/** Living players this one could shoot with an ordinary weapon. */
export function shotsAvailable(
  state: ArenaState,
  player: ArenaPlayer,
): { target: ArenaPlayer; distance: number }[] {
  if (!player.weapon) return [];
  const range = weaponRange(player.weapon.card);
  const shots: { target: ArenaPlayer; distance: number }[] = [];

  for (const target of livingPlayers(state)) {
    if (target.index === player.index) continue;
    if (target.x !== player.x && target.y !== player.y) continue;
    const distance = Math.abs(target.x - player.x) + Math.abs(target.y - player.y);
    if (distance === 0 || distance > range) continue;
    if (blockedBetween(state, player, target)) continue;
    shots.push({ target, distance });
  }
  return shots;
}

/** The first `count` players along a direction, however far away they are. */
export function firstTargets(
  state: ArenaState,
  from: Position,
  direction: Direction,
  count: number,
): ArenaPlayer[] {
  const found: ArenaPlayer[] = [];
  let at = step(from, direction);
  while (inBounds(at) && found.length < count) {
    const standing = playerAt(state, at);
    if (standing) found.push(standing);
    at = step(at, direction);
  }
  return found;
}

/** The cells a scatter shot covers: one step out, plus its two flanks. */
export function scatterCells(from: Position, direction: Direction): Position[] {
  const centre = step(from, direction);
  const flanks: Position[] =
    direction === 'north' || direction === 'south'
      ? [
          { x: centre.x - 1, y: centre.y },
          { x: centre.x + 1, y: centre.y },
        ]
      : [
          { x: centre.x, y: centre.y - 1 },
          { x: centre.x, y: centre.y + 1 },
        ];
  return [centre, ...flanks].filter(inBounds);
}

export function scatterTargets(
  state: ArenaState,
  player: ArenaPlayer,
  directions: Direction[],
): ArenaPlayer[] {
  const hit = new Map<number, ArenaPlayer>();
  for (const direction of directions) {
    for (const cell of scatterCells(player, direction)) {
      const standing = playerAt(state, cell);
      if (standing && standing.index !== player.index) hit.set(standing.index, standing);
    }
  }
  return [...hit.values()];
}

/** Bodies block the line of fire; cards on the floor do not. */
function blockedBetween(state: ArenaState, from: Position, to: Position): boolean {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  let x = from.x + dx;
  let y = from.y + dy;
  while (x !== to.x || y !== to.y) {
    if (playerAt(state, { x, y })) return true;
    x += dx;
    y += dy;
  }
  return false;
}

/**
 * Super mobility is the one card playable out of turn — everything else waits
 * for your own.
 */
export function isReaction(state: ArenaState, seat: number, action: ArenaAction): boolean {
  if (state.phase === 'over' || action.type !== 'activateCard') return false;
  const player = seatAt(state, seat);
  if (!player || player.out) return false;
  const card = player.hand.find((entry) => entry.id === action.cardId);
  return Boolean(card && diamondAbility(state, card) === 'mobility');
}

/**
 * Apply an action. `seat` defaults to whoever is on the clock; another seat may
 * only act with a reaction card.
 */
export function act(state: ArenaState, action: ArenaAction, seat?: number): ActionResult {
  const actor = currentActor(state);
  if (actor === null) return fail('The game is over.');
  const index = seat ?? actor;
  if (index !== actor && !isReaction(state, index, action)) {
    return fail('It is not your turn.');
  }
  const player = seatAt(state, index);
  if (!player || player.out) return fail('You are out of the fight.');
  if (state.pendingDiscard !== null && index === state.pendingDiscard && action.type !== 'discard') {
    return fail('Discard down to three cards first.');
  }

  switch (action.type) {
    case 'move': {
      if (state.turn.actionsLeft < 1) return fail('You are out of actions.');
      const target = step(player, action.direction);
      const moved = movePlayer(state, player, target);
      if (!moved.ok) return moved;
      state.turn.actionsLeft--;
      log(state, `${player.name} moves ${action.direction} to ${target.x},${target.y}.`);
      return ok();
    }

    case 'search': {
      const cost = state.turn.freeSearchUsed ? 1 : 0;
      if (cost > state.turn.actionsLeft) return fail('You are out of actions.');
      if (player.hand.length >= HAND_LIMIT) return fail('Your hand is full — discard first.');
      const card = cardAt(state, player);
      if (!card) return fail('There is nothing to search here.');
      state.board[cellIndex(player)] = null;
      if (cost === 0) state.turn.freeSearchUsed = true;
      state.turn.actionsLeft -= cost;
      log(state, `${player.name} searches ${player.x},${player.y}.`);
      giveCard(state, player, card);
      return ok();
    }

    case 'activateCard':
      return activateCard(state, player, action);

    case 'shoot':
      return shoot(state, player, action);

    case 'reload': {
      const cost = state.turn.freeReloads ? 0 : 1;
      if (cost > state.turn.actionsLeft) return fail('You are out of actions.');
      if (!player.weapon) return fail('You have no weapon equipped.');
      if (player.weapon.loaded) return fail('Your weapon is already loaded.');
      player.weapon.loaded = true;
      state.turn.actionsLeft -= cost;
      log(state, `${player.name} reloads${cost === 0 ? ' for free' : ''}.`);
      return ok();
    }

    case 'discard': {
      const card = takeFromHand(player, action.cardId);
      if (!card) return fail('That card is not in your hand.');
      discardCard(state, card);
      log(state, `${player.name} discards a card.`);
      if (state.pendingDiscard === player.index && player.hand.length <= HAND_LIMIT) {
        state.pendingDiscard = null;
      }
      return ok();
    }

    case 'endTurn': {
      if (index !== actor) return fail('It is not your turn.');
      if (player.weapon && !player.weapon.loaded) {
        player.weapon.loaded = true;
        log(state, `${player.name} reloads as the turn ends.`);
      }
      advanceTurn(state);
      return ok();
    }

    default:
      return fail(`Unknown action: ${(action as { type: string }).type}`);
  }
}

function movePlayer(state: ArenaState, player: ArenaPlayer, to: Position): ActionResult {
  if (!inBounds(to)) return fail('That is off the board.');
  const blocker = playerAt(state, to);
  if (blocker) return fail(`${blocker.name} is standing there.`);
  player.x = to.x;
  player.y = to.y;
  return ok();
}

function activateCard(
  state: ArenaState,
  player: ArenaPlayer,
  action: Extract<ArenaAction, { type: 'activateCard' }>,
): ActionResult {
  const fromHand = player.hand.find((entry) => entry.id === action.cardId);
  const fromAces = player.aces.find((entry) => entry.id === action.cardId);
  const card = fromHand ?? fromAces;
  if (!card) return fail('That card is not yours to play.');

  const cost = card.suit === 'diamonds' ? 0 : 1;
  if (cost > state.turn.actionsLeft) return fail('You are out of actions.');

  const spend = () => {
    if (fromHand) takeFromHand(player, card.id);
    else player.aces = player.aces.filter((entry) => entry.id !== card.id);
    state.turn.actionsLeft -= cost;
  };

  switch (card.suit) {
    case 'clubs': {
      spend();
      if (player.weapon) {
        state.pile.push(player.weapon.card);
        state.rng.shuffle(state.pile);
        log(state, `${player.name} throws their old weapon back into the pile.`);
      }
      player.weapon = { card, loaded: true, revealed: false };
      log(state, `${player.name} equips a weapon face down.`);
      return ok();
    }

    case 'hearts': {
      const ability = heartAbility(state, card);
      if (ability === 'auto-revive') {
        return fail('Auto-revive fires by itself when you are killed — keep it in hand.');
      }
      if (ability === 'regen' || ability === 'overheal-regen') {
        spend();
        const max = ability === 'overheal-regen' ? OVERHEAL_CAP : MAX_HP;
        player.hp = Math.max(player.hp, MAX_HP);
        const turns = die(state);
        player.regen = { turnsLeft: turns, max };
        discardCard(state, card);
        log(
          state,
          `${player.name} plays ${card.label}: full heal, then 1 hp a turn for ${turns} turn` +
            `${turns === 1 ? '' : 's'} (up to ${max}).`,
        );
        return ok();
      }
      if (player.hp >= MAX_HP) return fail('You are already at full health.');
      spend();
      const healed = Math.min(healAmount(card), MAX_HP - player.hp);
      player.hp += healed;
      discardCard(state, card);
      log(state, `${player.name} plays ${card.label} and heals ${healed} (${player.hp}/${MAX_HP} hp).`);
      return ok();
    }

    case 'spades': {
      if (spadeAbility(state, card)) {
        const value = overshieldValue(card);
        spend();
        player.overshield = Math.max(player.overshield, value);
        discardCard(state, card);
        log(state, `${player.name} straps on ${card.label} — overshield ${player.overshield}.`);
        return ok();
      }
      if (player.shield >= MAX_SHIELD) return fail('Your armor is already full.');
      spend();
      const gained = Math.min(shieldAmount(card), MAX_SHIELD - player.shield);
      player.shield += gained;
      discardCard(state, card);
      log(state, `${player.name} plays ${card.label} for +${gained} shield (${player.shield}).`);
      return ok();
    }

    case 'diamonds': {
      const ability = diamondAbility(state, card);
      if (ability === 'mobility') {
        if (!action.direction) return fail('Pick a direction to step.');
        const target = step(player, action.direction);
        const moved = movePlayer(state, player, target);
        if (!moved.ok) return moved;
        spend();
        discardCard(state, card);
        log(state, `${player.name} plays ${card.label} and slips ${action.direction} to ${target.x},${target.y}.`);
        return ok();
      }
      if (ability === 'teleport') {
        if (!action.to) return fail('Pick a cell to teleport to.');
        const moved = movePlayer(state, player, action.to);
        if (!moved.ok) return moved;
        spend();
        discardCard(state, card);
        log(state, `${player.name} plays ${card.label} and blinks to ${action.to.x},${action.to.y}.`);
        return ok();
      }
      if (ability === 'blitzkrieg') {
        spend();
        state.turn.actionsLeft++;
        state.turn.freeReloads = true;
        discardCard(state, card);
        log(state, `${player.name} plays ${card.label}: +1 action and free reloads this turn.`);
        return ok();
      }
      spend();
      const energy = energyFrom(card);
      state.turn.actionsLeft += energy;
      discardCard(state, card);
      log(state, `${player.name} burns ${card.label} for ${energy} extra action${energy === 1 ? '' : 's'}.`);
      return ok();
    }

    default:
      return fail('That card cannot be activated.');
  }
}

function shoot(
  state: ArenaState,
  player: ArenaPlayer,
  action: Extract<ArenaAction, { type: 'shoot' }>,
): ActionResult {
  if (state.turn.actionsLeft < 1) return fail('You are out of actions.');
  const weapon = player.weapon;
  if (!weapon) return fail('You have no weapon equipped.');
  if (!weapon.loaded) return fail('Your weapon is out of ammo — reload it.');
  const ability = clubAbility(state, weapon.card);

  const fire = () => {
    weapon.loaded = false;
    weapon.revealed = true;
    state.turn.actionsLeft--;
  };

  if (ability === 'piercing') {
    const direction = action.directions?.[0];
    if (!direction || action.directions?.length !== 1) return fail('Pick one direction to pierce.');
    const targets = firstTargets(state, player, direction, 2);
    if (targets.length === 0) return fail('Nobody is standing that way.');
    fire();
    log(state, `${player.name} fires the piercing sniper ${direction}.`);
    for (const target of targets) {
      if (target.out) continue;
      if (hasProtection(target)) {
        wipeProtection(state, target);
      } else {
        log(state, `${target.name} is pierced clean through.`);
        killPlayer(state, target, player.index);
      }
    }
    return ok();
  }

  if (ability === 'shotgun') {
    const directions = action.directions ?? [];
    if (directions.length !== 2 || directions[0] === directions[1]) {
      return fail('Pick two different directions.');
    }
    const targets = scatterTargets(state, player, directions);
    if (targets.length === 0) return fail('Nobody is in the scatter.');
    fire();
    log(state, `${player.name} unloads both shotguns ${directions[0]} and ${directions[1]}.`);
    for (const target of targets) {
      if (!target.out) applyDamage(state, target, 6, player.index);
    }
    return ok();
  }

  if (ability === 'exploding') {
    const target = state.players.find((entry) => entry.index === action.targetIndex);
    if (!target || target.out) return fail('No such target.');
    const inLine = DIRECTIONS.some(
      (direction) => firstTargets(state, player, direction, 1)[0]?.index === target.index,
    );
    if (!inLine) return fail('You have no line on that player.');
    fire();
    const damage = die(state);
    log(state, `${player.name} lands an exploding round on ${target.name} — 1d6 rolls ${damage}.`);
    if (hasProtection(target)) wipeProtection(state, target);
    applyDamage(state, target, damage, player.index, { ignoreProtection: true });
    return ok();
  }

  const shot = shotsAvailable(state, player).find(
    (candidate) => candidate.target.index === action.targetIndex,
  );
  if (!shot) return fail('You have no shot on that player.');
  fire();
  const damage = weaponDamage(weapon.card);
  log(state, `${player.name} shoots ${shot.target.name} with ${weapon.card.label} for ${damage}.`);
  applyDamage(state, shot.target, damage, player.index);
  return ok();
}

/* ---------------------------------------------------------------- effects */

function wipeProtection(state: ArenaState, target: ArenaPlayer): void {
  if (target.overshield === 0 && target.shield === 0) return;
  target.overshield = 0;
  target.shield = 0;
  log(state, `${target.name}'s protection is stripped away.`);
}

function applyDamage(
  state: ArenaState,
  target: ArenaPlayer,
  amount: number,
  killerIndex: number | null,
  options: { ignoreProtection?: boolean } = {},
): void {
  if (!options.ignoreProtection && target.overshield > 0) {
    // An overshield eats the whole hit: the excess never reaches the armor.
    const absorbed = Math.min(target.overshield, amount);
    target.overshield -= absorbed;
    log(
      state,
      `${target.name}'s overshield takes the hit (${target.overshield} overshield left).`,
    );
    return;
  }

  const absorbed = options.ignoreProtection ? 0 : Math.min(target.shield, amount);
  target.shield -= absorbed;
  target.hp -= amount - absorbed;
  log(
    state,
    `${target.name} takes ${amount}${absorbed > 0 ? ` (${absorbed} on shield)` : ''} — ` +
      `${Math.max(0, target.hp)} hp, ${target.shield} shield.`,
  );
  if (target.hp <= 0) killPlayer(state, target, killerIndex);
}

/** Death, unless the king of hearts is in hand to answer it. */
function killPlayer(state: ArenaState, victim: ArenaPlayer, killerIndex: number | null): void {
  const revive = state.specialAbilities
    ? victim.hand.find((card) => heartAbility(state, card) === 'auto-revive')
    : undefined;
  if (revive) {
    takeFromHand(victim, revive.id);
    discardCard(state, revive);
    victim.hp = MAX_HP;
    victim.shield = 0;
    victim.overshield = 0;
    log(state, `${victim.name} shows ${revive.label} and comes straight back at full health.`);
    return;
  }
  knockOut(state, victim, killerIndex);
}

function knockOut(state: ArenaState, victim: ArenaPlayer, killerIndex: number | null): void {
  victim.out = true;
  victim.hp = 0;
  victim.shield = 0;
  victim.overshield = 0;
  victim.regen = null;

  // Anything in play goes back to the pile; the hand goes to whoever killed them.
  if (victim.weapon) state.pile.push(victim.weapon.card);
  state.pile.push(...victim.aces);
  victim.weapon = null;
  victim.aces = [];

  const looted = victim.hand;
  victim.hand = [];
  const killer = killerIndex === null ? undefined : seatAt(state, killerIndex);
  log(state, `${victim.name} is knocked out.`);

  if (killer && !killer.out && looted.length > 0) {
    log(state, `${killer.name} loots ${looted.length} card${looted.length === 1 ? '' : 's'}.`);
    for (const card of looted) giveCard(state, killer, card);
    if (killer.hand.length > HAND_LIMIT) state.pendingDiscard = killer.index;
  } else {
    state.pile.push(...looted);
  }
  state.rng.shuffle(state.pile);
  checkWinner(state);
}

/**
 * Put a card into a player's keeping. Aces go face up and pull a replacement
 * from the pile; everything else lands in hand.
 */
function giveCard(state: ArenaState, player: ArenaPlayer, card: Card): void {
  if (acesCollect(state) && card.rank === 'A') {
    player.aces.push(card);
    log(state, `${player.name} plays ${card.label} face up (${player.aces.length}/${ACES_TO_WIN}).`);
    if (checkAceWin(state, player)) return;
    const replacement = drawFromPile(state);
    if (replacement) {
      log(state, `${player.name} draws a replacement from the pile.`);
      giveCard(state, player, replacement);
    }
    return;
  }
  player.hand.push(card);
}

function drawFromPile(state: ArenaState): Card | null {
  if (state.pile.length === 0) return null;
  state.rng.shuffle(state.pile);
  return state.pile.pop() ?? null;
}

function checkAceWin(state: ArenaState, player: ArenaPlayer): boolean {
  if (player.aces.length < ACES_TO_WIN) return false;
  state.phase = 'over';
  state.winnerIndex = player.index;
  state.pendingDiscard = null;
  log(state, `${player.name} holds all four aces and wins!`);
  return true;
}

function checkWinner(state: ArenaState): void {
  const living = livingPlayers(state);
  if (living.length > 1) return;
  state.phase = 'over';
  state.winnerIndex = living[0]?.index ?? null;
  state.pendingDiscard = null;
  log(
    state,
    living[0] ? `${living[0].name} is the last one standing and wins!` : 'Nobody is left standing.',
  );
}

/* ---------------------------------------------------------------- helpers */

export function step(from: Position, direction: Direction): Position {
  const delta = STEP[direction];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

function takeFromHand(player: ArenaPlayer, cardId: string): Card | null {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) return null;
  return player.hand.splice(index, 1)[0] ?? null;
}

/** Used cards go back into the face-down pile, shuffled. */
function discardCard(state: ArenaState, card: Card): void {
  state.pile.push(card);
  state.rng.shuffle(state.pile);
}

function die(state: ArenaState): number {
  return rollDie(6, state.rng);
}

function log(state: ArenaState, text: string): void {
  state.log.push(text);
}

const ok = (): ActionResult => ({ ok: true });
const fail = (error: string): ActionResult => ({ ok: false, error });
