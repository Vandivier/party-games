import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import {
  act,
  attackDamage,
  createGame,
  currentActor,
  HAND_SIZE,
  HERO_HP,
  legalActions,
  resolveDefense,
} from '@games/hero_war/engine';
import type { HeroWarState } from '@games/hero_war/types';

const REFERENCE_DECK = buildDeck();

/** Look a card up by its label, e.g. `card('K♠')`. */
function card(label: string): Card {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
}

function cards(...labels: string[]): Card[] {
  return labels.map(card);
}

function table(seed = 'test'): HeroWarState {
  return createGame({ players: [{ name: 'Ada' }, { name: 'Bo' }], seed });
}

/** Deal both seats a chosen hand and put both heroes on the field. */
function staged(handA: string[], handB: string[], heroA = 'K♠', heroB = 'J♥'): HeroWarState {
  const state = table();
  state.players[0]!.hand = cards(...handA, heroA);
  state.players[1]!.hand = cards(...handB, heroB);
  expect(act(state, { type: 'playHero', cardId: card(heroA).id }).ok).toBe(true);
  expect(act(state, { type: 'playHero', cardId: card(heroB).id }).ok).toBe(true);
  expect(state.phase).toBe('play');
  return state;
}

describe('setup', () => {
  it('deals five cards to each player', () => {
    const state = table();
    for (const player of state.players) expect(player.hand).toHaveLength(HAND_SIZE);
  });

  it('always deals an opening hand containing a face card', () => {
    for (let seed = 0; seed < 60; seed++) {
      const state = createGame({ players: [{ name: 'A' }, { name: 'B' }], seed: `seed-${seed}` });
      for (const player of state.players) {
        expect(player.hand.some((entry) => ['J', 'Q', 'K'].includes(entry.rank))).toBe(true);
      }
    }
  });

  it('shows the table and redraws when a hand has no face card', () => {
    // Roughly a quarter of five-card hands hold no face card, so a sweep of
    // seeds is certain to walk the mulligan path.
    const redraws = Array.from({ length: 60 }, (_, seed) =>
      createGame({ players: [{ name: 'Ada' }, { name: 'Bo' }], seed: `mull-${seed}` }),
    ).flatMap((state) => state.log.filter((line) => line.includes('no face card')));

    expect(redraws.length).toBeGreaterThan(0);
    expect(redraws[0]).toMatch(/shows a hand with no face card \(.+\) and redraws\./);
  });

  it('only lets face cards take the field, at full hit points', () => {
    const state = table();
    state.players[0]!.hand = cards('5♦', 'Q♣');
    expect(act(state, { type: 'playHero', cardId: card('5♦').id }).ok).toBe(false);
    expect(act(state, { type: 'playHero', cardId: card('Q♣').id }).ok).toBe(true);
    expect(state.players[0]!.hero).toMatchObject({ hp: HERO_HP, maxHp: HERO_HP });
    expect(state.players[0]!.hero!.card.label).toBe('Q♣');
  });

  it('waits for every seat to field a hero before play starts', () => {
    const state = table();
    state.players[0]!.hand = cards('K♠');
    state.players[1]!.hand = cards('J♥');
    act(state, { type: 'playHero', cardId: card('K♠').id });
    expect(state.phase).toBe('setup');
    expect(currentActor(state)).toBe(1);
    act(state, { type: 'playHero', cardId: card('J♥').id });
    expect(state.phase).toBe('play');
    expect(currentActor(state)).toBe(0);
  });
});

