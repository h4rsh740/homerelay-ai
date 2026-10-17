import { NextRequest, NextResponse } from 'next/server';
import { createTask, listTasks } from '@/lib/db';
import { databaseErrorResponse } from '@/lib/db/http';
import { CreateTaskSchema, ListTasksSchema } from '@/lib/db/validators';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = ListTasksSchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ tasks: await listTasks(parsed.data) });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to fetch tasks');
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ task: await createTask(parsed.data) }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to create task');
  }
}
