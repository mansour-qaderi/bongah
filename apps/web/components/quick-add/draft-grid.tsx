'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, ClipboardList, Info, Send, Trash2, Wand2 } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES, PROPERTY_TYPES } from '@bongah/shared-types';
import { checkDraft, type DraftErrors, type DraftField } from '@/lib/import/draft-validation';
import { useDrafts } from '@/lib/import/drafts-store';
import type { ImportField } from '@/lib/import/parse-file';
import { publishDrafts, type PublishResult } from '@/lib/import/publish';
import type { DraftRow } from '@/lib/import/types';
import { formatNumber } from '@/lib/format';
import { refreshListingData } from '@/lib/listing-actions';
import { summarizeQuota } from '@/lib/quota';
import { PROVINCES, provinceLabel, provinceNameLabel } from '@/lib/provinces';
import { tNow } from '@/i18n/active';
import type { MessageKey } from '@/i18n/translate';
import { useLanguage, useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
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

/** The name of each field that can be missing, for the one-line hint. */
const FIELD_LABEL: Partial<Record<DraftField, MessageKey>> = {
  title: 'import.field.title',
  type: 'import.field.type',
  deal_type: 'import.field.deal_type',
  price: 'import.field.price',
  currency: 'import.field.currency',
  area_sqm: 'import.field.area_sqm',
  province: 'import.field.province',
  address: 'import.field.address',
  bedrooms: 'import.field.bedrooms',
  bathrooms: 'import.field.bathrooms',
  district: 'import.field.district',
  neighborhood: 'import.field.neighborhood',
};

interface RowProps {
  row: DraftRow;
  index: number;
  serverError?: PublishResult;
  /** The person pressed «ثبت» (or touched this row): only then are gaps shown as errors. */
  attempted: boolean;
  onChange: (key: string, patch: Partial<DraftRow>) => void;
  onRemove: (key: string) => void;
}

type TextField = 'title' | 'price' | 'area_sqm' | 'bedrooms' | 'bathrooms' | 'district' | 'address';

const GridRow = memo(function GridRow({ row, index, serverError, attempted, onChange, onRemove }: RowProps) {
  const t = useT();
  const [touched, setTouched] = useState(false);
  const { language } = useLanguage();
  const labels = useLabels();
  const cellAria = (field: ImportField) => t('grid.cellAria', { field: t(`import.field.${field}`), n: formatNumber(index + 1) });
  const check = checkDraft(row);
  // A freshly read row is not an error: what is missing is listed once, quietly. It turns red only when the person has
  // pressed «ثبت» or started editing this row (or the server refused it).
  const loud = attempted || touched || Boolean(serverError);
  const errors: DraftErrors = loud ? { ...check.errors, ...(serverError?.errors ?? {}) } : {};
  const missing = !loud && !check.ok ? (Object.keys(check.errors) as DraftField[]).map((f) => (f in FIELD_LABEL ? t(FIELD_LABEL[f]!) : '')).filter(Boolean) : [];
  const change = (key: string, patch: Partial<DraftRow>) => {
    setTouched(true);
    onChange(key, patch);
  };
  const bad = (f: DraftField) => Boolean(errors[f]);
  const text = (field: TextField, cls: string, extra?: { ltr?: boolean; mode?: 'decimal' | 'numeric' }) => (
    <Input
      aria-label={cellAria(field)}
      value={row[field]}
      invalid={bad(field)}
      inputMode={extra?.mode}
      onChange={(e) => change(row.key, { [field]: e.target.value })}
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
            <AlertCircle aria-label={t('grid.failed')} className="h-4.5 w-4.5 text-danger" />
          ) : check.ok ? (
            <CheckCircle2 aria-label={t('grid.ready')} className="h-4.5 w-4.5 text-primary" />
          ) : (
            <AlertCircle aria-label={t('grid.needsFix')} className="h-4.5 w-4.5 text-accent" />
          )}
        </td>
        <td className="px-1 py-1.5">{text('title', 'w-56')}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('type')} invalid={bad('type')} value={row.type} onChange={(e) => change(row.key, { type: e.target.value as DraftRow['type'] })} className={cn(CELL, 'w-32')}>
            <option value="">—</option>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {labels.type[type]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('deal_type')} invalid={bad('deal_type')} value={row.deal_type} onChange={(e) => change(row.key, { deal_type: e.target.value as DraftRow['deal_type'] })} className={cn(CELL, 'w-24')}>
            <option value="">—</option>
            {DEAL_TYPES.map((d) => (
              <option key={d} value={d}>
                {labels.deal[d]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('price', 'w-28', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('currency')} invalid={bad('currency')} value={row.currency} onChange={(e) => change(row.key, { currency: e.target.value as DraftRow['currency'] })} className={cn(CELL, 'w-24')}>
            <option value="">—</option>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {labels.currency[c]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('area_sqm', 'w-20', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">{text('bedrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">{text('bathrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('province')} invalid={bad('province')} value={row.province} onChange={(e) => change(row.key, { province: e.target.value })} className={cn(CELL, 'w-28')}>
            <option value="">—</option>
            {row.province && !PROVINCES.some((p) => p.name === row.province) ? <option value={row.province}>{provinceNameLabel(row.province, language)}</option> : null}
            {PROVINCES.map((p) => (
              <option key={p.id} value={p.name}>
                {provinceLabel(p, language)}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('district', 'w-24')}</td>
        <td className="px-1 py-1.5">{text('address', 'w-64')}</td>
        <td className="px-2 py-1.5">
          <button onClick={() => onRemove(row.key)} aria-label={t('grid.removeRow', { n: formatNumber(index + 1) })} className="rounded-md p-1.5 text-muted hover:bg-danger-tint hover:text-danger">
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
      {messages.length || row.notes.length || missing.length ? (
        <tr className={messages.length ? 'bg-danger-tint/30' : ''}>
          <td />
          <td colSpan={13} className="px-1 pb-2">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {missing.length ? <span className="text-muted">{t('grid.todo', { fields: missing.join('، ') })}</span> : null}
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
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const { drafts, actions, saveFailed } = useDrafts();
  const { data: wallet } = useWallet();
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [attempted, setAttempted] = useState(false);
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
    if (problems > 0) setAttempted(true);
    if (ready.length === 0) {
      toast.info(tNow('grid.needFix', { n: formatNumber(problems) }));
      return;
    }
    const items = ready.map((r) => ({ key: r.key, input: checkDraft(r).input! }));
    const titles = new Map(drafts.map((d) => [d.key, d.title]));
    setRun({ title: t('grid.publishTitle'), done: 0, total: items.length, titles });
    const results = await publishDrafts(items, (done, total) => setRun((r) => (r ? { ...r, done, total } : r)));
    const ok = results.filter((r) => r.ok).map((r) => r.key);
    const failed = results.filter((r) => !r.ok);
    actions.remove(new Set(ok));
    setServerResults(new Map(failed.map((f) => [f.key, f])));
    setRun((r) => (r ? { ...r, done: r.total, outcome: { succeeded: ok, failed: failed.map((f) => ({ id: f.key, message: f.message ?? t('grid.notRegistered') })) } } : r));
    void refreshListingData();
  }

  function applyFill() {
    if (!fill.value) return;
    actions.updateMany(null, { [fill.field]: fill.value } as Partial<DraftRow>);
    toast.success(tNow('grid.applied'));
  }

  if (drafts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title={t('grid.emptyTitle')}
          description={t('grid.emptyText')}
          compact
        />
      </Card>
    );
  }

  const fillOptions: Record<typeof fill.field, { label: string; options?: { value: string; label: string }[] }> = {
    province: { label: t('import.field.province'), options: PROVINCES.map((p) => ({ value: p.name, label: provinceLabel(p, language) })) },
    district: { label: t('grid.fill.district') },
    deal_type: { label: t('grid.fill.deal'), options: DEAL_TYPES.map((d) => ({ value: d, label: labels.deal[d] })) },
    currency: { label: t('import.field.currency'), options: CURRENCIES.map((c) => ({ value: c, label: labels.currency[c] })) },
    type: { label: t('import.field.type'), options: PROPERTY_TYPES.map((type) => ({ value: type, label: labels.type[type] })) },
  };
  const spec = fillOptions[fill.field];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t('grid.title', { n: formatNumber(drafts.length) })}
        description={t('grid.summary', { ready: formatNumber(ready.length), problems: formatNumber(problems) })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(true)} className="gap-1.5 text-muted">
              <Trash2 aria-hidden className="h-4 w-4" />
              {t('grid.clearAll')}
            </Button>
            <Button onClick={() => void publish()} disabled={run !== null} className="gap-2">
              <Send aria-hidden className="h-4 w-4" />
              {t('grid.publish', { n: formatNumber(ready.length) })}
            </Button>
          </div>
        }
      />

      {quota && quota.remaining !== null && ready.length > quota.remaining ? (
        <p role="status" className="mx-5 mt-3 rounded-xl border border-accent-bright/50 bg-accent-tint px-4 py-2.5 text-[13px] text-accent-text">
          {t('grid.quotaWarn', { remaining: formatNumber(quota.remaining), ready: formatNumber(ready.length) })}{' '}
          <Link href="/dashboard/subscription" className="font-bold underline">
            {t('form.moreQuota')}
          </Link>
        </p>
      ) : null}
      {saveFailed ? (
        <p role="status" className="mx-5 mt-3 rounded-xl border border-line bg-soft px-4 py-2.5 text-[13px] text-ink-2">
          {t('grid.saveFailed')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <Wand2 aria-hidden className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-semibold text-ink-2">{t('grid.forAll')}</span>
        <Select aria-label={t('grid.fieldAria')} value={fill.field} onChange={(e) => setFill({ field: e.target.value as typeof fill.field, value: '' })} className="h-8 w-32 text-[13px]">
          {(Object.keys(fillOptions) as (typeof fill.field)[]).map((k) => (
            <option key={k} value={k}>
              {fillOptions[k].label}
            </option>
          ))}
        </Select>
        {spec.options ? (
          <Select aria-label={t('grid.valueAria')} value={fill.value} onChange={(e) => setFill({ ...fill, value: e.target.value })} className="h-8 w-36 text-[13px]">
            <option value="">{t('common.choose')}</option>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : (
          <Input aria-label={t('grid.valueAria')} value={fill.value} onChange={(e) => setFill({ ...fill, value: e.target.value })} className="h-8 w-36 text-[13px]" placeholder={t('form.districtPlaceholder')} />
        )}
        <Button variant="secondary" size="sm" onClick={applyFill} disabled={!fill.value}>
          {t('grid.apply')}
        </Button>
        <label className="ms-auto flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => { setOnlyProblems(e.target.checked); setPage(1); }} className="h-4 w-4 accent-[#047857]" />
          {t('grid.onlyProblems')}
        </label>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-start">
          <thead className="bg-soft/60 text-xs text-muted">
            <tr>
              {['#', '', t('grid.h.title'), t('grid.h.type'), t('grid.h.deal'), t('grid.h.price'), t('grid.h.currency'), t('grid.h.area'), t('grid.h.beds'), t('grid.h.baths'), t('grid.h.province'), t('grid.h.district'), t('grid.h.address'), ''].map((h, i) => (
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
                attempted={attempted}
                onChange={actions.update}
                onRemove={(key) => actions.remove(new Set([key]))}
              />
            ))}
          </tbody>
        </table>
        {slice.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{t('grid.allGood')}</p> : null}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
          <span>
            {t('grid.page', { page: formatNumber(current), pages: formatNumber(pages) })}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              {t('pay.prev')}
            </Button>
            <Button variant="secondary" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              {t('pay.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('grid.confirmTitle')}
        description={t('grid.confirmText', { n: formatNumber(drafts.length) })}
        confirmLabel={t('grid.confirmButton')}
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
