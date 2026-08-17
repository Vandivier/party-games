'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ArenaAction, LegalAction } from '@games/deck_arena/types';
import type { ArenaView } from '@games/deck_arena/view';
import {
  createArena,
  fetchView,
  sendAction,
  type NewArenaInput,
} from '@/lib/deck-arena-client';
import { PlayingCard } from '@/components/PlayingCard';
import { SeatForm, type SeatFormValue } from '@/components/SeatForm';
import { ArenaBoard, seatColor } from './ArenaBoard';

const STORAGE_KEY = 'party-games:deck-arena';
const COMPASS = ['north', 'west', 'east', 'south'] as const;

export function ArenaTable() {
  const [view, setView] = useState<ArenaView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set while a teleport is waiting for the player to pick a cell. */
  const [teleportCardId, setTeleportCardId] = useState<string | null>(null);

  const run = useCallback(async (task: () => Promise<{ view: ArenaView }>) => {
    setBusy(true);
    setError(null);
    try {
      const { view: next } = await task();
      setView(next);
      setTeleportCardId(null);
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ gameId: next.gameId, seat: next.seat }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }, []);

  // Pick a game back up after a refresh.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    let parsed: { gameId?: string; seat?: number };
    try {
      parsed = JSON.parse(saved) as { gameId?: string; seat?: number };
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (!parsed.gameId) return;
    fetchView(parsed.gameId, parsed.seat ?? 0)
      .then((response) => setView(response.view))
      .catch(() => window.localStorage.removeItem(STORAGE_KEY));
  }, []);

  const start = (value: SeatFormValue) => {
    const input: NewArenaInput = {
      players: value.players,
      specialAbilities: value.flags.abilities ?? true,
      ...(value.seed ? { seed: value.seed } : {}),
    };
    return run(() => createArena(input).then(({ view: v }) => ({ view: v })));
  };
  const take = (action: ArenaAction) => view && run(() => sendAction(view.gameId, view.seat, action));
  const takeSeat = (seat: number) => view && run(() => fetchView(view.gameId, seat));

  const leave = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setView(null);
    setError(null);
  };

  if (!view) {
    return (
      <div className="stack">
        {error ? <div className="error">{error}</div> : null}
        <SeatForm
          onStart={start}
          busy={busy}
          maxSeats={8}
          defaultSeats={[
            { name: 'Player 1', isBot: false },
            { name: 'Bot', isBot: true },
          ]}
          note="Two to eight fighters. Bots play themselves; humans share this screen, hot-seat style."
          toggles={[
            {
              key: 'abilities',
              label: 'Special abilities',
              hint: 'face-card abilities and ace collecting',
              defaultValue: true,
            },
          ]}
          submitLabel="Drop in"
        />
      </div>
    );
  }

  const byType = <T extends LegalAction['type']>(type: T) =>
    view.legalActions.filter((action): action is Extract<LegalAction, { type: T }> => action.type === type);

  const moves = byType('move');
  const shots = byType('shoot');
  const search = byType('search')[0];
  const reload = byType('reload')[0];
  const endTurn = byType('endTurn')[0];
  const cardActions = byType('activateCard');
  const discards = byType('discard');
  // The one card playable off-turn; the server has the final say on legality.
  const reactions =
    view.specialAbilities && !view.you.out && view.phase === 'play' && !view.isYourTurn
      ? view.you.hand.filter((card) => card.suit === 'diamonds' && card.rank === 'J')
      : [];
  const waitingHuman = view.opponents.find(
    (opponent) => opponent.index === view.turnPlayerIndex && !opponent.isBot && !opponent.out,
  );

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Deck Arena</h1>
        <div className="row">
          <span className="small muted">
            arena {view.gameId} · round {view.round} · seat {view.seat}
          </span>
          <button type="button" onClick={leave} disabled={busy}>
            New game
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {view.phase === 'over' ? (
        <div className="banner win">
          {view.winner ? `${view.winner.name} is the last one standing.` : 'Nobody is left standing.'}
        </div>
      ) : view.you.out ? (
        <div className="banner attack">You are knocked out. The fight goes on without you.</div>
      ) : null}

      <div className="table-layout">
        <div className="stack">
          <ArenaBoard
            view={view}
            {...(teleportCardId
              ? {
                  onPick: (cell: { x: number; y: number }) =>
                    take({ type: 'activateCard', cardId: teleportCardId, to: cell }),
                }
              : {})}
          />

          {teleportCardId ? (
            <div className="banner">
              Pick an empty cell to blink to.{' '}
              <button type="button" className="tiny" onClick={() => setTeleportCardId(null)}>
                Cancel
              </button>
            </div>
          ) : null}

          <section className="panel stack">
            <div className="board-head">
              <span className="board-name">
                {view.you.name} (you) · {view.you.x},{view.you.y}
              </span>
              <span className="small muted">
                {view.you.hp}/{view.maxHp} hp · {view.you.shield} shield
                {view.you.overshield > 0 ? ` · ${view.you.overshield} overshield` : ''}
                {view.you.regen
                  ? ` · regen ${view.you.regen.turnsLeft} turn${view.you.regen.turnsLeft === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>

            {view.specialAbilities ? (
              <div className="row small">
                <h3 style={{ margin: 0 }}>Aces</h3>
                {view.you.aces.length === 0 ? (
                  <span className="muted">none — collect all four to win</span>
                ) : (
                  <>
                    {view.you.aces.map((ace) => (
                      <PlayingCard key={ace.id} card={ace} small />
                    ))}
                    <span className="muted">{view.you.aces.length}/4</span>
                  </>
                )}
              </div>
            ) : null}

            <div className="row small">
              <h3 style={{ margin: 0 }}>Weapon</h3>
              {view.you.weapon?.card ? (
                <>
                  <PlayingCard card={view.you.weapon.card} small />
                  <span className="muted">
                    {view.you.weapon.damage} damage · range {view.you.weapon.range} ·{' '}
                    {view.you.weapon.loaded ? 'loaded' : 'out of ammo'} ·{' '}
                    {view.you.weapon.revealed ? 'face up' : 'face down'}
                  </span>
                </>
              ) : (
                <span className="muted">unarmed</span>
              )}
            </div>

            <div>
              <h3>
                Hand ({view.you.hand.length}/{view.handLimit})
              </h3>
              {view.you.hand.length === 0 ? (
                <span className="muted small">empty</span>
              ) : (
                <div className="hand-row">
                  {view.you.hand.map((card) => {
                    const uses = cardActions.filter((action) => action.cardId === card.id);
                    const drop = discards.find((action) => action.cardId === card.id);
                    const teleports =
                      view.specialAbilities && card.suit === 'diamonds' && card.rank === 'Q';
                    return (
                      <div key={card.id} className="hand-card">
                        <PlayingCard card={card} />
                        {teleports && uses.length > 0 ? (
                          <button
                            type="button"
                            className="primary tiny"
                            disabled={busy}
                            onClick={() => setTeleportCardId(card.id)}
                          >
                            Teleport (free)
                          </button>
                        ) : (
                          uses.map((use) => (
                            <button
                              key={use.label}
                              type="button"
                              className="primary tiny"
                              disabled={busy}
                              onClick={() => take(use)}
                            >
                              {use.label.replace(/^(Equip|Play) \S+ — /, '')}
                              {use.cost === 0 ? ' (free)' : ''}
                            </button>
                          ))
                        )}
                        {drop ? (
                          <button type="button" className="tiny" disabled={busy} onClick={() => take(drop)}>
                            Discard
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="panel stack">
            {view.phase === 'over' ? (
              <p className="muted" style={{ margin: 0 }}>
                The arena is closed.
              </p>
            ) : view.mustDiscard ? (
              <div className="stack">
                <div className="banner attack">
                  You looted the kill. Discard down to {view.handLimit} cards before anything else.
                </div>
              </div>
            ) : !view.isYourTurn ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Waiting on {view.turnPlayerName}.
                </p>
                {reactions.length > 0 ? (
                  <div className="stack" style={{ gap: '0.35rem' }}>
                    <h3 style={{ margin: 0 }}>Super mobility — playable out of turn</h3>
                    <div className="action-list">
                      {reactions.map((card) =>
                        (['north', 'south', 'east', 'west'] as const).map((direction) => (
                          <button
                            key={`${card.id}-${direction}`}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              take({ type: 'activateCard', cardId: card.id, direction })
                            }
                          >
                            {card.label} — step {direction}
                          </button>
                        )),
                      )}
                    </div>
                  </div>
                ) : null}
                {waitingHuman ? (
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => takeSeat(waitingHuman.index)}
                    >
                      Pass the device — I am {waitingHuman.name}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div className="board-head">
                  <h3 style={{ margin: 0 }}>Your move</h3>
                  <span className="small muted">
                    rolled {view.actionRoll} · {view.actionsLeft} action
                    {view.actionsLeft === 1 ? '' : 's'} left
                    {view.freeSearchAvailable ? ' · free search available' : ''}
                  </span>
                </div>

                <div className="compass">
                  {COMPASS.map((direction) => {
                    const action = moves.find((move) => move.direction === direction);
                    return (
                      <button
                        key={direction}
                        type="button"
                        className={`compass-${direction}`}
                        disabled={busy || !action}
                        onClick={() => action && take(action)}
                        title={action?.label ?? `Cannot move ${direction}`}
                      >
                        {direction === 'north' ? '↑' : direction === 'south' ? '↓' : direction === 'east' ? '→' : '←'}
                      </button>
                    );
                  })}
                  <span className="compass-hub muted small" style={{ color: seatColor(view.seat) }}>
                    {view.you.x},{view.you.y}
                  </span>
                </div>

                <div className="action-list">
                  {search ? (
                    <button type="button" className="primary" disabled={busy} onClick={() => take(search)}>
                      {search.label}
                    </button>
                  ) : null}
                  {shots.map((shot) => (
                    <button
                      key={`shoot-${shot.targetIndex}`}
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => take(shot)}
                    >
                      {shot.label}
                    </button>
                  ))}
                  {reload ? (
                    <button type="button" disabled={busy} onClick={() => take(reload)}>
                      Reload
                    </button>
                  ) : null}
                  {endTurn ? (
                    <button type="button" disabled={busy} onClick={() => take(endTurn)}>
                      End turn
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="stack">
          <div className="panel">
            <h3>Fighters</h3>
            <ul className="fighters">
              {[
                { ...view.you, isBot: false, handCount: view.you.hand.length, isYou: true },
                ...view.opponents.map((opponent) => ({ ...opponent, isYou: false })),
              ]
                .sort((a, b) => a.index - b.index)
                .map((player) => (
                  <li key={player.index} className={player.out ? 'muted' : ''}>
                    <span className="dot" style={{ background: seatColor(player.index) }} />
                    <span>
                      {player.name}
                      {player.isYou ? ' (you)' : ''}
                      {'isBot' in player && player.isBot ? ' · bot' : ''}
                    </span>
                    <span className="small muted">
                      {player.out
                        ? 'knocked out'
                        : `${player.hp} hp · ${player.shield} shield` +
                          (player.overshield > 0 ? ` +${player.overshield} over` : '') +
                          ` · ${player.handCount} cards` +
                          (player.aces.length > 0 ? ` · ${player.aces.length} ace` : '') +
                          (player.regen ? ' · regen' : '') +
                          (player.weapon
                            ? player.weapon.revealed
                              ? ` · ${player.weapon.card?.label}`
                              : ' · armed'
                            : '')}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="panel">
            <h3>Arena</h3>
            <p className="small muted" style={{ margin: 0 }}>
              round {view.round} · {view.pileCount} cards in the face-down pile
              <br />
              turn: {view.turnPlayerName}
            </p>
          </div>

          <div className="panel">
            <h3>Log</h3>
            <div className="log">
              {view.log.map((line, index) => (
                <div
                  key={`${index}-${line}`}
                  className={`log-line${line.startsWith('---') ? ' turn' : ''}`}
                >
                  {line.replace(/^---\s*|\s*---$/g, '')}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
