import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--accent-muted)] text-[var(--teal-400)]',
        secondary:
          'border-transparent bg-[rgba(100,116,139,0.15)] text-[var(--slate-300)]',
        success:
          'border-transparent bg-[rgba(34,197,94,0.15)] text-[var(--success)]',
        warning:
          'border-transparent bg-[rgba(245,158,11,0.15)] text-[var(--warning)]',
        destructive:
          'border-transparent bg-[rgba(239,68,68,0.15)] text-[var(--error)]',
        outline:
          'border-[var(--border-strong)] bg-transparent text-[var(--text-secondary)]',
      },
      size: {
        default: 'min-h-[22px]',
        sm: 'min-h-4 px-1.5 text-[10px]',
        lg: 'min-h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}

export { Badge, badgeVariants };
