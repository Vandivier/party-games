import Link from 'next/link';
import { Markdown } from '@/lib/markdown';
import { readGameDoc } from '@/lib/game-docs';

export const metadata = {
  title: 'Deck Arena rules · Party Games',
};

export default async function DeckArenaRulesPage() {
  const [rules, houseRules] = await Promise.all([
    readGameDoc('games/deck_arena/RULES.md'),
    readGameDoc('games/deck_arena/HOUSE_RULES.md'),
  ]);

  return (
    <div className="stack">
      <div className="row">
        <Link href="/deck-arena">← Back to the arena</Link>
      </div>
      <article className="panel">
        <Markdown source={rules} />
      </article>
      <article className="panel">
        <Markdown source={houseRules} />
      </article>
    </div>
  );
}
