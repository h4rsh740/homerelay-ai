import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  CircleDashed,
  Info,
  ShieldCheck,
} from 'lucide-react';

import { SAMPLE_PLAN_STEPS, SAMPLE_REQUEST, type DemoPlanStep } from '@/lib/demo-data';
import { ApprovalDialog } from '@/components/approval-dialog';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

type FlowStep = 'request' | 'plan' | 'execution' | 'results';

const FLOW_STEPS: Array<{ key: FlowStep; label: string; href: string }> = [
  { key: 'request', label: 'Request', href: '/new-request' },
  { key: 'plan', label: 'Review', href: '/plan' },
  { key: 'execution', label: 'Progress', href: '/execution' },
  { key: 'results', label: 'Receipt', href: '/results' },
];

export function FlowSteps({ current }: { current: FlowStep }) {
  const currentIndex = FLOW_STEPS.findIndex((step) => step.key === current);

  return (
    <nav aria-label="Request flow" className="border-y border-[var(--border)] py-3">
      <ol className="flex items-center gap-2 overflow-x-auto text-[11px]">
        {FLOW_STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isComplete = index < currentIndex;

          return (
            <li key={step.key} className="flex min-w-max items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-[var(--border-strong)]" />}
              <Link
                href={step.href}
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)] ${isCurrent ? 'bg-[var(--accent-muted)] font-semibold text-[var(--teal-400)]' : isComplete ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <span className={`flex size-5 items-center justify-center rounded-full border text-[10px] font-bold ${isCurrent ? 'border-[var(--teal-500)] bg-[var(--teal-500)] text-[var(--navy-950)]' : isComplete ? 'border-[var(--border-strong)] text-[var(--teal-400)]' : 'border-[var(--border-strong)]'}`}>
                  {isComplete ? '✓' : index + 1}
                </span>
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--teal-400)]">
          <span className="size-1.5 rounded-full bg-[var(--teal-400)] shadow-[0_0_12px_var(--teal-400)]" />
          {eyebrow}
        </div>
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.06] tracking-[-0.05em] text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[var(--text-secondary)]">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function SampleDataBadge({ children = 'Local sample data' }: { children?: ReactNode }) {
  return (
    <Badge variant="outline" className="border-[rgba(45,212,191,0.25)] bg-[rgba(20,184,166,0.07)] text-[var(--teal-400)]">
      <CircleDashed aria-hidden="true" className="size-3" />
      {children}
    </Badge>
  );
}

export function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] border-l-2 border-l-[var(--teal-500)] bg-[var(--surface-subtle)] p-3.5 text-xs leading-5 text-[var(--text-secondary)]" role="note">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--teal-400)]" />
      <span>{children}</span>
    </div>
  );
}

export function StatusPill({
  status,
  children,
}: {
  status: 'success' | 'warning' | 'neutral' | 'danger';
  children: ReactNode;
}) {
  const variants = {
    success: 'border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.1)] text-[var(--success)]',
    warning: 'border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.1)] text-[var(--warning)]',
    neutral: 'border-[var(--border)] bg-[rgba(100,116,139,0.12)] text-[var(--slate-300)]',
    danger: 'border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.1)] text-[var(--error)]',
  };

  return (
    <span className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] ${variants[status]}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function PlanStep({ step, compact }: { step: DemoPlanStep; compact: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(4,13,26,0.32)] p-3.5 transition-colors hover:border-[rgba(45,212,191,0.22)]">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[rgba(45,212,191,0.28)] bg-[rgba(20,184,166,0.1)] text-[11px] font-bold text-[var(--teal-400)]">
        {step.id}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-[13px] font-semibold text-[var(--text-primary)]">{step.title}</strong>
          <Badge variant="secondary" size="sm">{step.category}</Badge>
        </span>
        {!compact && <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{step.detail}</span>}
        <code className="mt-2 inline-flex rounded bg-[rgba(20,184,166,0.08)] px-1.5 py-0.5 text-[10px] text-[var(--teal-400)]">{step.label}</code>
      </span>
      <ArrowRight aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-[var(--text-muted)]" />
    </li>
  );
}

export function PlanPreviewCard({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="overflow-hidden border-[var(--border-strong)] border-l-2 border-l-[var(--teal-500)]">
      <CardHeader className="border-b border-[var(--border)] pb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ClipboardCheck aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
              <CardTitle>A sample plan</CardTitle>
              <Badge variant="warning" size="sm">Preview only</Badge>
            </div>
            <CardDescription>A clear look at the next steps before anything is connected.</CardDescription>
          </div>
          <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-[var(--teal-400)]" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">The request</p>
          <p className="text-sm leading-6 text-[var(--text-primary)]">“{SAMPLE_REQUEST}”</p>
        </div>
        <ol className="space-y-2.5" aria-label="Sample plan steps">
          {SAMPLE_PLAN_STEPS.map((step) => <PlanStep key={step.id} step={step} compact={compact} />)}
        </ol>
        <PreviewNotice>
          Approval is visual only in this phase. No AI call, database write, notification, or MCP tool will run.
        </PreviewNotice>
        <div className="flex flex-wrap gap-2">
          <ApprovalDialog size="sm" />
          <Button asChild variant="outline" size="sm">
            <Link href="/plan">View full plan</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function StepStatusIcon({ status }: { status: 'ready' | 'pending' | 'complete' | 'attention' }) {
  if (status === 'complete') return <CheckCircle2 aria-hidden="true" className="size-5 text-[var(--success)]" />;
  if (status === 'attention') return <Info aria-hidden="true" className="size-5 text-[var(--warning)]" />;
  return <CircleDashed aria-hidden="true" className="size-5 text-[var(--text-muted)]" />;
}
