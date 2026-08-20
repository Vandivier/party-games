/** Request parsing for the Cards Against AI API. */

import type { CaaAction } from '@games/cards_against_ai/types';
import { GameError } from './game-error';
import type { NewGameRequest } from './cards-against-ai-store';

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

export function parseNewGame(input: unknown): NewGameRequest {
  const body = asObject(input, 'new game request');
  if (!Array.isArray(body.players)) throw new GameError('A game needs a list of players.');
  const request: NewGameRequest = {
    players: body.players.map((player) => {
      const entry = asObject(player, 'player');
      return { name: String(entry.name ?? ''), isBot: Boolean(entry.isBot) };
    }),
  };
  if (typeof body.seed === 'string' && body.seed.trim()) request.seed = body.seed.trim().slice(0, 64);
  if (typeof body.targetScore === 'number') {
    if (!Number.isInteger(body.targetScore) || body.targetScore < 1 || body.targetScore > 20) {
      throw new GameError('Play to somewhere between 1 and 20 points.');
    }
    request.targetScore = body.targetScore;
  }
  return request;
}

export function parseAction(input: unknown): CaaAction {
  const body = asObject(input, 'action');
  const type = asString(body.type, 'action type');

  switch (type) {
    case 'submit':
      return { type, cardId: asString(body.cardId, 'card') };
    case 'vote':
      return { type, submissionId: asString(body.submissionId, 'card') };
    case 'nextRound':
      return { type };
    default:
      throw new GameError(`Unknown action: ${type}`);
  }
}
