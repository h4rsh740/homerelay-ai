'use client';

import { useEffect, useMemo, useState, useCallback, useSyncExternalStore, type FormEvent } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui';
import type { Reminder } from '@/lib/db/types';

type ReminderFilter = 'upcoming' | 'all' | 'completed';

type Notice = {
  kind: 'success' | 'error';
  message: string;
};

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

function ReminderSkeleton() {
  return (
    <div aria-label="Loading reminders" aria-live="polite" className="divide-y divide-[var(--border)]">
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-start gap-4 px-4 py-5 sm:px-6">
          <div className="skeleton mt-0.5 size-5 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="skeleton h-3.5" style={{ width: item === 2 ? '50%' : '65%' }} />
            <div className="skeleton h-2.5 w-[35%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

let cachedMinute = typeof window !== 'undefined' ? Math.floor(Date.now() / 60000) : 0;
const minuteSubscribers = new Set<() => void>();

if (typeof window !== 'undefined') {
  setInterval(() => {
    const next = Math.floor(Date.now() / 60000);
    if (next !== cachedMinute) {
      cachedMinute = next;
      minuteSubscribers.forEach((fn) => fn());
    }
  }, 10000);
}

function subscribeToMinute(callback: () => void) {
  minuteSubscribers.add(callback);
  return () => {
    minuteSubscribers.delete(callback);
  };
}

function getMinuteSnapshot() {
  return cachedMinute * 60000;
}

function getServerSnapshot() {
  return 0;
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReminderFilter>('upcoming');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    message: '',
    remind_at: '',
  });

  const fetchReminders = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch('/api/reminders');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReminders(data.reminders ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message: `Failed to load reminders: ${message}` });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const now = useSyncExternalStore(subscribeToMinute, getMinuteSnapshot, getServerSnapshot);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/reminders');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!ignore) {
          setReminders(data.reminders ?? []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const message = err instanceof Error ? err.message : String(err);
          setNotice({ kind: 'error', message: `Failed to load reminders: ${message}` });
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

  const upcomingCount = reminders.filter((r) => !r.is_sent).length;
  const completedCount = reminders.filter((r) => r.is_sent).length;

  const filteredReminders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matchesFilter = (reminder: Reminder) => {
      if (filter === 'upcoming') return !reminder.is_sent;
      if (filter === 'completed') return reminder.is_sent;
      return true;
    };

    return reminders
      .filter((r) => {
        const searchable = r.message.toLowerCase();
        return matchesFilter(r) && (!query || searchable.includes(query));
      })
      .sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
  }, [filter, search, reminders]);

  const handleCreateReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.message.trim() || isSubmitting) {
      setFormError('Please enter a reminder message.');
      return;
    }

    if (!form.remind_at) {
      setFormError('Please choose when to send this reminder.');
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const isoDate = new Date(form.remind_at).toISOString();
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: form.message.trim(),
          remind_at: isoDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create reminder.');
      }

      const data = await res.json();
      setReminders((prev) => [data.reminder, ...prev]);
      setShowForm(false);
      setForm({ message: '', remind_at: '' });
      setNotice({ kind: 'success', message: `Reminder saved to database for ${new Date(isoDate).toLocaleString()}.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleSent = async (reminder: Reminder) => {
    const newIsSent = !reminder.is_sent;

    // Optimistic UI update
    setReminders((current) =>
      current.map((r) => (r.id === reminder.id ? { ...r, is_sent: newIsSent } : r))
    );

    try {
      const res = await fetch(`/api/reminders/${reminder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_sent: newIsSent }),
      });

      if (!res.ok) throw new Error('Failed to update reminder status.');
      setNotice({
        kind: 'success',
        message: newIsSent ? 'Marked reminder as acknowledged.' : 'Reopened reminder as upcoming.',
      });
    } catch (err: unknown) {
      setReminders((current) =>
        current.map((r) => (r.id === reminder.id ? { ...r, is_sent: reminder.is_sent } : r))
      );
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message });
    }
  };

  const removeReminder = async (reminder: Reminder) => {
    if (!confirm(`Delete reminder "${reminder.message}"?`)) return;

    setReminders((current) => current.filter((r) => r.id !== reminder.id));

    try {
      const res = await fetch(`/api/reminders/${reminder.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete reminder.');
      setNotice({ kind: 'success', message: 'Reminder deleted from database.' });
    } catch (err: unknown) {
      setReminders((current) => [reminder, ...current]);
      const message = err instanceof Error ? err.message : String(err);
      setNotice({ kind: 'error', message });
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-[1120px] pb-14">
      <header className="mb-8 border-b border-[var(--border)] pb-6 sm:pb-8">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4 sm:gap-6">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
              Reminders
            </div>
            <h1 className="text-[clamp(2.5rem,8vw,4rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--text-primary)]">
              Gentle nudges for the moments that matter.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Scheduled nudges saved in your PostgreSQL database.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchReminders(true)}
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

      <section aria-label="Reminder metrics" className="mb-8 border-y border-[var(--border)] py-4 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">Schedule</p>
          <h2 className="mt-2 text-base font-semibold leading-6 text-[var(--text-primary)]">
            {upcomingCount > 0 ? `${upcomingCount} upcoming reminder(s)` : 'No upcoming reminders'}
          </h2>
        </div>
        <p aria-label="Reminder counts" className="mt-4 shrink-0 text-xs text-[var(--text-muted)] sm:mt-0">
          <span className="text-[var(--text-primary)] font-semibold">{upcomingCount}</span> upcoming{' '}
          <span aria-hidden="true" className="px-1.5">·</span>
          <span className="text-[var(--text-primary)] font-semibold">{completedCount}</span> completed
        </p>
      </section>

      {showForm && (
        <Card aria-labelledby="new-reminder-title" className="mb-8 animate-slide-down overflow-hidden border-[rgba(45,212,191,0.24)]">
          <CardHeader className="gap-0 border-b border-[var(--border)] p-5 pb-5 sm:p-6">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <CardTitle id="new-reminder-title" className="text-lg tracking-[-0.025em]">Schedule a Reminder</CardTitle>
                <CardDescription className="mt-2 text-xs">Stored in the database and surfaced when due.</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close reminder form"
                onClick={() => setShowForm(false)}
                className="size-8 shrink-0 text-[var(--text-muted)]"
              >
                <X aria-hidden="true" size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-6 sm:p-6 sm:pt-6">
            <form onSubmit={handleCreateReminder} noValidate className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
                <div className="min-w-0">
                  <label htmlFor="reminder-message" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    Reminder Message <span aria-hidden="true" className="text-[var(--teal-400)]">*</span>
                  </label>
                  <Input
                    id="reminder-message"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="e.g. Move laundry to dryer"
                    autoFocus
                    required
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="reminder-at" className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]">
                    When to remind <span aria-hidden="true" className="text-[var(--teal-400)]">*</span>
                  </label>
                  <Input
                    id="reminder-at"
                    type="datetime-local"
                    value={form.remind_at}
                    onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
                    required
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
                <Button type="submit" disabled={isSubmitting || !form.message.trim() || !form.remind_at}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Scheduling…
                    </>
                  ) : (
                    <>
                      <Plus aria-hidden="true" size={14} /> Schedule Reminder
                    </>
                  )}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card aria-labelledby="reminders-list-title" className="overflow-hidden">
        <CardHeader className="gap-0 border-b border-[var(--border)] p-5 pb-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-2">
                <Bell aria-hidden="true" size={16} className="text-[var(--teal-400)]" />
                <CardTitle id="reminders-list-title" className="tracking-[-0.025em]">Scheduled Reminders</CardTitle>
              </div>
              <CardDescription className="mt-2 text-xs">
                {filteredReminders.length} of {reminders.length} reminder(s) shown
              </CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => { setShowForm((c) => !c); setFormError(''); }}
            >
              <Plus aria-hidden="true" size={14} /> Add Reminder
            </Button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="relative block">
              <span className="sr-only">Search reminders</span>
              <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reminders…"
                className="pl-9"
              />
            </label>
            <label className="flex items-center gap-2">
              <ListFilter aria-hidden="true" size={14} className="text-[var(--text-muted)]" />
              <select
                className="input h-10 min-w-[130px]"
                value={filter}
                onChange={(e) => setFilter(e.target.value as ReminderFilter)}
              >
                <option value="upcoming">Upcoming</option>
                <option value="all">All</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
        </CardHeader>

        <div aria-busy={isLoading}>
          {isLoading ? (
            <ReminderSkeleton />
          ) : filteredReminders.length === 0 ? (
            <div className="px-5 py-16 text-center sm:px-6">
              <Bell aria-hidden="true" size={24} className="mx-auto mb-4 text-[var(--teal-400)]" />
              <h3 className="text-base font-semibold">No reminders found</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
                {search ? 'No reminders match your search query.' : 'Use "+ Add Reminder" or ask the AI agent to set a reminder.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filteredReminders.map((reminder) => {
                const isSent = reminder.is_sent;
                const dueDate = new Date(reminder.remind_at);
                const isPast = now > 0 && dueDate.getTime() < now;

                return (
                  <article
                    key={reminder.id}
                    className={`group flex items-start gap-4 px-4 py-5 transition-colors hover:bg-[rgba(20,184,166,0.035)] sm:px-6 ${
                      isSent ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      type="button"
                      aria-label={isSent ? 'Mark upcoming' : 'Mark completed'}
                      onClick={() => toggleSent(reminder)}
                      className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isSent
                          ? 'border-[var(--success)] bg-[rgba(34,197,94,0.14)] text-[var(--success)]'
                          : 'border-[var(--border-strong)] text-transparent hover:border-[var(--teal-400)]'
                      }`}
                    >
                      {isSent && <Check aria-hidden="true" size={13} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3
                          className={`text-sm font-semibold leading-6 ${
                            isSent ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {reminder.message}
                        </h3>
                        <span className={`text-[11px] font-semibold ${isPast && !isSent ? 'text-[var(--warning)]' : 'text-[var(--teal-400)]'}`}>
                          {dueDate.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-[10px] font-mono text-[var(--text-muted)]">
                        <span>ID: {reminder.id.slice(0, 8)}…</span>
                        <span>Saved in DB: {isSent ? 'Acknowledged' : 'Scheduled'}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeReminder(reminder)}
                      aria-label={`Remove ${reminder.message}`}
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
    </div>
  );
}
