import { describe, expect, it } from 'vitest';
import { buildDeck, type Card } from '@/core/cards';
import {
  act,
  cellIndex,
  createGame,
  currentActor,
  legalActions,
  overshieldValue,
} from '@games/deck_arena/engine';
import { ACES_TO_WIN, HAND_LIMIT, MAX_HP, OVERHEAL_CAP, type ArenaState } from '@games/deck_arena/types';

const REFERENCE_DECK = buildDeck();
const card = (label: string): Card => {
  const found = REFERENCE_DECK.find((entry) => entry.label === label);
  if (!found) throw new Error(`No such card: ${label}`);
  return found;
};

function arena(names = ['Ada', 'Bo'], seed = 'abilities'): ArenaState {
  const state = createGame({ players: names.map((name) => ({ name })), seed });
  state.board.fill(null);
  for (const player of state.players) {
    player.hand = [];
    player.aces = [];
  }
  return state;
}

function place(state: ArenaState, index: number, x: number, y: number): void {
  Object.assign(state.players[index]!, { x, y });
}

function turnFor(state: ArenaState, index: number, actions = 2): void {
  state.orderIndex = state.order.indexOf(index);
  state.turn = { roll: actions === 1 ? 2 : 5, actionsLeft: actions, freeSearchUsed: false, freeReloads: false };
}

function equip(state: ArenaState, index: number, label: string): void {
  state.players[index]!.weapon = { card: card(label), loaded: true, revealed: false };
}

describe('opting in', () => {
  it('is on by default and can be switched off', () => {
    expect(createGame({ players: [{ name: 'A' }, { name: 'B' }], seed: 's' }).specialAbilities).toBe(
      true,
    );
    const plain = createGame({
      players: [{ name: 'A' }, { name: 'B' }],
      seed: 's',
      specialAbilities: false,
    });
    expect(plain.specialAbilities).toBe(false);
  });

  it('leaves face cards ordinary when switched off', () => {
    const state = createGame({
      players: [{ name: 'A' }, { name: 'B' }],
      seed: 'plain',
      specialAbilities: false,
    });
    state.board.fill(null);
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    state.players[seat]!.hp = 1;
    state.players[seat]!.hand = [card('K♥')];

    expect(act(state, { type: 'activateCard', cardId: card('K♥').id }).ok).toBe(true);
    expect(state.players[seat]!.hp).toBe(4); // a plain tier-3 heal
    expect(state.players[seat]!.regen).toBeNull();
  });
});

describe('club snipers', () => {
  it('J: strips protection and deals 1d6 straight to health at any range', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 6); // five cells away, further than any tiered range
    turnFor(state, me, 2);
    equip(state, me, 'J♣');
    Object.assign(state.players[them]!, { shield: 4, overshield: 2 });

    const options = legalActions(state).filter((action) => action.type === 'shoot');
    expect(options).toHaveLength(1);
    expect(act(state, options[0]!).ok).toBe(true);

    const victim = state.players[them]!;
    expect(victim.shield).toBe(0);
    expect(victim.overshield).toBe(0);
    expect(victim.hp).toBeLessThan(MAX_HP);
    expect(MAX_HP - victim.hp).toBeGreaterThanOrEqual(1);
    expect(MAX_HP - victim.hp).toBeLessThanOrEqual(6);
  });

  it('Q: wipes a shielded target and kills an unshielded one, two deep', () => {
    const state = arena(['Ada', 'Bo', 'Cy']);
    const [me, near, far] = [state.order[0]!, state.order[1]!, state.order[2]!];
    place(state, me, 3, 1);
    place(state, near, 3, 3);
    place(state, far, 3, 5);
    turnFor(state, me, 2);
    equip(state, me, 'Q♣');
    state.players[near]!.shield = 3;

    expect(act(state, { type: 'shoot', directions: ['south'] }).ok).toBe(true);
    expect(state.players[near]!.shield).toBe(0);
    expect(state.players[near]!.out).toBe(false);
    expect(state.players[far]!.out).toBe(true); // no protection: killed outright
  });

  it('Q: refuses anything but exactly one direction', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 3);
    turnFor(state, me, 2);
    equip(state, me, 'Q♣');

    expect(act(state, { type: 'shoot', targetIndex: them }).ok).toBe(false);
    expect(act(state, { type: 'shoot', directions: ['north'] }).ok).toBe(false); // nobody there
    expect(act(state, { type: 'shoot', directions: ['south', 'east'] }).ok).toBe(false);
  });

  it('K: scatters 6 damage over a cell and its flanks, in two directions', () => {
    const state = arena(['Ada', 'Bo', 'Cy', 'Di']);
    const [me, ahead, flank, behind] = [
      state.order[0]!,
      state.order[1]!,
      state.order[2]!,
      state.order[3]!,
    ];
    place(state, me, 3, 3);
    place(state, ahead, 3, 2); // one step north
    place(state, flank, 2, 2); // flanking the north cell
    place(state, behind, 3, 4); // one step south
    turnFor(state, me, 2);
    equip(state, me, 'K♣');

    expect(act(state, { type: 'shoot', directions: ['north', 'south'] }).ok).toBe(true);
    expect(state.players[ahead]!.out).toBe(true);
    expect(state.players[flank]!.out).toBe(true);
    expect(state.players[behind]!.out).toBe(true);
  });

  it('K: needs two different directions', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 3, 3);
    place(state, them, 3, 2);
    turnFor(state, me, 2);
    equip(state, me, 'K♣');
    expect(act(state, { type: 'shoot', directions: ['north', 'north'] }).ok).toBe(false);
    expect(act(state, { type: 'shoot', directions: ['north'] }).ok).toBe(false);
  });
});

