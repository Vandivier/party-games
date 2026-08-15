/**
 * Hero War engine.
 *
 * Rules: ./RULES.md   Gap-filling defaults: ./HOUSE_RULES.md
 *
 * The engine owns all state and every legality check. It never prompts and
 * never renders: a caller drives it with `legalActions` -> `act`, and answers
 * `state.pendingAttack` with `resolveDefense`.
 */

import { buildDeck, isFace, sortHand, type Card } from '@/core/cards';
import { Random } from '@/core/rng';
import type {
  ActionResult,
  CreateGameOptions,
  DamageBreakdown,
  DefenseChoice,
  HeroWarAction,
  HeroWarPlayer,
  HeroWarState,
  LegalAction,
} from './types';

/** A hero's face value is both its damage and its hit points. */
export function heroHitPoints(card: Card): number {
  return card.value;
}
export const HAND_SIZE = 5;
const MAX_MULLIGANS = 25;
/** A club this big is worth spending a spade to destroy. */
const SABOTAGE_THRESHOLD = 7;

export function createGame({ players, seed, deckCount }: CreateGameOptions): HeroWarState {
  if (!players || players.length < 2) throw new Error('Hero War needs at least 2 players.');
  if (players.length > 8) throw new Error('Hero War tops out at 8 players.');
  const rng = new Random(seed);
  const decks = deckCount ?? (players.length >= 4 ? 2 : 1);

  const state: HeroWarState = {
    rng,
    seed: rng.seed,
    deckCount: decks,
    deck: rng.shuffle(buildDeck(decks)),
    discard: [],
    players: players.map((player, index) => ({
      index,
      name: player.name,
      isBot: Boolean(player.isBot),
      hand: [],
      hero: null,
      equipment: [],
      out: false,
    })),
    turn: { playerIndex: 0, drawn: false, played: false, equipped: false, attacked: false },
    pendingAttack: null,
    pendingHero: null,
    phase: 'setup',
    winnerIndex: null,
    log: [],
  };

  for (const player of state.players) dealOpeningHand(state, player);
  return state;
}

/** Deal five, mulliganing in the open until the hand holds a face card. */
function dealOpeningHand(state: HeroWarState, player: HeroWarPlayer): void {
  for (let attempt = 0; attempt <= MAX_MULLIGANS; attempt++) {
    player.hand = [];
    for (let i = 0; i < HAND_SIZE; i++) drawCard(state, player);
    if (player.hand.some(isFace)) return;
    log(state, `${player.name} shows a hand with no face card (${labels(player.hand)}) and redraws.`);
    state.deck.push(...player.hand);
    state.rng.shuffle(state.deck);
  }
  throw new Error('Cannot deal an opening hand containing a face card.');
}

/* ------------------------------------------------------------------ helpers */

const labels = (cards: readonly Card[]): string => cards.map((card) => card.label).join(' ');

function log(state: HeroWarState, text: string): void {
  state.log.push(text);
}

export function playerAt(state: HeroWarState, index: number): HeroWarPlayer | undefined {
  return state.players[index];
}

function drawCard(state: HeroWarState, player: HeroWarPlayer): Card | null {
  if (state.deck.length === 0) {
    if (state.discard.length === 0) return null;
    state.deck = state.rng.shuffle(state.discard);
    state.discard = [];
    log(state, 'The discard pile is shuffled into a new deck.');
  }
  const card = state.deck.pop();
  if (!card) return null;
  player.hand.push(card);
  return card;
}

function takeFromHand(player: HeroWarPlayer, cardId: string): Card | null {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index === -1) return null;
  return player.hand.splice(index, 1)[0] ?? null;
}

export function livingPlayers(state: HeroWarState): HeroWarPlayer[] {
  return state.players.filter((player) => !player.out);
}

