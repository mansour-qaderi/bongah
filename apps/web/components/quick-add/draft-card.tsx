'use client';

import { memo } from 'react';
import { Info, Trash2 } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES, PRICE_TERMS, PROPERTY_TYPES } from '@bongah/shared-types';
import type { DraftField } from '@/lib/import/draft-validation';
import type { PublishResult } from '@/lib/import/publish';
import type { DraftRow } from '@/lib/import/types';
import { hasRoomsFor } from '@/lib/labels';
import { formatNumber } from '@/lib/format';
import { PROVINCES, provinceLabel, provinceNameLabel } from '@/lib/provinces';
import { useLanguage, useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { cn } from '@/lib/cn';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { fieldName, StatusPill, useRowReport } from './draft-shared';

interface Props {
  row: DraftRow;
  index: number;
  serverError?: PublishResult;
  attempted: boolean;
  onChange: (key: string, patch: Partial<DraftRow>) => void;
  onRemove: (key: string) => void;
}

/**
 * One draft as a card instead of a table row: the same fields, each with its label above it, and the full description
 * (everything that was pasted) in a text box of its own. For one listing, or a few, a 14-column table is a lot of
 * scrolling for nothing; the checks, the status and the notes are exactly those of the table (draft-shared.tsx).
 */
export const DraftCard = memo(function DraftCard({ row, index, serverError, attempted, onChange, onRemove }: Props) {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
  const { errors, missing, state, fixes, hasProblem, touch } = useRowReport(row, serverError, attempted);
  const change = (patch: Partial<DraftRow>) => {
    touch();
    onChange(row.key, patch);
  };
  const err = (f: DraftField) => (errors[f] ? String(errors[f]) : null);
  const rooms = row.type === '' || hasRoomsFor(row.type);
  const n = formatNumber(index + 1);

  return (
    <article
      data-testid="draft-card"
      data-state={state}
      aria-label={t('grid.cardAria', { n })}
      className={cn('rounded-2xl border bg-surface p-4 sm:p-5', hasProblem ? 'border-danger/50 bg-danger-tint/20' : 'border-line')}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="tabular grid h-7 w-7 place-items-center rounded-full bg-soft text-xs font-bold text-ink-2">{n}</span>
          <StatusPill state={state} />
        </div>
        <button
          type="button"
          onClick={() => onRemove(row.key)}
          aria-label={t('grid.removeRow', { n })}
          className="rounded-md p-1.5 text-muted hover:bg-danger-tint hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('grid.h.title')} error={err('title')} required className="sm:col-span-2 lg:col-span-4">
          {(p) => <Input {...p} value={row.title} onChange={(e) => change({ title: e.target.value })} />}
        </Field>
        <Field label={t('grid.h.type')} error={err('type')} required>
          {(p) => (
            <Select {...p} value={row.type} onChange={(e) => change({ type: e.target.value as DraftRow['type'] })}>
              <option value="">—</option>
              {PROPERTY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels.type[type]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('grid.h.deal')} error={err('deal_type')} required>
          {(p) => (
            <Select {...p} value={row.deal_type} onChange={(e) => change({ deal_type: e.target.value as DraftRow['deal_type'] })}>
              <option value="">—</option>
              {DEAL_TYPES.map((d) => (
                <option key={d} value={d}>
                  {labels.deal[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('grid.h.price')} error={err('price')} required>
          {(p) => <Input {...p} className="ltr text-start" inputMode="decimal" value={row.price} onChange={(e) => change({ price: e.target.value })} />}
        </Field>
        <Field label={t('grid.h.currency')} error={err('currency')} required>
          {(p) => (
            <Select {...p} value={row.currency} onChange={(e) => change({ currency: e.target.value as DraftRow['currency'] })}>
              <option value="">—</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {labels.currency[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('grid.h.terms')}>
          {(p) => (
            <Select {...p} value={row.price_terms} onChange={(e) => change({ price_terms: e.target.value as DraftRow['price_terms'] })}>
              <option value="">{t('form.unspecified')}</option>
              {PRICE_TERMS.map((term) => (
                <option key={term} value={term}>
                  {labels.terms[term]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('grid.h.area')} error={err('area_sqm')} required>
          {(p) => <Input {...p} className="ltr text-start" inputMode="decimal" value={row.area_sqm} onChange={(e) => change({ area_sqm: e.target.value })} />}
        </Field>
        {rooms ? (
          <>
            <Field label={t('grid.h.beds')} error={err('bedrooms')}>
              {(p) => <Input {...p} className="ltr text-start" inputMode="numeric" value={row.bedrooms} onChange={(e) => change({ bedrooms: e.target.value })} />}
            </Field>
            <Field label={t('grid.h.baths')} error={err('bathrooms')}>
              {(p) => <Input {...p} className="ltr text-start" inputMode="numeric" value={row.bathrooms} onChange={(e) => change({ bathrooms: e.target.value })} />}
            </Field>
          </>
        ) : null}
        <Field label={t('grid.h.province')} error={err('province')} required>
          {(p) => (
            <Select {...p} value={row.province} onChange={(e) => change({ province: e.target.value })}>
              <option value="">—</option>
              {row.province && !PROVINCES.some((pr) => pr.name === row.province) ? (
                <option value={row.province}>{provinceNameLabel(row.province, language)}</option>
              ) : null}
              {PROVINCES.map((pr) => (
                <option key={pr.id} value={pr.name}>
                  {provinceLabel(pr, language)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('grid.h.district')} error={err('district')}>
          {(p) => <Input {...p} value={row.district} onChange={(e) => change({ district: e.target.value })} />}
        </Field>
        <Field label={t('grid.h.address')} error={err('address')} required className="sm:col-span-2">
          {(p) => <Input {...p} value={row.address} onChange={(e) => change({ address: e.target.value })} />}
        </Field>
        <Field
          label={t('card.description')}
          error={err('description')}
          hint={t('card.descriptionHint', { n: formatNumber(row.description.length) })}
          className="sm:col-span-2 lg:col-span-4"
        >
          {(p) => <Textarea {...p} rows={8} value={row.description} onChange={(e) => change({ description: e.target.value })} className="text-[13px]" />}
        </Field>
      </div>

      {row.phone ? (
        <p className="mt-3 text-xs text-muted">
          <span className="font-semibold text-ink-2">{t('card.phone')}: </span>
          <span className="ltr tabular">{row.phone}</span>
          <span> — {t('card.phoneHint')}</span>
        </p>
      ) : null}

      {serverError || fixes.length || row.notes.length || missing.length ? (
        <div className="mt-3 space-y-1 text-xs">
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
              {row.notes.map((note) => (
                <span key={note} className="flex items-center gap-1 text-accent-text">
                  <Info aria-hidden className="h-3 w-3 shrink-0" />
                  {note}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
});
