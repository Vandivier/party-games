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
  overshield: number;
  out: boolean;
}

/**
 * The 6x6 arena: face-down loot, and a die for every player still standing.
 * When `onPick` is set, empty cells become buttons — that is the teleport
 * flow asking where to land.
 */
export function ArenaBoard({
  view,
  onPick,
}: {
  view: ArenaView;
  onPick?: (cell: { x: number; y: number }) => void;
}) {
  const pawns = new Map<number, Pawn>();
  pawns.set(view.you.index, { ...view.you, name: `${view.you.name} (you)` });
  for (const opponent of view.opponents) pawns.set(opponent.index, opponent);

  return (
    <div
      className={`arena-grid${onPick ? ' picking' : ''}`}
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
        const pickable = Boolean(onPick) && !pawn;
        if (pickable) classes.push('pickable');

        const contents = (
          <>
            <span className="coord" aria-hidden="true">
              {cell.x},{cell.y}
            </span>
            {pawn ? (
              <span
                className="pawn"
                style={{ borderColor: seatColor(pawn.index), color: seatColor(pawn.index) }}
              >
                <span className="pawn-hp">{pawn.hp}</span>
                {pawn.shield + pawn.overshield > 0 ? (
                  <span className="pawn-shield">
                    🛡{pawn.shield}
                    {pawn.overshield > 0 ? `+${pawn.overshield}` : ''}
                  </span>
                ) : null}
              </span>
            ) : cell.hasCard ? (
              <span className="loot" aria-label="face-down card" />
            ) : null}
          </>
        );

        const title = pawn
          ? `${pawn.name} at ${cell.x},${cell.y}`
          : pickable
            ? `Teleport to ${cell.x},${cell.y}`
            : `${cell.x},${cell.y}`;

        return pickable ? (
          <button
            key={`${cell.x},${cell.y}`}
            type="button"
            className={classes.join(' ')}
            title={title}
            onClick={() => onPick?.({ x: cell.x, y: cell.y })}
          >
            {contents}
          </button>
        ) : (
          <div key={`${cell.x},${cell.y}`} className={classes.join(' ')} role="gridcell" title={title}>
            {contents}
          </div>
        );
      })}
    </div>
  );
}
