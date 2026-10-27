'use client';

import { useEffect } from 'react';
import { Lock, MapPinned, Unlock } from 'lucide-react';
import { CURRENCIES, DEAL_TYPES } from '@bongah/shared-types';
import { PROVINCES, provinceLabel } from '@/lib/provinces';
import { useLanguage, useT } from '@/i18n/provider';
import { useLabels } from '@/i18n/use-labels';
import { useDashboard, useOfficePin } from '@/hooks/use-api';
import { usePinned } from '@/hooks/use-pinned';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';

/**
 * The values that stay the same from one listing to the next: the office's province and district, the usual deal and
 * currency. They fill the single form and whatever an import could not read, and survive «save and add next».
 */
export function PinnedPanel() {
  const t = useT();
  const { language } = useLanguage();
  const labels = useLabels();
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
            <h2 className="text-sm font-bold text-ink">{t('pinned.title')}</h2>
            <p className="text-xs text-muted">
              {pinned.locked ? t('pinned.locked') : t('pinned.unlocked')}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
          {t('pinned.keep')}
          <Switch label={t('pinned.keepAria')} checked={pinned.locked} onChange={(locked) => setPinned({ locked })} />
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('import.field.province')}>
          {(p) => (
            <Select {...p} value={pinned.province} onChange={(e) => setPinned({ province: e.target.value })}>
              <option value="">{t('common.choose')}</option>
              {PROVINCES.map((x) => (
                <option key={x.id} value={x.name}>
                  {provinceLabel(x, language)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('import.field.district')}>
          {(p) => <Input {...p} value={pinned.district} onChange={(e) => setPinned({ district: e.target.value })} placeholder={t('form.districtPlaceholder')} maxLength={80} />}
        </Field>
        <Field label={t('pinned.usualDeal')}>
          {(p) => (
            <Select {...p} value={pinned.deal_type} onChange={(e) => setPinned({ deal_type: e.target.value as typeof pinned.deal_type })}>
              <option value="">{t('pinned.noDefault')}</option>
              {DEAL_TYPES.map((d) => (
                <option key={d} value={d}>
                  {labels.deal[d]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('pinned.usualCurrency')}>
          {(p) => (
            <Select {...p} value={pinned.currency} onChange={(e) => setPinned({ currency: e.target.value as typeof pinned.currency })}>
              <option value="">{t('pinned.noDefault')}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {labels.currency[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {pinned.office_lat ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <MapPinned aria-hidden className="h-3.5 w-3.5 text-primary" />
          {t('pinned.officePin')}
        </p>
      ) : null}
    </Card>
  );
}
