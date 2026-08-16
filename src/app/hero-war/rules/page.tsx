import Link from 'next/link';
import { Markdown } from '@/lib/markdown';
import { readGameDoc } from '@/lib/game-docs';

export const metadata = {
  title: 'Hero War rules · Party Games',
};

export default async function HeroWarRulesPage() {
  const [rules, houseRules] = await Promise.all([
    readGameDoc('games/hero_war/RULES.md'),
    readGameDoc('games/hero_war/HOUSE_RULES.md'),
  ]);

  return (
    <div className="stack">
      <div className="row">
        <Link href="/hero-war">← Back to the table</Link>
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
