import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'primary' | 'info' | 'gold' | 'danger' | 'solid';

const TONES: Record<Tone, string> = {
  neutral: 'bg-soft text-neutral-600 border-transparent',
  primary: 'bg-primary-tint text-primary-dark border-transparent',
  info: 'bg-info-tint text-info border-transparent',
  gold: 'bg-accent-tint text-accent-text border-transparent',
  danger: 'bg-danger-tint text-danger border-transparent',
  solid: 'bg-primary text-white border-transparent',
};

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    />
  );
}
