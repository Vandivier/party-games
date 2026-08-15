/** Typed fetch wrappers for the Hero War API. */

import type { HeroWarAction } from '@games/hero_war/types';
import type { HeroWarView } from '@games/hero_war/view';
import type { SeatInfo } from '@/server/hero-war-store';

export interface NewGameInput {
  players: { name: string; isBot: boolean }[];
  seed?: string;
  deckCount?: number;
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

export function createGame(input: NewGameInput): Promise<{ view: HeroWarView; seats: SeatInfo[] }> {
  return request('/api/hero-war', { method: 'POST', body: JSON.stringify(input) });
}

export function fetchView(gameId: string, seat: number): Promise<{ view: HeroWarView }> {
  return request(`/api/hero-war/${gameId}?seat=${seat}`);
}

export function sendAction(
  gameId: string,
  seat: number,
  action: HeroWarAction,
): Promise<{ view: HeroWarView }> {
  return request(`/api/hero-war/${gameId}/action`, {
    method: 'POST',
    body: JSON.stringify({ seat, action }),
  });
}

export function sendDefense(
  gameId: string,
  seat: number,
  cardId: string | null,
): Promise<{ view: HeroWarView }> {
  return request(`/api/hero-war/${gameId}/defense`, {
    method: 'POST',
    body: JSON.stringify({ seat, cardId }),
  });
}
