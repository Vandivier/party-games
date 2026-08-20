import { NextResponse } from 'next/server';
import { applyAction } from '@/server/cards-against-ai-store';
import { parseAction } from '@/server/cards-against-ai-validate';
import { parseSeat } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/cards-against-ai/:id/action — play a card, cast a vote, deal on. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { seat?: unknown; action?: unknown };
    const seat = parseSeat(body?.seat);
    const action = parseAction(body?.action);
    return NextResponse.json({ view: applyAction(id, seat, action) });
  } catch (error) {
    return errorResponse(error);
  }
}
