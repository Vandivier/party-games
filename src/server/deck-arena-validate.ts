/** Request parsing for the Deck Arena API. */

import type { ArenaAction, Direction } from '@games/deck_arena/types';
import { GameError } from './game-error';
import type { NewArenaRequest } from './deck-arena-store';

const DIRECTIONS = new Set<string>(['north', 'south', 'east', 'west']);

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

export function parseNewArena(input: unknown): NewArenaRequest {
  const body = asObject(input, 'new game request');
  if (!Array.isArray(body.players)) throw new GameError('A game needs a list of players.');
  const request: NewArenaRequest = {
    players: body.players.map((player) => {
      const entry = asObject(player, 'player');
      return { name: String(entry.name ?? ''), isBot: Boolean(entry.isBot) };
    }),
  };
  if (typeof body.seed === 'string' && body.seed.trim()) request.seed = body.seed.trim().slice(0, 64);
  if (typeof body.specialAbilities === 'boolean') request.specialAbilities = body.specialAbilities;
  return request;
}

function parsePosition(input: unknown): { x: number; y: number } {
  const body = asObject(input, 'cell');
  const { x, y } = body;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) {
    throw new GameError('Malformed cell.');
  }
  return { x, y };
}

export function parseArenaAction(input: unknown): ArenaAction {
  const body = asObject(input, 'action');
  const type = asString(body.type, 'action type');

  switch (type) {
    case 'search':
    case 'reload':
    case 'endTurn':
      return { type };
    case 'move': {
      const direction = asString(body.direction, 'direction');
      if (!DIRECTIONS.has(direction)) throw new GameError(`Unknown direction: ${direction}`);
      return { type, direction: direction as Direction };
    }
    case 'discard':
      return { type, cardId: asString(body.cardId, 'card') };
    case 'activateCard': {
      const action: ArenaAction = { type, cardId: asString(body.cardId, 'card') };
      if (body.direction !== undefined) {
        const direction = asString(body.direction, 'direction');
        if (!DIRECTIONS.has(direction)) throw new GameError(`Unknown direction: ${direction}`);
        action.direction = direction as Direction;
      }
      if (body.to !== undefined) action.to = parsePosition(body.to);
      return action;
    }
    case 'shoot': {
      const action: ArenaAction = { type };
      if (body.targetIndex !== undefined) {
        const target = body.targetIndex;
        if (typeof target !== 'number' || !Number.isInteger(target) || target < 0) {
          throw new GameError('Missing target.');
        }
        action.targetIndex = target;
      }
      if (body.directions !== undefined) {
        if (!Array.isArray(body.directions) || body.directions.length > 2) {
          throw new GameError('Malformed directions.');
        }
        action.directions = body.directions.map((entry) => {
          const direction = asString(entry, 'direction');
          if (!DIRECTIONS.has(direction)) throw new GameError(`Unknown direction: ${direction}`);
          return direction as Direction;
        });
      }
      if (action.targetIndex === undefined && !action.directions) throw new GameError('Missing target.');
      return action;
    }
    default:
      throw new GameError(`Unknown action: ${type}`);
  }
}
