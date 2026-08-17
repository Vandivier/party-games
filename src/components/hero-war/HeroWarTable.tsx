'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Card } from '@/core/cards';
import type { HeroWarAction, LegalAction } from '@games/hero_war/types';
import type { HeroWarView } from '@games/hero_war/view';
import {
  createGame,
  fetchView,
  sendAction,
  sendDefense,
  type NewGameInput,
} from '@/lib/hero-war-client';
import { CardRow, SelectableCard } from '@/components/PlayingCard';
import { SeatForm } from '@/components/SeatForm';
import { Board } from './Board';

const STORAGE_KEY = 'party-games:hero-war';

export function HeroWarTable() {
  const [view, setView] = useState<HeroWarView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boostIds, setBoostIds] = useState<string[]>([]);
  /** A game left running in this browser, offered rather than resumed for you. */
  const [resumable, setResumable] = useState<HeroWarView | null>(null);

  const run = useCallback(async (task: () => Promise<{ view: HeroWarView }>) => {
    setBusy(true);
    setError(null);
    try {
      const { view: next } = await task();
      setView(next);
      setResumable(null);
      setBoostIds([]);
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

  // Offer to pick an unfinished game back up — but always land on setup first,
  // so arriving here means choosing how to play rather than being dropped in.
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
      .then((response) => {
        if (response.view.phase === 'over') {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }
        setResumable(response.view);
      })
      .catch(() => window.localStorage.removeItem(STORAGE_KEY));
  }, []);

  const forget = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setResumable(null);
  };

  const startGame = (input: NewGameInput) => run(() => createGame(input).then(({ view: v }) => ({ view: v })));
  const takeAction = (action: HeroWarAction) =>
    view && run(() => sendAction(view.gameId, view.seat, action));
  const defend = (cardId: string | null) =>
    view && run(() => sendDefense(view.gameId, view.seat, cardId));
  const takeSeat = (seat: number) => view && run(() => fetchView(view.gameId, seat));

  const leaveTable = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setView(null);
    setError(null);
  };

  const boostTotal = useMemo(() => {
    if (!view) return 0;
    return view.you.hand
      .filter((card) => boostIds.includes(card.id))
      .reduce((sum, card) => sum + card.value, 0);
  }, [view, boostIds]);

  if (!view) {
    return (
      <div className="stack">
        {error ? <div className="error">{error}</div> : null}
        {resumable ? (
          <div className="banner">
            <strong>You have a table in progress</strong> — {resumable.gameId}, playing{' '}
            {resumable.you.name}.
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => setView(resumable)}
              >
                Resume it
              </button>
              <button type="button" disabled={busy} onClick={forget}>
                Discard and deal a new one
              </button>
            </div>
          </div>
        ) : null}
        <SeatForm
          onStart={startGame}
          busy={busy}
          maxSeats={8}
          defaultSeats={[
            { name: 'Player 1', isBot: false },
            { name: 'Bot', isBot: true },
          ]}
          note="Bots play themselves. Two or more humans share this screen, hot-seat style."
        />
      </div>
    );
  }

  const attacks = view.legalActions.filter(
    (action): action is Extract<LegalAction, { type: 'attack' }> => action.type === 'attack',
  );
  const otherActions = view.legalActions.filter((action) => action.type !== 'attack');
  const diamonds = view.you.hand.filter((card) => card.suit === 'diamonds');
  const waitingOn = view.waitingOn;
  const waitingOpponent =
    waitingOn && waitingOn.index !== view.seat
      ? view.opponents.find((opponent) => opponent.index === waitingOn.index)
      : undefined;

  const toggleBoost = (card: Card) =>
    setBoostIds((current) =>
      current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
    );

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Hero War</h1>
        <div className="row">
          <span className="small muted">
            table {view.gameId} · seat {view.seat}
          </span>
          <button type="button" onClick={leaveTable} disabled={busy}>
            New game
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {view.phase === 'over' ? (
        <div className="banner win">
          {view.winner
            ? `${view.winner.name} is the last hero standing.`
            : 'Everyone is out. Nobody wins.'}
        </div>
      ) : null}

      <div className="table-layout">
        <div className="stack">
          {view.opponents.map((opponent) => (
            <Board
              key={opponent.index}
              name={opponent.name}
              hero={opponent.hero}
              equipment={opponent.equipment}
              damage={opponent.damage}
              out={opponent.out}
              active={view.turnPlayerIndex === opponent.index && view.phase === 'play'}
              isBot={opponent.isBot}
              handCount={opponent.handCount}
            />
          ))}

          <Board
            name={view.you.name}
            hero={view.you.hero}
            equipment={view.you.equipment}
            damage={view.you.damage}
            out={view.you.out}
            active={view.turnPlayerIndex === view.seat && view.phase === 'play'}
            isYou
          >
            <div>
              <h3>Your hand</h3>
              {view.you.hand.length === 0 ? (
                <span className="muted small">empty</span>
              ) : attacks.length > 0 ? (
                <div className="hand">
                  {view.you.hand.map((card) => (
                    <SelectableCard
                      key={card.id}
                      card={card}
                      selected={boostIds.includes(card.id)}
                      disabled={card.suit !== 'diamonds' || busy}
                      onToggle={toggleBoost}
                      title={
                        card.suit === 'diamonds'
                          ? `Spend ${card.label} for +${card.value} damage on this attack`
                          : card.label
                      }
                    />
                  ))}
                </div>
              ) : (
                <CardRow cards={view.you.hand} />
              )}
            </div>
          </Board>

          <div className="panel stack">
            {view.pendingAttack && view.isYourInput ? (
              <div className="stack">
                <div className="banner attack">
                  {view.pendingAttack.attackerName} swings for{' '}
                  <strong>{view.pendingAttack.damage}</strong>
                  {view.pendingAttack.boosts.length
                    ? ` (powered by ${view.pendingAttack.boosts.map((card) => card.label).join(' ')})`
                    : ''}
                  . Discard a heart to nullify it?
                </div>
                <div className="action-list">
                  {view.defenseOptions.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => defend(card.id)}
                    >
                      Nullify with {card.label}
                    </button>
                  ))}
                  <button type="button" className="danger" disabled={busy} onClick={() => defend(null)}>
                    Take {view.pendingAttack.damage} damage
                  </button>
                </div>
              </div>
            ) : !view.isYourInput ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  {waitingOn
                    ? `Waiting on ${waitingOn.name}${waitingOn.kind === 'defense' ? ' to defend' : waitingOn.kind === 'hero' ? ' to field a hero' : ''}.`
                    : 'The game is over.'}
                </p>
                {waitingOpponent && !waitingOpponent.isBot ? (
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => takeSeat(waitingOpponent.index)}
                    >
                      Pass the device — I am {waitingOpponent.name}
                    </button>
                  </div>
                ) : null}
                {view.phase !== 'over' && view.opponents.some((opponent) => !opponent.isBot) ? (
                  <div className="row small">
                    <span className="muted">Switch seat:</span>
                    {view.opponents
                      .filter((opponent) => !opponent.isBot && !opponent.out)
                      .map((opponent) => (
                        <button
                          key={opponent.index}
                          type="button"
                          disabled={busy}
                          onClick={() => takeSeat(opponent.index)}
                        >
                          {opponent.name}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="stack">
                <h3 style={{ margin: 0 }}>
                  {waitingOn?.kind === 'hero' ? 'Field a hero' : 'Your move'}
                </h3>
                <div className="action-list">
                  {otherActions.map((action) => (
                    <button
                      key={actionKey(action)}
                      type="button"
                      className={action.type === 'endTurn' ? '' : 'primary'}
                      disabled={busy}
                      onClick={() => takeAction(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>

                {attacks.length > 0 ? (
                  <div className="stack" style={{ gap: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>
                      Attack
                      {diamonds.length
                        ? ` — tap diamonds above to power up${boostTotal ? ` (+${boostTotal})` : ''}`
                        : ''}
                    </h3>
                    <div className="action-list">
                      {attacks.map((action) => (
                        <button
                          key={actionKey(action)}
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            takeAction({ ...action, boostCardIds: boostIds } as HeroWarAction)
                          }
                        >
                          {`${action.label.split(' for ')[0]} for ${view.you.damage.total + boostTotal}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <aside className="stack">
          <div className="panel">
            <h3>Table</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {view.deckRemaining} cards in the deck · {view.discardCount} discarded
              <br />
              turn: {view.turnPlayerName}
              <br />
              phase: {view.phase}
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

function actionKey(action: LegalAction): string {
  switch (action.type) {
    case 'spadeSabotage':
      return `${action.type}:${action.cardId}:${action.targetIndex}:${action.clubId}`;
    case 'attack':
      return `${action.type}:${action.targetIndex}`;
    case 'playHero':
    case 'equip':
    case 'spadeTrade':
      return `${action.type}:${action.cardId}`;
    default:
      return action.type;
  }
}
