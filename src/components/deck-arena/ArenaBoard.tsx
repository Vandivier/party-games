import type { ArenaView } from '@games/deck_arena/view';

/** Eight seat colours, in seat order. */
export const SEAT_COLORS = [
  '#e8c37a',
  '#6fc2f0',
  '#f0846f',
  '#8fd694',
  '#c79bf0',
  '#f0d76f',
  '#6fe0d0',
  '#f08fc0',
];

export const seatColor = (index: number): string =>
  SEAT_COLORS[index % SEAT_COLORS.length] as string;

interface Pawn {
  index: number;
  name: string;
  hp: number;
  shield: number;
  out: boolean;
}

/** The 6x6 arena: face-down loot, and a die for every player still standing. */
export function ArenaBoard({ view }: { view: ArenaView }) {
  const pawns = new Map<number, Pawn>();
  pawns.set(view.you.index, {
    index: view.you.index,
    name: `${view.you.name} (you)`,
    hp: view.you.hp,
    shield: view.you.shield,
    out: view.you.out,
  });
  for (const opponent of view.opponents) {
    pawns.set(opponent.index, {
      index: opponent.index,
      name: opponent.name,
      hp: opponent.hp,
      shield: opponent.shield,
      out: opponent.out,
    });
  }

  return (
    <div
      className="arena-grid"
      style={{ gridTemplateColumns: `repeat(${view.boardSize}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="arena"
    >
      {view.cells.map((cell) => {
        const pawn = cell.playerIndex === null ? undefined : pawns.get(cell.playerIndex);
        const isYou = pawn?.index === view.you.index;
        const isTurn = pawn?.index === view.turnPlayerIndex;
        const classes = ['arena-cell'];
        if (pawn) classes.push('occupied');
        if (isYou) classes.push('you');
        if (isTurn) classes.push('acting');

        return (
          <div
            key={`${cell.x},${cell.y}`}
            className={classes.join(' ')}
            role="gridcell"
            title={pawn ? `${pawn.name} at ${cell.x},${cell.y}` : `${cell.x},${cell.y}`}
          >
            <span className="coord" aria-hidden="true">
              {cell.x},{cell.y}
            </span>
            {pawn ? (
              <span
                className="pawn"
                style={{ borderColor: seatColor(pawn.index), color: seatColor(pawn.index) }}
              >
                <span className="pawn-hp">{pawn.hp}</span>
                {pawn.shield > 0 ? <span className="pawn-shield">🛡{pawn.shield}</span> : null}
              </span>
            ) : cell.hasCard ? (
              <span className="loot" aria-label="face-down card" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
