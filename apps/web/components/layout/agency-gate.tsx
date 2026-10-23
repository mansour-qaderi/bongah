'use client';

import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useDashboard } from '@/hooks/use-api';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * The panel is for real-estate offices. A signed-in account that never registered an office gets a clear next step
 * instead of a page full of errors (the office is registered in the phone app, where the licence photo is taken).
 */
export function AgencyGate({ children }: { children: ReactNode }) {
  const { error } = useDashboard();
  if (error instanceof ApiError && error.code === 'AGENCY_PROFILE_REQUIRED') {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface">
        <EmptyState
          icon={Building2}
          title="این حساب هنوز دفتر بنگاه ندارد"
          description="این پنل مخصوص دفترهای معاملات ملکی است. ابتدا در اپلیکیشن بنگاه، از بخش حساب کاربری، «ثبت دفتر» را انجام دهید و مدرک دفتر را بفرستید؛ پس از تأیید، با همین شماره وارد این پنل شوید."
        />
      </div>
    );
  }
  return <>{children}</>;
}
