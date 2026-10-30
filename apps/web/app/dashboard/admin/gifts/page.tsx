'use client';

import { Suspense } from 'react';
import { AdminGifts } from '@/components/admin/admin-gifts';
import { Skeleton } from '@/components/ui/skeleton';

export default function Page() {
  // The page reads ?user= from the address, which needs a Suspense boundary while the page is prepared.
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-72 max-w-5xl rounded-2xl" />}>
      <AdminGifts />
    </Suspense>
  );
}
