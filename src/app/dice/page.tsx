import { DiceRoller } from '@/components/DiceRoller';

export const metadata = {
  title: 'Dice · Party Games',
  description: 'Roll a d6, a d20, or any NdS+M.',
};

export default function DicePage() {
  return (
    <section className="stack">
      <div>
        <h1>Dice</h1>
        <p className="lede">
          For games that need them. Type any <code>NdS+M</code> notation, or tap a preset.
        </p>
      </div>
      <DiceRoller />
    </section>
  );
}
