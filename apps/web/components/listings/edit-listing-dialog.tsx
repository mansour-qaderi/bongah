'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CURRENCIES, PRICE_TERMS, type Currency, type PriceTerms, type Property } from '@bongah/shared-types';
import { moneyAmount } from '@bongah/validation';
import { errorMessage } from '@/lib/api';
import { parseLooseNumber } from '@/lib/format';
import { patchCachedListings, refreshListingData, updateListing, type ListingPatch } from '@/lib/listing-actions';
import { useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';

interface Form {
  title: string;
  description: string;
  price: string;
  currency: Currency;
  price_terms: PriceTerms | '';
  area: string;
  bedrooms: string;
  bathrooms: string;
  district: string;
  neighborhood: string;
  address: string;
}

const fromProperty = (p: Property): Form => ({
  title: p.title,
  description: p.description ?? '',
  price: String(p.price),
  currency: p.currency,
  price_terms: p.price_terms ?? '',
  area: String(p.area_sqm),
  bedrooms: p.bedrooms == null ? '' : String(p.bedrooms),
  bathrooms: p.bathrooms == null ? '' : String(p.bathrooms),
  district: p.district ?? '',
  neighborhood: p.neighborhood ?? '',
  address: p.address ?? '',
});

type Errors = Partial<Record<keyof Form, string>>;

/** Whole-number field that may be left empty (null). */
function count(raw: string): number | null | 'bad' {
  if (raw.trim() === '') return null;
  const n = parseLooseNumber(raw);
  return n === null || !Number.isInteger(n) || n > 50 ? 'bad' : n;
}

/**
 * The full edit form for one listing. Only what changed is sent (PATCH), so a field the person did not touch is never
 * overwritten with an older copy; the pin, photos and the deal stay as they are (they have their own screens).
 */
export function EditListingDialog({ listing, onClose }: { listing: Property | null; onClose: () => void }) {
  const t = useT();
  const labels = useLabels();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(listing ? fromProperty(listing) : null);
    setErrors({});
  }, [listing]);

  if (!listing || !form) return null;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save() {
    if (!listing || !form) return;
    const next: Errors = {};
    const patch: ListingPatch = {};
    const before = fromProperty(listing);

    const title = form.title.replace(/\s+/g, ' ').trim();
    if (title.length < 3) next.title = t('list.col.titleShort');
    else if (title.length > 150) next.title = t('list.col.titleLong');
    else if (title !== before.title) patch.title = title;

    const description = form.description.trim();
    if (description.length < 1) next.description = t('list.edit.descriptionRequired');
    else if (description.length > 5000) next.description = t('list.edit.descriptionLong');
    else if (description !== before.description.trim()) patch.description = description;

    const price = parseLooseNumber(form.price);
    if (price === null || price <= 0) next.price = t('list.col.priceNumber');
    else if (!moneyAmount.safeParse(price).success) next.price = t('list.col.priceInvalid');
    else if (price !== listing.price) patch.price = price;
    if (form.currency !== listing.currency) patch.currency = form.currency;
    if (form.price_terms !== before.price_terms) patch.price_terms = form.price_terms || null;

    const area = parseLooseNumber(form.area);
    if (area === null || area <= 0 || area > 100_000_000) next.area = t('list.edit.areaInvalid');
    else if (area !== listing.area_sqm) patch.area_sqm = area;

    const bedrooms = count(form.bedrooms);
    if (bedrooms === 'bad') next.bedrooms = t('list.edit.countInvalid');
    else if (bedrooms !== listing.bedrooms) patch.bedrooms = bedrooms;
    const bathrooms = count(form.bathrooms);
    if (bathrooms === 'bad') next.bathrooms = t('list.edit.countInvalid');
    else if (bathrooms !== listing.bathrooms) patch.bathrooms = bathrooms;

    for (const key of ['district', 'neighborhood', 'address'] as const) {
      const value = form[key].replace(/\s+/g, ' ').trim();
      if (value !== '' && value.length < (key === 'address' ? 3 : 2)) next[key] = t('list.edit.tooShort');
      else if (value !== (before[key] ?? '').trim()) patch[key] = value;
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateListing(listing.id, patch);
      await patchCachedListings(new Set([listing.id]), patch);
      toast.success(t('common.saved'));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
      await refreshListingData();
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !saving && onClose()}
      title={t('list.edit.title')}
      description={t('list.edit.hint')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} loading={saving} data-testid="edit-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5" data-testid="edit-listing">
        <Field label={t('list.col.titleLabel')} error={errors.title} required>
          {(p) => <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={150} />}
        </Field>
        <Field label={t('list.edit.description')} error={errors.description} required>
          {(p) => <Textarea {...p} rows={6} value={form.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label={t('list.col.price')} error={errors.price} required>
            {(p) => <Input {...p} className="ltr text-start" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />}
          </Field>
          <Field label={t('list.edit.currency')}>
            {(p) => (
              <Select {...p} value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {labels.currency[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('import.field.price_terms')}>
            {(p) => (
              <Select {...p} value={form.price_terms} onChange={(e) => set('price_terms', e.target.value as Form['price_terms'])}>
                <option value="">{t('form.unspecified')}</option>
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {labels.terms[term]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('list.edit.area')} error={errors.area} required>
            {(p) => <Input {...p} className="ltr text-start" inputMode="decimal" value={form.area} onChange={(e) => set('area', e.target.value)} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('list.edit.bedrooms')} error={errors.bedrooms}>
            {(p) => <Input {...p} className="ltr text-start" inputMode="numeric" value={form.bedrooms} onChange={(e) => set('bedrooms', e.target.value)} />}
          </Field>
          <Field label={t('list.edit.bathrooms')} error={errors.bathrooms}>
            {(p) => <Input {...p} className="ltr text-start" inputMode="numeric" value={form.bathrooms} onChange={(e) => set('bathrooms', e.target.value)} />}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('list.edit.district')} error={errors.district}>
            {(p) => <Input {...p} value={form.district} onChange={(e) => set('district', e.target.value)} />}
          </Field>
          <Field label={t('list.edit.neighborhood')} error={errors.neighborhood}>
            {(p) => <Input {...p} value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} />}
          </Field>
        </div>
        <Field label={t('list.edit.address')} error={errors.address}>
          {(p) => <Input {...p} value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={300} />}
        </Field>
      </div>
    </Dialog>
  );
}
