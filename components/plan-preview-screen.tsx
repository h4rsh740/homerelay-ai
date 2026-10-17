'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { ApprovalDialog } from '@/components/approval-dialog';
import { Badge, Button } from '@/components/ui';
import { FlowSteps, ScreenHeader, StatusPill } from '@/components/screen-primitives';
import { useHomeRelay } from '@/components/providers';

export function PlanPreviewScreen() {
  const { activePlan, cancelPlan } = useHomeRelay();
  const [cancelling, setCancelling] = useState(false);
  const [cancelledMessage, setCancelledMessage] = useState<string | null>(null);

  const handleCancel = async () => {
    setCancelling(true);
    const success = await cancelPlan();
    setCancelling(false);
    if (success) {
      setCancelledMessage('Plan was cancelled. No actions were executed.');
    }
  };

  if (!activePlan) {
    return (
      <div className="mx-auto w-full max-w-[1120px] animate-fade-in pb-10">
        <ScreenHeader
          eyebrow="HomeRelay AI / Review"
          title="No active plan to review."
          description="Start with a household request to generate a personalized action plan with verified MCP tools."
        />

        <FlowSteps current="plan" />

        <div className="mt-8 border border-[var(--border-strong)] bg-[var(--surface)] p-12 text-center shadow-[var(--shadow-sm)]">
          <ClipboardCheck aria-hidden="true" className="mx-auto size-12 text-[var(--teal-400)]" />
          <h2 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">Ready for your request</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            Write down a household goal or chore, and the agent will produce a step-by-step plan for your approval.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link href="/new-request">
                <Plus aria-hidden="true" /> Create New Request
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tasks">View Existing Tasks</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { plan, prompt, status } = activePlan;
  const isCancelled = status === 'cancelled';
  const isExecuted = status === 'executed';

  return (
    <div className="mx-auto w-full max-w-[1120px] animate-fade-in pb-10">
      <ScreenHeader
        eyebrow="Request Review · Awaiting Decision"
        title="Review the details."
        description="A short, ordered plan is easy to understand and trust. Check each step and tool before authorizing execution."
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              <Sparkles aria-hidden="true" className="size-3.5" /> Real Agent Plan
            </span>
          </div>
        }
      />

      <FlowSteps current="plan" />

      {cancelledMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-6 flex items-center gap-3 border-l-2 border-[var(--warning)] bg-[rgba(234,180,91,0.08)] p-4 text-sm text-[var(--warning)]"
        >
          <Ban aria-hidden="true" className="size-5 shrink-0" />
          <span>{cancelledMessage}</span>
        </div>
      )}

      <div className="mt-8 grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <main
          aria-labelledby="plan-title"
          className="border border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
        >
          <header className="border-b border-[var(--border)] p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <ClipboardCheck aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
                    Action Plan
                  </span>
                  <Badge variant={isCancelled ? 'destructive' : isExecuted ? 'secondary' : 'warning'} size="sm">
                    {isCancelled ? 'Cancelled' : isExecuted ? 'Executed' : 'Pending Approval'}
                  </Badge>
                </div>
                <h2 id="plan-title" className="editorial-title text-3xl text-[var(--text-primary)]">
                  {plan.summary}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {plan.steps.length} proposed action(s) · {plan.estimated_duration_seconds ?? 5}s estimated runtime
                </p>
              </div>
              <StatusPill status={isCancelled ? 'danger' : isExecuted ? 'success' : 'warning'}>
                {isCancelled ? 'Cancelled' : isExecuted ? 'Executed' : 'Awaiting approval'}
              </StatusPill>
            </div>
          </header>

          <div className="p-5 sm:p-8">
            <div className="border-l-2 border-l-[var(--teal-500)] bg-[var(--surface-subtle)] px-4 py-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Original Request
              </p>
              <p className="text-sm leading-6 text-[var(--text-primary)]">“{prompt}”</p>
            </div>

            <div className="mt-9">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Proposed Actions</h3>
                <span className="text-[11px] text-[var(--text-muted)]">Sequential execution order</span>
              </div>
              <ol
                aria-label="Planned action steps"
                className="divide-y divide-[var(--border)] border-b border-[var(--border)]"
              >
                {plan.steps.map((step, idx) => (
                  <li
                    key={step.step_index ?? idx}
                    className="grid gap-4 py-5 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-start"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-[rgba(83,216,196,0.35)] bg-[rgba(20,184,166,0.08)] text-xs font-bold text-[var(--teal-400)]">
                      {String((step.step_index ?? idx) + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                          {step.description}
                        </h4>
                        <Badge variant="outline" size="sm">
                          {step.tool_name}
                        </Badge>
                      </div>

                      {/* Display validated tool inputs */}
                      <div className="mt-2.5 rounded bg-[var(--surface-subtle)] p-2.5 text-xs text-[var(--text-secondary)]">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                          Tool Arguments:
                        </p>
                        <pre className="overflow-x-auto text-[11px] font-mono text-[var(--teal-400)]">
                          {JSON.stringify(step.tool_input, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <FileSearch
                      aria-hidden="true"
                      className="hidden size-4 text-[var(--text-muted)] sm:mt-1 sm:block"
                    />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </main>

        <aside className="space-y-9 lg:pt-3">
          <section aria-labelledby="review-notes-title" className="border-l-2 border-l-[var(--teal-500)] pl-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
              Safety Verification
            </p>
            <h2 id="review-notes-title" className="editorial-title text-2xl text-[var(--text-primary)]">
              Server Guardrails
            </h2>
            <ul className="mt-5 space-y-4 text-xs leading-5 text-[var(--text-secondary)]">
              <li className="flex gap-2.5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--teal-400)]" />
                No tool will run without explicit approval.
              </li>
              <li className="flex gap-2.5">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--teal-400)]" />
                All arguments have been pre-validated with Zod.
              </li>
              <li className="flex gap-2.5">
                <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--teal-400)]" />
                Cancelling blocks any execution attempt.
              </li>
            </ul>
          </section>

          <section aria-label="Plan decision" className="border-y border-[var(--border)] py-6">
            <div className="flex items-center gap-2 text-[var(--teal-400)]">
              <ShieldCheck aria-hidden="true" className="size-4" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Your Decision</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {isCancelled
                ? 'This plan was cancelled. You can edit the request or start fresh.'
                : isExecuted
                ? 'This plan was already executed. View the results below.'
                : 'Approve this plan to execute the actions via the MCP server.'}
            </p>

            <div className="mt-5 space-y-3">
              {!isCancelled && !isExecuted && (
                <>
                  <ApprovalDialog className="w-full" />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-[var(--error)] hover:border-[var(--error)] hover:bg-[rgba(239,68,68,0.06)]"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    <Ban aria-hidden="true" /> {cancelling ? 'Cancelling…' : 'Cancel Plan'}
                  </Button>
                </>
              )}

              {isExecuted && (
                <Button asChild className="w-full">
                  <Link href="/results">
                    View Execution Results <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}

              <Button asChild variant="ghost" className="w-full">
                <Link href="/new-request">
                  <ArrowLeft aria-hidden="true" /> Edit Request
                </Link>
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
