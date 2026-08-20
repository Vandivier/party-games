/**
 * Server-side home for live Cards Against AI tables.
 *
 * Same contract as the other stores: engine state stays here, clients get
 * per-seat views, and bot seats are played out before a response goes back so a
 * browser never learns what is still face down.
 */

import { act, createGame, isWaitingOn, pendingSeats } from '@games/cards_against_ai/engine';
import { botAction } from '@games/cards_against_ai/bot';
import { toView, type CaaView } from '@games/cards_against_ai/view';
import type { CaaAction, CaaState } from '@games/cards_against_ai/types';
import { GameError } from './game-error';

export interface SeatInfo {
  index: number;
  name: string;
  isBot: boolean;
}

interface Session {
  id: string;
  state: CaaState;
  seats: SeatInfo[];
  createdAt: number;
  updatedAt: number;
}

export interface NewGameRequest {
  players: { name: string; isBot?: boolean }[];
  seed?: string;
  targetScore?: number;
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const MAX_BOT_STEPS = 200;

/** Survives dev-server hot reloads, which would otherwise drop live tables. */
const sessions: Map<string, Session> = ((
  globalThis as { __cardsAgainstAiSessions?: Map<string, Session> }
).__cardsAgainstAiSessions ??= new Map());

export function createSession(request: NewGameRequest): { view: CaaView; seats: SeatInfo[] } {
  const players = normalizePlayers(request.players);
  const state = createGame({
    players,
    ...(request.seed ? { seed: request.seed } : {}),
    ...(request.targetScore ? { targetScore: request.targetScore } : {}),
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

export function getView(gameId: string, seat: number): CaaView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  return viewOf(session, seat);
}

export function applyAction(gameId: string, seat: number, action: CaaAction): CaaView {
  const session = requireSession(gameId);
  requireSeat(session, seat);

  const result = act(session.state, seat, action);
  if (!result.ok) throw new GameError(result.error ?? 'Illegal action.');
  session.updatedAt = Date.now();
  runBots(session);
  return viewOf(session, seat);
}

/* ------------------------------------------------------------------ internals */

/** Let every waiting bot answer or vote before the humans see anything. */
function runBots(session: Session): void {
  const { state } = session;
  for (let step = 0; step < MAX_BOT_STEPS; step++) {
    const waiting = pendingSeats(state).filter((seat) => state.players[seat]?.isBot);
    const seat = waiting[0];
    if (seat === undefined) return;
    const action = botAction(state, seat);
    if (!action) return;
    const result = act(state, seat, action);
    if (!result.ok) throw new GameError(`Bot action failed: ${result.error}`, 500);
  }
  throw new GameError('Bot play did not settle; the table is stuck.', 500);
}

function normalizePlayers(players: NewGameRequest['players']): { name: string; isBot: boolean }[] {
  if (!Array.isArray(players) || players.length < 3) {
    throw new GameError('Cards Against AI needs at least 3 players.');
  }
  if (players.length > 8) throw new GameError('Cards Against AI tops out at 8 players.');
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

function viewOf(session: Session, seat: number): CaaView {
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

export { isWaitingOn };
