'use client';

import { memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ClipboardList, CircleHelp, Info, LayoutGrid, Send, Table2, Trash2, Wand2 } from 'lucide-react';
import { marketOfCurrency, MARKETS, PRICE_TERMS } from '@bongah/shared-types';
import { checkDraft } from '@/lib/import/draft-validation';
import { useDrafts } from '@/lib/import/drafts-store';
import type { ImportField } from '@/lib/import/parse-file';
import { publishDrafts, type PublishResult } from '@/lib/import/publish';
import type { DraftRow } from '@/lib/import/types';
import { formatNumber } from '@/lib/format';
import { refreshListingData } from '@/lib/listing-actions';
import { summarizeQuota } from '@/lib/quota';
import { provincesFor, provinceLabel, provinceNameLabel } from '@/lib/provinces';
import { currenciesFor, dealsFor, deedsFor, marketName, reconcileDraft, typesFor, typesForDeal } from '@/lib/market';
import { useBatchMarket } from '@/hooks/use-pinned';
import { useLabelsFor, useRowMarket } from '@/hooks/use-market';
import { tNow } from '@/i18n/active';
import type { MessageKey } from '@/i18n/translate';
import { useLanguage, useT } from '@/i18n/provider';
import { marketKey } from '@/i18n/translate';
import { useLabels } from '@/i18n/use-labels';
import { useWallet } from '@/hooks/use-api';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Checkbox, Input, Select } from '@/components/ui/field';
import { Tip } from '@/components/ui/tooltip';
import { ProgressDialog, type RunState } from '@/components/listings/progress-dialog';
import { DraftCard } from './draft-card';
import { fieldName, StatusPill, useRowReport, type RowState } from './draft-shared';
import { FeaturesCell } from './features-cell';

const PAGE = 50;
const PAGE_CARDS = 10;
const VIEW_KEY = 'bongah.drafts-view';
type DraftView = 'table' | 'cards';
const CELL = 'h-8 rounded-lg px-2 text-[13px]';

/** A column heading with a small «?» that explains the cell, for the columns agents most often leave wrong. */
function HeadWithHint({ text, hint }: { text: string; hint?: string }) {
  if (!hint) return <>{text}</>;
  return (
    <Tip label={hint}>
      <span className="inline-flex cursor-help items-center gap-1">
        {text}
        <CircleHelp aria-hidden className="h-3.5 w-3.5 text-muted" />
        <span className="sr-only">{hint}</span>
      </span>
    </Tip>
  );
}

/**
 * What the three statuses mean, and that nothing is lost while a row is incomplete. It is not on the page all the time:
 * a small ⓘ beside the title opens it, so the table is the first thing in view and the guide is one press away.
 */