describe('turn actions', () => {
  it('allows one draw per turn', () => {
    const state = staged(['2♠'], ['3♠']);
    expect(act(state, { type: 'draw' }).ok).toBe(true);
    expect(act(state, { type: 'draw' }).ok).toBe(false);
    expect(state.players[0]!.hand).toHaveLength(2);
  });

  it('allows one card play per turn and equipment boosts damage permanently', () => {
    const state = staged(['7♣', '4♣'], ['3♠']);
    expect(act(state, { type: 'equip', cardId: card('7♣').id }).ok).toBe(true);
    expect(act(state, { type: 'equip', cardId: card('4♣').id }).ok).toBe(false);
    expect(attackDamage(state.players[0]!)).toBe(13 + 7);

    act(state, { type: 'endTurn' });
    act(state, { type: 'endTurn' });
    expect(state.turn.playerIndex).toBe(0);
    expect(state.players[0]!.equipment.map((entry) => entry.label)).toEqual(['7♣']);
    expect(attackDamage(state.players[0]!)).toBe(20);
  });

  it('refuses to equip a card that is not a club', () => {
    const state = staged(['7♥'], ['3♠']);
    expect(act(state, { type: 'equip', cardId: card('7♥').id }).ok).toBe(false);
  });

  it('lets a spade buy a draw without spending the turn actions', () => {
    const state = staged(['2♠', '9♣'], ['3♠']);
    expect(act(state, { type: 'spadeTrade', cardId: card('2♠').id }).ok).toBe(true);
    expect(state.turn.drawn).toBe(false);
    expect(state.turn.played).toBe(false);
    expect(state.discard.map((entry) => entry.label)).toContain('2♠');
    expect(act(state, { type: 'draw' }).ok).toBe(true);
    expect(act(state, { type: 'equip', cardId: card('9♣').id }).ok).toBe(true);
  });

  it('lets a spade destroy an opponent equipped club', () => {
    const state = staged(['2♠'], ['8♣']);
    act(state, { type: 'endTurn' });
    act(state, { type: 'equip', cardId: card('8♣').id });
    act(state, { type: 'endTurn' });

    expect(state.players[1]!.equipment).toHaveLength(1);
    const result = act(state, {
      type: 'spadeSabotage',
      cardId: card('2♠').id,
      targetIndex: 1,
      clubId: card('8♣').id,
    });
    expect(result.ok).toBe(true);
    expect(state.players[1]!.equipment).toHaveLength(0);
    expect(state.discard.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['2♠', '8♣']),
    );
  });

  it('advances the turn to the next living player', () => {
    const state = staged(['2♠'], ['3♠']);
    expect(state.turn.playerIndex).toBe(0);
    act(state, { type: 'endTurn' });
    expect(state.turn.playerIndex).toBe(1);
    expect(state.turn).toMatchObject({ drawn: false, played: false, attacked: false });
  });

  it('reshuffles the discard pile when the deck runs dry', () => {
    const state = staged(['2♠'], ['3♠']);
    state.discard = cards('5♦', '6♦');
    state.deck = [];
    expect(act(state, { type: 'draw' }).ok).toBe(true);
    expect(state.players[0]!.hand).toHaveLength(2);
    expect(state.log.some((line) => line.includes('shuffled into a new deck'))).toBe(true);
  });
});

