import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GAMES, getGame } from '@/games/registry';

describe('game catalogue', () => {
  it('lists Hero War as playable and Magic Hero War as planned', () => {
    expect(getGame('hero-war')).toMatchObject({ status: 'playable', href: '/hero-war' });
    expect(getGame('magic-hero-war')).toMatchObject({ status: 'planned', href: null });
  });

  it('gives every game a doc that actually exists in the repo', async () => {
    for (const game of GAMES) {
      const doc = await readFile(game.rulesPath, 'utf8');
      expect(doc.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids and sane player counts', () => {
    expect(new Set(GAMES.map((game) => game.id)).size).toBe(GAMES.length);
    for (const game of GAMES) {
      expect(game.minPlayers).toBeGreaterThanOrEqual(2);
      expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
    }
  });

  it('never points a planned game at a play route', () => {
    for (const game of GAMES.filter((entry) => entry.status === 'planned')) {
      expect(game.href).toBeNull();
    }
  });
});
