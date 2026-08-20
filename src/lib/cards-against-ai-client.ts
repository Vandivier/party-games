/** Typed fetch wrappers for the Cards Against AI API. */

import type { CaaAction } from '@games/cards_against_ai/types';
import type { CaaView } from '@games/cards_against_ai/view';
import type { SeatInfo } from '@/server/cards-against-ai-store';

export interface NewGameInput {
  players: { name: string; isBot: boolean }[];
  seed?: string;
  targetScore?: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? `Request failed (${response.status}).`);
  }
  return payload;
}

export function createGame(input: NewGameInput): Promise<{ view: CaaView; seats: SeatInfo[] }> {
  return request('/api/cards-against-ai', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchView(gameId: string, seat: number): Promise<{ view: CaaView }> {
  return request(`/api/cards-against-ai/${gameId}?seat=${seat}`);
}

export function sendAction(
  gameId: string,
  seat: number,
  action: CaaAction,
): Promise<{ view: CaaView }> {
  return request(`/api/cards-against-ai/${gameId}/action`, {
    method: 'POST',
    body: JSON.stringify({ seat, action }),
  });
}
