import { NextResponse } from 'next/server';

import { isDatabaseError } from './errors';

/** Convert service-layer failures into safe, stable route responses. */
export function databaseErrorResponse(error: unknown, fallback = 'Database operation failed') {
  if (isDatabaseError(error)) {
    const status =
      error.code === 'validation'
        ? 422
        : error.code === 'not_found'
          ? 404
          : error.code === 'conflict'
            ? 409
            : error.code === 'configuration'
              ? 503
              : 500;

    console.error(`[database:${error.operation}]`, error);
    return NextResponse.json(
      { error: error.code === 'validation' ? error.message : fallback },
      { status }
    );
  }

  console.error('[database:unknown]', error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
