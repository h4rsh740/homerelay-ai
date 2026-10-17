import { NextRequest, NextResponse } from 'next/server';
import { databaseErrorResponse } from '@/lib/db/http';
import { deleteTask, updateTask } from '@/lib/db';
import { UpdateTaskSchema, UUIDSchema } from '@/lib/validators/schemas';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const idParsed = UUIDSchema.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ task: await updateTask(id, parsed.data) });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to update task');
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const idParsed = UUIDSchema.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });

  try {
    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to delete task');
  }
}
