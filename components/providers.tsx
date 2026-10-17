'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { Plan } from '@/lib/validators/schemas';

export interface ActivePlanState {
  plan_id: string;
  plan: Plan;
  prompt: string;
  status: 'pending_approval' | 'approved' | 'cancelled' | 'executed';
  created_at?: string;
}

export interface ExecutionStepProgress {
  step_index: number;
  tool_name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  output?: Record<string, unknown> | null;
  error_message?: string | null;
  disclaimer?: string;
  duration_ms?: number;
}

export interface ExecutionReportState {
  session_id: string;
  plan_id?: string;
  prompt: string;
  overall_status: 'completed' | 'partial_failure' | 'failed';
  summary: string;
  total_steps: number;
  completed_steps: ExecutionStepProgress[];
  failed_steps: ExecutionStepProgress[];
  pending_steps: ExecutionStepProgress[];
  executed_at: string;
}

interface RequestDraft {
  request: string;
  context: string;
}

interface AppContextValue {
  draft: RequestDraft;
  setDraft: (draft: RequestDraft) => void;
  activePlan: ActivePlanState | null;
  setActivePlan: (plan: ActivePlanState | null) => void;
  executionReport: ExecutionReportState | null;
  setExecutionReport: (report: ExecutionReportState | null) => void;
  executionSteps: ExecutionStepProgress[];
  isGeneratingPlan: boolean;
  isExecutingPlan: boolean;
  planError: string | null;
  executionError: string | null;
  generatePlan: (prompt: string) => Promise<ActivePlanState | null>;
  cancelPlan: () => Promise<boolean>;
  executeApprovedPlan: () => Promise<ExecutionReportState | null>;
  resetFlow: () => void;
}

const STORAGE_KEY_PLAN = 'homerelay_active_plan';
const STORAGE_KEY_REPORT = 'homerelay_execution_report';