describe('heart abilities', () => {
  it('J: full heal, then a rolled number of 1 hp ticks capped at 6', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hp = 1;
    me.hand = [card('J♥')];

    expect(act(state, { type: 'activateCard', cardId: card('J♥').id }).ok).toBe(true);
    expect(me.hp).toBe(MAX_HP);
    expect(me.regen).toMatchObject({ max: MAX_HP });
    expect(me.regen!.turnsLeft).toBeGreaterThanOrEqual(1);
    expect(me.regen!.turnsLeft).toBeLessThanOrEqual(6);

    me.hp = 3;
    act(state, { type: 'endTurn' });
    act(state, { type: 'endTurn' }); // back around to this seat
    expect(me.hp).toBe(4);
  });

  it('Q: ticks past the normal cap, up to twelve', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hp = 2;
    me.hand = [card('Q♥')];

    act(state, { type: 'activateCard', cardId: card('Q♥').id });
    expect(me.hp).toBe(MAX_HP);
    expect(me.regen).toMatchObject({ max: OVERHEAL_CAP });

    me.regen!.turnsLeft = 6;
    act(state, { type: 'endTurn' });
    act(state, { type: 'endTurn' });
    expect(me.hp).toBe(MAX_HP + 1);
  });

  it('K: cannot be played, and answers a killing blow by itself', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    turnFor(state, me, 2);
    equip(state, me, '10♣'); // 3 damage
    const victim = state.players[them]!;
    victim.hp = 1;
    victim.hand = [card('K♥')];

    expect(legalActions(state).some((action) => action.type === 'activateCard')).toBe(false);

    act(state, { type: 'shoot', targetIndex: them });
    expect(victim.out).toBe(false);
    expect(victim.hp).toBe(MAX_HP);
    expect(victim.hand).toHaveLength(0);
    expect(state.log.some((line) => line.includes('K♥'))).toBe(true);
  });
});

describe('overshields', () => {
  it('are worth 2, 4 and 6', () => {
    expect([overshieldValue(card('J♠')), overshieldValue(card('Q♠')), overshieldValue(card('K♠'))]).toEqual(
      [2, 4, 6],
    );
  });

  it('sit alongside armor and never spill damage onto it', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    turnFor(state, them, 2);
    const victim = state.players[them]!;
    victim.hand = [card('J♠')];
    victim.shield = 5;

    act(state, { type: 'activateCard', cardId: card('J♠').id });
    expect(victim.overshield).toBe(2);
    expect(victim.shield).toBe(5);

    act(state, { type: 'endTurn' });
    turnFor(state, me, 2);
    equip(state, me, '10♣'); // 3 damage into a 2 point overshield
    act(state, { type: 'shoot', targetIndex: them });

    expect(victim.overshield).toBe(0);
    expect(victim.shield).toBe(5); // the extra damage is lost, not carried
    expect(victim.hp).toBe(MAX_HP);
  });

  it('keep the better of two', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hand = [card('K♠'), card('J♠')];
    act(state, { type: 'activateCard', cardId: card('K♠').id });
    act(state, { type: 'activateCard', cardId: card('J♠').id });
    expect(me.overshield).toBe(6);
  });
});

