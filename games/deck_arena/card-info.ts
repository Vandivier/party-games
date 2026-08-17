/**
 * Plain-language descriptions of what a card does, for the UI to show on
 * demand. Pure and stateless: it takes the two rule options rather than a game,
 * so a client can describe a card without the engine.
 *
 * Every brief says what happens to the card itself, because a face-card ability
 * looks like an ordinary move until you notice you just spent it.
 */

import type { Card } from '@/core/cards';

export interface CardBrief {
  /** "Super mobility", or "Weapon" for a card with no named ability. */
  name: string;
  /** What it does, in a sentence. */
  detail: string;
  /** What playing it costs you in cards. */
  fate: string;
}

export interface RuleOptions {
  faceCardAbilities: boolean;
  aceVictory: boolean;
}

const tier = (card: Card): number => (card.value <= 4 ? 1 : card.value <= 9 ? 2 : 3);
const isFace = (card: Card): boolean => ['J', 'Q', 'K'].includes(card.rank);

const SPENT = 'Playing it spends the card: it goes face down into the pile.';
const EQUIPPED =
  'Equipping moves the card out of your hand and in front of you as your weapon. Whatever you were carrying is thrown back into the pile.';

export function describeCard(card: Card, options: RuleOptions): CardBrief {
  if (card.rank === 'A' && options.aceVictory) {
    return {
      name: 'Ace',
      detail:
        'Lay it face up in front of you and draw a replacement. Face-up aces sit outside your hand limit, and all four win the game outright.',
      fate: 'Spending it for its suit effect instead gives up its place in the set.',
    };
  }

  const faces = options.faceCardAbilities && isFace(card);

  switch (card.suit) {
    case 'clubs':
      if (faces && card.rank === 'J') {
        return {
          name: 'Exploding sniper',
          detail:
            'Shoots the first player in any one direction, however far away. Strips their shield and overshield, then deals 1d6 straight to health.',
          fate: EQUIPPED,
        };
      }
      if (faces && card.rank === 'Q') {
        return {
          name: 'Piercing sniper',
          detail:
            'Shoots the first two players in one direction. Anyone with protection loses all of it; anyone without is killed outright.',
          fate: EQUIPPED,
        };
      }
      if (faces && card.rank === 'K') {
        return {
          name: 'Dual shotguns',
          detail:
            'Pick two directions. Each scatters 6 damage over the cell one step away and the two cells flanking it.',
          fate: EQUIPPED,
        };
      }
      return {
        name: 'Weapon',
        detail: `Equips as a weapon dealing ${tier(card)} damage at a range of ${tier(card) * 2} cells, along your row or column.`,
        fate: EQUIPPED,
      };

    case 'hearts':
      if (faces && card.rank === 'J') {
        return {
          name: 'Regen',
          detail: 'Heals you to full, then 1 more each turn for a rolled 1d6 turns, up to 6 health.',
          fate: SPENT,
        };
      }
      if (faces && card.rank === 'Q') {
        return {
          name: 'Regen with overheal',
          detail:
            'Heals you to full, then 1 more each turn for a rolled 1d6 turns — and these ticks can carry you past 6, up to 12 health.',
          fate: SPENT,
        };
      }
      if (faces && card.rank === 'K') {
        return {
          name: 'Auto-revive',
          detail:
            'Cannot be played. Hold it: the moment a hit would kill you it shows itself and restores you to full health.',
          fate: 'It is discarded when it saves you, and it only saves you once.',
        };
      }
      return { name: 'Heal', detail: `Heals ${tier(card)}, up to a maximum of 6.`, fate: SPENT };

    case 'spades':
      if (faces) {
        const points = card.rank === 'J' ? 2 : card.rank === 'Q' ? 4 : 6;
        return {
          name: 'Overshield',
          detail: `Straps on ${points} points of overshield, which sits alongside your armor. It swallows a hit whole — anything it cannot absorb is lost rather than carried through.`,
          fate: SPENT,
        };
      }
      return {
        name: 'Armor',
        detail: `Adds ${tier(card)} shield, up to a maximum of 6. Damage comes off shield before health.`,
        fate: SPENT,
      };

    default:
      if (faces && card.rank === 'J') {
        return {
          name: 'Super mobility',
          detail:
            'Step one cell for free — and you may play it on someone else’s turn, not just your own.',
          fate: SPENT,
        };
      }
      if (faces && card.rank === 'Q') {
        return {
          name: 'Teleport',
          detail: 'Blink to any unoccupied cell on the board, for free.',
          fate: SPENT,
        };
      }
      if (faces && card.rank === 'K') {
        return {
          name: 'Blitzkrieg',
          detail: 'Grants an extra action, and reloading costs nothing for the rest of the turn.',
          fate: SPENT,
        };
      }
      return {
        name: 'Energy',
        detail: `Free to play, and gives you ${card.value >= 7 ? 2 : 1} extra action${card.value >= 7 ? 's' : ''}.`,
        fate: SPENT,
      };
  }
}
