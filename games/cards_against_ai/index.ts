import type { GameDefinition } from '@/core/game-definition';

export const cardsAgainstAi: GameDefinition = {
  id: 'cards-against-ai',
  name: 'Cards Against AI',
  blurb:
    'You are the model. An Input Card asks something dumb, mundane or academic; everyone answers ' +
    'face down with an Output Card, the answers are shuffled and revealed, and the table votes for ' +
    'the best one. Seven points wins.',
  minPlayers: 3,
  maxPlayers: 8,
  props: ['The Input and Output decks (print them or play here)'],
  rulesPath: 'games/cards_against_ai/RULES.md',
  href: '/cards-against-ai',
  docsHref: '/cards-against-ai/rules',
  status: 'playable',
};

export * from './cards';
export * from './types';
export * from './engine';
export * from './bot';
export * from './view';
