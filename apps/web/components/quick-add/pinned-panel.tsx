'use client';

import { useEffect } from 'react';
import { Lock, MapPinned, Unlock } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES } from '@bongah/shared-types';
import { PROVINCES } from '@/lib/provinces';
import { CURRENCY_NAME, DEAL_LABEL } from '@/lib/labels';
import { useDashboard, useOfficePin } from '@/hooks/use-api';
import { usePinned } from '@/hooks/use-pinned';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';

/**
 * The values that stay the same from one listing to the next: the office's province and district, the usual deal and
 * currency. They fill the single form and whatever an import could not read, and survive «ذخیره و ثبت بعدی».
 */
export function PinnedPanel() {
  const [pinned, setPinned] = usePinned();
  const { data: dashboard } = useDashboard();
  const { data: pins } = useOfficePin(dashboard?.agency.id);

  // The office's pin, once, so the form can offer it.
  useEffect(() => {
    if (!pinned.office_lat && dashboard && pins) {
      const mine = pins.find((p) => p.id === dashboard.agency.id);
      if (mine) setPinned({ office_lat: String(mine.lat), office_lng: String(mine.lng) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.agency.id, pins]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-tint text-primary">
            {pinned.locked ? <Lock aria-hidden className="h-4 w-4" /> : <Unlock aria-hidden className="h-4 w-4" />}
          </span>
          <div>
            <h2 className="text-sm font-bold text-ink">مقادیر ثابت دفتر</h2>
            <p className="text-xs text-muted">
              {pinned.locked ? 'بعد از هر ثبت همین‌ها می‌مانند و فقط بقیهٔ فرم خالی می‌شود.' : 'بعد از هر ثبت، این مقادیر هم خالی می‌شوند.'}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          ثابت بماند
          <Switch label="ثابت ماندن مقادیر" checked={pinned.locked} onChange={(locked) => setPinned({ locked })} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ولایت">
          {(p) => (
            <Select {...p} value={pinned.province} onChange={(e) => setPinned({ province: e.target.value })}>
              <option value="">انتخاب کنید</option>
              {PROVINCES.map((x) => (
                <option key={x.id} value={x.name}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="ناحیه / ولسوالی">
          {(p) => <Input {...p} value={pinned.district} onChange={(e) => setPinned({ district: e.target.value })} placeholder="ناحیه ۴" maxLength={80} />}
        </Field>
        <Field label="معامله‌ٔ معمول">
          {(p) => (
            <Select {...p} value={pinned.deal_type} onChange={(e) => setPinned({ deal_type: e.target.value as typeof pinned.deal_type })}>
              <option value="">بدون پیش‌فرض</option>
              {DEAL_TYPES.map((d) => (
                <option key={d} value={d}>
                  {DEAL_LABEL[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="ارز معمول">
          {(p) => (
            <Select {...p} value={pinned.currency} onChange={(e) => setPinned({ currency: e.target.value as typeof pinned.currency })}>
              <option value="">بدون پیش‌فرض</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_NAME[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {pinned.office_lat ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <MapPinned aria-hidden className="h-3.5 w-3.5 text-primary" />
          موقعیت دفتر شما روی نقشه ثبت است؛ در فرم می‌توانید آن را برای آگهی بردارید.
        </p>
      ) : null}
    </Card>
  );
}