function StatusGuide() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const items: { state: RowState; text: MessageKey }[] = [
    { state: 'ready', text: 'grid.legend.ready' },
    { state: 'incomplete', text: 'grid.legend.incomplete' },
    { state: 'failed', text: 'grid.legend.failed' },
  ];
  return (
    <>
      <button
        type="button"
        data-testid="status-guide-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('grid.legend.title')}
        title={t('grid.legend.title')}
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Info aria-hidden className="h-[18px] w-[18px]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={t('grid.legend.title')} size="sm">
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.state} className="flex items-start gap-2.5 text-[13px] leading-6 text-ink-2">
              <StatusPill state={item.state} withTip={false} />
              <span>{t(item.text)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-soft/70 px-3 py-2.5 text-[13px] leading-6 text-muted">{t('grid.legend.note')}</p>
      </Dialog>
    </>
  );
}

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
  const { language } = useLanguage();
  const market = useRowMarket(row);
  const labels = useLabelsFor(market);
  const cellAria = (field: ImportField) => t('grid.cellAria', { field: t(`import.field.${field}`), n: formatNumber(index + 1) });
  const { missing, state, fixes, hasProblem, touch, bad } = useRowReport(row, serverError, attempted);
  const change = (key: string, patch: Partial<DraftRow>) => {
    touch();
    onChange(key, patch);
  };
  /** Another country: what does not exist there is cleared, and the row keeps the country from then on. */
  const switchMarket = (next: typeof market, keep: Partial<DraftRow> = {}) =>
    change(row.key, { ...keep, ...reconcileDraft({ ...row, ...keep }, next), market: next });
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
  return (
    <>
      <tr className={cn('align-top', hasProblem ? 'bg-danger-tint/30' : '')}>
        <td className="px-2 py-1.5 text-center text-xs text-muted">{formatNumber(index + 1)}</td>
        <td className="px-1 py-1.5">
          <StatusPill state={state} />
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={t('market.field')} value={market} onChange={(e) => switchMarket(e.target.value as typeof market)} className={cn(CELL, 'w-24')}>
            {MARKETS.map((m) => (
              <option key={m} value={m}>
                {marketName(m)}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('title', 'w-56')}</td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('type')} invalid={bad('type')} value={row.type} onChange={(e) => change(row.key, { type: e.target.value as DraftRow['type'] })} className={cn(CELL, 'w-32')}>
            <option value="">—</option>
            {typesForDeal(market, row.deal_type).map((type) => (
              <option key={type} value={type}>
                {labels.type[type]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('deal_type')} invalid={bad('deal_type')} value={row.deal_type} onChange={(e) => {
              const deal_type = e.target.value as DraftRow['deal_type'];
              change(row.key, {
                deal_type,
                ...(row.type && !typesForDeal(market, deal_type).includes(row.type) ? { type: '' as const } : {}),
                ...(deal_type !== 'MORTGAGE_RENT' && row.monthly_rent ? { monthly_rent: '' } : {}),
              });
            }} className={cn(CELL, 'w-28')}>
            <option value="">—</option>
            {dealsFor(market).map((d) => (
              <option key={d} value={d}>
                {labels.deal[d]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('price', 'w-28', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">
          <Input
            aria-label={cellAria('monthly_rent')}
            value={row.monthly_rent ?? ''}
            invalid={bad('monthly_rent')}
            inputMode="decimal"
            disabled={row.deal_type !== 'MORTGAGE_RENT'}
            placeholder={row.deal_type === 'MORTGAGE_RENT' ? '' : '—'}
            onChange={(e) => change(row.key, { monthly_rent: e.target.value })}
            className={cn(CELL, 'ltr w-28 text-start')}
          />
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('currency')} invalid={bad('currency')} value={row.currency} onChange={(e) => {
              const currency = e.target.value as DraftRow['currency'];
              const owner = currency ? marketOfCurrency(currency) : null;
              if (owner && owner !== market) switchMarket(owner, { currency });
              else change(row.key, { currency });
            }} className={cn(CELL, 'w-24')}>
            <option value="">—</option>
            {currenciesFor(market).map((c) => (
              <option key={c} value={c}>
                {labels.currency[c]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('price_terms')} value={row.price_terms} onChange={(e) => change(row.key, { price_terms: e.target.value as DraftRow['price_terms'] })} className={cn(CELL, 'w-28')}>
            <option value="">—</option>
            {PRICE_TERMS.map((term) => (
              <option key={term} value={term}>
                {labels.terms[term]}
              </option>
            ))}
          </Select>
        </td>
        <td className="px-1 py-1.5">{text('area_sqm', 'w-20', { ltr: true, mode: 'decimal' })}</td>
        <td className="px-1 py-1.5">{text('bedrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">{text('bathrooms', 'w-14', { ltr: true, mode: 'numeric' })}</td>
        <td className="px-1 py-1.5">
          <FeaturesCell market={market} value={row.features ?? []} onChange={(features) => change(row.key, { features })} label={cellAria('features')} invalid={bad('features')} className="w-36" />
        </td>
        <td className="px-1 py-1.5">
          {deedsFor(market).length ? (
            <Select aria-label={cellAria('deed_type')} invalid={bad('deed_type')} value={row.deed_type ?? ''} onChange={(e) => change(row.key, { deed_type: e.target.value as DraftRow['deed_type'] })} className={cn(CELL, 'w-28')}>
              <option value="">—</option>
              {deedsFor(market).map((deed) => (
                <option key={deed} value={deed}>
                  {labels.deed[deed]}
                </option>
              ))}
            </Select>
          ) : (
            <span className="px-2 text-muted">—</span>
          )}
        </td>
        <td className="px-1 py-1.5">
          <Select aria-label={cellAria('province')} invalid={bad('province')} value={row.province} onChange={(e) => change(row.key, { province: e.target.value })} className={cn(CELL, 'w-28')}>
            <option value="">—</option>
            {row.province && !provincesFor(market).some((p) => p.name === row.province) ? <option value={row.province}>{provinceNameLabel(row.province, language)}</option> : null}
            {provincesFor(market).map((p) => (
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
      {hasProblem || row.notes.length || missing.length ? (
        <tr className={hasProblem ? 'bg-danger-tint/30' : ''}>
          <td />
          <td colSpan={18} className="px-1 pb-2">
            <div className="space-y-1 text-xs">
              {serverError ? (
                <p role="alert" className="font-semibold text-danger">
                  {t('grid.refused', { reason: serverError.message ?? t('grid.notRegistered') })}
                </p>
              ) : null}
              {fixes.length ? (
                <div role="alert">
                  <span className="font-semibold text-ink-2">{t('grid.fixTitle')}</span>
                  <ul className="mt-0.5 flex flex-wrap gap-x-5 gap-y-1">
                    {fixes.map(([field, text]) => (
                      <li key={field} className="text-danger">
                        <span className="font-bold">{fieldName(t, field)}</span>
                        <span aria-hidden> — </span>
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {serverError ? <p className="text-muted">{t('grid.refusedHint')}</p> : null}
              {missing.length ? <p className="text-muted">{t('grid.todo', { fields: missing.join('، ') })}</p> : null}
              {row.notes.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {row.notes.map((n) => (
                    <span key={n} className="flex items-center gap-1 text-accent-text">
                      <Info aria-hidden className="h-3 w-3 shrink-0" />
                      {n}
                    </span>
                  ))}
                </div>
              ) : null}
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
  const [batchMarket] = useBatchMarket();
  const batchLabels = useLabelsFor(batchMarket);
  const { drafts, actions, saveFailed } = useDrafts();
  const { data: wallet } = useWallet();
  const [page, setPage] = useState(1);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverResults, setServerResults] = useState<ReadonlyMap<string, PublishResult>>(new Map());
  const [confirmClear, setConfirmClear] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [fill, setFill] = useState<{ field: 'province' | 'district' | 'deal_type' | 'currency' | 'price_terms' | 'type'; value: string }>({ field: 'province', value: '' });

  const checks = drafts.map(checkDraft);
  const ready = drafts.filter((_, i) => checks[i]!.ok);
  const problems = drafts.length - ready.length;
  const quota = summarizeQuota(wallet);

  const visible = useMemo(
    () => (onlyProblems ? drafts.filter((d) => !checkDraft(d).ok || serverResults.has(d.key)) : drafts),
    [drafts, onlyProblems, serverResults],
  );
  // One listing (the usual paste) is shown as a card: a 14-column table is a lot of scrolling for a single row. Whatever
  // the person picks is remembered; until then it is the card for one draft and the table for more.
  const [chosenView, setChosenView] = useLocalStorage<DraftView | null>(VIEW_KEY, null);
  const view: DraftView = chosenView ?? (drafts.length === 1 ? 'cards' : 'table');
  const pageSize = view === 'cards' ? PAGE_CARDS : PAGE;
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages);
  const slice = visible.slice((current - 1) * pageSize, current * pageSize);

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
    province: { label: t(marketKey('import.field.province', batchMarket)), options: provincesFor(batchMarket).map((p) => ({ value: p.name, label: provinceLabel(p, language) })) },
    district: { label: t(marketKey('grid.fill.district', batchMarket)) },
    deal_type: { label: t('grid.fill.deal'), options: dealsFor(batchMarket).map((d) => ({ value: d, label: batchLabels.deal[d] })) },
    currency: { label: t('import.field.currency'), options: currenciesFor(batchMarket).map((c) => ({ value: c, label: labels.currency[c] })) },
    price_terms: { label: t('import.field.price_terms'), options: PRICE_TERMS.map((term) => ({ value: term, label: labels.terms[term] })) },
    type: { label: t('import.field.type'), options: typesFor(batchMarket).map((type) => ({ value: type, label: labels.type[type] })) },
  };
  const spec = fillOptions[fill.field];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('grid.title', { n: formatNumber(drafts.length) })}
            <StatusGuide />
          </span>
        }
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

      <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-line px-5 py-3">
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
          <Input aria-label={t('grid.valueAria')} value={fill.value} onChange={(e) => setFill({ ...fill, value: e.target.value })} className="h-8 w-36 text-[13px]" placeholder={t(marketKey('form.districtPlaceholder', batchMarket))} />
        )}
        <Button variant="secondary" size="sm" onClick={applyFill} disabled={!fill.value}>
          {t('grid.apply')}
        </Button>
        <div role="group" aria-label={t('grid.view.aria')} className="ms-auto inline-flex rounded-lg bg-soft p-0.5">
          {(
            [
              ['cards', LayoutGrid, 'grid.view.cards'],
              ['table', Table2, 'grid.view.table'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => {
                setChosenView(value);
                setPage(1);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-ink-2',
                view === value && 'bg-surface text-primary ring-1 ring-line',
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {t(label)}
            </button>
          ))}
        </div>
        <Checkbox
          checked={onlyProblems}
          onChange={(next) => {
            setOnlyProblems(next);
            setPage(1);
          }}
          label={t('grid.onlyProblems')}
          className="text-[13px]"
        >
          {t('grid.onlyProblems')}
        </Checkbox>
      </div>

      {view === 'cards' ? (
        <div className="space-y-4 p-4 sm:p-5">
          {slice.map((row, i) => (
            <DraftCard
              key={row.key}
              row={row}
              index={(current - 1) * pageSize + i}
              serverError={serverResults.get(row.key)}
              attempted={attempted}
              onChange={actions.update}
              onRemove={(key) => actions.remove(new Set([key]))}
            />
          ))}
          {slice.length === 0 ? <p className="py-4 text-center text-sm text-muted">{t('grid.allGood')}</p> : null}
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[2200px] border-collapse text-start">
            <thead className="bg-soft/60 text-xs text-muted">
              <tr>
                {[
                  { text: '#' },
                  { text: t('grid.status') },
                  { text: t('market.field') },
                  { text: t('grid.h.title') },
                  { text: t('grid.h.type') },
                  { text: t('grid.h.deal') },
                  { text: t('grid.h.price'), hint: t('grid.hint.price') },
                  { text: t('import.field.monthly_rent') },
                  { text: t('grid.h.currency') },
                  { text: t('grid.h.terms') },
                  { text: t('grid.h.area'), hint: t('grid.hint.area') },
                  { text: t('grid.h.beds'), hint: t('grid.hint.rooms') },
                  { text: t('grid.h.baths'), hint: t('grid.hint.rooms') },
                  { text: t('import.field.features') },
                  { text: t('import.field.deed_type') },
                  { text: t(marketKey('grid.h.province', batchMarket)) },
                  { text: t(marketKey('grid.h.district', batchMarket)) },
                  { text: t('grid.h.address'), hint: t('grid.hint.address') },
                  { text: '' },
                ].map((h, i) => (
                  <th key={i} scope="col" className="px-2 py-2 text-start font-semibold">
                    <HeadWithHint text={h.text} hint={h.hint} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slice.map((row, i) => (
                <GridRow
                  key={row.key}
                  row={row}
                  index={(current - 1) * pageSize + i}
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
      )}

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