describe('attacks and defense', () => {
  it('deals hero value plus equipment plus diamonds', () => {
    const state = staged(['7♣', '5♦', '3♦'], ['2♠']);
    act(state, { type: 'equip', cardId: card('7♣').id });
    const result = act(state, {
      type: 'attack',
      targetIndex: 1,
      boostCardIds: [card('5♦').id, card('3♦').id],
    });
    expect(result.ok).toBe(true);
    expect(state.pendingAttack).toMatchObject({ damage: 13 + 7 + 5 + 3, defenderIndex: 1 });
    expect(state.discard.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['5♦', '3♦']),
    );
    expect(legalActions(state)).toHaveLength(0);
    expect(currentActor(state)).toBe(1);
  });

  it('rejects a non-diamond boost and leaves the hand untouched', () => {
    const state = staged(['5♥'], ['2♠']);
    const result = act(state, { type: 'attack', targetIndex: 1, boostCardIds: [card('5♥').id] });
    expect(result.ok).toBe(false);
    expect(state.players[0]!.hand.map((entry) => entry.label)).toContain('5♥');
    expect(state.pendingAttack).toBeNull();
  });

  it('allows only one attack per turn', () => {
    const state = staged([], ['2♠']);
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });
    expect(act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] }).ok).toBe(false);
  });

  it('nullifies an attack with a heart', () => {
    const state = staged([], ['4♥']);
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    expect(resolveDefense(state, { cardId: card('4♥').id }).ok).toBe(true);
    expect(state.players[1]!.hero!.hp).toBe(HERO_HP);
    expect(state.players[1]!.hand.map((entry) => entry.label)).not.toContain('4♥');
    expect(state.discard.map((entry) => entry.label)).toContain('4♥');
  });

  it('refuses to defend with anything but a heart', () => {
    const state = staged([], ['4♠']);
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    expect(resolveDefense(state, { cardId: card('4♠').id }).ok).toBe(false);
    expect(state.pendingAttack).not.toBeNull();
  });

  it('applies damage that accumulates across attacks', () => {
    const state = staged([], []);
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });
    expect(state.players[1]!.hero!.hp).toBe(HERO_HP - 13);

    act(state, { type: 'endTurn' });
    act(state, { type: 'endTurn' });
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });
    expect(state.players[1]!.hero).toBeNull();
  });

  it('asks a fallen player for a replacement hero before play continues', () => {
    const state = staged(['9♣'], ['Q♦']);
    state.players[0]!.equipment = cards('7♣');
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });

    expect(state.players[1]!.hero).toBeNull();
    expect(state.pendingHero).toBe(1);
    expect(currentActor(state)).toBe(1);
    expect(legalActions(state).map((action) => action.type)).toEqual(['playHero']);

    expect(act(state, { type: 'playHero', cardId: card('Q♦').id }).ok).toBe(true);
    expect(state.players[1]!.hero!.hp).toBe(HERO_HP);
    expect(state.pendingHero).toBeNull();
    expect(currentActor(state)).toBe(0);
  });

  it('keeps equipment when the hero it belonged to dies', () => {
    const state = staged([], ['Q♦', '2♣']);
    state.players[1]!.equipment = cards('6♣');
    state.players[0]!.equipment = cards('9♣');
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });
    act(state, { type: 'playHero', cardId: card('Q♦').id });
    expect(state.players[1]!.equipment.map((entry) => entry.label)).toEqual(['6♣']);
    expect(attackDamage(state.players[1]!)).toBe(12 + 6);
  });

  it('eliminates a player with no hero left and crowns the survivor', () => {
    const state = staged([], ['2♣', '3♦']);
    state.players[0]!.equipment = cards('9♣');
    act(state, { type: 'attack', targetIndex: 1, boostCardIds: [] });
    resolveDefense(state, { cardId: null });

    expect(state.players[1]!.out).toBe(true);
    expect(state.phase).toBe('over');
    expect(state.winnerIndex).toBe(0);
    expect(currentActor(state)).toBeNull();
    expect(act(state, { type: 'draw' }).ok).toBe(false);
  });
});

describe('multiplayer', () => {
  it('skips eliminated seats when the turn advances', () => {
    const state = createGame({
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      seed: 'three',
    });
    for (const [index, hero] of ['K♠', 'Q♠', 'J♠'].entries()) {
      state.players[index]!.hand = cards(hero);
      act(state, { type: 'playHero', cardId: card(hero).id });
    }
    state.players[1]!.out = true;
    act(state, { type: 'endTurn' });
    expect(state.turn.playerIndex).toBe(2);
  });

  it('names its target when more than one opponent is on the field', () => {
    const state = createGame({
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      seed: 'targets',
    });
    for (const [index, hero] of ['K♠', 'Q♠', 'J♠'].entries()) {
      state.players[index]!.hand = cards(hero);
      act(state, { type: 'playHero', cardId: card(hero).id });
    }
    const attacks = legalActions(state).filter((action) => action.type === 'attack');
    expect(attacks).toHaveLength(2);
    expect(act(state, { type: 'attack', targetIndex: 2, boostCardIds: [] }).ok).toBe(true);
    expect(state.pendingAttack!.defenderIndex).toBe(2);
  });

  it('refuses to attack yourself or an empty seat', () => {
    const state = staged([], []);
    expect(act(state, { type: 'attack', targetIndex: 0, boostCardIds: [] }).ok).toBe(false);
    expect(act(state, { type: 'attack', targetIndex: 9, boostCardIds: [] }).ok).toBe(false);
  });
});
