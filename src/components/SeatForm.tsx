'use client';

import { useState } from 'react';

export interface Seat {
  name: string;
  isBot: boolean;
}

export interface SeatFormToggle {
  key: string;
  label: string;
  hint?: string;
  defaultValue: boolean;
}

export interface SeatFormValue {
  players: Seat[];
  seed?: string;
  /** Values of the extra toggles, keyed as the caller declared them. */
  flags: Record<string, boolean>;
}

/** Shared "who is playing" panel: seats, bot toggles, and an optional seed. */
export function SeatForm({
  onStart,
  busy,
  maxSeats,
  minSeats = 2,
  defaultSeats,
  note,
  toggles = [],
  submitLabel = 'Deal the cards',
}: {
  onStart: (value: SeatFormValue) => void;
  busy: boolean;
  maxSeats: number;
  /** Smallest legal table. The Remove button stops here. */
  minSeats?: number;
  defaultSeats: Seat[];
  note: string;
  toggles?: SeatFormToggle[];
  submitLabel?: string;
}) {
  const [seats, setSeats] = useState<Seat[]>(defaultSeats);
  const [seed, setSeed] = useState('');
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(toggles.map((toggle) => [toggle.key, toggle.defaultValue])),
  );

  const update = (index: number, patch: Partial<Seat>) =>
    setSeats((current) => current.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)));

  const addSeat = () =>
    setSeats((current) =>
      current.length >= maxSeats
        ? current
        : [...current, { name: `Player ${current.length + 1}`, isBot: true }],
    );

  const removeSeat = () =>
    setSeats((current) => (current.length <= minSeats ? current : current.slice(0, -1)));

  const humans = seats.filter((seat) => !seat.isBot).length;

  return (
    <div className="panel stack" style={{ maxWidth: 560 }}>
      <div>
        <h2>New game</h2>
        <p className="muted small">{note}</p>
      </div>

      <div className="stack" style={{ gap: '0.5rem' }}>
        {seats.map((seat, index) => (
          <div key={index} className="row">
            <input
              value={seat.name}
              maxLength={24}
              aria-label={`Seat ${index + 1} name`}
              onChange={(event) => update(index, { name: event.target.value })}
            />
            <label className="inline">
              <input
                type="checkbox"
                checked={seat.isBot}
                onChange={(event) => update(index, { isBot: event.target.checked })}
              />
              bot
            </label>
          </div>
        ))}
      </div>

      <div className="row">
        <button type="button" onClick={addSeat} disabled={seats.length >= maxSeats}>
          Add seat
        </button>
        <button type="button" onClick={removeSeat} disabled={seats.length <= minSeats}>
          Remove seat
        </button>
        <label className="inline">
          seed
          <input
            value={seed}
            placeholder="optional"
            style={{ width: '9rem' }}
            onChange={(event) => setSeed(event.target.value)}
          />
        </label>
      </div>

      {toggles.length > 0 ? (
        <div className="stack" style={{ gap: '0.3rem' }}>
          {toggles.map((toggle) => (
            <label key={toggle.key} className="inline">
              <input
                type="checkbox"
                checked={flags[toggle.key] ?? toggle.defaultValue}
                onChange={(event) =>
                  setFlags((current) => ({ ...current, [toggle.key]: event.target.checked }))
                }
              />
              {toggle.label}
              {toggle.hint ? <span className="muted"> — {toggle.hint}</span> : null}
            </label>
          ))}
        </div>
      ) : null}

      {humans === 0 ? <p className="error small">At least one seat has to be a human.</p> : null}

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || humans === 0}
          onClick={() =>
            onStart({ players: seats, flags, ...(seed.trim() ? { seed: seed.trim() } : {}) })
          }
        >
          {busy ? 'Dealing…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
