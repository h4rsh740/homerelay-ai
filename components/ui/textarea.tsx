import * as React from 'react';

import { cn } from './utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-24 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm leading-6 text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-[var(--text-muted)] hover:border-[rgba(83,216,196,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--error)] aria-invalid:ring-[rgba(239,119,119,0.22)]',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
