'use client';

import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  History,
  ListTodo,
  Plus,
  ShieldCheck,
} from 'lucide-react';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from '@/components/ui';
import { FlowSteps, ScreenHeader, StatusPill } from '@/components/screen-primitives';
import { useHomeRelay } from '@/components/providers';

export function ResultsScreen() {
  const { executionReport, activePlan, resetFlow } = useHomeRelay();

  if (!executionReport && !activePlan) {
    return (
      <div className="mx-auto w-full max-w-[1040px] animate-fade-in pb-10">
        <ScreenHeader
          eyebrow="HomeRelay AI / Results"
          title="No execution results found."
          description="Submit a household request and approve the resulting plan to see execution results."
        />
        <div className="mt-8 border border-[var(--border-strong)] bg-[var(--surface)] p-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No recent execution run in memory.</p>
          <Button asChild className="mt-4">
            <Link href="/new-request">
              <Plus aria-hidden="true" /> Start a New Request
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const completed = executionReport?.completed_steps ?? [];
  const failed = executionReport?.failed_steps ?? [];
  const pending = executionReport?.pending_steps ?? [];
  const isPartial = executionReport?.overall_status === 'partial_failure';
  const isFailed = executionReport?.overall_status === 'failed';

  return (
    <div className="mx-auto w-full max-w-[1040px] animate-fade-in pb-10">
      <ScreenHeader
        eyebrow="Execution Receipt · Verified Outcomes"
        title="Verified Execution Results"
        description="Here is what was planned, what was executed in the database, and what needs your attention."
      />

      <FlowSteps current="results" />

      {/* Overview Metric Banner */}
      <Card className={`mb-6 mt-6 border-l-2 ${isFailed ? 'border-l-[var(--error)]' : isPartial ? 'border-l-[var(--warning)]' : 'border-l-[var(--success)]'} border-[var(--border-strong)]`}>
        <CardContent className="flex flex-wrap items-center justify-between gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(20,184,166,0.1)] text-[var(--teal-400)]">
              <FileCheck2 aria-hidden="true" className="size-5" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {executionReport?.summary ?? 'Execution finished.'}
                </h2>
                <StatusPill status={isFailed ? 'danger' : isPartial ? 'warning' : 'success'}>
                  {isFailed ? 'Failed' : isPartial ? 'Partial failure' : 'Verified complete'}
                </StatusPill>
              </div>
              <p className="max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
                Session ID: <code className="font-mono text-[var(--teal-400)]">{executionReport?.session_id}</code>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
              {completed.length}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">actions completed</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="space-y-5">
          {/* Completed Actions */}
          <Card>
            <CardHeader className="border-b border-[var(--border)] pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  Completed Actions ({completed.length})
                </CardTitle>
                <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--success)]" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {completed.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">No actions completed successfully.</p>
              ) : (
                completed.map((step, idx) => (
                  <div
                    key={step.step_index ?? idx}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4"
                  >
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--success)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {step.description}
                        </h3>
                        <Badge variant="outline" size="sm">
                          {step.tool_name}
                        </Badge>
                      </div>

                      {step.disclaimer && (
                        <p className="mt-1.5 text-xs text-[var(--teal-400)] font-medium">
                          {step.disclaimer}
                        </p>
                      )}

                      {step.duration_ms !== undefined && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          Runtime: {step.duration_ms}ms
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Failed Actions */}
          {failed.length > 0 && (
            <Card className="border-[var(--error)]">
              <CardHeader className="border-b border-[var(--border)] pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base text-[var(--error)]">
                    Failed Actions ({failed.length})
                  </CardTitle>
                  <AlertCircle aria-hidden="true" className="size-5 text-[var(--error)]" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {failed.map((step, idx) => (
                  <div
                    key={step.step_index ?? idx}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--error)] bg-[rgba(239,68,68,0.05)] p-4"
                  >
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[var(--error)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {step.description}
                        </h3>
                        <Badge variant="destructive" size="sm">
                          {step.tool_name}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--error)]">
                        Error: {step.error_message || 'Execution error returned by tool'}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending / Skipped Actions */}
          {pending.length > 0 && (
            <Card>
              <CardHeader className="border-b border-[var(--border)] pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base text-[var(--text-muted)]">
                    Pending / Skipped Actions ({pending.length})
                  </CardTitle>
                  <Clock aria-hidden="true" className="size-5 text-[var(--text-muted)]" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {pending.map((step, idx) => (
                  <div
                    key={step.step_index ?? idx}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--text-secondary)]"
                  >
                    <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{step.description}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{step.error_message || 'Skipped due to prior failure'}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
                Data Invariants Verified
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Guarantees enforced by the backend on this execution:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--teal-400)] shrink-0" />
                All changes were committed to persistent database.
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--teal-400)] shrink-0" />
                Audit record appended to execution_logs.
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--teal-400)] shrink-0" />
                Zero unapproved operations executed.
              </div>
              <Separator />
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" />
                <p className="text-xs leading-5 text-[var(--text-secondary)]">
                  You can inspect the full audit trace in the Activity History ledger.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[var(--surface-raised)]">
            <CardContent className="p-5">
              <p className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                Explore Household Data
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild size="sm" variant="default">
                  <Link href="/tasks">
                    <ListTodo aria-hidden="true" /> View Tasks Board
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/reminders">View Scheduled Reminders</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/history">View Execution Logs</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetFlow();
                  }}
                  asChild
                >
                  <Link href="/new-request">
                    Start New Request <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/execution">
            <ArrowLeft aria-hidden="true" /> Back to progress ledger
          </Link>
        </Button>
      </div>
    </div>
  );
}
