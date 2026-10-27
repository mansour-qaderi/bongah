'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/i18n/provider';

/**
 * Three dots that rise in turn. Used inside buttons and small spots instead of a spinner: the panel has no default
 * spinners, in step with the phone app. Larger waits use skeletons (see skeleton.tsx).
 */
export function LoadingDots({ className }: { className?: string }) {
  const t = useT();
  return (
    <span role="status" aria-label={t('common.loading')} className={cn('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  );
}
