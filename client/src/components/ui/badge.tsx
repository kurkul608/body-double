import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'accent' | 'now' | 'warn' | 'muted' | 'outline';

const variantClasses: Record<Variant, string> = {
  accent: 'bg-accent-soft text-accent',
  now: 'bg-now-soft text-now',
  warn: 'bg-warn-soft text-warn',
  muted: 'bg-mono-bg text-ink-soft',
  outline: 'border border-line text-ink-soft',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = 'muted', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