export function damageBreakdown(
  player: HeroWarPlayer,
  boostCards: readonly Card[] = [],
): DamageBreakdown {
  const hero = player.hero ? player.hero.card.value : 0;
  const equipment = player.equipment.reduce((sum, card) => sum + card.value, 0);
  const boost = boostCards.reduce((sum, card) => sum + card.value, 0);
  return { hero, equipment, boost, total: player.hero ? hero + equipment + boost : 0 };
}

export function attackDamage(player: HeroWarPlayer, boostCards: readonly Card[] = []): number {
  return damageBreakdown(player, boostCards).total;
}

/** Whose input the game is waiting on, or null when the game is over. */
export function currentActor(state: HeroWarState): number | null {
  if (state.phase === 'over') return null;
  if (state.pendingAttack) return state.pendingAttack.defenderIndex;
  if (state.pendingHero !== null) return state.pendingHero;
  if (state.phase === 'setup') {
    const waiting = state.players.find((player) => !player.out && !player.hero);
    return waiting ? waiting.index : null;
  }
  return state.turn.playerIndex;
}

/** What the game is waiting for: an action, a defense, or a replacement hero. */
export function waitingKind(state: HeroWarState): 'action' | 'defense' | 'hero' | null {
  if (state.phase === 'over') return null;
  if (state.pendingAttack) return 'defense';
  if (state.pendingHero !== null || state.phase === 'setup') return 'hero';
  return 'action';
}

/* ------------------------------------------------------------------ actions */

/**
 * Every action the current actor may legally take right now. Attacks are
 * offered unboosted; a caller collects diamonds and passes their ids in.
 */
export function legalActions(state: HeroWarState): LegalAction[] {
  const index = currentActor(state);
  if (index === null) return [];
  const player = playerAt(state, index);
  if (!player) return [];
  if (state.pendingAttack) return []; // answered through resolveDefense

  if (!player.hero) {
    return player.hand.filter(isFace).map((card) => ({
      type: 'playHero' as const,
      cardId: card.id,
      label: `Play ${card.label} as your hero — ${card.value} damage, ${heroHitPoints(card)} hp`,
    }));
  }
  if (state.phase === 'setup') return [];

  const actions: LegalAction[] = [];
  const { turn } = state;

  if (!turn.drawn) actions.push({ type: 'draw', label: 'Draw a card' });

  if (!turn.played && !turn.attacked) {
    for (const card of sortHand(player.hand)) {
      if (card.suit !== 'clubs') continue;
      actions.push({
        type: 'equip',
        cardId: card.id,
        label: `Equip ${card.label} — +${card.value} damage, permanent`,
      });
    }
  }

  for (const card of sortHand(player.hand).filter((c) => c.suit === 'spades')) {
    actions.push({
      type: 'spadeTrade',
      cardId: card.id,
      label: `Discard ${card.label} to draw a card — free action`,
    });
    for (const opponent of state.players) {
      if (opponent.out || opponent.index === player.index) continue;
      for (const club of opponent.equipment) {
        actions.push({
          type: 'spadeSabotage',
          cardId: card.id,
          targetIndex: opponent.index,
          clubId: club.id,
          label: `Discard ${card.label} to destroy ${opponent.name}'s ${club.label}`,
        });
      }
    }
  }

  if (!turn.attacked && !turn.equipped) {
    for (const opponent of state.players) {
      if (opponent.out || opponent.index === player.index || !opponent.hero) continue;
      actions.push({
        type: 'attack',
        targetIndex: opponent.index,
        boostCardIds: [],
        label: `Attack ${opponent.name} for ${attackDamage(player)}`,
      });
    }
  }

  actions.push({ type: 'endTurn', label: 'End turn' });
  return actions;
}

