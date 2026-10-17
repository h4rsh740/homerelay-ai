import { NextRequest, NextResponse } from 'next/server';
import { GeneratePlanRequestSchema } from '@/lib/validators/schemas';
import { createActionPlan } from '@/lib/ai/planner';

// Simple in-memory rate limiter (resets on server restart)
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15; // requests
const RATE_WINDOW_MS = 60_000; // per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT) return false;

  record.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { status: 429 }
    );
  }

  // Parse & validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = GeneratePlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  // Generate plan
  try {
    const result = await createActionPlan(parsed.data.prompt);
    return NextResponse.json(
      {
        plan: result.plan,
        plan_id: result.managedPlan.plan_id,
        status: result.managedPlan.status,
        created_at: result.managedPlan.created_at,
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/plan] Error:', message);
    return NextResponse.json(
      { error: 'Failed to generate plan. Please try again.' },
      { status: 500 }
    );
  }
}
