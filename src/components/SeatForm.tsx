'use client';

import { useState } from 'react';

export interface Seat {
  name: string;
  isBot: boolean;
}

export interface SeatFormValue {
  players: Seat[];
  seed?: string;
}

/** Shared "who is playing" panel: seats, bot toggles, and an optional seed. */
export function SeatForm({
  onStart,
  busy,
  maxSeats,
  defaultSeats,
  note,
  submitLabel = 'Deal the cards',
}: {
  onStart: (value: SeatFormValue) => void;
  busy: boolean;
  maxSeats: number;
  defaultSeats: Seat[];
  note: string;
  submitLabel?: string;
}) {
  const [seats, setSeats] = useState<Seat[]>(defaultSeats);
  const [seed, setSeed] = useState('');

  const update = (index: number, patch: Partial<Seat>) =>
    setSeats((current) => current.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)));

  const addSeat = () =>
    setSeats((current) =>
      current.length >= maxSeats
        ? current
        : [...current, { name: `Player ${current.length + 1}`, isBot: true }],
    );

  const removeSeat = () =>
    setSeats((current) => (current.length <= 2 ? current : current.slice(0, -1)));

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
        <button type="button" onClick={removeSeat} disabled={seats.length <= 2}>
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

      {humans === 0 ? <p className="error small">At least one seat has to be a human.</p> : null}

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || humans === 0}
          onClick={() => onStart({ players: seats, ...(seed.trim() ? { seed: seed.trim() } : {}) })}
        >
          {busy ? 'Dealing…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
