import Link from 'next/link';
import { GameTable } from '@/components/cards-against-ai/GameTable';

export const metadata = {
  title: 'Cards Against AI · Party Games',
  description: 'You are the model. Answer the prompt, get voted on, reach seven points.',
};

export default function CardsAgainstAiPage() {
  return (
    <div className="stack">
      <GameTable />
      <div className="panel">
        <h3>How a round goes</h3>
        <p className="small muted" style={{ margin: 0 }}>
          An <strong>Input Card</strong> is turned up — something dumb, something mundane, sometimes
          something academic. Everybody answers at once with an <strong>Output Card</strong> played
          face down. When the last card is down they are shuffled and revealed with no names on them,
          and everyone votes for a card that is not their own. Most votes takes the round; a tie
          scores for everybody tied. First to <strong>seven points</strong> wins. Three to eight
          players — two would have to vote for each other every round.
        </p>
        <p className="small" style={{ marginBottom: 0 }}>
          <Link href="/cards-against-ai/rules">Full rules →</Link>
        </p>
      </div>
    </div>
  );
}