/** Apply an action on behalf of the current actor. */
export function act(state: HeroWarState, action: HeroWarAction): ActionResult {
  const index = currentActor(state);
  if (index === null) return fail('The game is over.');
  if (state.pendingAttack) return fail('An attack is waiting on the defender.');
  const player = playerAt(state, index);
  if (!player) return fail('No active player.');
  const { turn } = state;

  switch (action.type) {
    case 'playHero': {
      if (player.hero) return fail('You already have a hero in play.');
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail('That card is not in your hand.');
      if (!isFace(card)) return fail('Only face cards can be played as a hero.');
      takeFromHand(player, card.id);
      const hp = heroHitPoints(card);
      player.hero = { card, hp, maxHp: hp };
      log(state, `${player.name} takes the field with ${card.label} (${hp} hp).`);
      if (state.pendingHero === player.index) state.pendingHero = null;
      if (state.phase === 'setup' && state.players.every((p) => p.out || p.hero)) {
        state.phase = 'play';
        log(state, `--- ${state.players[state.turn.playerIndex]?.name}'s turn ---`);
      }
      return ok();
    }

    case 'draw': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      if (turn.drawn) return fail('You have already drawn this turn.');
      const card = drawCard(state, player);
      turn.drawn = true;
      log(
        state,
        card
          ? `${player.name} draws a card.`
          : `${player.name} reaches for a card, but nothing is left to draw.`,
      );
      return ok();
    }

    case 'equip': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      if (turn.played) return fail('You have already played a card this turn.');
      if (turn.attacked) return fail('You cannot equip a club on a turn you attacked.');
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return fail('That card is not in your hand.');
      if (card.suit !== 'clubs') return fail('Only clubs can be equipped.');
      takeFromHand(player, card.id);
      player.equipment.push(card);
      turn.played = true;
      turn.equipped = true;
      log(state, `${player.name} equips ${card.label} (+${card.value} damage).`);
      return ok();
    }

    case 'spadeTrade': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      const check = requireSpade(player, action.cardId);
      if (!check.ok) return check;
      const card = takeFromHand(player, action.cardId);
      if (!card) return fail('That card is not in your hand.');
      state.discard.push(card);
      const drawn = drawCard(state, player);
      log(
        state,
        `${player.name} trades ${card.label} for a fresh card${drawn ? '' : ' — but the deck is empty'}.`,
      );
      return ok();
    }

    case 'spadeSabotage': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      const check = requireSpade(player, action.cardId);
      if (!check.ok) return check;
      const target = playerAt(state, action.targetIndex);
      if (!target || target.out || target.index === player.index) return fail('Invalid target.');
      const clubIndex = target.equipment.findIndex((c) => c.id === action.clubId);
      if (clubIndex === -1) return fail(`${target.name} does not have that equipment.`);
      const card = takeFromHand(player, action.cardId);
      if (!card) return fail('That card is not in your hand.');
      state.discard.push(card);
      const [club] = target.equipment.splice(clubIndex, 1);
      if (club) state.discard.push(club);
      log(state, `${player.name} spends ${card.label} to destroy ${target.name}'s ${club?.label}.`);
      return ok();
    }

    case 'attack': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      if (turn.attacked) return fail('You have already attacked this turn.');
      if (turn.equipped) return fail('You cannot attack on the same turn you equip a club.');
      if (!player.hero) return fail('You have no hero to attack with.');
      const target = playerAt(state, action.targetIndex);
      if (!target || target.out || target.index === player.index) return fail('Invalid target.');
      if (!target.hero) return fail(`${target.name} has no hero in play.`);

      const boosts: Card[] = [];
      for (const cardId of action.boostCardIds ?? []) {
        const card = player.hand.find((c) => c.id === cardId);
        if (!card) return fail('That boost card is not in your hand.');
        if (card.suit !== 'diamonds') return fail('Only diamonds can boost an attack.');
        if (boosts.some((c) => c.id === cardId)) return fail('That diamond is already spent.');
        boosts.push(card);
      }
      for (const card of boosts) {
        takeFromHand(player, card.id);
        state.discard.push(card);
      }

      const breakdown = damageBreakdown(player, boosts);
      turn.attacked = true;
      state.pendingAttack = {
        attackerIndex: player.index,
        defenderIndex: target.index,
        damage: breakdown.total,
        breakdown,
        boosts,
      };
      const boostNote = boosts.length ? ` (powered by ${labels(boosts)})` : '';
      log(state, `${player.name} attacks ${target.name} for ${breakdown.total}${boostNote}.`);
      return ok();
    }

    case 'endTurn': {
      if (state.phase !== 'play') return fail('Play a hero first.');
      advanceTurn(state);
      return ok();
    }

    default:
      return fail(`Unknown action: ${(action as { type: string }).type}`);
  }
}

