'use client';

import { BookOpen } from 'lucide-react';

import { Badge } from '@/components/ui';
import { useRequestDraft } from '@/components/providers';

export function RequestDraftNote() {
  const { draft } = useRequestDraft();
  if (!draft.request.trim()) return null;
  return (
    <section aria-label="Your local draft" className="mb-7 border-y border-[var(--border)] py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen aria-hidden="true" className="size-4 text-[var(--teal-400)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your words, read back</h2>
        </div>
        <Badge variant="outline" size="sm">Local draft</Badge>
      </div>
      <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-[var(--text-primary)]">{draft.request}</p>
      {draft.context && <p className="mt-2 max-w-3xl break-words text-xs leading-5 text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-muted)]">Kept with it:</span> {draft.context}</p>}
      <p className="mt-4 text-xs leading-5 text-[var(--warning)]">This page was not processed. The Saturday dinner plan below is fixed sample data and does not come from your draft.</p>
    </section>
  );
}
