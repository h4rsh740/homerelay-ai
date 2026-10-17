'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Badge, Button, Progress } from '@/components/ui';
import { FlowSteps, ScreenHeader, StatusPill } from '@/components/screen-primitives';
import { useHomeRelay, type ExecutionStepProgress } from '@/components/providers';

export function ExecutionScreen() {
  const {
    activePlan,
    executionSteps,
    isExecutingPlan,
    executionError,
    executionReport,
    executeApprovedPlan,
  } = useHomeRelay();

  const hasTriggeredRef = useRef(false);

  // Trigger execution automatically upon arriving on this screen if plan is ready
  useEffect(() => {
    if (activePlan && !executionReport && !isExecutingPlan && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      executeApprovedPlan();
    }
  }, [activePlan, executionReport, isExecutingPlan, executeApprovedPlan]);

  if (!activePlan) {
    return (
      <div className="mx-auto w-full max-w-[1120px] animate-fade-in pb-10">
        <ScreenHeader
          eyebrow="HomeRelay AI / Execution"
          title="No plan is queued for execution."
          description="Create a request and approve the resulting plan before accessing the execution screen."
        />
        <FlowSteps current="execution" />
        <div className="mt-8 border border-[var(--border-strong)] bg-[var(--surface)] p-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No active plan found.</p>
          <Button asChild className="mt-4">
            <Link href="/new-request">Create New Request</Link>
          </Button>
        </div>
      </div>
    );
  }

  const stepsToDisplay: ExecutionStepProgress[] =
    executionSteps.length > 0
      ? executionSteps
      : activePlan.plan.steps.map((s) => ({
          step_index: s.step_index,
          tool_name: s.tool_name,
          description: s.description,
          status: 'pending' as const,
        }));

  const totalSteps = stepsToDisplay.length;
  const completedCount = stepsToDisplay.filter((s) => s.status === 'completed').length;
  const failedCount = stepsToDisplay.filter((s) => s.status === 'failed').length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  const isFinished = Boolean(executionReport);

  return (
    <div className="mx-auto w-full max-w-[1120px] animate-fade-in pb-10">
      <ScreenHeader
        eyebrow="Verified Execution · MCP Stream"
        title="Real-time Execution Ledger"
        description="Every action runs through the official Model Context Protocol server. Results are verified and written directly to your database."
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              <Sparkles aria-hidden="true" className="size-3.5" /> MCP Server Connected
            </span>
          </div>
        }
      />

      <FlowSteps current="execution" />

      {executionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-6 flex items-start gap-3 border-l-2 border-[var(--error)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-[var(--error)]"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Execution error</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{executionError}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 border-[var(--error)] text-[var(--error)] hover:bg-[rgba(239,68,68,0.1)]"
              onClick={() => executeApprovedPlan()}
            >
              <RotateCcw aria-hidden="true" /> Retry Execution
            </Button>
          </div>
        </div>
      )}

      <section
        aria-labelledby="progress-ledger-title"
        className="mt-8 border border-[var(--border-strong)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
      >
        <header className="border-b border-[var(--border)] p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] text-[var(--teal-400)]">
                {isExecutingPlan ? (
                  <Loader2 aria-hidden="true" className="size-5 animate-spin" />
                ) : isFinished && failedCount === 0 ? (
                  <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--success)]" />
                ) : isFinished && failedCount > 0 ? (
                  <AlertCircle aria-hidden="true" className="size-5 text-[var(--warning)]" />
                ) : (
                  <CircleDashed aria-hidden="true" className="size-5" />
                )}
              </div>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
                  {isExecutingPlan
                    ? 'Executing Actions…'
                    : isFinished
                    ? 'Execution Finished'
                    : 'Awaiting Run'}
                </p>
                <h2 id="progress-ledger-title" className="editorial-title text-3xl text-[var(--text-primary)]">
                  {isExecutingPlan
                    ? 'Running approved steps…'
                    : isFinished && failedCount === 0
                    ? 'All steps executed successfully.'
                    : isFinished && failedCount > 0
                    ? 'Completed with partial failures.'
                    : 'Ready to execute.'}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                  Request: “{activePlan.prompt}”
                </p>
              </div>
            </div>
            <StatusPill status={isExecutingPlan ? 'neutral' : failedCount > 0 ? 'warning' : 'success'}>
              {isExecutingPlan
                ? 'In progress'
                : failedCount > 0
                ? 'Partial failure'
                : 'Completed'}
            </StatusPill>
          </div>
        </header>

        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Verified Progress
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {completedCount} of {totalSteps} step(s) completed
                {failedCount > 0 && ` · ${failedCount} failed`}
              </p>
            </div>
            <Badge variant="outline">
              {progressPercent}% Complete
            </Badge>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={progressPercent} aria-label="Execution progress" className="h-2 flex-1" />
            <span className="w-10 text-right text-xs font-semibold text-[var(--text-muted)]">
              {progressPercent}%
            </span>
          </div>

          <ol aria-label="Execution steps" className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {stepsToDisplay.map((step, idx) => {
              const isCurrent = step.status === 'in_progress';
              const isDone = step.status === 'completed';
              const isFailed = step.status === 'failed';

              return (
                <li
                  key={step.step_index ?? idx}
                  className="grid gap-3 py-5 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-start"
                >
                  <div className="mt-0.5">
                    {isCurrent ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin text-[var(--teal-400)]" />
                    ) : isDone ? (
                      <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--success)]" />
                    ) : isFailed ? (
                      <AlertCircle aria-hidden="true" className="size-4 text-[var(--error)]" />
                    ) : (
                      <div className="size-3 rounded-full border border-[var(--text-muted)]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {step.description}
                      </p>
                      <Badge variant="secondary" size="sm">
                        {step.tool_name}
                      </Badge>
                      {step.duration_ms !== undefined && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {step.duration_ms}ms
                        </span>
                      )}
                    </div>

                    {isFailed && step.error_message && (
                      <p className="mt-1.5 text-xs text-[var(--error)]">
                        Error: {step.error_message}
                      </p>
                    )}

                    {step.disclaimer && (
                      <p className="mt-1 text-xs italic text-[var(--text-muted)]">
                        {step.disclaimer}
                      </p>
                    )}
                  </div>

                  <div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
                        isDone
                          ? 'text-[var(--success)]'
                          : isFailed
                          ? 'text-[var(--error)]'
                          : isCurrent
                          ? 'text-[var(--teal-400)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {isDone
                        ? 'Verified'
                        : isFailed
                        ? 'Failed'
                        : isCurrent
                        ? 'Executing…'
                        : 'Pending'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {isFinished && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border border-[var(--border)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck aria-hidden="true" className="size-6 text-[var(--teal-400)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Execution Complete
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                All results were verified and recorded in your database history.
              </p>
            </div>
          </div>
          <Button asChild>
            <Link href="/results">
              View Detailed Results Receipt <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      <nav aria-label="Progress navigation" className="mt-7 flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/plan">
            <ArrowLeft aria-hidden="true" /> Back to plan
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/tasks">View Tasks</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/history">View History</Link>
        </Button>
      </nav>
    </div>
  );
}
