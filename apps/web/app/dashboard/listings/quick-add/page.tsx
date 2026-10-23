import type { Metadata } from 'next';
import { QuickAddView } from '@/components/quick-add/quick-add-view';

export const metadata: Metadata = { title: 'ثبت سریع و گروهی' };

export default function QuickAddPage() {
  return <QuickAddView />;
}
