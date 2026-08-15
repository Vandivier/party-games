/** Standard 52-card poker deck: suits, ranks, and deck building. */

export type SuitKey = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type RankKey =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type FaceRank = 'J' | 'Q' | 'K';

export interface Suit {
  readonly key: SuitKey;
  readonly symbol: string;
  readonly name: string;
  readonly color: 'red' | 'black';
}

export interface Card {
  /** Unique within a game, so multi-deck games can tell two K♠ apart. */
  readonly id: string;
  readonly rank: RankKey;
  readonly suit: SuitKey;
  readonly symbol: string;
  /** A = 1, pips at face value, J/Q/K = 11/12/13. */
  readonly value: number;
  /** Display shorthand, e.g. "K♠". */
  readonly label: string;
}

export const SUITS: readonly Suit[] = [
  { key: 'spades', symbol: '♠', name: 'Spades', color: 'black' },
  { key: 'hearts', symbol: '♥', name: 'Hearts', color: 'red' },
  { key: 'diamonds', symbol: '♦', name: 'Diamonds', color: 'red' },
  { key: 'clubs', symbol: '♣', name: 'Clubs', color: 'black' },
];

export const RANKS: readonly { key: RankKey; value: number }[] = [
  { key: 'A', value: 1 },
  { key: '2', value: 2 },
  { key: '3', value: 3 },
  { key: '4', value: 4 },
  { key: '5', value: 5 },
  { key: '6', value: 6 },
  { key: '7', value: 7 },
  { key: '8', value: 8 },
  { key: '9', value: 9 },
  { key: '10', value: 10 },
  { key: 'J', value: 11 },
  { key: 'Q', value: 12 },
  { key: 'K', value: 13 },
];

export const FACE_RANKS: readonly FaceRank[] = ['J', 'Q', 'K'];

const SUIT_BY_KEY = new Map(SUITS.map((suit) => [suit.key, suit]));
const SUIT_ORDER = new Map(SUITS.map((suit, index) => [suit.key, index]));

/** Build `count` standard decks combined into one unshuffled pile. */
export function buildDeck(count = 1): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < count; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${rank.key}${suit.symbol}${count > 1 ? `#${copy + 1}` : ''}`,
          rank: rank.key,
          suit: suit.key,
          symbol: suit.symbol,
          value: rank.value,
          label: `${rank.key}${suit.symbol}`,
        });
      }
    }
  }
  return cards;
}

export function isFace(card: Card): boolean {
  return (FACE_RANKS as readonly string[]).includes(card.rank);
}

export function suitOf(key: SuitKey): Suit {
  const suit = SUIT_BY_KEY.get(key);
  if (!suit) throw new Error(`Unknown suit: ${key}`);
  return suit;
}

/** "K♠ Q♥ 3♦" — a compact hand listing. */
export function handToString(cards: readonly Card[]): string {
  return cards.map((card) => card.label).join(' ');
}

/** Sort for display: suit order first, then value. */
export function sortHand(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      (SUIT_ORDER.get(a.suit) ?? 0) - (SUIT_ORDER.get(b.suit) ?? 0) || a.value - b.value,
  );
}
