/** Hand-rolled request parsing — the API surface is small enough not to need a schema library. */

import type { HeroWarAction } from '@games/hero_war/types';
import { GameError } from './game-error';
import type { NewGameRequest } from './hero-war-store';

type Json = Record<string, unknown>;

function asObject(input: unknown, what: string): Json {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameError(`Malformed ${what}.`);
  }
  return input as Json;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new GameError(`Missing ${what}.`);
  return value;
}

function asIndex(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new GameError(`Missing ${what}.`);
  }
  return value;
}

export function parseSeat(value: unknown): number {
  const seat = typeof value === 'string' ? Number(value) : value;
  return asIndex(seat, 'seat');
}

export function parseNewGame(input: unknown): NewGameRequest {
  const body = asObject(input, 'new game request');
  const players = body.players;
  if (!Array.isArray(players)) throw new GameError('A game needs a list of players.');
  const request: NewGameRequest = {
    players: players.map((player) => {
      const entry = asObject(player, 'player');
      return { name: String(entry.name ?? ''), isBot: Boolean(entry.isBot) };
    }),
  };
  if (typeof body.seed === 'string' && body.seed.trim()) request.seed = body.seed.trim().slice(0, 64);
  if (typeof body.deckCount === 'number') {
    if (![1, 2, 3, 4].includes(body.deckCount)) throw new GameError('Use 1–4 decks.');
    request.deckCount = body.deckCount;
  }
  return request;
}

export function parseAction(input: unknown): HeroWarAction {
  const body = asObject(input, 'action');
  const type = asString(body.type, 'action type');

  switch (type) {
    case 'draw':
    case 'endTurn':
      return { type };
    case 'playHero':
    case 'equip':
    case 'spadeTrade':
      return { type, cardId: asString(body.cardId, 'card') };
    case 'spadeSabotage':
      return {
        type,
        cardId: asString(body.cardId, 'card'),
        targetIndex: asIndex(body.targetIndex, 'target'),
        clubId: asString(body.clubId, 'equipment'),
      };
    case 'attack': {
      const boosts = body.boostCardIds;
      if (boosts !== undefined && !Array.isArray(boosts)) throw new GameError('Malformed boosts.');
      return {
        type,
        targetIndex: asIndex(body.targetIndex, 'target'),
        boostCardIds: (boosts ?? []).map((id) => asString(id, 'boost card')),
      };
    }
    default:
      throw new GameError(`Unknown action: ${type}`);
  }
}

export function parseDefense(input: unknown): { seat: number; cardId: string | null } {
  const body = asObject(input, 'defense');
  const cardId = body.cardId;
  if (cardId !== null && cardId !== undefined && typeof cardId !== 'string') {
    throw new GameError('Malformed defense card.');
  }
  return { seat: parseSeat(body.seat), cardId: (cardId as string | null) ?? null };
}
