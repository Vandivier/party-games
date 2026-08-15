'use client';

import { useState } from 'react';
import { rollNotation, type DiceRoll } from '@/core/dice';

const PRESETS = ['d6', '2d6', 'd20', 'd20+5', '4d6'];

export function DiceRoller() {
  const [notation, setNotation] = useState('d20');
  const [result, setResult] = useState<DiceRoll | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const doRoll = (value: string) => {
    setNotation(value);
    try {
      const rolled = rollNotation(value);
      setResult(rolled);
      setError(null);
      // Oldest first: the log panel renders bottom-up, so the newest lands on top.
      setHistory((current) => [...current, `${rolled.notation} → ${rolled.total}`].slice(-12));
    } catch (failure) {
      setResult(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <div className="panel stack">
        <div className="row">
          <label className="inline">
            <input
              value={notation}
              aria-label="dice notation"
              style={{ width: '7rem' }}
              onChange={(event) => setNotation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') doRoll(notation);
              }}
            />
          </label>
          <button type="button" className="primary" onClick={() => doRoll(notation)}>
            Roll
          </button>
        </div>

        <div className="row">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => doRoll(preset)}>
              {preset}
            </button>
          ))}
        </div>

        {error ? <div className="error small">{error}</div> : null}

        {result ? (
          <div>
            <div className="dice-result">{result.total}</div>
            <div className="row small muted">
              {result.rolls.map((value, index) => (
                <span key={index} className="die">
                  {value}
                </span>
              ))}
              {result.modifier ? <span>{result.modifier > 0 ? `+${result.modifier}` : result.modifier}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      {history.length ? (
        <div className="panel">
          <h3>Recent rolls</h3>
          <div className="log">
            {history.map((entry, index) => (
              <div key={`${index}-${entry}`} className="log-line">
                {entry}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
