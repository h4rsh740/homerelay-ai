import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--accent)] text-[var(--navy-950)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-teal)]',
        destructive:
          'border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.15)] text-[var(--error)] hover:bg-[rgba(239,68,68,0.25)]',
        outline:
          'border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:border-[rgba(83,216,196,0.38)] hover:bg-[var(--surface-raised)]',
        secondary:
          'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface-overlay)]',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]',
        link: 'text-[var(--teal-400)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-[var(--radius-sm)] px-3',
        lg: 'h-11 rounded-[var(--radius-md)] px-8',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
