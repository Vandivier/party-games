import type { GameDefinition } from '@/core/game-definition';

export const deckArena: GameDefinition = {
  id: 'deck-arena',
  name: 'Deck Arena',
  blurb:
    'A 6x6 arena dealt face down from one poker deck. Roll for actions, loot the floor, equip ' +
    'clubs as weapons, and shoot down the row. Optional face-card abilities add snipers, ' +
    'shotguns, regen, overshields and teleports — last player standing wins, or whoever ' +
    'collects all four aces.',
  minPlayers: 2,
  maxPlayers: 8,
  props: ['1 standard poker deck', '2 d6 per player (health and shield)'],
  rulesPath: 'games/deck_arena/RULES.md',
  href: '/deck-arena',
  docsHref: '/deck-arena/rules',
  status: 'playable',
};

export * from './types';
export * from './engine';
export * from './bot';
export * from './view';
