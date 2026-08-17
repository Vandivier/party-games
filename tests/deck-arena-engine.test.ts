import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import {
  act,
  cardAt,
  cellIndex,
  createGame,
  currentActor,
  energyFrom,
  legalActions,
  shotsAvailable,
  tierOf,
  weaponDamage,
  weaponRange,
} from '@games/deck_arena/engine';
import { HAND_LIMIT, MAX_HP, MAX_SHIELD, type ArenaState } from '@games/deck_arena/types';

const REFERENCE_DECK = buildDeck();
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};

/** These tests cover the plain game; abilities live in deck-arena-abilities. */
function arena(seed = 'arena', names = ['Ada', 'Bo']): ArenaState {
  return createGame({ players: names.map((name) => ({ name })), seed, specialAbilities: false });
}

/** Put the arena in a known shape: empty floor, chosen positions, whose turn. */
function staged(seed = 'arena', names = ['Ada', 'Bo']): ArenaState {
  const state = arena(seed, names);
  state.board.fill(null);
  for (const player of state.players) player.hand = [];
  return state;
}

function place(state: ArenaState, index: number, x: number, y: number): void {
  const player = state.players[index];
  if (!player) throw new Error(`No seat ${index}`);
  player.x = x;
  player.y = y;
}

function turnFor(state: ArenaState, index: number, actions = 2): void {
  state.orderIndex = state.order.indexOf(index);
  state.turn = { roll: actions === 1 ? 2 : 5, actionsLeft: actions, freeSearchUsed: false, freeReloads: false };
}

function putCard(state: ArenaState, x: number, y: number, label: string): void {
  state.board[cellIndex({ x, y })] = card(label);
}

function equip(state: ArenaState, index: number, label: string, loaded = true): void {
  const player = state.players[index];
  if (!player) throw new Error(`No seat ${index}`);
  player.weapon = { card: card(label), loaded, revealed: false };
}

describe('the value table', () => {
  it('tiers cards A–4, 5–9, 10–K', () => {
    expect([1, 4].map((value) => tierOf(card(value === 1 ? 'A♣' : '4♣')))).toEqual([1, 1]);
    expect(tierOf(card('5♣'))).toBe(2);
    expect(tierOf(card('9♣'))).toBe(2);
    expect(tierOf(card('10♣'))).toBe(3);
    expect(tierOf(card('K♣'))).toBe(3);
  });

  it('turns tiers into damage and range', () => {
    expect([weaponDamage(card('3♣')), weaponRange(card('3♣'))]).toEqual([1, 2]);
    expect([weaponDamage(card('7♣')), weaponRange(card('7♣'))]).toEqual([2, 4]);
    expect([weaponDamage(card('K♣')), weaponRange(card('K♣'))]).toEqual([3, 6]);
  });

  it('gives diamonds their authored energy', () => {
    expect(energyFrom(card('A♦'))).toBe(1);
    expect(energyFrom(card('6♦'))).toBe(1);
    expect(energyFrom(card('7♦'))).toBe(2);
    expect(energyFrom(card('K♦'))).toBe(2);
  });
});

