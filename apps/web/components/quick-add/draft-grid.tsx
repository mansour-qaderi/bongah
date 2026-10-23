'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, ClipboardList, Info, Send, Trash2, Wand2 } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES, PROPERTY_TYPES } from '@bongah/shared-types';
import { checkDraft, type DraftErrors, type DraftField } from '@/lib/import/draft-validation';
import { useDrafts } from '@/lib/import/drafts-store';
import { publishDrafts, type PublishResult } from '@/lib/import/publish';
import type { DraftRow } from '@/lib/import/types';
import { CURRENCY_NAME, DEAL_LABEL, TYPE_LABEL } from '@/lib/labels';
import { formatNumber } from '@/lib/format';
import { refreshListingData } from '@/lib/listing-actions';
import { summarizeQuota } from '@/lib/quota';
import { PROVINCES } from '@/lib/provinces';
import { useWallet } from '@/hooks/use-api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/field';
import { ProgressDialog, type RunState } from '@/components/listings/progress-dialog';

const PAGE = 50;
const CELL = 'h-8 rounded-lg px-2 text-[13px]';

interface RowProps {
  row: DraftRow;
  index: number;
  serverError?: PublishResult;
  onChange: (key: string, patch: Partial<DraftRow>) => void;
  onRemove: (key: string) => void;
}

