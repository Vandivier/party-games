import Link from 'next/link';
import { HeroWarTable } from '@/components/hero-war/HeroWarTable';

export const metadata = {
  title: 'Hero War · Party Games',
  description: 'War with heroes, equipment, and spells — played with a standard poker deck.',
};

export default function HeroWarPage() {
  return (
    <div className="stack">
      <HeroWarTable />
      <div className="panel">
        <h3>Suit cheat sheet</h3>
        <p className="small muted" style={{ margin: 0 }}>
          <strong>Face cards</strong> are heroes (20 hp, damage equal to face value) ·{' '}
          <strong>♣ clubs</strong> equip for permanent damage · <strong>♥ hearts</strong> nullify an
          attack against you · <strong>♦ diamonds</strong> boost one attack ·{' '}
          <strong>♠ spades</strong> destroy enemy gear or buy a free draw.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          <Link href="/hero-war/rules">Full rules →</Link>
        </p>
      </div>
    </div>
  );
}
