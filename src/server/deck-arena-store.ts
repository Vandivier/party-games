/**
 * Server-side home for live Deck Arena tables.
 *
 * Same contract as the Hero War store: engine state never leaves this module,
 * clients get per-seat views, and bot seats are played out here so their
 * decisions — and the cards they can see — never reach a browser.
 */

import { act, createGame, currentActor } from '@games/deck_arena/engine';
import { botAction } from '@games/deck_arena/bot';
import { toView, type ArenaView } from '@games/deck_arena/view';
import type { ArenaAction, ArenaState } from '@games/deck_arena/types';
import { GameError } from './game-error';

export interface SeatInfo {
  index: number;
  name: string;
  isBot: boolean;
}

interface Session {
  id: string;
  state: ArenaState;
  seats: SeatInfo[];
  createdAt: number;
  updatedAt: number;
}

export interface NewArenaRequest {
  players: { name: string; isBot?: boolean }[];
  seed?: string;
}

const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
/** Backstop so a bot loop can never spin forever. */
const MAX_BOT_STEPS = 2000;

/** Survives dev-server hot reloads, which would otherwise drop live tables. */
const sessions: Map<string, Session> = ((
  globalThis as { __deckArenaSessions?: Map<string, Session> }
).__deckArenaSessions ??= new Map());

export function createSession(request: NewArenaRequest): { view: ArenaView; seats: SeatInfo[] } {
  const players = normalizePlayers(request.players);
  const state = createGame({ players, ...(request.seed ? { seed: request.seed } : {}) });

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

export function getView(gameId: string, seat: number): ArenaView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  return viewOf(session, seat);
}

export function applyAction(gameId: string, seat: number, action: ArenaAction): ArenaView {
  const session = requireSession(gameId);
  requireSeat(session, seat);
  requireTurn(session, seat);

  const result = act(session.state, action);
  if (!result.ok) throw new GameError(result.error ?? 'Illegal action.');
  session.updatedAt = Date.now();
  runBots(session);
  return viewOf(session, seat);
}

/* ------------------------------------------------------------------ internals */

/** Play out every consecutive bot turn until a human is on the clock. */
function runBots(session: Session): void {
  const { state } = session;
  for (let step = 0; step < MAX_BOT_STEPS; step++) {
    const actor = currentActor(state);
    if (actor === null) return;
    const player = state.players[actor];
    if (!player?.isBot) return;

    const action = botAction(state);
    if (!action) return;
    const result = act(state, action);
    if (!result.ok) throw new GameError(`Bot action failed: ${result.error}`, 500);
  }
  throw new GameError('Bot play did not settle; the arena is stuck.', 500);
}

function normalizePlayers(players: NewArenaRequest['players']): { name: string; isBot: boolean }[] {
  if (!Array.isArray(players) || players.length < 2) {
    throw new GameError('Deck Arena needs at least 2 players.');
  }
  if (players.length > 8) throw new GameError('Deck Arena tops out at 8 players.');
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

function viewOf(session: Session, seat: number): ArenaView {
  return toView(session.state, seat, session.id);
}

function requireSession(gameId: string): Session {
  const session = sessions.get(gameId);
  if (!session) throw new GameError('That arena is gone. Start a new game.', 404);
  return session;
}

function requireSeat(session: Session, seat: number): SeatInfo {
  const info = session.seats[seat];
  if (!info) throw new GameError(`Seat ${seat} is not in this arena.`, 404);
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

/** Test helper: forget every arena. */
export function resetSessions(): void {
  sessions.clear();
}
