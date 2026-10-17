import { NextRequest, NextResponse } from 'next/server';
import { createReminder, listReminders } from '@/lib/db';
import { databaseErrorResponse } from '@/lib/db/http';
import { ListRemindersSchema } from '@/lib/db/validators';
import { CreateReminderSchema } from '@/lib/validators/schemas';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isSent = searchParams.get('is_sent');
  const parsed = ListRemindersSchema.safeParse({
    is_sent: isSent === null ? undefined : isSent === 'true' ? true : isSent === 'false' ? false : isSent,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ reminders: await listReminders(parsed.data) });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to fetch reminders');
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateReminderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    return NextResponse.json({ reminder: await createReminder(parsed.data) }, { status: 201 });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to create reminder');
  }
}
