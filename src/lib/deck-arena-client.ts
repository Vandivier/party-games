/** Typed fetch wrappers for the Deck Arena API. */

import type { ArenaAction } from '@games/deck_arena/types';
import type { ArenaView } from '@games/deck_arena/view';
import type { SeatInfo } from '@/server/deck-arena-store';

export interface NewArenaInput {
  players: { name: string; isBot: boolean }[];
  seed?: string;
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

export function createArena(input: NewArenaInput): Promise<{ view: ArenaView; seats: SeatInfo[] }> {
  return request('/api/deck-arena', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchView(gameId: string, seat: number): Promise<{ view: ArenaView }> {
  return request(`/api/deck-arena/${gameId}?seat=${seat}`);
}

export function sendAction(
  gameId: string,
  seat: number,
  action: ArenaAction,
): Promise<{ view: ArenaView }> {
  return request(`/api/deck-arena/${gameId}/action`, {
    method: 'POST',
    body: JSON.stringify({ seat, action }),
  });
}
