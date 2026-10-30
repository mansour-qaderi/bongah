'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useDashboard, useMe } from '@/hooks/use-api';
import { RegisterOffice } from '@/components/agency/register-office';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_HOME } from './nav';

/**
 * Any signed-in account can use the panel. The dashboard reads and writes through a profile (name and address), so an
 * account that has none yet is shown the short form for it right here; once it exists the pages show. There is no
 * document check and no review step in between.
 *
 * An admin account is the one exception: the API never turns an admin into an office (that would take the admin's
 * powers away), so the personal pages (map, listings, plan) are not for it. It lands in the admin section, with the
 * whole admin menu, instead of meeting a notice that stands between it and its tools.
 */
export function AgencyGate({ children }: { children: ReactNode }) {
  const { error } = useDashboard();
  const { data: me, error: meError } = useMe();
  const pathname = usePathname();
  const router = useRouter();

  const inAdminArea = pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
  const sendToAdmin = me?.role === 'ADMIN' && !inAdminArea;
  useEffect(() => {
    if (sendToAdmin) router.replace(ADMIN_HOME);
  }, [sendToAdmin, router]);

  if (sendToAdmin) return <Skeleton className="mx-auto h-72 max-w-4xl rounded-2xl" />;
  // The admin pages are not about an office: an admin has none (and cannot get one), so the form below would only
  // stand between the admin and the page.
  if (inAdminArea) return <>{children}</>;

  if (error instanceof ApiError && error.code === 'AGENCY_PROFILE_REQUIRED') {
    if (!me && !meError) return <Skeleton className="mx-auto h-72 max-w-4xl rounded-2xl" />;
    return <RegisterOffice />;
  }
  return <>{children}</>;
}
