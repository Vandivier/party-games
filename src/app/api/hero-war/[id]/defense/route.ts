import { NextResponse } from 'next/server';
import { applyDefense } from '@/server/hero-war-store';
import { parseDefense } from '@/server/validate';
import { errorResponse } from '@/server/http';

export const dynamic = 'force-dynamic';

/** POST /api/hero-war/:id/defense — answer a pending attack (heart id, or null). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const { seat, cardId } = parseDefense(body);
    return NextResponse.json({ view: applyDefense(id, seat, cardId) });
  } catch (error) {
    return errorResponse(error);
  }
}