function requireSpade(player: HeroWarPlayer, cardId: string): ActionResult {
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return fail('That card is not in your hand.');
  if (card.suit !== 'spades') return fail('That is not a spade.');
  return ok();
}

/**
 * Answer a pending attack: name a heart to discard for a full nullify, or pass
 * `null` to take the hit.
 */
export function resolveDefense(
  state: HeroWarState,
  { cardId = null }: DefenseChoice = { cardId: null },
): ActionResult {
  const attack = state.pendingAttack;
  if (!attack) return fail('No attack is pending.');
  const defender = playerAt(state, attack.defenderIndex);
  if (!defender || !defender.hero) return fail('There is nobody left to defend.');

  if (cardId) {
    const card = defender.hand.find((c) => c.id === cardId);
    if (!card) return fail('That card is not in your hand.');
    if (card.suit !== 'hearts') return fail('Only hearts nullify an attack.');
    takeFromHand(defender, card.id);
    state.discard.push(card);
    state.pendingAttack = null;
    log(state, `${defender.name} discards ${card.label} and the attack is nullified.`);
    return ok();
  }

  state.pendingAttack = null;
  defender.hero.hp -= attack.damage;
  log(
    state,
    `${defender.name}'s ${defender.hero.card.label} takes ${attack.damage} damage ` +
      `(${Math.max(0, defender.hero.hp)}/${defender.hero.maxHp} hp).`,
  );
  if (defender.hero.hp <= 0) killHero(state, defender);
  return ok();
}

function killHero(state: HeroWarState, player: HeroWarPlayer): void {
  if (!player.hero) return;
  state.discard.push(player.hero.card);
  log(state, `${player.name}'s ${player.hero.card.label} falls.`);
  player.hero = null;
  if (player.hand.some(isFace)) {
    state.pendingHero = player.index;
    return;
  }
  eliminate(state, player);
}

function eliminate(state: HeroWarState, player: HeroWarPlayer): void {
  player.out = true;
  state.discard.push(...player.hand, ...player.equipment);
  player.hand = [];
  player.equipment = [];
  if (state.pendingHero === player.index) state.pendingHero = null;
  log(state, `${player.name} has no hero left to play and is out.`);
  checkWinner(state);
}

function checkWinner(state: HeroWarState): void {
  const living = livingPlayers(state);
  if (living.length > 1) return;
  state.phase = 'over';
  state.winnerIndex = living[0]?.index ?? null;
  state.pendingAttack = null;
  state.pendingHero = null;
  log(
    state,
    living[0]
      ? `${living[0].name} is the last hero standing and wins!`
      : 'Everyone is out. Nobody wins.',
  );
}

function advanceTurn(state: HeroWarState): void {
  if (state.phase === 'over') return;
  const count = state.players.length;
  for (let step = 1; step <= count; step++) {
    const next = (state.turn.playerIndex + step) % count;
    const player = state.players[next];
    if (!player || player.out) continue;
    state.turn = { playerIndex: next, drawn: false, played: false, equipped: false, attacked: false };
    log(state, `--- ${player.name}'s turn ---`);
    return;
  }
}

export { SABOTAGE_THRESHOLD };

const ok = (): ActionResult => ({ ok: true });
const fail = (error: string): ActionResult => ({ ok: false, error });