describe('setup', () => {
  it('deals 36 cards to the map and sets 16 aside', () => {
    const state = arena();
    const onBoard = state.board.filter(Boolean).length;
    // Every player has already picked up their spawn card.
    expect(onBoard + state.players.length).toBe(36);
    expect(state.pile).toHaveLength(16);
  });

  it('starts everyone at full health with one card and no weapon', () => {
    const state = arena('start', ['Ada', 'Bo', 'Cy']);
    for (const player of state.players) {
      expect(player.hp).toBe(MAX_HP);
      expect(player.shield).toBe(0);
      expect(player.hand).toHaveLength(1);
      expect(player.weapon).toBeNull();
      expect(player.x).toBeGreaterThanOrEqual(1);
      expect(player.x).toBeLessThanOrEqual(6);
      expect(player.y).toBeGreaterThanOrEqual(1);
      expect(player.y).toBeLessThanOrEqual(6);
    }
  });

  it('never spawns two players on or next to each other', () => {
    for (let seed = 0; seed < 30; seed++) {
      const state = createGame({
        players: Array.from({ length: 8 }, (_, i) => ({ name: `P${i}` })),
        seed: `spawn-${seed}`,
        specialAbilities: false,
      });
      for (const a of state.players) {
        for (const b of state.players) {
          if (a.index === b.index) continue;
          const distance = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          expect(distance).toBeGreaterThan(1);
        }
      }
    }
  });

  it('rolls a turn order covering every seat exactly once', () => {
    const state = arena('order', ['Ada', 'Bo', 'Cy', 'Di']);
    expect([...state.order].sort()).toEqual([0, 1, 2, 3]);
    expect(currentActor(state)).toBe(state.order[0]);
    expect(state.log.some((line) => line.startsWith('Turn order:'))).toBe(true);
  });

  it('opens a turn with an action roll worth one or two actions', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = arena(`roll-${seed}`);
      expect(state.turn.roll).toBeGreaterThanOrEqual(1);
      expect(state.turn.roll).toBeLessThanOrEqual(6);
      expect(state.turn.actionsLeft).toBe(state.turn.roll <= 3 ? 1 : 2);
    }
  });

  it('never names a hidden card in the log', () => {
    const state = arena('secrets');
    const labels = REFERENCE_DECK.map((entry) => entry.label);
    for (const line of state.log) {
      expect(labels.some((label) => line.includes(label))).toBe(false);
    }
  });
});

