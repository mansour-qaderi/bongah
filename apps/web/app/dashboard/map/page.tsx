'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

// The map needs the browser (WebGL), so it is loaded there only.
const OfficeMap = dynamic(() => import('@/components/map/office-map').then((m) => m.OfficeMap), {
  ssr: false,
  loading: () => <Skeleton className="-mx-4 -my-6 h-[calc(100dvh-4rem)] rounded-none sm:-mx-6" />,
});

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <OfficeMap />
    </Suspense>
  );
}
