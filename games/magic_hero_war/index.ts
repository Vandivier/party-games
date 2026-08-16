import type { GameDefinition } from '@/core/game-definition';

/**
 * Placeholder entry — see ./CONCEPT.md. There is no engine, and the catalogue
 * has no directory yet; both arrive with the first playable version.
 */
export const magicHeroWar: GameDefinition = {
  id: 'magic-hero-war',
  name: 'Magic Hero War',
  blurb:
    'Hero War gone wide: real spells, a party of heroes on the field at once, three or more ' +
    'players, and decks with distinct identities mapped onto ordinary poker cards.',
  minPlayers: 2,
  maxPlayers: 6,
  props: ['1 standard poker deck per player', 'printed deck maps', 'd6 and d20'],
  rulesPath: 'games/magic_hero_war/CONCEPT.md',
  href: null,
  docsHref: '/magic-hero-war',
  status: 'planned',
};