describe('moving', () => {
  it('spends an action to step one cell', () => {
    const state = staged();
    place(state, state.order[0]!, 3, 3);
    place(state, state.order[1]!, 6, 6);
    turnFor(state, state.order[0]!, 2);
    const me = state.players[state.order[0]!]!;

    expect(act(state, { type: 'move', direction: 'north' }).ok).toBe(true);
    expect([me.x, me.y]).toEqual([3, 2]);
    expect(state.turn.actionsLeft).toBe(1);
  });

  it('refuses to walk off the board or through another player', () => {
    const state = staged();
    place(state, state.order[0]!, 1, 1);
    place(state, state.order[1]!, 2, 1);
    turnFor(state, state.order[0]!, 2);

    expect(act(state, { type: 'move', direction: 'north' }).ok).toBe(false);
    expect(act(state, { type: 'move', direction: 'west' }).ok).toBe(false);
    const blocked = act(state, { type: 'move', direction: 'east' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toMatch(/standing there/);
    expect(state.turn.actionsLeft).toBe(2);
  });

  it('stops moving once the actions run out', () => {
    const state = staged();
    place(state, state.order[0]!, 3, 3);
    place(state, state.order[1]!, 6, 6);
    turnFor(state, state.order[0]!, 1);

    expect(act(state, { type: 'move', direction: 'south' }).ok).toBe(true);
    expect(act(state, { type: 'move', direction: 'south' }).ok).toBe(false);
    expect(legalActions(state).some((action) => action.type === 'move')).toBe(false);
  });
});

describe('searching', () => {
  it('is free once a turn, then costs an action', () => {
    const state = staged();
    const seat = state.order[0]!;
    place(state, seat, 2, 2);
    place(state, state.order[1]!, 6, 6);
    turnFor(state, seat, 2);
    putCard(state, 2, 2, '9♣');

    const free = legalActions(state).find((action) => action.type === 'search');
    expect(free?.cost).toBe(0);
    expect(act(state, { type: 'search' }).ok).toBe(true);
    expect(state.turn.actionsLeft).toBe(2);
    expect(state.players[seat]!.hand.map((entry) => entry.label)).toEqual(['9♣']);
    expect(cardAt(state, { x: 2, y: 2 })).toBeNull();

    putCard(state, 2, 2, '4♥');
    const again = legalActions(state).find((action) => action.type === 'search');
    expect(again?.cost).toBe(1);
    expect(act(state, { type: 'search' }).ok).toBe(true);
    expect(state.turn.actionsLeft).toBe(1);
  });

  it('needs a card underfoot and room in hand', () => {
    const state = staged();
    const seat = state.order[0]!;
    place(state, seat, 2, 2);
    place(state, state.order[1]!, 6, 6);
    turnFor(state, seat, 2);

    expect(act(state, { type: 'search' }).ok).toBe(false);

    putCard(state, 2, 2, '9♣');
    state.players[seat]!.hand = [card('2♥'), card('3♥'), card('4♥')];
    expect(state.players[seat]!.hand).toHaveLength(HAND_LIMIT);
    const result = act(state, { type: 'search' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/hand is full/);
    expect(legalActions(state).some((action) => action.type === 'search')).toBe(false);

    expect(act(state, { type: 'discard', cardId: card('2♥').id }).ok).toBe(true);
    expect(act(state, { type: 'search' }).ok).toBe(true);
  });
});

describe('cards in hand', () => {
  it('equips a club face down and loaded, dumping the old weapon', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    equip(state, seat, '3♣');
    me.hand = [card('K♣')];

    expect(act(state, { type: 'activateCard', cardId: card('K♣').id }).ok).toBe(true);
    expect(me.weapon).toMatchObject({ loaded: true, revealed: false });
    expect(me.weapon!.card.label).toBe('K♣');
    expect(state.pile.some((entry) => entry.label === '3♣')).toBe(true);
    expect(state.turn.actionsLeft).toBe(1);
    expect(state.log.some((line) => line.includes('face down'))).toBe(true);
    expect(state.log.some((line) => line.includes('K♣'))).toBe(false);
  });

  it('heals with hearts up to the cap', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hp = 2;
    me.hand = [card('K♥'), card('2♥')];

    expect(act(state, { type: 'activateCard', cardId: card('K♥').id }).ok).toBe(true);
    expect(me.hp).toBe(5);
    expect(act(state, { type: 'activateCard', cardId: card('2♥').id }).ok).toBe(true);
    expect(me.hp).toBe(MAX_HP);
  });

  it('offers no heart when already at full health', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    state.players[seat]!.hand = [card('K♥')];
    expect(legalActions(state).some((action) => action.type === 'activateCard')).toBe(false);
  });

  it('adds shield with spades up to the cap', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hand = [card('K♠'), card('9♠')];

    act(state, { type: 'activateCard', cardId: card('K♠').id });
    expect(me.shield).toBe(3);
    me.shield = MAX_SHIELD - 1;
    act(state, { type: 'activateCard', cardId: card('9♠').id });
    expect(me.shield).toBe(MAX_SHIELD);
  });

  it('burns diamonds for free actions', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 1);
    const me = state.players[seat]!;
    me.hand = [card('3♦'), card('J♦')];

    const energy = legalActions(state).find(
      (action) => action.type === 'activateCard' && action.cardId === card('3♦').id,
    );
    expect(energy?.cost).toBe(0);
    act(state, { type: 'activateCard', cardId: card('3♦').id });
    expect(state.turn.actionsLeft).toBe(2);
    act(state, { type: 'activateCard', cardId: card('J♦').id });
    expect(state.turn.actionsLeft).toBe(4);
    expect(me.hand).toHaveLength(0);
  });

  it('discards for free at any time', () => {
    const state = staged();
    const seat = state.order[0]!;
    turnFor(state, seat, 1);
    state.players[seat]!.hand = [card('8♥')];
    expect(act(state, { type: 'discard', cardId: card('8♥').id }).ok).toBe(true);
    expect(state.turn.actionsLeft).toBe(1);
    expect(state.pile.some((entry) => entry.label === '8♥')).toBe(true);
  });
});

