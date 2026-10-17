'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent } from 'react';
import {
  AlertCircle,
  ClipboardCheck,
  Lightbulb,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { Button, Input, Textarea } from '@/components/ui';
import { FlowSteps, ScreenHeader } from '@/components/screen-primitives';
import { useHomeRelay } from '@/components/providers';

const STARTER_PROMPTS = [
  'Clean the kitchen and prepare for dinner by 6 PM',
  'Remind me to take the laundry out of the dryer at 7:30 PM',
  'Check tracking status for parcel DEMO-TRK-001',
  'Order groceries for Saturday dinner and schedule a reminder',
];

export function NewRequestScreen() {
  const router = useRouter();
  const {
    draft,
    setDraft,
    generatePlan,
    isGeneratingPlan,
    planError,
  } = useHomeRelay();

  const { request, context } = draft;
  const setRequest = (req: string) => setDraft({ ...draft, request: req });
  const setContext = (ctx: string) => setDraft({ ...draft, context: ctx });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!request.trim() || isGeneratingPlan) return;

    const fullPrompt = context.trim()
      ? `${request.trim()}. Note: ${context.trim()}`
      : request.trim();

    const plan = await generatePlan(fullPrompt);
    if (plan) {
      router.push('/plan');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] animate-fade-in pb-10">
      <ScreenHeader
        eyebrow="HomeRelay AI / Planner"
        title="A little less to remember."
        description="Describe a household intention in plain language. HomeRelay interprets your goal, builds a transparent action plan, and asks for your approval before anything runs."
        action={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-[rgba(20,184,166,0.3)] bg-[rgba(20,184,166,0.08)] px-2.5 py-1 text-xs font-semibold text-[var(--teal-400)]">
              <Sparkles aria-hidden="true" className="size-3.5" /> AI Planner Connected
            </span>
          </div>
        }
      />

      <FlowSteps current="request" />

      {planError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-6 flex items-start gap-3 border-l-2 border-[var(--error)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-[var(--error)]"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Planning error</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{planError}</p>
          </div>
        </div>
      )}

      <div className="mt-8 grid items-start gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <section
          aria-labelledby="request-page-title"
          className="border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-8"
        >
          <div className="mb-8 flex items-start gap-3 border-b border-[var(--border)] pb-6">
            <MessageSquareText
              aria-hidden="true"
              className="mt-1 size-5 shrink-0 text-[var(--teal-400)]"
            />
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
                New Household Request
              </p>
              <h2
                id="request-page-title"
                className="editorial-title text-2xl text-[var(--text-primary)]"
              >
                What would make today easier?
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">
                Write what you need done in your own words. The agent will formulate an action plan for your review.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7" noValidate>
            <div>
              <label
                htmlFor="new-request"
                className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Your request <span aria-hidden="true" className="text-[var(--teal-400)]">*</span>
              </label>
              <Textarea
                id="new-request"
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="e.g. Clean the kitchen filters and remind me at 6 PM to turn off oven…"
                maxLength={800}
                required
                disabled={isGeneratingPlan}
                aria-describedby="new-request-help"
                className="min-h-40 bg-[var(--surface-raised)] text-[15px] leading-7"
              />
              <div
                id="new-request-help"
                className="mt-2 flex justify-between gap-3 text-[11px] text-[var(--text-muted)]"
              >
                <span>State the desired outcomes or actions.</span>
                <span>{request.length}/800</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="request-context"
                className="mb-2 block text-xs font-semibold text-[var(--text-secondary)]"
              >
                Additional constraints or notes <span className="font-normal text-[var(--text-muted)]">(optional)</span>
              </label>
              <Input
                id="request-context"
                value={context}
                maxLength={400}
                disabled={isGeneratingPlan}
                onChange={(event) => setContext(event.target.value)}
                placeholder="e.g. Guests arriving at 6:30 PM, high priority"
                aria-describedby="request-context-help"
              />
              <p
                id="request-context-help"
                className="mt-2 text-[11px] text-[var(--text-muted)]"
              >
                Time, place, urgency, or context that helps shape the actions.
              </p>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Quick Starters
              </p>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isGeneratingPlan}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition-colors hover:border-[rgba(83,216,196,0.38)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)] disabled:opacity-50"
                    onClick={() => setRequest(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--teal-400)]">Safety guarantee:</span> Generating a plan creates no tasks, reminders, or changes yet. You will preview and approve every step before execution starts.
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
              <Button type="submit" disabled={!request.trim() || isGeneratingPlan}>
                {isGeneratingPlan ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    Generating action plan…
                  </>
                ) : (
                  <>
                    <ClipboardCheck aria-hidden="true" />
                    Generate Action Plan
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isGeneratingPlan}
                onClick={() => setDraft({ request: '', context: '' })}
              >
                <RotateCcw aria-hidden="true" /> Clear
              </Button>
            </div>
          </form>
        </section>

        <aside className="space-y-9 lg:pt-3">
          <div className="border-l-2 border-l-[var(--teal-500)] pl-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
              Transparent Execution
            </p>
            <ol className="space-y-5">
              <li>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  1. Understand & Plan
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  The AI backend interprets your intent and selects verified MCP tools.
                </p>
              </li>
              <li>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  2. Review & Consent
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Every step is presented with its exact tool arguments for your review.
                </p>
              </li>
              <li>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  3. Verified Execution
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Actions run only after server-enforced approval, and results are verified.
                </p>
              </li>
            </ol>
          </div>

          <figure className="border-y border-[var(--border)] py-5">
            <figcaption className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              <Lightbulb aria-hidden="true" className="size-3.5 text-[var(--warning)]" />
              Supported Tools
            </figcaption>
            <p className="text-xs leading-5 text-[var(--text-secondary)]">
              Tasks (`create_task`, `list_tasks`, `complete_task`), Reminders (`schedule_reminder`, `list_reminders`), and Parcel Status (`get_parcel_status`).
            </p>
          </figure>
        </aside>
      </div>
    </div>
  );
}
