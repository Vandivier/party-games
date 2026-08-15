import type { GameDefinition } from '@/core/game-definition';
import { heroWar } from '@games/hero_war';

/** Every game the app knows about. Add new games here. */
export const GAMES: readonly GameDefinition[] = [heroWar];

export function getGame(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
