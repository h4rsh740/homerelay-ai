'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock3,
  History,
  Home,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from '@/components/ui';
import { ScreenHeader, StatusPill } from '@/components/screen-primitives';
import { useHomeRelay } from '@/components/providers';
import type { Task, Reminder, ExecutionLog } from '@/lib/db/types';

const EXAMPLE_REQUESTS = [
  'Clean the kitchen and prepare for dinner by 6 PM',
  'Remind me to take the laundry out at 7:30 PM',
  'Check tracking status for parcel DEMO-TRK-001',
];

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="bg-[var(--surface-raised)] p-4 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {label}
        </span>
        <span className="text-[var(--teal-400)]">{icon}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
          {value}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{detail}</span>
      </div>
    </Card>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const { draft, setDraft, generatePlan, isGeneratingPlan, activePlan } = useHomeRelay();
  const request = draft.request;
  const setRequest = (req: string) => setDraft({ ...draft, request: req });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<ExecutionLog[]>([]);

  // Fetch live stats from API
  useEffect(() => {
    async function loadStats() {
      try {
        const [tasksRes, remindersRes, historyRes] = await Promise.all([
          fetch('/api/tasks?limit=5'),
          fetch('/api/reminders?limit=5'),
          fetch('/api/history?limit=5'),
        ]);

        if (tasksRes.ok) {
          const t = await tasksRes.json();
          setTasks(t.tasks ?? []);
        }
        if (remindersRes.ok) {
          const r = await remindersRes.json();
          setReminders(r.reminders ?? []);
        }
        if (historyRes.ok) {
          const h = await historyRes.json();
          setHistory(h.history ?? []);
        }
      } catch {
        // Non-fatal
      }
    }
    loadStats();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request.trim() || isGeneratingPlan) return;

    const plan = await generatePlan(request.trim());
    if (plan) {
      router.push('/plan');
    }
  };

  const openTasks = tasks.filter((t) => t.status !== 'completed');
  const upcomingReminders = reminders.filter((r) => !r.is_sent);

  return (
    <div className="mx-auto w-full max-w-[1240px] animate-fade-in pb-10">
      <ScreenHeader
        eyebrow="HomeRelay AI Command Center"
        title="A calmer command center for home."
        description="Describe what needs attention, review a transparent action plan, and execute verified actions with your Model Context Protocol server."
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              <Sparkles aria-hidden="true" className="size-3.5" /> Live Agent Connected
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/new-request">
                <Plus aria-hidden="true" /> New request
              </Link>
            </Button>
          </div>
        }
      />

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Household overview">
        <MetricCard
          label="Open tasks"
          value={openTasks.length}
          detail="in database"
          icon={<ClipboardList aria-hidden="true" className="size-4" />}
        />
        <MetricCard
          label="Total tasks"
          value={tasks.length}
          detail="records saved"
          icon={<CalendarClock aria-hidden="true" className="size-4" />}
        />
        <MetricCard
          label="Reminders"
          value={upcomingReminders.length}
          detail="scheduled"
          icon={<Bell aria-hidden="true" className="size-4" />}
        />
        <MetricCard
          label="Execution runs"
          value={history.length}
          detail="in audit log"
          icon={<Clock3 aria-hidden="true" className="size-4" />}
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)]">
        <div className="space-y-5">
          <Card className="overflow-hidden border-[var(--border-strong)] border-l-2 border-l-[var(--teal-500)]">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[var(--teal-400)]">
                    <MessageSquareText aria-hidden="true" className="size-4" />
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em]">
                      AI Household Assistant
                    </span>
                  </div>
                  <CardTitle className="text-xl tracking-[-0.03em]">What can we take off your plate?</CardTitle>
                  <CardDescription className="mt-2 max-w-xl leading-6">
                    Enter your request in natural language. HomeRelay interprets your goal, selects verified MCP tools, and requests your approval before execution.
                  </CardDescription>
                </div>
                <MessageSquareText aria-hidden="true" className="hidden size-6 text-[var(--teal-400)] sm:block" />
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <label htmlFor="household-command" className="sr-only">
                  Household command
                </label>
                <Textarea
                  id="household-command"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="e.g. Clean the kitchen filters and remind me at 6 PM to turn off oven…"
                  maxLength={800}
                  disabled={isGeneratingPlan}
                  aria-describedby="command-help"
                  className="min-h-32 bg-[rgba(4,13,26,0.54)] text-[15px]"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span id="command-help" className="text-xs text-[var(--text-muted)]">
                    {request.length}/800 · Actions require your explicit approval before running
                  </span>
                  <Button type="submit" size="sm" disabled={!request.trim() || isGeneratingPlan}>
                    {isGeneratingPlan ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Generating Plan…
                      </>
                    ) : (
                      <>
                        <Send aria-hidden="true" /> Generate & Review Plan
                      </>
                    )}
                  </Button>
                </div>
              </form>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    Quick Examples
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {EXAMPLE_REQUESTS.map((example) => (
                    <button
                      key={example}
                      type="button"
                      disabled={isGeneratingPlan}
                      className="group rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(4,13,26,0.35)] p-3 text-left text-xs leading-5 text-[var(--text-secondary)] transition-colors hover:border-[rgba(45,212,191,0.3)] hover:bg-[rgba(20,184,166,0.08)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)]"
                      onClick={() => setRequest(example)}
                    >
                      <span className="mb-2 block text-[var(--teal-400)]">
                        <MessageSquareText aria-hidden="true" className="size-3.5" />
                      </span>
                      {example}
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-2 size-3.5 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
                      Active Tasks
                    </CardTitle>
                    <CardDescription className="mt-1">From your PostgreSQL database.</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/tasks">
                      View all <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--text-muted)]">No tasks saved yet.</p>
                ) : (
                  tasks.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${
                          task.status === 'completed' ? 'bg-[var(--success)]' : 'bg-[var(--teal-400)]'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${task.status === 'completed' ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                          {task.title}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                          {task.priority} priority · {task.status}
                        </p>
                      </div>
                      <Badge variant={task.status === 'completed' ? 'secondary' : 'warning'} size="sm">
                        {task.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bell aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
                      Upcoming Reminders
                    </CardTitle>
                    <CardDescription className="mt-1">Scheduled in the database.</CardDescription>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/reminders">
                      View all <ChevronRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {reminders.length === 0 ? (
                  <p className="py-4 text-center text-xs text-[var(--text-muted)]">No reminders scheduled yet.</p>
                ) : (
                  reminders.slice(0, 4).map((reminder) => (
                    <div
                      key={reminder.id}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(20,184,166,0.1)] text-[var(--teal-400)]">
                        <Bell aria-hidden="true" className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {reminder.message}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--teal-400)]">
                          {new Date(reminder.remind_at).toLocaleDateString()} at{' '}
                          {new Date(reminder.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          {activePlan && (
            <Card className="border-[var(--teal-400)]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[var(--teal-400)]">Active Plan Queued</Badge>
                  <StatusPill status="warning">Awaiting Approval</StatusPill>
                </div>
                <CardTitle className="mt-2 text-base text-[var(--text-primary)]">
                  {activePlan.plan.summary}
                </CardTitle>
                <CardDescription className="text-xs">
                  {activePlan.plan.steps.length} step(s) ready to review.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild size="sm" className="w-full">
                  <Link href="/plan">
                    Review & Approve Plan <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
                    Recent Execution Logs
                  </CardTitle>
                  <CardDescription className="mt-1">Real database audit trail.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/history">
                    History <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {history.length === 0 ? (
                <p className="py-4 text-center text-xs text-[var(--text-muted)]">No execution history recorded yet.</p>
              ) : (
                history.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-[var(--radius-md)] p-2.5 transition-colors hover:bg-[var(--surface-raised)]"
                  >
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-[rgba(20,184,166,0.1)] text-[var(--teal-400)]">
                      <Home aria-hidden="true" className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{log.tool_name}</p>
                        <StatusPill status={log.status === 'success' ? 'success' : 'danger'}>
                          {log.status}
                        </StatusPill>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{log.prompt}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                        {new Date(log.created_at).toLocaleTimeString()} · {log.duration_ms ?? 0}ms
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
