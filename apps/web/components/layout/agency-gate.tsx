'use client';

import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useDashboard, useMe } from '@/hooks/use-api';
import { useT } from '@/i18n/provider';
import { RegisterOffice } from '@/components/agency/register-office';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Any signed-in account can use the panel. The dashboard reads and writes through a profile (name and address), so an
 * account that has none yet is shown the short form for it right here; once it exists the pages show. There is no
 * document check and no review step in between.
 *
 * An admin account is the one exception: the API never turns an admin into an office (that would take the admin's
 * powers away), so showing it a form whose button can only be refused would be a trap. It is told so instead.
 */
export function AgencyGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { error } = useDashboard();
  const { data: me, error: meError } = useMe();

  if (error instanceof ApiError && error.code === 'AGENCY_PROFILE_REQUIRED') {
    if (!me && !meError) return <Skeleton className="mx-auto h-72 max-w-4xl rounded-2xl" />;
    if (me?.role === 'ADMIN') {
      return (
        <div role="status" data-testid="setup-admin-notice" className="reveal mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border border-info/30 bg-info-tint p-5 text-info">
          <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="text-[15px] font-extrabold">{t('setup.admin.title')}</h2>
            <p className="mt-1 text-[13px] leading-7">{t('setup.admin.text')}</p>
          </div>
        </div>
      );
    }
    return <RegisterOffice />;
  }
  return <>{children}</>;
}