describe('shooting', () => {
  it('hits along a row within range, spending ammo and revealing the weapon', () => {
    const state = staged();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 3);
    place(state, them, 4, 3);
    turnFor(state, me, 2);
    equip(state, me, '7♣'); // 2 damage, range 4

    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(true);
    expect(state.players[them]!.hp).toBe(MAX_HP - 2);
    expect(state.players[me]!.weapon).toMatchObject({ loaded: false, revealed: true });
    expect(state.turn.actionsLeft).toBe(1);
  });

  it('cannot shoot diagonally, out of range, or through a body', () => {
    const state = staged('block', ['Ada', 'Bo', 'Cy']);
    const [me, them, blocker] = [state.order[0]!, state.order[1]!, state.order[2]!];
    place(state, me, 1, 1);
    place(state, them, 3, 3);
    place(state, blocker, 6, 6);
    turnFor(state, me, 2);
    equip(state, me, 'K♣'); // range 6

    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(false); // diagonal

    place(state, them, 1, 5);
    expect(shotsAvailable(state, state.players[me]!)).toHaveLength(1);
    place(state, blocker, 1, 3);
    expect(shotsAvailable(state, state.players[me]!).map((shot) => shot.target.index)).toEqual([
      blocker,
    ]);
    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(false); // blocked

    place(state, blocker, 6, 6);
    equip(state, me, '3♣'); // range 2, target is 4 away
    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(false);
  });

  it('takes shield off first', () => {
    const state = staged();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    turnFor(state, me, 2);
    equip(state, me, 'K♣'); // 3 damage
    state.players[them]!.shield = 2;

    act(state, { type: 'shoot', targetIndex: them });
    expect(state.players[them]!.shield).toBe(0);
    expect(state.players[them]!.hp).toBe(MAX_HP - 1);
  });

  it('needs a reload after each shot, and gets one free at end of turn', () => {
    const state = staged();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    turnFor(state, me, 2);
    equip(state, me, '2♣');

    act(state, { type: 'shoot', targetIndex: them });
    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(false);
    expect(legalActions(state).some((action) => action.type === 'reload')).toBe(true);
    expect(act(state, { type: 'reload' }).ok).toBe(true);
    expect(state.players[me]!.weapon!.loaded).toBe(true);
    expect(state.turn.actionsLeft).toBe(0);

    act(state, { type: 'shoot', targetIndex: them }); // no actions left
    expect(state.players[me]!.weapon!.loaded).toBe(true);

    equip(state, me, '2♣', false);
    act(state, { type: 'endTurn' });
    expect(state.players[me]!.weapon!.loaded).toBe(true);
  });

  it('knocks a player out at zero health and crowns the survivor', () => {
    const state = staged();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    turnFor(state, me, 2);
    equip(state, me, 'K♣');
    const victim = state.players[them]!;
    victim.hp = 2;
    victim.hand = [card('5♥')];

    act(state, { type: 'shoot', targetIndex: them });
    expect(victim.out).toBe(true);
    expect(victim.hand).toHaveLength(0);
    // The killer takes what the dead player was holding.
    expect(state.players[me]!.hand.map((entry) => entry.label)).toContain('5♥');
    expect(state.phase).toBe('over');
    expect(state.winnerIndex).toBe(me);
    expect(currentActor(state)).toBeNull();
    expect(legalActions(state)).toEqual([]);
    expect(act(state, { type: 'endTurn' }).ok).toBe(false);
  });
});

describe('rounds', () => {
  it('passes the turn in rolled order and replenishes at the end of the round', () => {
    const state = staged('rounds', ['Ada', 'Bo', 'Cy']);
    state.pile = [card('2♥'), card('3♥')];
    expect(currentActor(state)).toBe(state.order[0]);

    act(state, { type: 'endTurn' });
    expect(currentActor(state)).toBe(state.order[1]);
    act(state, { type: 'endTurn' });
    expect(currentActor(state)).toBe(state.order[2]);
    expect(state.round).toBe(1);

    act(state, { type: 'endTurn' });
    expect(currentActor(state)).toBe(state.order[0]);
    expect(state.round).toBe(2);
    // The board was emptied by the staging helper, so both pile cards land on it.
    expect(state.board.filter(Boolean)).toHaveLength(2);
    expect(state.pile).toHaveLength(0);
    expect(state.log.some((line) => line.includes('replenish'))).toBe(true);
  });

  it('skips knocked-out players when the turn comes round', () => {
    const state = staged('skip', ['Ada', 'Bo', 'Cy']);
    const secondSeat = state.order[1]!;
    state.players[secondSeat]!.out = true;

    act(state, { type: 'endTurn' });
    expect(currentActor(state)).toBe(state.order[2]);
  });
});
