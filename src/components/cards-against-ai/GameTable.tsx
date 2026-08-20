'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CaaAction } from '@games/cards_against_ai/types';
import type { CaaView } from '@games/cards_against_ai/view';
import {
  createGame,
  fetchView,
  sendAction,
  type NewGameInput,
} from '@/lib/cards-against-ai-client';
import { SeatForm, type SeatFormValue } from '@/components/SeatForm';

const STORAGE_KEY = 'party-games:cards-against-ai';

export function GameTable() {
  const [view, setView] = useState<CaaView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<CaaView | null>(null);

  const run = useCallback(async (task: () => Promise<{ view: CaaView }>) => {
    setBusy(true);
    setError(null);
    try {
      const { view: next } = await task();
      setView(next);
      setResumable(null);
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

  // Offer an unfinished game rather than dropping you into it.
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

  const start = (value: SeatFormValue) => {
    const input: NewGameInput = {
      players: value.players,
      ...(value.seed ? { seed: value.seed } : {}),
    };
    return run(() => createGame(input).then(({ view: v }) => ({ view: v })));
  };
  const take = (action: CaaAction) => view && run(() => sendAction(view.gameId, view.seat, action));
  const takeSeat = (seat: number) => view && run(() => fetchView(view.gameId, seat));

  const leave = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setResumable(null);
    setView(null);
    setError(null);
  };

  if (!view) {
    return (
      <div className="stack">
        {error ? <div className="error">{error}</div> : null}
        {resumable ? (
          <div className="banner">
            <strong>You have a table in progress</strong> — {resumable.gameId}, round{' '}
            {resumable.round}, playing {resumable.you.name}.
            <div className="row" style={{ marginTop: '0.6rem' }}>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => setView(resumable)}
              >
                Resume it
              </button>
              <button type="button" disabled={busy} onClick={leave}>
                Discard and set up a new one
              </button>
            </div>
          </div>
        ) : null}
        <SeatForm
          onStart={start}
          busy={busy}
          maxSeats={8}
          defaultSeats={[
            { name: 'Player 1', isBot: false },
            { name: 'Player 2', isBot: false },
            { name: 'Bot', isBot: true },
          ]}
          minSeats={3}
          note="Three to eight players. Bots fill seats and vote at random, so two humans and a bot is a fine table."
          submitLabel="Deal the cards"
        />
      </div>
    );
  }

  const waitingHuman = view.waitingOn.find((entry) => {
    const player = view.players.find((p) => p.index === entry.index);
    return player && !player.isBot && entry.index !== view.seat;
  });

  const submitOptions = view.legalActions.filter((action) => action.type === 'submit');
  const voteOptions = view.legalActions.filter((action) => action.type === 'vote');

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Cards Against AI</h1>
        <div className="row">
          <span className="small muted">
            table {view.gameId} · round {view.round} · first to {view.targetScore} · seat {view.seat}
          </span>
          <button type="button" onClick={leave} disabled={busy}>
            New game
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {view.phase === 'over' ? (
        <div className="banner win">
          {view.winners.length === 1
            ? `${view.winners[0]?.name} reaches ${view.targetScore} points and wins.`
            : `${view.winners.map((w) => w.name).join(' and ')} share the win.`}
        </div>
      ) : null}

      <div className="table-layout">
        <div className="stack">
          <section className="prompt-card">
            <span className={`tag tone-${view.prompt.tone}`}>{view.prompt.tone} input</span>
            <p>{view.prompt.text}</p>
          </section>

          {view.phase === 'submit' ? (
            view.isWaitingOnYou ? (
              <section className="panel stack">
                <h3 style={{ margin: 0 }}>Your answer, {view.you.name}</h3>
                <div className="answer-grid">
                  {submitOptions.map((action) => (
                    <button
                      key={action.cardId}
                      type="button"
                      className="answer-card"
                      disabled={busy}
                      onClick={() => take(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {view.faceDownCount} card{view.faceDownCount === 1 ? '' : 's'} face down so far.
                </p>
              </section>
            ) : (
              <WaitingPanel view={view} busy={busy} onSeat={takeSeat} waitingHuman={waitingHuman} />
            )
          ) : null}

          {view.phase === 'vote' ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>
                {view.isWaitingOnYou
                  ? 'Shuffled and revealed — vote for your favourite'
                  : 'Votes are in from you; waiting on the rest'}
              </h3>
              <div className="answer-grid">
                {view.table.map((card) => {
                  const vote = voteOptions.find((action) => action.submissionId === card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={`answer-card${card.yours ? ' yours' : ''}`}
                      disabled={busy || !vote}
                      title={card.yours ? 'Your own card — you cannot vote for it' : 'Vote for this'}
                      onClick={() => vote && take(vote)}
                    >
                      {card.text}
                      {card.yours ? <span className="answer-note">yours</span> : null}
                    </button>
                  );
                })}
              </div>
              {!view.isWaitingOnYou ? (
                <WaitingPanel view={view} busy={busy} onSeat={takeSeat} waitingHuman={waitingHuman} />
              ) : null}
            </section>
          ) : null}

          {view.result && (view.phase === 'results' || view.phase === 'over') ? (
            <section className="panel stack">
              <h3 style={{ margin: 0 }}>
                {view.result.winners.length === 1 ? 'Round winner' : 'Round tied'}
              </h3>
              <ol className="standings">
                {view.result.standings.map((entry) => (
                  <li
                    key={entry.submissionId}
                    className={view.result?.winners.includes(entry.playerIndex) ? 'won' : ''}
                  >
                    <span className="standing-votes">
                      {entry.votes} vote{entry.votes === 1 ? '' : 's'}
                    </span>
                    <span className="standing-card">{entry.card.text}</span>
                    <span className="small muted">{entry.playerName}</span>
                  </li>
                ))}
              </ol>
              {view.phase === 'results' ? (
                <div className="row">
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => take({ type: 'nextRound' })}
                  >
                    Deal the next input
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="stack">
          <div className="panel">
            <h3>Scores — first to {view.targetScore}</h3>
            <ul className="fighters">
              {view.standings.map((entry) => {
                const player = view.players.find((p) => p.index === entry.index);
                return (
                  <li key={entry.index}>
                    <span className="dot" style={{ background: 'var(--gold)' }} />
                    <span>
                      {entry.name}
                      {entry.index === view.seat ? ' (you)' : ''}
                      {player?.isBot ? ' · bot' : ''}
                    </span>
                    <span className="small muted">
                      {entry.score} point{entry.score === 1 ? '' : 's'}
                      {view.phase === 'submit' && player?.hasSubmitted ? ' · answered' : ''}
                      {view.phase === 'vote' && player?.hasVoted ? ' · voted' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="panel">
            <h3>Log</h3>
            <div className="log">
              {view.log.map((line, index) => (
                <div key={`${index}-${line}`} className="log-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WaitingPanel({
  view,
  busy,
  onSeat,
  waitingHuman,
}: {
  view: CaaView;
  busy: boolean;
  onSeat: (seat: number) => void;
  waitingHuman: { index: number; name: string } | undefined;
}) {
  return (
    <section className="panel stack">
      <p className="muted" style={{ margin: 0 }}>
        {view.waitingOn.length === 0
          ? 'Everyone is done.'
          : `Waiting on ${view.waitingOn.map((entry) => entry.name).join(', ')}.`}
      </p>
      {waitingHuman ? (
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => onSeat(waitingHuman.index)}
          >
            Pass the device — I am {waitingHuman.name}
          </button>
        </div>
      ) : null}
    </section>
  );
}
