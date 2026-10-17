'use client';

import { useEffect, useMemo, useState, useCallback, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  CalendarDays,
  Check,
  Inbox,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import type { Task, TaskPriority, TaskStatus } from '@/lib/db/types';

type TaskFilter = 'all' | 'pending' | 'completed';
type SortOption = 'newest' | 'priority' | 'alphabetical';

type Notice = {
  kind: 'success' | 'error';
  message: string;
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const priorityTone: Record<TaskPriority, string> = {
  high: 'text-[var(--warning)] font-semibold',
  medium: 'text-[var(--text-secondary)]',
  low: 'text-[var(--text-muted)]',
};

function formatPriority(priority: TaskPriority) {
  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const isError = notice.kind === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`mb-6 flex min-w-0 items-start gap-3 border-l-2 bg-[var(--surface)] px-4 py-3 text-sm ${
        isError ? 'border-[var(--error)] text-[var(--error)]' : 'border-[var(--success)] text-[var(--success)]'
      }`}
    >
      {isError ? <AlertCircle aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
      <span className="min-w-0 flex-1 break-words text-[var(--text-secondary)] [overflow-wrap:anywhere]">
        {notice.message}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="size-8 shrink-0 text-[var(--text-muted)]"
      >
        <X aria-hidden="true" size={15} />
      </Button>
    </div>
  );
}

function TaskSkeleton() {
  return (
    <div aria-label="Loading tasks" aria-live="polite" className="divide-y divide-[var(--border)]">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-start gap-4 px-4 py-5 sm:px-6">
          <div className="skeleton mt-0.5 size-5 shrink-0 rounded-[var(--radius-sm)]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="skeleton h-3.5" style={{ width: item === 2 ? '54%' : '72%' }} />
            <div className="skeleton h-2.5 w-[42%]" />
            <div className="skeleton h-2.5 w-[28%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [sort, setSort] = useState<SortOption>('newest');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    due_date: string;
  }>({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
  });

  // Fetch real tasks from backend
  const fetchTasks = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message: `Failed to load tasks: ${message}` });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/tasks');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!ignore) {
          setTasks(data.tasks ?? []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const message = err instanceof Error ? err.message : String(err);
          setNotice({ kind: 'error', message: `Failed to load tasks: ${message}` });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const activeCount = tasks.filter((t) => t.status !== 'completed').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilter = (task: Task) => {
      if (filter === 'pending') return task.status !== 'completed';
      if (filter === 'completed') return task.status === 'completed';
      return true;
    };

    return tasks
      .filter((task) => {
        const searchable = `${task.title} ${task.description ?? ''} ${task.priority}`.toLowerCase();
        return matchesFilter(task) && (!query || searchable.includes(query));
      })
      .sort((a, b) => {
        if (sort === 'alphabetical') return a.title.localeCompare(b.title);
        if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [filter, search, sort, tasks]);

  const resetForm = () => {
    setForm({ title: '', description: '', priority: 'medium', due_date: '' });
    setFormError('');
  };

  const handleCreateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || isSubmitting) {
      setFormError('Please enter a task title.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        priority: form.priority,
      };
      if (form.description.trim()) {
        payload.description = form.description.trim();
      }
      if (form.due_date) {
        payload.due_date = new Date(form.due_date).toISOString();
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create task.');
      }

      const data = await res.json();
      setTasks((prev) => [data.task, ...prev]);
      setShowForm(false);
      resetForm();
      setNotice({ kind: 'success', message: `Task "${data.task.title}" saved to database.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTask = async (task: Task) => {
    const isNowCompleted = task.status !== 'completed';
    const newStatus: TaskStatus = isNowCompleted ? 'completed' : 'pending';

    // Optimistic UI update
    setTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update task status in database.');
      setNotice({
        kind: 'success',
        message: isNowCompleted ? `Marked "${task.title}" as completed.` : `Reopened "${task.title}".`,
      });
    } catch (err: unknown) {
      // Revert optimistic update on failure
      setTasks((current) =>
        current.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
      );
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message });
    }
  };

  const removeTask = async (task: Task) => {
    if (!confirm(`Delete task "${task.title}"?`)) return;

    // Optimistic removal
    setTasks((current) => current.filter((t) => t.id !== task.id));

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete task from database.');
      setNotice({ kind: 'success', message: `Deleted task "${task.title}".` });
    } catch (err: unknown) {
      // Restore on failure
      setTasks((current) => [task, ...current]);
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message });
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-[1120px] pb-14">
      <header className="mb-8 border-b border-[var(--border)] pb-6 sm:pb-8">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4 sm:gap-6">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-[clamp(2.5rem,8vw,4rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--text-primary)]">
              Tasks
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Persistent household tasks stored in your PostgreSQL database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchTasks(true)}
              disabled={isRefreshing}
            >
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <span className="rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              Live Database
            </span>
          </div>
        </div>
      </header>

      {notice && <NoticeBanner notice={notice} onDismiss={() => setNotice(null)} />}

      <section aria-label="Task overview" className="mb-8 border-y border-[var(--border)] py-4 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">Overview</p>
          <h2 className="mt-2 text-base font-semibold leading-6 text-[var(--text-primary)]">
            {activeCount > 0 ? `${activeCount} task(s) in progress` : 'All tasks completed'}
          </h2>
        </div>
        <p aria-label="Task counts" className="mt-4 shrink-0 text-xs text-[var(--text-muted)] sm:mt-0">
          <span className="text-[var(--text-primary)] font-semibold">{activeCount}</span> open{' '}
          <span aria-hidden="true" className="px-1.5">·</span>
          <span className="text-[var(--text-primary)] font-semibold">{completedCount}</span> completed
        </p>
      </section>

      {showForm && (
        <Card aria-labelledby="new-task-title" className="mb-8 animate-slide-down overflow-hidden border-[rgba(45,212,191,0.24)]">
          <CardHeader className="gap-0 border-b border-[var(--border)] p-5 pb-5 sm:p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <CardTitle id="new-task-title" className="text-lg tracking-[-0.025em]">Add a Task</CardTitle>
                <CardDescription className="mt-2 text-xs">Persists directly to the database.</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close new task form"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="size-8 shrink-0 text-[var(--text-muted)]"
              >
                <X aria-hidden="true" size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-6 sm:p-6 sm:pt-6">
            <form onSubmit={handleCreateTask} noValidate className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
                <div className="min-w-0">
                  <label htmlFor="task-title" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Task title <span aria-hidden="true" className="text-[var(--teal-400)]">*</span>
                  </label>
                  <Input
                    id="task-title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Replace air filter"
                    autoFocus
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="task-priority" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    className="input h-10 w-full"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
                <div className="min-w-0">
                  <label htmlFor="task-description" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Details <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                  </label>
                  <Textarea
                    id="task-description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Add details, room location, or materials needed"
                    rows={2}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="task-due" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Due Date <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                  </label>
                  <Input
                    id="task-due"
                    type="datetime-local"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>
              {formError && (
                <div role="alert" className="flex items-center gap-2 text-xs text-[var(--error)]">
                  <AlertCircle aria-hidden="true" size={14} />
                  {formError}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={isSubmitting || !form.title.trim()}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Plus aria-hidden="true" size={14} /> Save Task
                    </>
                  )}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card aria-labelledby="task-board-title" className="overflow-hidden">
        <CardHeader className="gap-0 border-b border-[var(--border)] p-5 pb-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <Inbox aria-hidden="true" size={16} className="text-[var(--teal-400)]" />
                <CardTitle id="task-board-title" className="tracking-[-0.025em]">Task Board</CardTitle>
              </div>
              <CardDescription className="mt-2 text-xs">
                {filteredTasks.length} of {tasks.length} task(s) shown
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => { setShowForm((c) => !c); setFormError(''); }}
              aria-expanded={showForm}
            >
              <Plus aria-hidden="true" size={14} /> Add Task
            </Button>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(180px,1fr)_auto_auto] lg:items-center">
            <label className="relative block">
              <span className="sr-only">Search tasks</span>
              <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks by title or detail…"
                className="pl-9"
              />
            </label>
            <label className="flex items-center gap-2">
              <ListFilter aria-hidden="true" size={14} className="text-[var(--text-muted)]" />
              <span className="sr-only">Filter tasks</span>
              <select
                className="input h-10 min-w-[120px]"
                value={filter}
                onChange={(e) => setFilter(e.target.value as TaskFilter)}
              >
                <option value="all">All tasks</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <ArrowUpDown aria-hidden="true" size={14} className="text-[var(--text-muted)]" />
              <span className="sr-only">Sort tasks</span>
              <select
                className="input h-10 min-w-[130px]"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
              >
                <option value="newest">Newest first</option>
                <option value="priority">Priority</option>
                <option value="alphabetical">A–Z</option>
              </select>
            </label>
          </div>
        </CardHeader>

        <div aria-busy={isLoading}>
          {isLoading ? (
            <TaskSkeleton />
          ) : filteredTasks.length === 0 ? (
            <div className="px-5 py-16 text-center sm:px-6">
              <Search aria-hidden="true" size={24} className="mx-auto mb-4 text-[var(--teal-400)]" />
              <h3 className="text-base font-semibold">No tasks found</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
                {search ? 'Try clearing your search query.' : 'Use the "+ Add Task" button or ask the AI agent to create tasks.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredTasks.map((task) => {
                const isComplete = task.status === 'completed';
                return (
                  <article
                    key={task.id}
                    className={`group flex items-start gap-4 px-4 py-5 transition-colors hover:bg-[rgba(20,184,166,0.035)] sm:px-6 ${
                      isComplete ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={isComplete ? `Reopen ${task.title}` : `Mark ${task.title} complete`}
                      onClick={() => toggleTask(task)}
                      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)] ${
                        isComplete
                          ? 'border-[var(--success)] bg-[rgba(34,197,94,0.14)] text-[var(--success)]'
                          : 'border-[var(--border-strong)] text-transparent hover:border-[var(--teal-400)]'
                      }`}
                    >
                      {isComplete && <Check aria-hidden="true" size={13} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3
                          className={`text-sm font-semibold leading-6 ${
                            isComplete ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {task.title}
                        </h3>
                        <span className={`text-[10px] uppercase tracking-[0.1em] ${priorityTone[task.priority]}`}>
                          {formatPriority(task.priority)}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        {task.due_date && (
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays aria-hidden="true" size={13} />
                            Due {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono">
                          ID: {task.id.slice(0, 8)}…
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTask(task)}
                      aria-label={`Remove ${task.title}`}
                      className="size-8 shrink-0 text-[var(--text-muted)] opacity-60 transition-opacity group-hover:opacity-100 hover:text-[var(--error)]"
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </Button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <p className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-[var(--text-muted)]">
        <Tag aria-hidden="true" size={12} />
        Tasks are saved persistently to PostgreSQL. Changes remain across page reloads.
      </p>
    </div>
  );
}
