import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListingsView } from '@/components/listings/listings-view';
import { TableRowsSkeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'مدیریت آگهی‌ها' };

export default function ListingsPage() {
  return (
    <Suspense fallback={<TableRowsSkeleton rows={8} />}>
      <ListingsView />
    </Suspense>
  );
}
