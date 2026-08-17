import { NextResponse } from 'next/server';
import { applyAction } from '@/server/deck-arena-store';
import { parseArenaAction } from '@/server/deck-arena-validate';
import { parseSeat } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/deck-arena/:id/action — take one action from one seat. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { seat?: unknown; action?: unknown };
    const seat = parseSeat(body?.seat);
    const action = parseArenaAction(body?.action);
    return NextResponse.json({ view: applyAction(id, seat, action) });
  } catch (error) {
    return errorResponse(error);
  }
}
