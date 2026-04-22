import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={error || undefined}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        error &&
          'border-red-600 focus-visible:ring-red-600 dark:border-red-400 dark:focus-visible:ring-red-400',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
