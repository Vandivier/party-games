import { NextResponse } from 'next/server';
import { applyAction } from '@/server/hero-war-store';
import { parseAction, parseSeat } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/hero-war/:id/action — take a turn action from one seat. */
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
