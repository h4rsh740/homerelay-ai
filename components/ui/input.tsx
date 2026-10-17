import * as React from 'react';

import { cn } from './utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-[42px] w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-[background-color,border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--text-muted)] hover:border-[rgba(83,216,196,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-[var(--error)] aria-invalid:ring-[rgba(239,119,119,0.22)]',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
