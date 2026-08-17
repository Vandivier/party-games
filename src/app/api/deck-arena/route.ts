import { NextResponse } from 'next/server';
import { createSession } from '@/server/deck-arena-store';
import { parseNewArena } from '@/server/deck-arena-validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/deck-arena — deal a new arena. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { view, seats } = createSession(parseNewArena(body));
    return NextResponse.json({ view, seats }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
