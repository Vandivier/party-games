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
  BOARD_SIZE,
  HAND_LIMIT,
  MAX_HP,
  MAX_SHIELD,
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

/* ------------------------------------------------------------------ setup */

export function createGame({ players, seed }: CreateGameOptions): ArenaState {
  if (!players || players.length < 2) throw new Error('Deck Arena needs at least 2 players.');
  if (players.length > 8) throw new Error('Deck Arena tops out at 8 players.');

  const rng = new Random(seed);
  const deck = rng.shuffle(buildDeck(1));

  const state: ArenaState = {
    rng,
    seed: rng.seed,
    board: deck.slice(0, CELL_COUNT),
    pile: deck.slice(CELL_COUNT),
    players: players.map((player, index) => ({
      index,
      name: player.name,
      isBot: Boolean(player.isBot),
      hp: MAX_HP,
      shield: 0,
      x: 0,
      y: 0,
      hand: [],
      weapon: null,
      out: false,
    })),
    order: [],
    orderIndex: 0,
    round: 1,
    turn: { roll: 0, actionsLeft: 0, freeSearchUsed: false },
    phase: 'play',
    winnerIndex: null,
    log: [],
  };

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
      player.hand.push(card);
      log(state, `${player.name} picks up the card at ${spot.x},${spot.y}.`);
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
  return state.order[state.orderIndex] ?? null;
}

function beginTurn(state: ArenaState, player: ArenaPlayer): void {
  const roll = die(state);
  const actions = roll <= 3 ? 1 : 2;
  state.turn = { roll, actionsLeft: actions, freeSearchUsed: false };
  log(state, `--- ${player.name}'s turn — rolled ${roll}, ${actions} action${actions === 1 ? '' : 's'} ---`);
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

  for (const card of player.hand) {
    switch (card.suit) {
      case 'clubs':
        if (affordable(1)) {
          actions.push({
            type: 'activateCard',
            cardId: card.id,
            cost: 1,
            label: `Equip ${card.label} — ${weaponDamage(card)} damage, range ${weaponRange(card)}`,
          });
        }
        break;
      case 'hearts':
        if (affordable(1) && player.hp < MAX_HP) {
          actions.push({
            type: 'activateCard',
            cardId: card.id,
            cost: 1,
            label: `Play ${card.label} — heal ${healAmount(card)}`,
          });
        }
        break;
      case 'spades':
        if (affordable(1) && player.shield < MAX_SHIELD) {
          actions.push({
            type: 'activateCard',
            cardId: card.id,
            cost: 1,
            label: `Play ${card.label} — +${shieldAmount(card)} shield`,
          });
        }
        break;
      case 'diamonds':
        actions.push({
          type: 'activateCard',
          cardId: card.id,
          cost: 0,
          label: `Play ${card.label} — +${energyFrom(card)} action${energyFrom(card) === 1 ? '' : 's'}`,
        });
        break;
    }
  }

  if (player.weapon && affordable(1)) {
    if (player.weapon.loaded) {
      for (const shot of shotsAvailable(state, player)) {
        actions.push({
          type: 'shoot',
          targetIndex: shot.target.index,
          cost: 1,
          label: `Shoot ${shot.target.name} for ${weaponDamage(player.weapon.card)}`,
        });
      }
    } else {
      actions.push({ type: 'reload', cost: 1, label: 'Reload' });
    }
  }

  for (const card of player.hand) {
    actions.push({ type: 'discard', cardId: card.id, cost: 0, label: `Discard ${card.label}` });
  }

  actions.push({ type: 'endTurn', cost: 0, label: 'End turn' });
  return actions;
}

/** Every living player this one could shoot right now, with the distance. */
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

