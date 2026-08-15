import { NextResponse } from 'next/server';
import { createSession } from '@/server/hero-war-store';
import { parseNewGame } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/hero-war — deal a new table. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const { view, seats } = createSession(parseNewGame(body));
    return NextResponse.json({ view, seats }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
