import { NextResponse } from 'next/server';
import { getView } from '@/server/cards-against-ai-store';
import { parseSeat } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** GET /api/cards-against-ai/:id?seat=0 — this seat's picture of the table. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const seat = parseSeat(new URL(request.url).searchParams.get('seat') ?? 0);
    return NextResponse.json({ view: getView(id, seat) });
  } catch (error) {
    return errorResponse(error);
  }
}
