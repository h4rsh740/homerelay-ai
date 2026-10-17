'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useHomeRelay } from '@/components/providers';

export function ApprovalDialog({
  className,
  size,
  disabled,
}: {
  className?: string;
  size?: 'sm' | 'default';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { activePlan } = useHomeRelay();

  const handleConfirmApproval = () => {
    setOpen(false);
    router.push('/execution');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className} size={size} disabled={disabled || !activePlan}>
          Approve & Execute Plan <ArrowRight aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ShieldCheck aria-hidden="true" className="size-8 text-[var(--teal-400)]" />
        <DialogHeader>
          <DialogTitle>Confirm Plan Approval</DialogTitle>
          <DialogDescription>
            You are explicitly authorizing HomeRelay to execute {activePlan?.plan.steps.length ?? 0} actions via the MCP server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">What will happen:</p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 text-[var(--teal-400)] shrink-0" />
              <span>Actions will be executed sequentially through the MCP tools.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 text-[var(--teal-400)] shrink-0" />
              <span>Real records will be saved to your persistent database.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 text-[var(--teal-400)] shrink-0" />
              <span>Each step is verified and logged in your execution history.</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="outline">Keep Reviewing</Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirmApproval}>
            Confirm Approval & Run <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
