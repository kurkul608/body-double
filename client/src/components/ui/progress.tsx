import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  /** bar color class, defaults to accent */
  barClassName?: string;
}

export function Progress({ value, className, barClassName, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-mono-bg', className)}
      {...props}
    >
      <div
        className={cn('h-full rounded-full bg-accent transition-all duration-500', barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