export function act(state: ArenaState, action: ArenaAction): ActionResult {
  const index = currentActor(state);
  if (index === null) return fail('The game is over.');
  const player = seatAt(state, index);
  if (!player) return fail('No active player.');

  switch (action.type) {
    case 'move': {
      if (state.turn.actionsLeft < 1) return fail('You are out of actions.');
      const target = step(player, action.direction);
      if (!inBounds(target)) return fail('That is off the board.');
      const blocker = playerAt(state, target);
      if (blocker) return fail(`${blocker.name} is standing there.`);
      player.x = target.x;
      player.y = target.y;
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
      player.hand.push(card);
      if (cost === 0) state.turn.freeSearchUsed = true;
      state.turn.actionsLeft -= cost;
      log(state, `${player.name} searches ${player.x},${player.y}.`);
      return ok();
    }

    case 'activateCard': {
      const card = player.hand.find((entry) => entry.id === action.cardId);
      if (!card) return fail('That card is not in your hand.');
      const cost = card.suit === 'diamonds' ? 0 : 1;
      if (cost > state.turn.actionsLeft) return fail('You are out of actions.');
      takeFromHand(player, card.id);
      state.turn.actionsLeft -= cost;

      switch (card.suit) {
        case 'clubs': {
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
          const healed = Math.min(healAmount(card), MAX_HP - player.hp);
          player.hp += healed;
          discardCard(state, card);
          log(state, `${player.name} plays ${card.label} and heals ${healed} (${player.hp}/${MAX_HP} hp).`);
          return ok();
        }
        case 'spades': {
          const gained = Math.min(shieldAmount(card), MAX_SHIELD - player.shield);
          player.shield += gained;
          discardCard(state, card);
          log(state, `${player.name} plays ${card.label} for +${gained} shield (${player.shield}).`);
          return ok();
        }
        case 'diamonds': {
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

    case 'shoot': {
      if (state.turn.actionsLeft < 1) return fail('You are out of actions.');
      const weapon = player.weapon;
      if (!weapon) return fail('You have no weapon equipped.');
      if (!weapon.loaded) return fail('Your weapon is out of ammo — reload it.');
      const shot = shotsAvailable(state, player).find(
        (candidate) => candidate.target.index === action.targetIndex,
      );
      if (!shot) return fail('You have no shot on that player.');

      weapon.loaded = false;
      weapon.revealed = true;
      state.turn.actionsLeft--;
      const damage = weaponDamage(weapon.card);
      log(state, `${player.name} shoots ${shot.target.name} with ${weapon.card.label} for ${damage}.`);
      applyDamage(state, shot.target, damage);
      return ok();
    }

    case 'reload': {
      if (state.turn.actionsLeft < 1) return fail('You are out of actions.');
      if (!player.weapon) return fail('You have no weapon equipped.');
      if (player.weapon.loaded) return fail('Your weapon is already loaded.');
      player.weapon.loaded = true;
      state.turn.actionsLeft--;
      log(state, `${player.name} reloads.`);
      return ok();
    }

    case 'discard': {
      const card = takeFromHand(player, action.cardId);
      if (!card) return fail('That card is not in your hand.');
      discardCard(state, card);
      log(state, `${player.name} discards a card.`);
      return ok();
    }

    case 'endTurn': {
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

function applyDamage(state: ArenaState, target: ArenaPlayer, amount: number): void {
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  target.hp -= amount - absorbed;
  log(
    state,
    `${target.name} takes ${amount}${absorbed > 0 ? ` (${absorbed} on shield)` : ''} — ` +
      `${Math.max(0, target.hp)} hp, ${target.shield} shield.`,
  );
  if (target.hp <= 0) knockOut(state, target);
}

function knockOut(state: ArenaState, player: ArenaPlayer): void {
  player.out = true;
  player.hp = 0;
  state.pile.push(...player.hand);
  if (player.weapon) state.pile.push(player.weapon.card);
  state.rng.shuffle(state.pile);
  player.hand = [];
  player.weapon = null;
  log(state, `${player.name} is knocked out.`);
  checkWinner(state);
}

function checkWinner(state: ArenaState): void {
  const living = livingPlayers(state);
  if (living.length > 1) return;
  state.phase = 'over';
  state.winnerIndex = living[0]?.index ?? null;
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
