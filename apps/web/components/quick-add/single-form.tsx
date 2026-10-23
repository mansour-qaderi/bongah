'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ListPlus, MapPin } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES, PRICE_TERMS, PROPERTY_TYPES } from '@bongah/shared-types';
import type { Property } from '@bongah/shared-types';
import { addressFrom } from '@/lib/address';
import { ApiError, api, errorMessage } from '@/lib/api';
import { checkDraft, splitLatLng, type DraftErrors } from '@/lib/import/draft-validation';
import { composeTitle } from '@/lib/import/parse-text';
import { emptyDraft, type DraftRow } from '@/lib/import/types';
import { useDrafts } from '@/lib/import/drafts-store';
import { formatNumber } from '@/lib/format';
import { CURRENCY_NAME, DEAL_LABEL, TERMS_LABEL, TYPE_LABEL, hasRoomsFor } from '@/lib/labels';
import { refreshListingData, withBackoff } from '@/lib/listing-actions';
import { PROVINCES } from '@/lib/provinces';
import { usePinned } from '@/hooks/use-pinned';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ImagePicker, type PickedImage } from './image-picker';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  invalid,
}: {
  label: string;
  value: T | '';
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-xl border bg-soft p-1', invalid ? 'border-danger' : 'border-transparent')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 flex-1 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors',
            value === o.value ? 'bg-surface text-primary ring-1 ring-line' : 'text-ink-2 hover:text-primary',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** What the form clears after «ذخیره و ثبت بعدی»: everything about this one listing. */
function freshRow(pinned: ReturnType<typeof usePinned>[0]): DraftRow {
  // Province and district are not copied in: while they are empty the form follows the pinned panel live.
  return emptyDraft('form', { deal_type: pinned.deal_type, currency: pinned.currency });
}

export function SingleForm() {
  const router = useRouter();
  const [pinned, setPinned] = usePinned();
  const { actions } = useDrafts();
  const [row, setRow] = useState<DraftRow>(() => freshRow(pinned));
  const [pics, setPics] = useState<PickedImage[]>([]);
  const [locText, setLocText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; quota: boolean } | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const first = useRef<HTMLSelectElement>(null);

  // The form shows the pinned values live: change them above and this form follows until the person edits the field here.
  const effective: DraftRow = useMemo(
    () => ({
      ...row,
      province: row.province || pinned.province,
      district: row.district || pinned.district,
      images: pics.map((p) => p.url),
    }),
    [row, pinned.province, pinned.district, pics],
  );
  const check = useMemo(() => checkDraft(effective), [effective]);
  const errors: DraftErrors = submitted ? check.errors : {};

  const set = (patch: Partial<DraftRow>) => {
    setRow((r) => ({ ...r, ...patch }));
    setServerError(null);
  };

  const suggestedTitle = composeTitle({
    type: effective.type,
    deal: effective.deal_type,
    bedrooms: Number(effective.bedrooms) || null,
    area: Number(effective.area_sqm) || null,
    district: effective.district,
    province: effective.province,
  });

  function withDefaults(): DraftRow {
    const next: DraftRow = { ...effective };
    if (!next.title.trim()) next.title = suggestedTitle;
    if (!next.address.trim() && !next.lat) {
      next.address = addressFrom({ province: next.province, district: next.district, neighborhood: next.neighborhood, street: '' });
    }
    return next;
  }

  function reset() {
    if (!pinned.locked) setPinned({ province: '', district: '' });
    setRow(freshRow(pinned));
    setPics([]);
    setLocText('');
    setSubmitted(false);
    setServerError(null);
    requestAnimationFrame(() => first.current?.focus());
  }

  function setLocation(text: string) {
    setLocText(text);
    const pair = splitLatLng(text);
    if (pair) set(pair);
    else if (!text.trim()) set({ lat: '', lng: '' });
  }

  async function save(after: 'next' | 'list', e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const draft = withDefaults();
    const verdict = checkDraft(draft);
    if (!verdict.ok || !verdict.input) {
      toast.error('چند مورد را کامل یا اصلاح کنید.');
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      await withBackoff(() => api.post<Property>('properties', verdict.input));
      void refreshListingData();
      setSavedCount((n) => n + 1);
      toast.success(`آگهی «${verdict.input.title}» ثبت شد.`);
      if (after === 'next') reset();
      else router.push('/dashboard/listings');
    } catch (err) {
      const quota = err instanceof ApiError && (err.code === 'AGENCY_LISTING_LIMIT_REACHED' || err.code === 'FREE_LISTING_LIMIT_REACHED');
      setServerError({ message: errorMessage(err), quota });
    } finally {
      setBusy(false);
    }
  }

  function toDrafts() {
    setSubmitted(true);
    const draft = withDefaults();
    if (!draft.type || !draft.price) {
      toast.error('دست‌کم نوع ملک و قیمت را بنویسید.');
      return;
    }
    actions.add([draft]);
    toast.success('به فهرست پیش‌نویس‌ها اضافه شد.');
    reset();
  }

  const showRooms = !effective.type || hasRoomsFor(effective.type);
  const officePin = pinned.office_lat && pinned.office_lng ? `${pinned.office_lat}, ${pinned.office_lng}` : '';

  return (
    <Card className="p-4 sm:p-6">
      <form
        onSubmit={(e) => void save('next', e)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void save('next');
        }}
        noValidate
        className="space-y-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label="نوع ملک" required error={errors.type} className="w-full sm:w-48">
            {(p) => (
              <Select {...p} ref={first} value={row.type} onChange={(e) => set({ type: e.target.value as DraftRow['type'] })}>
                <option value="">انتخاب کنید</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="نوع معامله" required error={errors.deal_type} className="w-full sm:w-72">
            {() => (
              <Segmented
                label="نوع معامله"
                value={row.deal_type}
                invalid={Boolean(errors.deal_type)}
                onChange={(deal_type) => set({ deal_type })}
                options={DEAL_TYPES.map((d) => ({ value: d, label: DEAL_LABEL[d] }))}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="قیمت" required error={errors.price} className="lg:col-span-1">
            {(p) => <Input {...p} inputMode="decimal" value={row.price} onChange={(e) => set({ price: e.target.value })} placeholder="۸۵۰۰۰" className="ltr text-start" />}
          </Field>
          <Field label="ارز" required error={errors.currency}>
            {() => (
              <Segmented
                label="ارز"
                value={row.currency}
                invalid={Boolean(errors.currency)}
                onChange={(currency) => set({ currency })}
                options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_NAME[c] }))}
              />
            )}
          </Field>
          <Field label="شرایط قیمت">
            {(p) => (
              <Select {...p} value={row.price_terms} onChange={(e) => set({ price_terms: e.target.value as DraftRow['price_terms'] })}>
                <option value="">نامشخص</option>
                {PRICE_TERMS.map((t) => (
                  <option key={t} value={t}>
                    {TERMS_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="متراژ (متر مربع)" required error={errors.area_sqm}>
            {(p) => <Input {...p} inputMode="decimal" value={row.area_sqm} onChange={(e) => set({ area_sqm: e.target.value })} placeholder="۲۰۰" className="ltr text-start" />}
          </Field>
        </div>

        {showRooms ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="اتاق خواب" error={errors.bedrooms}>
              {(p) => <Input {...p} inputMode="numeric" value={row.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} placeholder="۳" className="ltr text-start" />}
            </Field>
            <Field label="حمام" error={errors.bathrooms}>
              {(p) => <Input {...p} inputMode="numeric" value={row.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} placeholder="۲" className="ltr text-start" />}
            </Field>
          </div>
        ) : null}

        <fieldset className="space-y-4 rounded-2xl border border-line p-4">
          <legend className="px-2 text-[13px] font-bold text-ink-2">موقعیت</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="ولایت" required error={errors.province}>
              {(p) => (
                <Select
                  {...p}
                  value={row.province || pinned.province}
                  onChange={(e) => {
                    set({ province: e.target.value });
                    setPinned({ province: e.target.value });
                  }}
                >
                  <option value="">انتخاب کنید</option>
                  {PROVINCES.map((x) => (
                    <option key={x.id} value={x.name}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="ناحیه / ولسوالی" error={errors.district}>
              {(p) => (
                <Input
                  {...p}
                  value={row.district || pinned.district}
                  onChange={(e) => {
                    set({ district: e.target.value });
                    setPinned({ district: e.target.value });
                  }}
                  placeholder="ناحیه ۴"
                />
              )}
            </Field>
            <Field label="محله" error={errors.neighborhood}>
              {(p) => <Input {...p} value={row.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} placeholder="کارته سه" />}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="آدرس" error={errors.address} hint="خالی بگذارید تا از ولایت و ناحیه ساخته شود." className="sm:col-span-2">
              {(p) => <Input {...p} value={row.address} onChange={(e) => set({ address: e.target.value })} placeholder="نزدیک مسجد جامع، کوچهٔ دوم" />}
            </Field>
            <Field label="موقعیت روی نقشه (اختیاری)" error={errors.location} hint="مثل ۳۴.۵۲۸۱, ۶۹.۱۷۶۱">
              {(p) => (
                <div className="flex gap-2">
                  <Input {...p} value={locText} onChange={(e) => setLocation(e.target.value)} placeholder="عرض, طول" className="ltr text-start" />
                  {officePin ? (
                    <Button type="button" variant="secondary" size="icon" aria-label="موقعیت دفتر" title="موقعیت دفتر" onClick={() => setLocation(officePin)}>
                      <MapPin className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              )}
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="عنوان" error={errors.title} hint="خالی بگذارید تا خودکار نوشته شود.">
            {(p) => <Input {...p} value={row.title} onChange={(e) => set({ title: e.target.value })} placeholder={suggestedTitle} maxLength={150} />}
          </Field>
          <Field label="توضیحات" error={errors.description} hint="خالی بگذارید تا از مشخصات ساخته شود.">
            {(p) => <Textarea {...p} rows={2} value={row.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} />}
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-ink-2">عکس‌ها (اختیاری)</div>
          <ImagePicker images={pics} onChange={setPics} />
        </div>

        {serverError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">
            {serverError.message}{' '}
            {serverError.quota ? (
              <Link href="/dashboard/subscription" className="font-bold underline">
                افزایش سهمیه
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" size="lg" loading={busy}>
            ذخیره و ثبت بعدی
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => void save('list')}>
            ذخیره و دیدن فهرست
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={toDrafts} className="gap-2">
            <ListPlus aria-hidden className="h-4 w-4" />
            افزودن به پیش‌نویس‌ها
          </Button>
          <span className="ms-auto hidden text-xs text-muted sm:block">Ctrl + Enter = ذخیره و ثبت بعدی</span>
          {savedCount > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              {formatNumber(savedCount)} آگهی در این نشست ثبت شد
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
