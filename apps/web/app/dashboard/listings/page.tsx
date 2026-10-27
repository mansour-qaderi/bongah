import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getRequestLanguage } from '@/i18n/server';
import { translate } from '@/i18n/translate';
import { ListingsView } from '@/components/listings/listings-view';
import { TableRowsSkeleton } from '@/components/ui/skeleton';

export async function generateMetadata(): Promise<Metadata> {
  return { title: translate(await getRequestLanguage(), 'nav.listings') };
}

export default function ListingsPage() {
  return (
    <Suspense fallback={<TableRowsSkeleton rows={8} />}>
      <ListingsView />
    </Suspense>
  );
}