const GridRow = memo(function GridRow({ row, index, serverError, onChange, onRemove }: RowProps) {
  const check = checkDraft(row);
  const errors: DraftErrors = { ...check.errors, ...(serverError?.errors ?? {}) };
  const bad = (f: DraftField) => Boolean(errors[f]);
  const text = (f: keyof DraftRow, field: DraftField, cls: string, extra?: { ltr?: boolean; mode?: 'decimal' | 'numeric' }) => (
    <Input
      aria-label={`${field} ردیف ${index + 1}`}
      value={row[f] as string}
      invalid={bad(field)}
      inputMode={extra?.mode}
      onChange={(e) => onChange(row.key, { [f]: e.target.value })}
      className={cn(CELL, cls, extra?.ltr && 'ltr text-start')}
    />
  );
  const messages = [...new Set([...Object.values(errors), serverError?.message].filter(Boolean) as string[])];

  return (
    <>
      <tr className={cn('align-top', messages.length ? 'bg-danger-tint/30' : '')}>
        <td className="px-2 py-1.5 text-center text-xs text-muted">{formatNumber(index + 1)}</td>
        <td className="px-1 py-1.5">
          {serverError ? (
            <AlertCircle aria-label="ثبت نشد" className="h-4.5 w-4.5 text-danger" />
          ) : check.ok ? (
            <CheckCircle2 aria-label="آماده" className="h-4.5 w-4.5 text-primary" />
          ) : (
            <AlertCircle aria-label="نیازمند اصلاح" className="h-4.5 w-4.5 text-accent" />
          )}
        </td>
        <td className="px-1 py-1.5">{text('title', 'title', 'w-56')}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={`نوع ردیف ${index + 1}`} invalid={bad('type')} value={row.type} onChange={(e) => onChange(row.key, { type: e.target.value as DraftRow['type'] })} className={cn(CELL, 'w-32')}>
            <option value="">—</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={`معامله ردیف ${index + 1}`} invalid={bad('deal_type')} value={row.deal_type} onChange={(e) => onChange(row.key, { deal_type: e.target.value as DraftRow['deal_type'] })} className={cn(CELL, 'w-24')}>
            <option value="">—</option>
            {DEAL_TYPES.map((d) => (
              <option key={d} value={d}>
                {DEAL_LABEL[d]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('price', 'price', 'w-28', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={`ارز ردیف ${index + 1}`} invalid={bad('currency')} value={row.currency} onChange={(e) => onChange(row.key, { currency: e.target.value as DraftRow['currency'] })} className={cn(CELL, 'w-24')}>
            <option value="">—</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_NAME[c]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('area_sqm', 'area_sqm', 'w-20', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">{text('bedrooms', 'bedrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">{text('bathrooms', 'bathrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={`ولایت ردیف ${index + 1}`} invalid={bad('province')} value={row.province} onChange={(e) => onChange(row.key, { province: e.target.value })} className={cn(CELL, 'w-28')}>
            <option value="">—</option>
            {row.province && !PROVINCES.some((p) => p.name === row.province) ? <option value={row.province}>{row.province}</option> : null}
            {PROVINCES.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('district', 'district', 'w-24')}</td>
        <td className="px-1 py-1.5">{text('address', 'address', 'w-64')}</td>
        <td className="px-2 py-1.5">
          <button onClick={() => onRemove(row.key)} aria-label={`حذف ردیف ${index + 1}`} className="rounded-md p-1.5 text-muted hover:bg-danger-tint hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {messages.length || row.notes.length ? (
        <tr className={messages.length ? 'bg-danger-tint/30' : ''}>
          <td />
          <td colSpan={13} className="px-1 pb-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {messages.map((m) => (
                <span key={m} role="alert" className="text-danger">
                  {m}
                </span>
              ))}
              {row.notes.map((n) => (
                <span key={n} className="flex items-center gap-1 text-accent-text">
                  <Info aria-hidden className="h-3 w-3 shrink-0" />
                  {n}
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
});

/** The listings waiting to be published: every cell editable, each row checked as the API will check it. */
export function DraftGrid() {
  const { drafts, actions, saveFailed } = useDrafts();
  const { data: wallet } = useWallet();
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [serverResults, setServerResults] = useState<ReadonlyMap<string, PublishResult>>(new Map());
  const [confirmClear, setConfirmClear] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [fill, setFill] = useState<{ field: 'province' | 'district' | 'deal_type' | 'currency' | 'type'; value: string }>({ field: 'province', value: '' });

  const checks = drafts.map(checkDraft);
  const ready = drafts.filter((_, i) => checks[i]!.ok);
  const problems = drafts.length - ready.length;
  const quota = summarizeQuota(wallet);

  const visible = useMemo(
    () => (onlyProblems ? drafts.filter((d) => !checkDraft(d).ok || serverResults.has(d.key)) : drafts),
    [drafts, onlyProblems, serverResults],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages);
  const slice = visible.slice((current - 1) * PAGE, current * PAGE);

  async function publish() {
    const items = ready.map((r) => ({ key: r.key, input: checkDraft(r).input! }));
    const titles = new Map(drafts.map((d) => [d.key, d.title]));
    setRun({ title: 'ثبت آگهی‌ها', done: 0, total: items.length, titles });
    const results = await publishDrafts(items, (done, total) => setRun((r) => (r ? { ...r, done, total } : r)));
    const ok = results.filter((r) => r.ok).map((r) => r.key);
    const failed = results.filter((r) => !r.ok);
    actions.remove(new Set(ok));
    setServerResults(new Map(failed.map((f) => [f.key, f])));
    setRun((r) => (r ? { ...r, done: r.total, outcome: { succeeded: ok, failed: failed.map((f) => ({ id: f.key, message: f.message ?? 'ثبت نشد.' })) } } : r));
    void refreshListingData();
  }

  function applyFill() {
    if (!fill.value) return;
    actions.updateMany(null, { [fill.field]: fill.value } as Partial<DraftRow>);
    toast.success('برای همهٔ ردیف‌ها اعمال شد.');
  }

  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="پیش‌نویسی ندارید"
          description="آگهی‌هایی که از متن یا فایل بسازید، اینجا برای بازبینی و ثبت می‌آیند. آنچه اینجا بماند در همین مرورگر ذخیره می‌شود."
          compact
        />
      </Card>
    );
  }

  const fillOptions: Record<typeof fill.field, { label: string; options?: { value: string; label: string }[] }> = {
    province: { label: 'ولایت', options: PROVINCES.map((p) => ({ value: p.name, label: p.name })) },
    district: { label: 'ناحیه' },
    deal_type: { label: 'معامله', options: DEAL_TYPES.map((d) => ({ value: d, label: DEAL_LABEL[d] })) },
    currency: { label: 'ارز', options: CURRENCIES.map((c) => ({ value: c, label: CURRENCY_NAME[c] })) },
    type: { label: 'نوع ملک', options: PROPERTY_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })) },
  };
  const spec = fillOptions[fill.field];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={`پیش‌نویس‌ها (${formatNumber(drafts.length)})`}
        description={`${formatNumber(ready.length)} آماده · ${formatNumber(problems)} نیازمند اصلاح`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} className="gap-1.5 text-muted">
              <Trash2 aria-hidden className="h-4 w-4" />
              پاک کردن همه
            </Button>
            <Button onClick={() => void publish()} disabled={ready.length === 0 || run !== null} className="gap-2">
              <Send aria-hidden className="h-4 w-4" />
              ثبت {formatNumber(ready.length)} آگهی
            </Button>
          </div>
        }
      />

      {quota && quota.remaining !== null && ready.length > quota.remaining ? (
        <p role="status" className="mx-5 mt-3 rounded-xl border border-accent-bright/50 bg-accent-tint px-4 py-2.5 text-[13px] text-accent-text">
          سهمیهٔ باقی‌مانده شما {formatNumber(quota.remaining)} آگهی است ولی {formatNumber(ready.length)} آگهی آماده دارید؛ آگهی‌های بعد از سهمیه رد می‌شوند.{' '}
          <Link href="/dashboard/subscription" className="font-bold underline">
            افزایش سهمیه
          </Link>
        </p>
      ) : null}
      {saveFailed ? (
        <p role="status" className="mx-5 mt-3 rounded-xl border border-line bg-soft px-4 py-2.5 text-[13px] text-ink-2">
          مرورگر اجازهٔ ذخیره نمی‌دهد؛ پیش‌نویس‌ها تا بستن این صفحه می‌مانند.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <Wand2 aria-hidden className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-ink-2">برای همهٔ ردیف‌ها:</span>
        <Select aria-label="فیلد" value={fill.field} onChange={(e) => setFill({ field: e.target.value as typeof fill.field, value: '' })} className="h-8 w-32 text-[13px]">
          {(Object.keys(fillOptions) as (typeof fill.field)[]).map((k) => (
            <option key={k} value={k}>
              {fillOptions[k].label}
            </option>
          ))}
        </Select>
        {spec.options ? (
          <Select aria-label="مقدار" value={fill.value} onChange={(e) => setFill({ ...fill, value: e.target.value })} className="h-8 w-36 text-[13px]">
            <option value="">انتخاب کنید</option>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input aria-label="مقدار" value={fill.value} onChange={(e) => setFill({ ...fill, value: e.target.value })} className="h-8 w-36 text-[13px]" placeholder="ناحیه ۴" />
        )}
        <Button variant="secondary" size="sm" onClick={applyFill} disabled={!fill.value}>
          اعمال
        </Button>
        <label className="ms-auto flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => { setOnlyProblems(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#047857]" />
          فقط ردیف‌های ناقص
        </label>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-start">
          <thead className="bg-soft/60 text-xs text-muted">
            <tr>
              {['#', '', 'عنوان', 'نوع ملک', 'معامله', 'قیمت', 'ارز', 'متراژ', 'خواب', 'حمام', 'ولایت', 'ناحیه', 'آدرس', ''].map((h, i) => (
                <th key={i} scope="col" className="px-2 py-2 text-start font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {slice.map((row, i) => (
              <GridRow
                key={row.key}
                row={row}
                index={(current - 1) * PAGE + i}
                serverError={serverResults.get(row.key)}
                onChange={actions.update}
                onRemove={(key) => actions.remove(new Set([key]))}
              />
            ))}
          </tbody>
        </table>
        {slice.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">همهٔ ردیف‌ها درست‌اند.</p> : null}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
          <span>
            صفحه {formatNumber(current)} از {formatNumber(pages)}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              قبلی
            </Button>
            <Button variant="secondary" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              بعدی
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="پاک کردن همهٔ پیش‌نویس‌ها؟"
        description={`${formatNumber(drafts.length)} پیش‌نویس حذف می‌شود. آگهی‌های ثبت‌شده دست نمی‌خورند.`}
        confirmLabel="پاک کردن"
        onConfirm={() => {
          actions.clear();
          setServerResults(new Map());
          setConfirmClear(false);
        }}
      />
      <ProgressDialog run={run} onClose={() => setRun(null)} />
    </Card>
  );
}
