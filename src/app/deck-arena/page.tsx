import Link from 'next/link';
import { ArenaTable } from '@/components/deck-arena/ArenaTable';

export const metadata = {
  title: 'Deck Arena · Party Games',
  description: 'A turn-based poker deck arena battle for 2–8 players.',
};

export default function DeckArenaPage() {
  return (
    <div className="stack">
      <ArenaTable />
      <div className="panel">
        <h3>Field manual</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Roll 1d6 each turn: <strong>1–3 gives one action, 4–6 gives two</strong>. The first search
          of the turn is free. <strong>♣ clubs</strong> are weapons — A–4 hit for 1 at range 2, 5–9
          for 2 at range 4, 10–K for 3 at range 6, always along your row or column, never through a
          body. <strong>♥ hearts</strong> heal and <strong>♠ spades</strong> shield by the same 1/2/3
          tiers · <strong>♦ diamonds</strong> burn for extra actions.
        </p>
        <p className="small muted" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          Two optional rules, each switched on or off when you set the game up.{' '}
          <strong>Face card abilities</strong>: club face cards are snipers and shotguns,{' '}
          <strong>J♥/Q♥</strong> regen, <strong>K♥</strong> revives you the moment you die, face
          spades are overshields worth 2/4/6, and face diamonds give a free step, a teleport, or an
          extra action. <strong>Ace victory</strong>: aces go face up when you find them, sit outside
          your hand limit, and collecting all four wins outright — killing someone takes theirs along
          with their hand.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          <Link href="/deck-arena/rules">Full rules →</Link>
        </p>
      </div>
    </div>
  );
}
