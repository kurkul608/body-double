import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'now';
type Size = 'sm' | 'default' | 'lg';

const variantClasses: Record<Variant, string> = {
  default: 'bg-accent text-white hover:opacity-90 shadow-xs',
  now: 'bg-now text-white hover:opacity-90 shadow-xs',
  secondary: 'bg-accent-soft text-accent hover:bg-accent hover:text-white',
  outline: 'border border-line bg-card text-ink hover:bg-mono-bg',
  ghost: 'text-ink-soft hover:bg-mono-bg hover:text-ink',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  default: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-now',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
