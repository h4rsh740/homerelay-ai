'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  ListFilter,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Badge, Button, Card, CardHeader, Input } from '@/components/ui';
import type { ExecutionLog } from '@/lib/db/types';

interface GroupedSession {
  session_id: string;
  prompt: string;
  created_at: string;
  status: 'success' | 'error';
  steps: ExecutionLog[];
  total_duration_ms: number;
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/history?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.history ?? []);
    } catch {
      // Non-fatal if empty initially
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/history?limit=100');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!ignore) {
          setLogs(data.history ?? []);
        }
      } catch {
        // Non-fatal if empty initially
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

  // Group individual step logs into cohesive sessions
  const sessions = useMemo(() => {
    const map = new Map<string, GroupedSession>();

    for (const log of logs) {
      if (!map.has(log.session_id)) {
        map.set(log.session_id, {
          session_id: log.session_id,
          prompt: log.prompt,
          created_at: log.created_at,
          status: 'success',
          steps: [],
          total_duration_ms: 0,
        });
      }

      const session = map.get(log.session_id)!;
      session.steps.push(log);
      session.total_duration_ms += log.duration_ms ?? 0;
      if (log.status === 'error') {
        session.status = 'error';
      }
    }

    // Sort steps within each session by step_index
    for (const session of map.values()) {
      session.steps.sort((a, b) => a.step_index - b.step_index);
    }

    // Return sessions sorted newest first
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [logs]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesFilter = filter === 'all' || s.status === filter;
      const matchesSearch =
        !query ||
        s.prompt.toLowerCase().includes(query) ||
        s.session_id.toLowerCase().includes(query) ||
        s.steps.some((step) => step.tool_name.toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [sessions, search, filter]);

  const toggleExpand = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  return (
    <div className="animate-fade-in mx-auto max-w-[1120px] pb-14">
      <header className="mb-8 border-b border-[var(--border)] pb-6 sm:pb-8">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-4 sm:gap-6">
          <div className="min-w-0 max-w-2xl">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
              Activity History
            </div>
            <h1 className="text-[clamp(2.5rem,8vw,4rem)] font-semibold leading-none tracking-[-0.06em] text-[var(--text-primary)]">
              A clear trail of what changed.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
              Append-only audit trail of all approved plan runs and tool executions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchHistory()}
              disabled={isRefreshing}
            >
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <span className="rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              Audit Logs ({logs.length})
            </span>
          </div>
        </div>
      </header>

      {/* Filter and search toolbar */}
      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">Search execution logs</span>
          <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by request prompt, tool name, or session ID…"
            className="pl-9"
          />
        </label>
        <label className="flex items-center gap-2">
          <ListFilter aria-hidden="true" size={14} className="text-[var(--text-muted)]" />
          <select
            className="input h-10 min-w-[130px]"
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'success' | 'error')}
          >
            <option value="all">All runs</option>
            <option value="success">Successful</option>
            <option value="error">With errors</option>
          </select>
        </label>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-[var(--text-muted)]">
          Loading execution history…
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card className="p-12 text-center">
          <History aria-hidden="true" className="mx-auto size-12 text-[var(--teal-400)]" />
          <h2 className="mt-4 text-base font-semibold text-[var(--text-primary)]">
            No execution history found
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-xs text-[var(--text-secondary)]">
            {search ? 'Try clearing your search query.' : 'Run a household request to record your first execution audit trail.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => {
            const isExpanded = expandedSessions.has(session.session_id);
            const isSuccess = session.status === 'success';

            return (
              <Card key={session.session_id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer p-5 transition-colors hover:bg-[rgba(20,184,166,0.02)] sm:p-6"
                  onClick={() => toggleExpand(session.session_id)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {isSuccess ? (
                          <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--success)]" />
                        ) : (
                          <AlertCircle aria-hidden="true" className="size-4 text-[var(--error)]" />
                        )}
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          “{session.prompt}”
                        </span>
                        <Badge variant={isSuccess ? 'outline' : 'destructive'} size="sm">
                          {isSuccess ? 'Success' : 'Error'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                        <span>{new Date(session.created_at).toLocaleString()}</span>
                        <span>{session.steps.length} step(s)</span>
                        <span>{session.total_duration_ms}ms total runtime</span>
                        <span className="font-mono text-[10px]">Session: {session.session_id.slice(0, 8)}…</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" type="button">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--surface-subtle)] p-5 sm:p-6">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      Executed Steps Audit Trace
                    </p>
                    <ol className="divide-y divide-[var(--border)] rounded border border-[var(--border)] bg-[var(--surface)]">
                      {session.steps.map((step) => {
                        const stepSuccess = step.status === 'success';
                        return (
                          <li key={step.id} className="p-4 text-xs">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <span className="font-bold text-[var(--teal-400)]">Step {step.step_index + 1}: </span>
                                <span className="font-semibold text-[var(--text-primary)]">{step.tool_name}</span>
                                {step.duration_ms !== null && (
                                  <span className="ml-2 text-[10px] text-[var(--text-muted)]">{step.duration_ms}ms</span>
                                )}
                              </div>
                              <Badge variant={stepSuccess ? 'outline' : 'destructive'} size="sm">
                                {step.status}
                              </Badge>
                            </div>

                            {/* Tool input */}
                            <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                              <span className="font-mono text-[10px] text-[var(--text-muted)]">Input: </span>
                              <code className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[10px]">
                                {JSON.stringify(step.tool_input)}
                              </code>
                            </div>

                            {/* Tool output or error */}
                            {step.error_message ? (
                              <p className="mt-1.5 text-[11px] text-[var(--error)]">
                                Error: {step.error_message}
                              </p>
                            ) : step.tool_output ? (
                              <div className="mt-1.5 text-[11px] text-[var(--text-secondary)]">
                                <span className="font-mono text-[10px] text-[var(--text-muted)]">Output: </span>
                                <code className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--teal-400)]">
                                  {JSON.stringify(step.tool_output)}
                                </code>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
