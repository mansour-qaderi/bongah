'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { MAX_DRAFTS, useDrafts } from '@/lib/import/drafts-store';
import { parseText, splitListings } from '@/lib/import/parse-text';
import { usePinned } from '@/hooks/use-pinned';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch, Textarea } from '@/components/ui/field';

const EXAMPLE = `🏠 فروش خانه سه خوابه در کابل
📍 آدرس: ناحیه ۴، کارته سه، نزدیک مسجد جامع
📐 مساحت ۲۰۰ متر مربع
💰 قیمت: ۸۵ هزار دالر (قابل معامله)
☎️ 0791234567
-----
کرایه آپارتمان ۲ خوابه ۹۰ متری در هرات، ۱۲ هزار افغانی`;

const MAX_CHARS = 200_000;

/** Paste messages as they come from Telegram or WhatsApp; the listings are read out of them and land in the draft grid. */
export function SmartText() {
  const [text, setText] = useState('');
  const [stripPhones, setStripPhones] = useState(true);
  const [pinned] = usePinned();
  const { actions } = useDrafts();
  const deferred = useDeferredValue(text);
  const count = useMemo(() => (deferred.trim() ? splitListings(deferred).length : 0), [deferred]);

  function analyse() {
    const rows = parseText(text, { defaults: pinned, stripPhones });
    if (rows.length === 0) {
      toast.info('متنی برای تحلیل نیست.');
      return;
    }
    const left = actions.add(rows);
    toast.success(`${formatNumber(rows.length - left)} پیش‌نویس ساخته شد؛ پایین صفحه بازبینی کنید.`);
    if (left > 0) toast.warning(`فقط ${formatNumber(MAX_DRAFTS)} پیش‌نویس نگه داشته می‌شود؛ ${formatNumber(left)} مورد اضافه ماند.`);
    setText('');
    requestAnimationFrame(() => document.getElementById('drafts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">متن آگهی‌ها را اینجا بچسبانید</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            از تلگرام یا واتساپ کپی کنید؛ عنوان، قیمت، نوع ملک، متراژ، تعداد اتاق و آدرس خوانده می‌شود. چند آگهی را با یک خط خالی یا خط «-----» جدا کنید.
          </p>
        </div>
        <button type="button" onClick={() => setText(EXAMPLE)} className="text-[13px] font-semibold text-primary hover:underline">
          نمونه را بگذار
        </button>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        rows={12}
        aria-label="متن آگهی‌ها"
        placeholder={EXAMPLE}
        className="min-h-60 text-[13px] leading-7"
      />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={analyse} disabled={!text.trim()} className="gap-2">
          <Sparkles aria-hidden className="h-4 w-4" />
          تحلیل متن و ساخت پیش‌نویس
        </Button>
        {count > 0 ? <span className="text-[13px] font-semibold text-primary">{formatNumber(count)} آگهی تشخیص داده شد</span> : null}
        <label className="ms-auto flex items-center gap-2 text-[13px] text-ink-2">
          شمارهٔ تلفن از توضیحات برداشته شود
          <Switch label="برداشتن شماره تلفن" checked={stripPhones} onChange={setStripPhones} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">
        هر چه تشخیص داده نشود، خالی می‌ماند یا با مقادیر ثابت دفتر پر می‌شود، و زیر همان ردیف نوشته می‌شود. چیزی ثبت نمی‌شود تا خودتان در پیش‌نویس‌ها دکمهٔ ثبت را بزنید.
      </p>
    </Card>
  );
}
