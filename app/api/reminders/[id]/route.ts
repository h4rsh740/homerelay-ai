import { NextRequest, NextResponse } from 'next/server';
import { databaseErrorResponse } from '@/lib/db/http';
import { deleteReminder, updateReminder } from '@/lib/db';
import { UpdateReminderSchema, UUIDSchema } from '@/lib/validators/schemas';

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUIDSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid reminder ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateReminderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ reminder: await updateReminder(id, parsed.data) });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to update reminder');
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUIDSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid reminder ID' }, { status: 400 });
  }

  try {
    await deleteReminder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to delete reminder');
  }
}
