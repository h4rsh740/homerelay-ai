import { NextRequest, NextResponse } from 'next/server';
import { ApprovePlanRequestSchema } from '@/lib/validators/schemas';
import { executeApprovedPlan } from '@/lib/ai/executor';
import {
  approvePlan,
  cancelPlan,
  registerPlanForApproval,
  PlanApprovalError,
} from '@/lib/ai/approval';

/**
 * POST /api/approve
 * Accepts an action plan approval decision:
 * - action: 'cancel' -> marks plan as cancelled, returns 200 without executing.
 * - action: 'approve' -> marks plan as approved on the server and executes it.
 *
 * If a plan is not approved on the server or was cancelled, execution is rejected with 403.
 * Supports both SSE stream (Accept: text/event-stream) and standard JSON response.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ApprovePlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { prompt, plan, action = 'approve', session_id } = parsed.data;
  let planId = parsed.data.plan_id;

  // If no plan_id was supplied (legacy / direct plan payload), register it
  if (!planId) {
    const registered = registerPlanForApproval(prompt, plan);
    planId = registered.plan_id;
  }

  // ── Handle Explicit Cancellation ──────────────────────────────────────────
  if (action === 'cancel') {
    cancelPlan(planId);
    return NextResponse.json(
      {
        success: true,
        status: 'cancelled',
        message: 'Plan approval was cancelled by user. No actions were executed.',
        plan_id: planId,
      },
      { status: 200 }
    );
  }

  // ── Server-Enforced Approval ──────────────────────────────────────────────
  try {
    approvePlan(planId);
  } catch (err: unknown) {
    if (err instanceof PlanApprovalError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sessionId = session_id ?? crypto.randomUUID();
  const acceptsSSE = req.headers.get('accept')?.includes('text/event-stream');

  // ── 1. SSE Stream Response ────────────────────────────────────────────────
  if (acceptsSSE) {
    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    const sendEvent = async (event: string, data: unknown) => {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    (async () => {
      try {
        await sendEvent('session_start', {
          session_id: sessionId,
          plan_id: planId,
          total_steps: plan.steps.length,
        });

        const report = await executeApprovedPlan({
          plan_id: planId,
          session_id: sessionId,
          prompt,
          plan,
          onProgress: async (event, data) => {
            await sendEvent(event, data);
          },
        });

        await sendEvent('session_complete', report);
      } catch (fatalErr: unknown) {
        const message = fatalErr instanceof Error ? fatalErr.message : String(fatalErr);
        await sendEvent('session_error', { session_id: sessionId, error: message });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── 2. Standard JSON Response ─────────────────────────────────────────────
  try {
    const report = await executeApprovedPlan({
      plan_id: planId,
      session_id: sessionId,
      prompt,
      plan,
    });

    const statusCode = report.overall_status === 'failed' ? 500 : 200;
    return NextResponse.json(report, { status: statusCode });
  } catch (err: unknown) {
    if (err instanceof PlanApprovalError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
