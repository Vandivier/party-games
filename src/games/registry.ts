import type { GameDefinition } from '@/core/game-definition';
import { deckArena } from '@games/deck_arena';
import { heroWar } from '@games/hero_war';
import { magicHeroWar } from '@games/magic_hero_war';

/** Every game the app knows about. Add new games here. */
export const GAMES: readonly GameDefinition[] = [heroWar, deckArena, magicHeroWar];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
