'use client';

import { useState } from 'react';
import type { NewGameInput } from '@/lib/hero-war-client';

interface Seat {
  name: string;
  isBot: boolean;
}

// Names read back in the log ("Player 1's turn"), so avoid pronouns here.
const DEFAULT_SEATS: Seat[] = [
  { name: 'Player 1', isBot: false },
  { name: 'Bot', isBot: true },
];

export function NewGameForm({
  onStart,
  busy,
}: {
  onStart: (input: NewGameInput) => void;
  busy: boolean;
}) {
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS);
  const [seed, setSeed] = useState('');

  const update = (index: number, patch: Partial<Seat>) =>
    setSeats((current) => current.map((seat, i) => (i === index ? { ...seat, ...patch } : seat)));

  const addSeat = () =>
    setSeats((current) =>
      current.length >= 8 ? current : [...current, { name: `Player ${current.length + 1}`, isBot: true }],
    );

  const removeSeat = () =>
    setSeats((current) => (current.length <= 2 ? current : current.slice(0, -1)));

  const start = () => {
    const input: NewGameInput = { players: seats };
    if (seed.trim()) input.seed = seed.trim();
    onStart(input);
  };

  const humans = seats.filter((seat) => !seat.isBot).length;

  return (
    <div className="panel stack" style={{ maxWidth: 560 }}>
      <div>
        <h2>New table</h2>
        <p className="muted small">
          Bots play themselves. Two or more humans share this screen, hot-seat style.
        </p>
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
        <button type="button" onClick={addSeat} disabled={seats.length >= 8}>
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
        <button type="button" className="primary" onClick={start} disabled={busy || humans === 0}>
          {busy ? 'Dealing…' : 'Deal the cards'}
        </button>
      </div>
    </div>
  );
}
