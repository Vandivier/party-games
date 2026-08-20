import { NextResponse } from 'next/server';
import { createSession } from '@/server/cards-against-ai-store';
import { parseNewGame } from '@/server/cards-against-ai-validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/cards-against-ai — deal a new table. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { view, seats } = createSession(parseNewGame(body));
    return NextResponse.json({ view, seats }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
