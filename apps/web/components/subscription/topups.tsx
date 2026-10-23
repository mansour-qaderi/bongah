'use client';

import { useDeferredValue, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronsUp, Search, Star } from 'lucide-react';
import type { FeaturedBundle, Paginated, Pricing, Property } from '@bongah/shared-types';
import { errorMessage, fetcher } from '@/lib/api';
import { formatMoney, formatNumber } from '@/lib/format';
import { startPayment } from '@/lib/payments';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { CardListSkeleton } from '@/components/ui/skeleton';

export function TopUps({ pricing, featuredCredits }: { pricing: Pricing; featuredCredits?: number }) {
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const bundles: FeaturedBundle[] = pricing.featured_bundles ?? [];

  async function buyBundle(size: FeaturedBundle['size']) {
    setBusy(size);
    try {
      await startPayment({ purpose: 'FEATURED_CREDITS', bundle_size: size as 1 | 3 | 5 | 10 | 20 });
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="نردبان آگهی" description="آگهی را به بالای فهرست می‌برد تا بیشتر دیده شود." />
        <div className="p-5">
          <div className="flex items-center justify-between rounded-xl border border-line p-4">
            <div>
              <div className="text-[13px] text-muted">قیمت یک نردبان</div>
              <div className="tabular mt-1 text-xl font-extrabold text-ink">{formatMoney(pricing.ladder, pricing.currency)}</div>
            </div>
            <Button onClick={() => setPick(true)} className="gap-2">
              <ChevronsUp aria-hidden className="h-4 w-4" />
              نردبان برای یک آگهی
            </Button>
          </div>
          <p className="mt-3 text-xs leading-6 text-muted">آگهی را انتخاب می‌کنید و در صفحهٔ پرداخت، مبلغ را می‌پردازید. نردبان‌های هدیه را از بخش «دعوت دوستان» خرج کنید.</p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="بستهٔ کادر ویژه"
          description={`هر کادر ویژه ${formatNumber(pricing.featured_ad_days)} روز می‌ماند. بسته را می‌خرید و بعداً روی آگهی‌ها خرج می‌کنید.`}
          action={
            featuredCredits !== undefined ? (
              <span className="tabular rounded-full bg-accent-tint px-3 py-1 text-xs font-bold text-accent-text">
                {formatNumber(featuredCredits)} کادر در حساب
              </span>
            ) : null
          }
        />
        <div className="p-5">
          {bundles.length === 0 ? (
            <p className="text-[13px] text-muted">بسته‌ای در دسترس نیست.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {bundles.map((b) => (
                <li key={b.size} className="flex flex-col rounded-xl border border-line p-3">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    <Star aria-hidden className="h-4 w-4 text-accent-bright" />
                    {formatNumber(b.size)} کادر
                    {b.discount_percent > 0 ? <span className="ms-auto text-xs font-bold text-primary">{formatNumber(b.discount_percent)}٪ تخفیف</span> : null}
                  </div>
                  <div className="tabular mt-2 text-base font-extrabold text-ink">{formatMoney(b.price, pricing.currency)}</div>
                  {b.list_price > b.price ? (
                    <div className="tabular text-xs text-muted line-through">{formatMoney(b.list_price, pricing.currency)}</div>
                  ) : (
                    <div className="h-4" />
                  )}
                  <Button size="sm" variant="secondary" className="mt-3 w-full justify-center" loading={busy === b.size} disabled={busy !== null} onClick={() => void buyBundle(b.size)}>
                    خرید
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <LadderDialog open={pick} onOpenChange={setPick} />
    </div>
  );
}

function LadderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const [busy, setBusy] = useState<string | null>(null);
  const key = open ? `properties/mine?status=ACTIVE&limit=10&page=1&sort=newest${deferred ? `&q=${encodeURIComponent(deferred)}` : ''}` : null;
  const { data, error } = useSWR<Paginated<Property>>(key, fetcher, { keepPreviousData: true });

  async function go(id: string) {
    setBusy(id);
    try {
      await startPayment({ purpose: 'LADDER', property_id: id });
    } catch (e) {
      toast.error(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="نردبان برای کدام آگهی؟" description="یک آگهی فعال را انتخاب کنید.">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی عنوان…" aria-label="جستجو" className="ps-9" />
      </div>
      <div className="mt-3 min-h-40">
        {!data && !error ? (
          <CardListSkeleton rows={4} />
        ) : error && !data ? (
          <p className="py-8 text-center text-[13px] text-danger">{errorMessage(error)}</p>
        ) : data && data.data.length === 0 ? (
          <EmptyState compact icon={Search} title="آگهی فعالی پیدا نشد" description="عبارت جستجو را تغییر دهید." />
        ) : (
          <ul className="divide-y divide-line">
            {data?.data.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-ink">{p.title}</div>
                  <div className="tabular text-xs text-muted">{formatMoney(p.price, p.currency)}</div>
                </div>
                <Button size="sm" loading={busy === p.id} disabled={busy !== null} onClick={() => void go(p.id)}>
                  نردبان
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
