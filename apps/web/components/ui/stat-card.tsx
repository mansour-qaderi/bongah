import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = 'primary',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  href?: string;
  tone?: 'primary' | 'info' | 'gold';
  children?: ReactNode;
}) {
  const body = (
    <div
      className={cn(
        'reveal h-full rounded-2xl border border-line bg-surface p-5 transition-colors',
        href && 'hover:border-primary',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-muted">{label}</span>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl',
            tone === 'primary' && 'bg-primary-tint text-primary',
            tone === 'info' && 'bg-info-tint text-info',
            tone === 'gold' && 'bg-accent-tint text-accent-text',
          )}
        >
          <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      </div>
      <div className="tabular mt-4 text-[28px] font-extrabold leading-none text-ink">{value}</div>
      {hint ? <div className="mt-2.5 text-xs text-muted">{hint}</div> : null}
      {children}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