const AppContext = createContext<AppContextValue | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<RequestDraft>({ request: '', context: '' });
  const [activePlan, setActivePlanState] = useState<ActivePlanState | null>(null);
  const [executionReport, setExecutionReportState] = useState<ExecutionReportState | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStepProgress[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isExecutingPlan, setIsExecutingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Restore state from localStorage on client mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const savedPlan = localStorage.getItem(STORAGE_KEY_PLAN);
        if (savedPlan) {
          setActivePlanState(JSON.parse(savedPlan));
        }
        const savedReport = localStorage.getItem(STORAGE_KEY_REPORT);
        if (savedReport) {
          const parsedReport = JSON.parse(savedReport);
          setExecutionReportState(parsedReport);
          setExecutionSteps([
            ...(parsedReport.completed_steps ?? []),
            ...(parsedReport.failed_steps ?? []),
            ...(parsedReport.pending_steps ?? []),
          ]);
        }
      } catch {
        // Ignore parse errors from stale localStorage
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const setActivePlan = useCallback((plan: ActivePlanState | null) => {
    setActivePlanState(plan);
    if (plan) {
      localStorage.setItem(STORAGE_KEY_PLAN, JSON.stringify(plan));
    } else {
      localStorage.removeItem(STORAGE_KEY_PLAN);
    }
  }, []);

  const setExecutionReport = useCallback((report: ExecutionReportState | null) => {
    setExecutionReportState(report);
    if (report) {
      localStorage.setItem(STORAGE_KEY_REPORT, JSON.stringify(report));
    } else {
      localStorage.removeItem(STORAGE_KEY_REPORT);
    }
  }, []);

  // Generate Plan via /api/plan
  const generatePlan = useCallback(
    async (prompt: string): Promise<ActivePlanState | null> => {
      if (!prompt.trim()) {
        setPlanError('Please enter a household request.');
        return null;
      }

      setIsGeneratingPlan(true);
      setPlanError(null);

      try {
        const response = await fetch('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim() }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate plan.');
        }

        const planState: ActivePlanState = {
          plan_id: data.plan_id,
          plan: data.plan,
          prompt: prompt.trim(),
          status: 'pending_approval',
          created_at: data.created_at,
        };

        setActivePlan(planState);
        setExecutionReport(null);
        setExecutionSteps(
          data.plan.steps.map((s: { step_index: number; tool_name: string; description: string }) => ({
            step_index: s.step_index,
            tool_name: s.tool_name,
            description: s.description,
            status: 'pending',
          }))
        );

        return planState;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setPlanError(message);
        return null;
      } finally {
        setIsGeneratingPlan(false);
      }
    },
    [setActivePlan, setExecutionReport]
  );

  // Cancel Plan via /api/approve
  const cancelPlan = useCallback(async (): Promise<boolean> => {
    if (!activePlan) return true;

    try {
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: activePlan.plan_id,
          plan: activePlan.plan,
          prompt: activePlan.prompt,
          action: 'cancel',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to cancel plan.');
      }

      const updated = { ...activePlan, status: 'cancelled' as const };
      setActivePlan(updated);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExecutionError(message);
      return false;
    }
  }, [activePlan, setActivePlan]);

  // Execute Approved Plan via /api/approve (Streaming or Direct)
  const executeApprovedPlan = useCallback(async (): Promise<ExecutionReportState | null> => {
    if (!activePlan) {
      setExecutionError('No active plan found to execute.');
      return null;
    }

    setIsExecutingPlan(true);
    setExecutionError(null);

    // Initialize initial steps in pending status
    const initialSteps: ExecutionStepProgress[] = activePlan.plan.steps.map((s) => ({
      step_index: s.step_index,
      tool_name: s.tool_name,
      description: s.description,
      status: 'pending',
    }));
    setExecutionSteps(initialSteps);

    try {
      // Execute via /api/approve
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify({
          plan_id: activePlan.plan_id,
          plan: activePlan.plan,
          prompt: activePlan.prompt,
          action: 'approve',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';

      // Handle SSE Stream
      if (contentType.includes('text/event-stream') && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalReport: ExecutionReportState | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.replace('data:', '').trim();
              if (!dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr);

                if (currentEvent === 'step_start') {
                  setExecutionSteps((prev) =>
                    prev.map((s) =>
                      s.step_index === parsed.step_index
                        ? { ...s, status: 'in_progress' }
                        : s
                    )
                  );
                } else if (currentEvent === 'step_complete') {
                  setExecutionSteps((prev) =>
                    prev.map((s) =>
                      s.step_index === parsed.step_index
                        ? {
                            ...s,
                            status: parsed.status === 'completed' ? 'completed' : 'failed',
                            error_message: parsed.error_message,
                            disclaimer: parsed.disclaimer,
                            duration_ms: parsed.duration_ms,
                          }
                        : s
                    )
                  );
                } else if (currentEvent === 'session_complete') {
                  finalReport = parsed as ExecutionReportState;
                } else if (currentEvent === 'session_error') {
                  throw new Error(parsed.error || 'Execution encountered a session error.');
                }
              } catch (parseErr) {
                if (currentEvent === 'session_error') throw parseErr;
              }
            }
          }
        }

        if (finalReport) {
          setExecutionReport(finalReport);
          setActivePlan({ ...activePlan, status: 'executed' });
          return finalReport;
        }
      }

      // Handle standard JSON response
      const report: ExecutionReportState = await response.json();
      setExecutionReport(report);
      setExecutionSteps([
        ...(report.completed_steps ?? []).map((s) => ({ ...s, status: s.status ?? 'completed' })),
        ...(report.failed_steps ?? []).map((s) => ({ ...s, status: s.status ?? 'failed' })),
        ...(report.pending_steps ?? []).map((s) => ({ ...s, status: s.status ?? 'pending' })),
      ]);

      setActivePlan({ ...activePlan, status: 'executed' });
      return report;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setExecutionError(message);
      return null;
    } finally {
      setIsExecutingPlan(false);
    }
  }, [activePlan, setActivePlan, setExecutionReport]);

  const resetFlow = useCallback(() => {
    setActivePlan(null);
    setExecutionReport(null);
    setExecutionSteps([]);
    setPlanError(null);
    setExecutionError(null);
    setDraft({ request: '', context: '' });
  }, [setActivePlan, setExecutionReport]);

  return (
    <AppContext.Provider
      value={{
        draft,
        setDraft,
        activePlan,
        setActivePlan,
        executionReport,
        setExecutionReport,
        executionSteps,
        isGeneratingPlan,
        isExecutingPlan,
        planError,
        executionError,
        generatePlan,
        cancelPlan,
        executeApprovedPlan,
        resetFlow,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useRequestDraft() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useRequestDraft must be used within Providers');
  return { draft: context.draft, setDraft: context.setDraft };
}

export function useHomeRelay() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useHomeRelay must be used within Providers');
  return context;
}