describe('diamond abilities', () => {
  it('J: a free step, playable on someone else’s turn', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 3, 3);
    place(state, them, 6, 6);
    turnFor(state, them, 2); // it is the other seat's turn
    state.players[me]!.hand = [card('J♦')];

    const result = act(state, { type: 'activateCard', cardId: card('J♦').id, direction: 'west' }, me);
    expect(result.ok).toBe(true);
    expect([state.players[me]!.x, state.players[me]!.y]).toEqual([2, 3]);
    expect(state.turn.actionsLeft).toBe(2); // the turn player keeps their budget
    expect(currentActor(state)).toBe(them);
  });

  it('J: nothing else may be played out of turn', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    turnFor(state, them, 2);
    state.players[me]!.hand = [card('Q♦'), card('5♥')];
    expect(act(state, { type: 'activateCard', cardId: card('5♥').id }, me).ok).toBe(false);
    expect(act(state, { type: 'move', direction: 'north' }, me).ok).toBe(false);
  });

  it('Q: teleports anywhere unoccupied, for free', () => {
    const state = arena();
    const [me, them] = [state.order[0]!, state.order[1]!];
    place(state, me, 1, 1);
    place(state, them, 6, 6);
    turnFor(state, me, 1);
    state.players[me]!.hand = [card('Q♦')];

    expect(act(state, { type: 'activateCard', cardId: card('Q♦').id, to: { x: 6, y: 6 } }).ok).toBe(
      false,
    );
    expect(act(state, { type: 'activateCard', cardId: card('Q♦').id, to: { x: 5, y: 6 } }).ok).toBe(
      true,
    );
    expect([state.players[me]!.x, state.players[me]!.y]).toEqual([5, 6]);
    expect(state.turn.actionsLeft).toBe(1);
  });

  it('K: grants an action and free reloads for the turn', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 1);
    state.players[seat]!.hand = [card('K♦')];
    equip(state, seat, '5♣');
    state.players[seat]!.weapon!.loaded = false;

    act(state, { type: 'activateCard', cardId: card('K♦').id });
    expect(state.turn.actionsLeft).toBe(2);
    expect(state.turn.freeReloads).toBe(true);

    const reload = legalActions(state).find((action) => action.type === 'reload');
    expect(reload?.cost).toBe(0);
    act(state, { type: 'reload' });
    expect(state.turn.actionsLeft).toBe(2);
  });

  it('every diamond is free to play, face card or not', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 1);
    state.players[seat]!.hand = [card('2♦')];
    const option = legalActions(state).find((action) => action.type === 'activateCard');
    expect(option?.cost).toBe(0);
    act(state, { type: 'activateCard', cardId: card('2♦').id });
    expect(state.turn.actionsLeft).toBe(2); // spent nothing, gained one
  });
});

