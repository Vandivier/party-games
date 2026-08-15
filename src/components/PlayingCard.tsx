import type { Card } from '@/core/cards';

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  const classes = ['card'];
  if (RED_SUITS.has(card.suit)) classes.push('red');
  if (small) classes.push('small-card');
  return (
    <span className={classes.join(' ')} aria-label={`${card.rank} of ${card.suit}`}>
      <span className="rank">{card.rank}</span>
      <span className="pip" aria-hidden="true">
        {card.symbol}
      </span>
    </span>
  );
}

export function CardBack({ small = false }: { small?: boolean }) {
  return <span className={`card back${small ? ' small-card' : ''}`} aria-label="face-down card" />;
}

export function CardRow({ cards, small = false }: { cards: readonly Card[]; small?: boolean }) {
  return (
    <div className="hand">
      {cards.map((card) => (
        <PlayingCard key={card.id} card={card} small={small} />
      ))}
    </div>
  );
}

export function SelectableCard({
  card,
  selected,
  disabled,
  onToggle,
  title,
}: {
  card: Card;
  selected: boolean;
  disabled?: boolean;
  onToggle: (card: Card) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`card-button${selected ? ' selected' : ''}`}
      disabled={disabled}
      aria-pressed={selected}
      title={title ?? card.label}
      onClick={() => onToggle(card)}
    >
      <PlayingCard card={card} />
    </button>
  );
}
