'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ListPlus } from 'lucide-react';
import { PRICE_TERMS } from '@bongah/shared-types';
import type { Language, Market, PlaceDetails, Property } from '@bongah/shared-types';
import { addressFrom } from '@/lib/address';
import { ApiError, api, errorMessage } from '@/lib/api';
import { checkDraft, type DraftErrors } from '@/lib/import/draft-validation';
import { composeTitle } from '@/lib/import/parse-text';
import { MAPBOX_TOKEN } from '@/lib/map-config';
import { lookupPlace, planFill, type AutoFilled } from '@/lib/reverse-address';
import { emptyDraft, type DraftRow } from '@/lib/import/types';
import { useDrafts } from '@/lib/import/drafts-store';
import { formatNumber } from '@/lib/format';
import { hasRoomsFor } from '@/lib/labels';
import { refreshListingData, withBackoff } from '@/lib/listing-actions';
import { provincesFor, provinceLabel } from '@/lib/provinces';
import { currenciesFor, dealsFor, deedsFor, featuresFor, reconcileDraft, typesForDeal } from '@/lib/market';
import { tNow } from '@/i18n/active';
import { useLanguage, useT } from '@/i18n/provider';
import { marketKey } from '@/i18n/translate';
import { useLabelsFor } from '@/hooks/use-market';
import { pinnedFor, usePinned, useBatchMarket } from '@/hooks/use-pinned';
import { AddressAutocomplete } from '@/components/ui/address-autocomplete';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { LocationPicker } from '@/components/map/location-picker';
import { pinOf, toPicked, type PickedPosition } from '@/lib/location-picker';
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

/** The pin rests this long before the address is looked up (dragging it about asks once, at the end). */
const LOOKUP_DELAY_MS = 350;

type AddressLookup = { state: 'idle' | 'finding' | 'filled' | 'failed'; text: string; guessedProvince: boolean };
const NO_LOOKUP: AddressLookup = { state: 'idle', text: '', guessedProvince: false };

