/**
 * Server-side home for live Hero War tables.
 *
 * The engine state never leaves this module: routes hand back per-seat views,
 * so a client can only ever see its own cards. Bot seats are resolved here too,
 * which keeps the client a thin renderer.
 */

import { act, currentActor, resolveDefense } from '@games/hero_war/engine';
import { botAction, botDefense } from '@games/hero_war/bot';
import { toView, type HeroWarView } from '@games/hero_war/view';
import { createGame } from '@games/hero_war/engine';
import type { HeroWarAction, HeroWarState } from '@games/hero_war/types';

export class GameError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GameError';
    this.status = status;
  }
}

export interface SeatInfo {
  index: number;
  name: string;
  isBot: boolean;
}

interface Session {
  id: string;
  state: HeroWarState;
  seats: SeatInfo[];
  createdAt: number;
  updatedAt: number;
}

export interface NewGameRequest {
  players: { name: string; isBot?: boolean }[];
  seed?: string;
  deckCount?: number;
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
/** Backstop so a bot loop can never spin forever. */
const MAX_BOT_STEPS = 500;

/** Survives dev-server hot reloads, which would otherwise drop live tables. */
const sessions: Map<string, Session> = ((
  globalThis as { __heroWarSessions?: Map<string, Session> }
).__heroWarSessions ??= new Map());

export function createSession(request: NewGameRequest): { view: HeroWarView; seats: SeatInfo[] } {
  const players = normalizePlayers(request.players);
  const state = createGame({
    players,
    ...(request.seed ? { seed: request.seed } : {}),
    ...(request.deckCount ? { deckCount: request.deckCount } : {}),
  });

  const id = newId();
  const session: Session = {
    id,
    state,
    seats: players.map((player, index) => ({ index, name: player.name, isBot: !!player.isBot })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  sessions.set(id, session);
  prune();

  runBots(session);
  return { view: viewOf(session, firstHumanSeat(session)), seats: session.seats };
}

export function getView(gameId: string, seat: number): HeroWarView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  return viewOf(session, seat);
}

export function applyAction(gameId: string, seat: number, action: HeroWarAction): HeroWarView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  requireTurn(session, seat);

  const result = act(session.state, action);
  if (!result.ok) throw new GameError(result.error ?? 'Illegal action.');
  session.updatedAt = Date.now();
  runBots(session);
  return viewOf(session, seat);
}

export function applyDefense(gameId: string, seat: number, cardId: string | null): HeroWarView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  if (!session.state.pendingAttack) throw new GameError('No attack is pending.');
  requireTurn(session, seat);

  const result = resolveDefense(session.state, { cardId });
  if (!result.ok) throw new GameError(result.error ?? 'Illegal defense.');
  session.updatedAt = Date.now();
  runBots(session);
  return viewOf(session, seat);
}

/* ------------------------------------------------------------------ internals */

/** Play out every consecutive bot decision until a human is on the clock. */
function runBots(session: Session): void {
  const { state } = session;
  for (let step = 0; step < MAX_BOT_STEPS; step++) {
    const actor = currentActor(state);
    if (actor === null) return;
    const player = state.players[actor];
    if (!player?.isBot) return;

    if (state.pendingAttack) {
      const result = resolveDefense(state, botDefense(state));
      if (!result.ok) throw new GameError(`Bot defense failed: ${result.error}`, 500);
      continue;
    }
    const action = botAction(state);
    if (!action) return;
    const result = act(state, action);
    if (!result.ok) throw new GameError(`Bot action failed: ${result.error}`, 500);
  }
  throw new GameError('Bot play did not settle; the table is stuck.', 500);
}

function normalizePlayers(players: NewGameRequest['players']): { name: string; isBot: boolean }[] {
  if (!Array.isArray(players) || players.length < 2) {
    throw new GameError('Hero War needs at least 2 players.');
  }
  if (players.length > 8) throw new GameError('Hero War tops out at 8 players.');
  const normalized = players.map((player, index) => ({
    name: String(player?.name ?? '').trim().slice(0, 24) || `Player ${index + 1}`,
    isBot: Boolean(player?.isBot),
  }));
  if (normalized.every((player) => player.isBot)) {
    throw new GameError('At least one seat must be a human.');
  }
  return normalized;
}

function firstHumanSeat(session: Session): number {
  return session.seats.find((seat) => !seat.isBot)?.index ?? 0;
}

function viewOf(session: Session, seat: number): HeroWarView {
  return toView(session.state, seat, session.id);
}

function requireSession(gameId: string): Session {
  const session = sessions.get(gameId);
  if (!session) throw new GameError('That table is gone. Start a new game.', 404);
  return session;
}

function requireSeat(session: Session, seat: number): SeatInfo {
  const info = session.seats[seat];
  if (!info) throw new GameError(`Seat ${seat} is not at this table.`, 404);
  if (info.isBot) throw new GameError('That seat is played by a bot.', 403);
  return info;
}

function requireTurn(session: Session, seat: number): void {
  const actor = currentActor(session.state);
  if (actor === null) throw new GameError('The game is over.');
  if (actor !== seat) {
    const name = session.state.players[actor]?.name ?? 'someone else';
    throw new GameError(`It is ${name}'s move.`, 409);
  }
}

function prune(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

function newId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

/** Test helper: forget every table. */
export function resetSessions(): void {
  sessions.clear();
}
