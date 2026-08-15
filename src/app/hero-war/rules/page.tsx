import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { Markdown } from '@/lib/markdown';

export const metadata = {
  title: 'Hero War rules · Party Games',
};

/** The rules files in the repo are the single source of truth — read them directly. */
async function readRules(file: string): Promise<string> {
  return readFile(path.join(process.cwd(), 'games', 'hero_war', file), 'utf8');
}

export default async function HeroWarRulesPage() {
  const [rules, houseRules] = await Promise.all([
    readRules('RULES.md'),
    readRules('HOUSE_RULES.md'),
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
