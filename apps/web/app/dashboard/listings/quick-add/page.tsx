import type { Metadata } from 'next';
import { getRequestLanguage } from '@/i18n/server';
import { translate } from '@/i18n/translate';
import { QuickAddView } from '@/components/quick-add/quick-add-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: translate(await getRequestLanguage(), 'nav.quickAdd') };
}

export default function QuickAddPage() {
  return <QuickAddView />;
}
