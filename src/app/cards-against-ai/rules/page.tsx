import Link from 'next/link';
import { Markdown } from '@/lib/markdown';
import { readGameDoc } from '@/lib/game-docs';

export const metadata = {
  title: 'Cards Against AI rules · Party Games',
};

export default async function CardsAgainstAiRulesPage() {
  const [rules, houseRules] = await Promise.all([
    readGameDoc('games/cards_against_ai/RULES.md'),
    readGameDoc('games/cards_against_ai/HOUSE_RULES.md'),
  ]);

  return (
    <div className="stack">
      <div className="row">
        <Link href="/cards-against-ai">← Back to the table</Link>
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
