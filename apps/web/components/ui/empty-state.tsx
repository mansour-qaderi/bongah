import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** What a list or panel shows when there is nothing in it: what it is, why it is empty, and the next step. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('reveal flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-soft text-primary">
        <Icon aria-hidden className="h-7 w-7" strokeWidth={1.7} />
      </div>
      <h3 className="mt-4 text-[15px] font-bold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** A request that failed: says so and offers a retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="reveal flex flex-col items-center px-6 py-12 text-center">
      <p className="text-sm font-semibold text-danger">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-3 rounded-lg border border-line-strong px-4 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-primary hover:text-primary">
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}