/** The server's "what is here" (signed-in; 404 = nothing known there). It throws when it cannot answer, and the caller then asks Mapbox. */
async function askServer(point: { lat: number; lng: number }, language: Language, signal?: AbortSignal): Promise<PlaceDetails | null> {
  try {
    return await api.get<PlaceDetails>('geo/reverse', { signal, query: { lat: point.lat.toFixed(6), lng: point.lng.toFixed(6), lang: language } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** What the form clears after «save and add next»: everything about this one listing. */
function freshRow(pinned: ReturnType<typeof usePinned>[0], market: Market): DraftRow {
  // Province and district are not copied in: while they are empty the form follows the pinned panel live.
  const usual = pinnedFor(pinned, market);
  return emptyDraft('form', { market, deal_type: usual.deal_type, currency: usual.currency });
}

export function SingleForm() {
  const t = useT();
  const { language } = useLanguage();
  const router = useRouter();
  const [pinned, setPinned] = usePinned();
  const [market] = useBatchMarket();
  const labels = useLabelsFor(market);
  const { actions } = useDrafts();
  const [row, setRow] = useState<DraftRow>(() => freshRow(pinned, market));
  const [pics, setPics] = useState<PickedImage[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; quota: boolean } | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const first = useRef<HTMLButtonElement>(null);

  const usual = useMemo(() => pinnedFor(pinned, market), [pinned, market]);

  // The form shows the pinned values live: change them above and this form follows until the person edits the field here.
  const effective: DraftRow = useMemo(
    () => ({
      ...row,
      market,
      province: row.province || usual.province,
      district: row.district || usual.district,
      images: pics.map((p) => p.url),
    }),
    [row, market, usual.province, usual.district, pics],
  );
  const latest = useRef(effective);
  latest.current = effective;
  // The account's market was switched elsewhere (the account menu) while this form is open: drop what no longer fits.
  const shownMarket = useRef(market);
  useEffect(() => {
    if (shownMarket.current === market) return;
    shownMarket.current = market;
    setRow((r) => ({ ...r, ...reconcileDraft({ ...latest.current, ...r }, market) }));
  }, [market]);
  const check = useMemo(() => checkDraft(effective), [effective]);
  const errors: DraftErrors = submitted ? check.errors : {};

  const set = (patch: Partial<DraftRow>) => {
    setRow((r) => ({ ...r, ...patch }));
    setServerError(null);
  };

  const suggestedTitle = composeTitle(
    {
      market,
      type: effective.type,
      deal: effective.deal_type,
      bedrooms: Number(effective.bedrooms) || null,
      area: Number(effective.area_sqm) || null,
      district: effective.district,
      province: effective.province,
    },
    language,
  );

  // ── the address the pin points at ──
  const [lookup, setLookup] = useState<AddressLookup>(NO_LOOKUP);
  const [settled, setSettled] = useState<{ province: string; district: string } | null>(null);
  const autoFilled = useRef<AutoFilled>({});
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);

  function stopLookup() {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = null;
    lookupAbort.current?.abort();
    lookupAbort.current = null;
  }
  useEffect(() => stopLookup, []);

  /** Asks what is at the pin and fills in the province, district, neighbourhood and address the person has not written. */
  function findAddress(at: { lat: number; lng: number }) {
    stopLookup();
    setLookup({ state: 'finding', text: '', guessedProvince: false });
    lookupTimer.current = setTimeout(async () => {
      const abort = new AbortController();
      lookupAbort.current = abort;
      const { place } = await lookupPlace(at, { language, token: MAPBOX_TOKEN, signal: abort.signal, server: askServer });
      if (abort.signal.aborted) return;
      const now = latest.current;
      const plan = planFill(place, { province: now.province, district: now.district, neighborhood: now.neighborhood, address: now.address }, autoFilled.current, at);
      autoFilled.current = plan.filled;
      if (!plan.found) {
        setLookup({ state: 'failed', text: '', guessedProvince: false });
        return;
      }
      if (Object.keys(plan.patch).length > 0) set(plan.patch);
      setSettled({ province: plan.patch.province ?? now.province, district: plan.patch.district ?? now.district });
      setLookup({ state: 'filled', text: plan.line, guessedProvince: plan.provinceGuessed });
    }, LOOKUP_DELAY_MS);
  }

  function onPick(position: PickedPosition | null) {
    set(position ?? { lat: '', lng: '' });
    if (position) findAddress({ lat: Number(position.lat), lng: Number(position.lng) });
    else {
      stopLookup();
      setLookup(NO_LOOKUP);
    }
  }

  function withDefaults(): DraftRow {
    const next: DraftRow = { ...effective };
    if (!next.title.trim()) next.title = suggestedTitle;
    if (!next.address.trim() && !next.lat) {
      next.address = addressFrom({ province: next.province, district: next.district, neighborhood: next.neighborhood, street: '' });
    }
    return next;
  }

  function reset() {
    stopLookup();
    setLookup(NO_LOOKUP);
    setSettled(null);
    autoFilled.current = {};
    if (!pinned.locked) setPinned({ province: '', district: '' });
    setRow(freshRow(pinned, market));
    setPics([]);
    setSubmitted(false);
    setServerError(null);
    requestAnimationFrame(() => first.current?.focus());
  }

  async function save(after: 'next' | 'list', e?: FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const draft = withDefaults();
    const verdict = checkDraft(draft);
    if (!verdict.ok || !verdict.input) {
      toast.error(tNow('form.fix'));
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      await withBackoff(() => api.post<Property>('properties', verdict.input));
      void refreshListingData();
      setSavedCount((n) => n + 1);
      toast.success(tNow('form.saved', { title: verdict.input.title }));
      if (after === 'next') reset();
      else router.push('/dashboard/listings');
    } catch (err) {
      const quota =
        err instanceof ApiError &&
        (err.code === 'AGENCY_LISTING_LIMIT_REACHED' ||
          err.code === 'FREE_LISTING_LIMIT_REACHED' ||
          err.code === 'TRIAL_LISTING_LIMIT_REACHED' ||
          err.code === 'SUBSCRIPTION_REQUIRED');
      setServerError({ message: errorMessage(err), quota });
    } finally {
      setBusy(false);
    }
  }

  function toDrafts() {
    setSubmitted(true);
    const draft = withDefaults();
    if (!draft.type || !draft.price) {
      toast.error(tNow('form.minimum'));
      return;
    }
    actions.add([draft]);
    toast.success(tNow('form.toDrafts'));
    reset();
  }

  const showRooms = !effective.type || hasRoomsFor(effective.type);
  const rentDeal = row.deal_type === 'MORTGAGE_RENT';
  const tags = featuresFor(market);
  const deeds = deedsFor(market);
  const officePin = pinned.office_lat && pinned.office_lng ? { lat: pinned.office_lat, lng: pinned.office_lng } : null;

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
          <Field label={t('filter.type')} required error={errors.type} className="w-full sm:w-48">
            {(p) => (
              <Select {...p} ref={first} value={row.type} onChange={(e) => set({ type: e.target.value as DraftRow['type'] })}>
                <option value="">{t('common.choose')}</option>
                {typesForDeal(market, row.deal_type).map((type) => (
                  <option key={type} value={type}>
                    {labels.type[type]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('filter.deal')} required error={errors.deal_type} className="w-full sm:w-auto sm:min-w-72">
            {() => (
              <Segmented
                label={t('filter.deal')}
                value={row.deal_type}
                invalid={Boolean(errors.deal_type)}
                onChange={(deal_type) =>
                  // A daily rental is only for a villa or a garden: another kind of property is let go of, not kept wrong.
                  // The monthly rent belongs to a mortgage-and-rent only, so another deal lets it go too.
                  set({
                    deal_type,
                    ...(row.type && !typesForDeal(market, deal_type).includes(row.type) ? { type: '' as const } : {}),
                    ...(deal_type !== 'MORTGAGE_RENT' && row.monthly_rent ? { monthly_rent: '' } : {}),
                  })
                }
                options={dealsFor(market).map((d) => ({ value: d, label: labels.deal[d] }))}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={rentDeal ? t('form.deposit') : t('import.field.price')} required error={errors.price} className="lg:col-span-1">
            {(p) => <Input {...p} inputMode="decimal" value={row.price} onChange={(e) => set({ price: e.target.value })} placeholder="۸۵۰۰۰" className="ltr text-start" />}
          </Field>
          {rentDeal ? (
            <Field label={t('form.monthlyRent')} required error={errors.monthly_rent}>
              {(p) => (
                <Input {...p} inputMode="decimal" value={row.monthly_rent ?? ''} onChange={(e) => set({ monthly_rent: e.target.value })} placeholder="۸۰۰۰۰۰۰" className="ltr text-start" data-testid="form-monthly-rent" />
              )}
            </Field>
          ) : null}
          <Field label={t('import.field.currency')} required error={errors.currency}>
            {() => (
              <Segmented
                label={t('import.field.currency')}
                value={row.currency}
                invalid={Boolean(errors.currency)}
                onChange={(currency) => set({ currency })}
                options={currenciesFor(market).map((c) => ({ value: c, label: labels.currency[c] }))}
              />
            )}
          </Field>
          <Field label={t('import.field.price_terms')}>
            {(p) => (
              <Select {...p} value={row.price_terms} onChange={(e) => set({ price_terms: e.target.value as DraftRow['price_terms'] })}>
                <option value="">{t('form.unspecified')}</option>
                {PRICE_TERMS.map((term) => (
                  <option key={term} value={term}>
                    {labels.terms[term]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('form.areaLabel')} required error={errors.area_sqm}>
            {(p) => <Input {...p} inputMode="decimal" value={row.area_sqm} onChange={(e) => set({ area_sqm: e.target.value })} placeholder="۲۰۰" className="ltr text-start" />}
          </Field>
        </div>

        {deeds.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('form.deed')} error={errors.deed_type}>
              {(p) => (
                <Select {...p} value={row.deed_type ?? ''} onChange={(e) => set({ deed_type: e.target.value as DraftRow['deed_type'] })} data-testid="form-deed">
                  <option value="">{t('form.unspecified')}</option>
                  {deeds.map((deed) => (
                    <option key={deed} value={deed}>
                      {labels.deed[deed]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        ) : null}

        {showRooms ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('import.field.bedrooms')} error={errors.bedrooms}>
              {(p) => <Input {...p} inputMode="numeric" value={row.bedrooms} onChange={(e) => set({ bedrooms: e.target.value })} placeholder="۳" className="ltr text-start" />}
            </Field>
            <Field label={t('import.field.bathrooms')} error={errors.bathrooms}>
              {(p) => <Input {...p} inputMode="numeric" value={row.bathrooms} onChange={(e) => set({ bathrooms: e.target.value })} placeholder="۲" className="ltr text-start" />}
            </Field>
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{t('form.features')}</div>
            <div role="group" aria-label={t('form.features')} className="flex flex-wrap gap-2" data-testid="form-features">
              {tags.map((feature) => {
                const on = (row.features ?? []).includes(feature);
                return (
                  <Checkbox
                    key={feature}
                    checked={on}
                    label={labels.feature[feature]}
                    onChange={(next) => set({ features: next ? [...(row.features ?? []), feature] : (row.features ?? []).filter((x) => x !== feature) })}
                    className={cn('rounded-xl border px-3 py-2 transition-colors', on ? 'border-primary bg-primary-tint text-primary' : 'border-line bg-surface')}
                  >
                    {labels.feature[feature]}
                  </Checkbox>
                );
              })}
            </div>
          </div>
        ) : null}

        <fieldset className="space-y-4 rounded-2xl border border-line p-4">
          <legend className="px-2 text-[13px] font-bold text-ink-2">{t('form.location')}</legend>
          {/* Iran does not ask for a province (it is filled in from the pin behind the scenes); Afghanistan does. */}
          <div className={cn('grid gap-4', market === 'IR' ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
            {market === 'IR' ? null : (
              <Field label={t('import.field.province')} required error={errors.province}>
                {(p) => (
                  <Select
                    {...p}
                    value={row.province || usual.province}
                    onChange={(e) => {
                      set({ province: e.target.value });
                      setPinned({ province: e.target.value });
                    }}
                  >
                    <option value="">{t('common.choose')}</option>
                    {provincesFor(market).map((x) => (
                      <option key={x.id} value={x.name}>
                        {provinceLabel(x, language)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <Field label={t(marketKey('import.field.district', market))} error={errors.district}>
              {(p) => (
                <Input
                  {...p}
                  value={row.district || usual.district}
                  onChange={(e) => {
                    set({ district: e.target.value });
                    setPinned({ district: e.target.value });
                  }}
                  placeholder={t(marketKey('form.districtPlaceholder', market))}
                />
              )}
            </Field>
            <Field label={t('form.neighborhood')} error={errors.neighborhood}>
              {(p) => <Input {...p} value={row.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} placeholder={t(marketKey('form.neighborhoodPlaceholder', market))} />}
            </Field>
          </div>
          <Field label={t('import.field.address')} error={errors.address} hint={t(marketKey('form.addressHint', market))}>
            {(p) => (
              <AddressAutocomplete
                id={p.id}
                invalid={p.invalid}
                aria-describedby={p['aria-describedby']}
                value={row.address}
                onValueChange={(address) => set({ address })}
                onChoose={(chosen) => {
                  const position = toPicked(chosen.lat, chosen.lng, market);
                  set({ address: chosen.text, ...(position ?? {}) });
                  if (position) findAddress({ lat: chosen.lat, lng: chosen.lng });
                }}
                placeholder={t(marketKey('form.addressPlaceholder', market))}
                language={language}
                near={pinOf(effective.lat, effective.lng, market) ?? undefined}
                listLabel={t('form.addressSuggestions')}
              />
            )}
          </Field>
          <Field label={t('form.mapLocation')} error={errors.location}>
            {(p) => (
              <LocationPicker
                id={p.id}
                invalid={p.invalid}
                lat={effective.lat}
                lng={effective.lng}
                market={market}
                province={effective.province}
                district={effective.district}
                officePin={officePin}
                onChange={onPick}
                lookup={lookup}
                settled={settled}
                shareTitle={effective.title.trim() || suggestedTitle}
                shareAddress={effective.address.trim()}
              />
            )}
          </Field>
        </fieldset>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label={t('import.field.title')} error={errors.title} hint={t('form.titleHint')}>
            {(p) => <Input {...p} value={row.title} onChange={(e) => set({ title: e.target.value })} placeholder={suggestedTitle} maxLength={150} />}
          </Field>
          <Field label={t('form.descriptionLabel')} error={errors.description} hint={t('form.descriptionHint')}>
            {(p) => <Textarea {...p} rows={2} value={row.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} />}
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-semibold text-ink-2">{t('form.images')}</div>
          <ImagePicker images={pics} onChange={setPics} />
        </div>

        {serverError ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] text-danger">
            {serverError.message}{' '}
            {serverError.quota ? (
              <Link href="/dashboard/subscription" className="font-bold underline">
                {t('form.moreQuota')}
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" size="lg" loading={busy}>
            {t('form.saveNext')}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={() => void save('list')}>
            {t('form.saveList')}
          </Button>
          <Button type="button" variant="ghost" size="lg" disabled={busy} onClick={toDrafts} className="gap-2">
            <ListPlus aria-hidden className="h-4 w-4" />
            {t('form.addToDrafts')}
          </Button>
          <span className="ms-auto hidden text-xs text-muted sm:block">{t('form.shortcut')}</span>
          {savedCount > 0 ? (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <CheckCircle2 aria-hidden className="h-4 w-4" />
              {t('form.sessionCount', { n: formatNumber(savedCount) })}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
