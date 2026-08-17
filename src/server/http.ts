import { NextResponse } from 'next/server';
import { GameError } from './game-error';

/** Turn a thrown GameError into its status; anything else is a 500. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof GameError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Unexpected API failure', error);
  return NextResponse.json({ error: 'Something went wrong at the table.' }, { status: 500 });
}
