import { NextRequest, NextResponse } from 'next/server';
import { pgliteClient } from '@/lib/db/pglite';

export interface InternalDbPayload {
  tableName: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  selectColumns?: string;
  data?: Record<string, unknown> | Record<string, unknown>[];
  filters?: Array<{ column: string; value: unknown }>;
  inFilters?: Array<{ column: string; values: unknown[] }>;
  orderClause?: { column: string; ascending: boolean };
  limitCount?: number;
  offsetCount?: number;
  conflictKey?: string;
  isSingle?: boolean;
  isMaybeSingle?: boolean;
}

export async function POST(req: NextRequest) {
  const secret = process.env.MCP_SERVER_SECRET;
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (secret && token !== secret) {
    return NextResponse.json({ error: 'Unauthorized internal DB access' }, { status: 401 });
  }

  let body: InternalDbPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.tableName || !body.action) {
    return NextResponse.json({ error: 'Missing tableName or action' }, { status: 422 });
  }

  try {
    const builder = pgliteClient.from(body.tableName);

    if (body.action === 'insert') {
      builder.insert(body.data!);
    } else if (body.action === 'update') {
      builder.update((body.data as Record<string, unknown>) ?? {});
    } else if (body.action === 'delete') {
      builder.delete();
    } else if (body.action === 'upsert') {
      builder.upsert(body.data!, { onConflict: body.conflictKey });
    } else {
      builder.select(body.selectColumns ?? '*');
    }

    if (body.filters) {
      for (const filter of body.filters) {
        builder.eq(filter.column, filter.value);
      }
    }

    if (body.inFilters) {
      for (const inFilter of body.inFilters) {
        builder.in(inFilter.column, inFilter.values);
      }
    }

    if (body.orderClause) {
      builder.order(body.orderClause.column, { ascending: body.orderClause.ascending });
    }

    if (body.limitCount !== undefined) {
      builder.limit(body.limitCount);
    }

    if (body.offsetCount !== undefined) {
      builder.range(body.offsetCount, body.offsetCount + (body.limitCount ?? 10) - 1);
    }

    let result;
    if (body.isSingle) {
      result = await builder.single();
    } else if (body.isMaybeSingle) {
      result = await builder.maybeSingle();
    } else {
      result = await builder.execute();
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { data: null, error: { message, code: 'INTERNAL_DB_ERROR' } },
      { status: 500 }
    );
  }
}
