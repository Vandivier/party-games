import Link from 'next/link';
import { GAMES } from '@/games/registry';

export default function LobbyPage() {
  return (
    <section>
      <h1>Party Games</h1>
      <p className="lede">
        Games you can play at a table with a standard poker deck and a couple of dice — and here,
        against a bot or a friend passing the same screen.
      </p>

      <div className="game-grid">
        {GAMES.map((game) => (
          <article key={game.id} className="game-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{game.name}</h2>
              <span className="tag">{game.status}</span>
            </div>
            <p className="muted small">{game.blurb}</p>
            <p className="small muted">
              {game.minPlayers}–{game.maxPlayers} players · {game.props.join(', ')}
            </p>
            {game.href ? (
              <div className="row">
                <Link href={game.href}>Play →</Link>
              </div>
            ) : null}
          </article>
        ))}

        <article className="game-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Dice</h2>
            <span className="tag">tool</span>
          </div>
          <p className="muted small">
            A d6, a d20, or any <code>NdS+M</code> you care to roll.
          </p>
          <div className="row">
            <Link href="/dice">Roll →</Link>
          </div>
        </article>
      </div>
    </section>
  );
}
