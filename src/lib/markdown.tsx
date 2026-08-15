/**
 * A deliberately tiny Markdown renderer — enough for the rules files this repo
 * ships (headings, bullets, paragraphs, links) and nothing more.
 */

import type { ReactNode } from 'react';

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD = /\*\*([^*]+)\*\*/g;

/** Strip link syntax down to its text and honour **bold**. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const plain = text.replace(LINK, '$1');
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of plain.matchAll(BOLD)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(plain.slice(cursor, start));
    nodes.push(<strong key={`${keyPrefix}-b${start}`}>{match[1]}</strong>);
    cursor = start + match[0].length;
  }
  if (cursor < plain.length) nodes.push(plain.slice(cursor));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split('\n');
  let bullets: string[] = [];
  let paragraph: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key}>
        {items.map((item, index) => (
          <li key={index}>{inline(item, `${key}-${index}`)}</li>
        ))}
      </ul>,
    );
  };

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    paragraph = [];
    blocks.push(<p key={key}>{inline(text, key)}</p>);
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `b${index}`;

    if (/^#{1,3}\s/.test(line)) {
      flushBullets(`${key}-ul`);
      flushParagraph(`${key}-p`);
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#+\s*/, '');
      const Heading = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      blocks.push(<Heading key={key}>{inline(text, key)}</Heading>);
      return;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph(`${key}-p`);
      bullets.push(line.replace(/^\s*[-*]\s+/, ''));
      return;
    }

    if (line.trim() === '') {
      flushBullets(`${key}-ul`);
      flushParagraph(`${key}-p`);
      return;
    }

    // A wrapped continuation of the bullet or paragraph above.
    if (bullets.length > 0 && /^\s{2,}/.test(raw)) {
      bullets[bullets.length - 1] += ` ${line.trim()}`;
      return;
    }
    paragraph.push(line.trim());
  });

  flushBullets('tail-ul');
  flushParagraph('tail-p');

  return <div className="prose">{blocks}</div>;
}