describe('aces', () => {
  it('go face up on search and pull a replacement from the pile', () => {
    const state = arena();
    const seat = state.order[0]!;
    place(state, seat, 2, 2);
    turnFor(state, seat, 2);
    state.board[cellIndex({ x: 2, y: 2 })] = card('A♠');
    state.pile = [card('7♥')];

    expect(act(state, { type: 'search' }).ok).toBe(true);
    const me = state.players[seat]!;
    expect(me.aces.map((entry) => entry.label)).toEqual(['A♠']);
    expect(me.hand.map((entry) => entry.label)).toEqual(['7♥']);
    expect(state.pile).toHaveLength(0);
  });

  it('do not count against the hand limit', () => {
    const state = arena();
    const seat = state.order[0]!;
    place(state, seat, 2, 2);
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hand = [card('2♥'), card('3♥'), card('4♥')];
    me.aces = [card('A♠'), card('A♥')];
    state.board[cellIndex({ x: 2, y: 2 })] = card('5♥');

    expect(me.hand).toHaveLength(HAND_LIMIT);
    expect(legalActions(state).some((action) => action.type === 'search')).toBe(false);
    expect(me.aces).toHaveLength(2);
  });

  it('can be spent for their face value, giving up the set', () => {
    const state = arena();
    const seat = state.order[0]!;
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.hp = 4;
    me.aces = [card('A♥')];

    const option = legalActions(state).find(
      (action) => action.type === 'activateCard' && action.cardId === card('A♥').id,
    );
    expect(option?.label).toContain('heal 1');
    act(state, { type: 'activateCard', cardId: card('A♥').id });
    expect(me.hp).toBe(5);
    expect(me.aces).toHaveLength(0);
  });

  it('win the game outright once all four are face up', () => {
    const state = arena();
    const seat = state.order[0]!;
    place(state, seat, 2, 2);
    turnFor(state, seat, 2);
    const me = state.players[seat]!;
    me.aces = [card('A♠'), card('A♥'), card('A♦')];
    state.board[cellIndex({ x: 2, y: 2 })] = card('A♣');

    act(state, { type: 'search' });
    expect(me.aces).toHaveLength(ACES_TO_WIN);
    expect(state.phase).toBe('over');
    expect(state.winnerIndex).toBe(seat);
  });

  it('stay in hand when abilities are off', () => {
    const state = createGame({
      players: [{ name: 'A' }, { name: 'B' }],
      seed: 'plain-aces',
      specialAbilities: false,
    });
    state.board.fill(null);
    const seat = state.order[0]!;
    const me = state.players[seat]!;
    me.hand = [];
    me.aces = [];
    place(state, seat, 2, 2);
    turnFor(state, seat, 2);
    state.board[cellIndex({ x: 2, y: 2 })] = card('A♠');

    act(state, { type: 'search' });
    expect(me.aces).toHaveLength(0);
    expect(me.hand.map((entry) => entry.label)).toEqual(['A♠']);
  });
});

describe('looting a kill', () => {
  it('hands the dead player’s cards to the killer, who must discard to three', () => {
    const state = arena(['Ada', 'Bo', 'Cy']);
    const [me, them, other] = [state.order[0]!, state.order[1]!, state.order[2]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    place(state, other, 6, 6);
    turnFor(state, me, 2);
    equip(state, me, '10♣');
    const killer = state.players[me]!;
    const victim = state.players[them]!;
    killer.hand = [card('2♥'), card('3♥')];
    victim.hp = 1;
    victim.hand = [card('4♥'), card('5♥')];
    victim.aces = [card('A♠')];
    victim.weapon = { card: card('9♣'), loaded: true, revealed: true };

    act(state, { type: 'shoot', targetIndex: them });

    expect(victim.out).toBe(true);
    expect(killer.hand).toHaveLength(4);
    expect(state.pendingDiscard).toBe(me);
    // What the dead player had in play goes back to the pile, not to the killer.
    expect(state.pile.some((entry) => entry.label === '9♣')).toBe(true);
    expect(state.pile.some((entry) => entry.label === 'A♠')).toBe(true);

    // Nothing else is legal until the hand is back to the limit.
    expect(legalActions(state).every((action) => action.type === 'discard')).toBe(true);
    expect(act(state, { type: 'endTurn' }).ok).toBe(false);

    act(state, { type: 'discard', cardId: card('2♥').id });
    expect(state.pendingDiscard).toBeNull();
    expect(killer.hand).toHaveLength(HAND_LIMIT);
    expect(legalActions(state).some((action) => action.type === 'endTurn')).toBe(true);
  });

  it('routes looted aces straight to the face-up set', () => {
    const state = arena(['Ada', 'Bo', 'Cy']);
    const [me, them, other] = [state.order[0]!, state.order[1]!, state.order[2]!];
    place(state, me, 1, 1);
    place(state, them, 1, 2);
    place(state, other, 6, 6);
    turnFor(state, me, 2);
    equip(state, me, '10♣');
    state.pile = [];
    const victim = state.players[them]!;
    victim.hp = 1;
    victim.hand = [card('A♦')];

    act(state, { type: 'shoot', targetIndex: them });
    expect(state.players[me]!.aces.map((entry) => entry.label)).toEqual(['A♦']);
    expect(state.pendingDiscard).toBeNull();
  });
});
