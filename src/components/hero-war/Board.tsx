import type { Card } from '@/core/cards';
import type { DamageBreakdown } from '@games/hero_war/types';
import type { HeroView } from '@games/hero_war/view';
import { CardBack, CardRow, PlayingCard } from '@/components/PlayingCard';

interface BoardProps {
  name: string;
  hero: HeroView | null;
  equipment: readonly Card[];
  damage: DamageBreakdown;
  out: boolean;
  active: boolean;
  isBot?: boolean;
  isYou?: boolean;
  handCount?: number;
  children?: React.ReactNode;
}

export function Board({
  name,
  hero,
  equipment,
  damage,
  out,
  active,
  isBot,
  isYou,
  handCount,
  children,
}: BoardProps) {
  const classes = ['board'];
  if (active) classes.push('active');
  if (out) classes.push('out');

  return (
    <section className={classes.join(' ')}>
      <div className="board-head">
        <span className="board-name">
          {name}
          {isYou ? ' (you)' : ''} {isBot ? <span className="tag">bot</span> : null}
        </span>
        <span className="small muted">
          {out ? 'out of the game' : `attack ${damage.total}`}
          {damage.equipment > 0 && !out ? ` (${damage.hero} + ${damage.equipment} gear)` : ''}
        </span>
      </div>

      <div className="hero-line">
        {hero ? (
          <>
            <PlayingCard card={hero.card} />
            <HpBar hp={hero.hp} maxHp={hero.maxHp} />
          </>
        ) : (
          <span className="muted small">{out ? 'No heroes left.' : 'No hero on the field.'}</span>
        )}
      </div>

      <div className="row">
        <h3 style={{ margin: 0 }}>Gear</h3>
        {equipment.length ? (
          <CardRow cards={equipment} small />
        ) : (
          <span className="muted small">none</span>
        )}
      </div>

      {handCount !== undefined ? (
        <div className="row">
          <h3 style={{ margin: 0 }}>Hand</h3>
          {handCount > 0 ? (
            <div className="hand">
              {Array.from({ length: handCount }, (_, index) => (
                <CardBack key={index} small />
              ))}
            </div>
          ) : (
            <span className="muted small">empty</span>
          )}
        </div>
      ) : null}

      {children}
    </section>
  );
}

export function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const clamped = Math.max(0, hp);
  const ratio = maxHp > 0 ? clamped / maxHp : 0;
  const tone = ratio > 0.6 ? '' : ratio > 0.3 ? ' hurt' : ' critical';
  return (
    <>
      <div
        className="hp-bar"
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={maxHp}
        aria-label="hero hit points"
      >
        <div className={`hp-fill${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="hp-text">
        {clamped}/{maxHp} hp
      </span>
    </>
  );
}
