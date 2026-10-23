import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { LoadingDots } from './loading';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark border border-primary hover:border-primary-dark',
  secondary: 'bg-surface text-ink-2 border border-line-strong hover:border-primary hover:text-primary',
  soft: 'bg-soft text-ink-2 border border-transparent hover:bg-line',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-soft',
  danger: 'bg-danger text-white border border-danger hover:opacity-90',
  gold: 'bg-accent-bright text-ink border border-accent-bright hover:bg-accent hover:border-accent',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap font-semibold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoadingDots /> : children}
    </button>
  );
});
