import type { GameDefinition } from '@/core/game-definition';

export const heroWar: GameDefinition = {
  id: 'hero-war',
  name: 'Hero War',
  blurb:
    'War with a hero on the field: face cards fight, clubs are equipment, hearts nullify, ' +
    'diamonds burst, spades sabotage.',
  minPlayers: 2,
  maxPlayers: 8,
  props: ['1–2 standard poker decks'],
  rulesPath: 'games/hero_war/RULES.md',
  href: '/hero-war',
  docsHref: '/hero-war/rules',
  status: 'playable',
};

export * from './types';
export * from './engine';
export * from './bot';
export * from './view';
