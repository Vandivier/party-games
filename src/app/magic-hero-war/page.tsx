import Link from 'next/link';
import { Markdown } from '@/lib/markdown';
import { readGameDoc } from '@/lib/game-docs';
import { getGame } from '@/games/registry';

export const metadata = {
  title: 'Magic Hero War · Party Games',
  description: 'Planned: Hero War expanded with spells, hero parties, more players, and deck maps.',
};

export default async function MagicHeroWarPage() {
  const game = getGame('magic-hero-war');
  const concept = await readGameDoc(game?.rulesPath ?? 'games/magic_hero_war/CONCEPT.md');

  return (
    <div className="stack">
      <div className="row">
        <Link href="/">← All games</Link>
      </div>
      <div className="banner">
        <strong>Coming soon.</strong> Nothing below is implemented — it is a statement of intent
        while the rules are worked out. In the meantime, <Link href="/hero-war">Hero War</Link> is
        playable.
      </div>
      <article className="panel">
        <Markdown source={concept} />
      </article>
    </div>
  );
}
