import { NextRequest, NextResponse } from 'next/server';
import { listExecutionLogs } from '@/lib/db';
import { databaseErrorResponse } from '@/lib/db/http';
import { ListExecutionLogsSchema } from '@/lib/db/validators';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = ListExecutionLogsSchema.safeParse({
    session_id: searchParams.get('session_id') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const history = await listExecutionLogs(parsed.data);
    return NextResponse.json({ history, total: history.length });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to fetch history');
  }
}
