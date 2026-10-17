import * as React from 'react';

import { cn } from './utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const safeMax = max > 0 ? max : 100;
    const safeValue = Math.min(Math.max(value, 0), safeMax);
    const percentage = (safeValue / safeMax) * 100;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-overlay)]',
          className
        )}
        {...props}
      >
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = 'Progress';

export { Progress };
