/**
 * Bots fill seats. They pick a card at random and vote at random, because a
 * model guessing which joke a table will find funny is a different project — and
 * a bot that voted "well" would just flatten the game.
 */

import { isWaitingOn, seatAt } from './engine';
import type { CaaAction, CaaState } from './types';

export function botAction(state: CaaState, seat: number): CaaAction | null {
  const player = seatAt(state, seat);
  if (!player || !isWaitingOn(state, seat)) return null;

  if (state.phase === 'submit') {
    const card = player.hand[state.rng.int(0, player.hand.length - 1)];
    return card ? { type: 'submit', cardId: card.id } : null;
  }

  if (state.phase === 'vote') {
    const options = state.submissions.filter((entry) => entry.playerIndex !== seat);
    const pick = options[state.rng.int(0, options.length - 1)];
    return pick ? { type: 'vote', submissionId: pick.id } : null;
  }

  return null;
}
