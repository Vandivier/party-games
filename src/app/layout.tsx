import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Party Games',
  description: 'Card and dice games playable with standard poker decks, d6 and d20.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            🃏 Party Games
          </Link>
          <nav>
            <Link href="/hero-war">Hero War</Link>
            <Link href="/deck-arena">Deck Arena</Link>
            <Link href="/dice">Dice</Link>
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
