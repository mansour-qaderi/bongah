// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AgencyListingPin, Property } from '@bongah/shared-types';

const get = vi.fn();
const patch = vi.fn();
const del = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const refresh = vi.fn(async () => undefined);
const patchCached = vi.fn(async () => undefined);
const swrMutate = vi.fn(async () => undefined);

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), info: vi.fn() } }));
vi.mock('swr', () => ({ default: () => ({ data: undefined }), mutate: (...a: unknown[]) => swrMutate(...(a as [])) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a), patch: (...a: unknown[]) => patch(...a), delete: (...a: unknown[]) => del(...a) } };
});
vi.mock('@/lib/listing-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/listing-actions')>('@/lib/listing-actions');
  return { ...actual, refreshListingData: () => refresh(), patchCachedListings: (...a: unknown[]) => patchCached(...(a as [])) };
});

import { LanguageProvider } from '@/i18n/provider';
import { prs } from '@/i18n/messages/prs';
import { ps } from '@/i18n/messages/ps';
import { translate } from '@/i18n/translate';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentWatcher } from '@/components/layout/payment-watcher';
import { EditListingDialog } from '@/components/listings/edit-listing-dialog';
import { MapListingCard } from '@/components/map/listing-card';
import { STATUS_TABS } from '@/hooks/use-listing-query';
import { DELETED_LISTINGS_KEY, deleteListing } from '@/lib/deleted-listings';
import { rememberPayment } from '@/lib/pending-payments';
import { readStored } from '@/hooks/use-local-storage';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);
const wrap = (node: React.ReactNode) => render(<LanguageProvider initialLanguage="prs">{node}</LanguageProvider>);

beforeEach(() => {
  window.localStorage.clear();
  for (const m of [get, patch, del, toastSuccess, toastError, refresh, patchCached, swrMutate]) m.mockReset();
  refresh.mockResolvedValue(undefined);
  patchCached.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('the status tabs run right to left', () => {
  it('gives the tab list a right-to-left direction (Radix defaults to left-to-right), «همه» first', () => {
    const { container } = wrap(
      <Tabs value="ALL" onValueChange={() => undefined}>
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {t(`list.tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>,
    );
    const list = container.querySelector('[role="tablist"]')!;
    expect(list.closest('[dir]')!.getAttribute('dir')).toBe('rtl');
    const names = within(list as HTMLElement).getAllByRole('tab').map((n) => n.textContent);
    expect(names[0]).toBe(t('list.tab.ALL')); // first in the DOM = rightmost in a right-to-left row
    expect(STATUS_TABS[0]).toBe('ALL');
  });
});

describe('the payment banner is gone', () => {
  it('shows nothing while a payment is pending, but still tells how it ended', async () => {
    rememberPayment({ id: 'p1', purpose: 'SUBSCRIPTION', manual: true });
    get.mockResolvedValue({ id: 'p1', status: 'SUCCESS' });
    const { container } = wrap(<PaymentWatcher />);
    expect(container.querySelector('[data-testid="payment-watcher"]')).toBeNull();
    expect(container.textContent).toBe('');
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(readStored('bongah.pendingPayments')).toBeNull(); // forgotten once it ended
  });

  it('says why when an admin refused the payment', async () => {
    rememberPayment({ id: 'p2', purpose: 'SUBSCRIPTION', manual: true });
    get.mockResolvedValue({ id: 'p2', status: 'FAILED', review_note: 'رسید خوانا نبود' });
    wrap(<PaymentWatcher />);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]![0])).toContain('رسید خوانا نبود');
  });

  it('no longer carries the banner texts in either language', () => {
    for (const messages of [prs, ps] as Record<string, string>[]) {
      expect(Object.keys(messages).filter((k) => k.startsWith('payment.check'))).toEqual([]);
    }
  });
});

const property = (over: Partial<Property> = {}): Property =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'خانه در هرات',
    description: 'توضیح کامل',
    type: 'HOUSE_HAWILI',
    deal_type: 'SALE',
    price: 5_000_000,
    currency: 'AFGHANI',
    area_sqm: 200,
    bedrooms: 3,
    bathrooms: 2,
    province: 'هرات',
    district: 'ناحیه ۴',
    neighborhood: null,
    address: 'هرات، گذر آمریه',
    status: 'ACTIVE',
    is_featured: false,
    ...over,
  }) as Property;

describe('editing a listing', () => {
  it('sends only what changed', async () => {
    patch.mockResolvedValue(property());
    const onClose = vi.fn();
    wrap(<EditListingDialog listing={property()} onClose={onClose} />);
    const box = screen.getByTestId('edit-listing');
    fireEvent.change(within(box).getByLabelText(new RegExp('^' + t('list.col.price'))), { target: { value: '۶۰۰۰۰۰۰' } });
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('properties/11111111-1111-4111-8111-111111111111', { price: 6_000_000 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('changes the price terms, and clears them with null', async () => {
    patch.mockResolvedValue(property());
    wrap(<EditListingDialog listing={property({ price_terms: 'NEGOTIABLE' })} onClose={() => undefined} />);
    const box = screen.getByTestId('edit-listing');
    const terms = within(box).getByRole('combobox', { name: t('import.field.price_terms') });
    expect(terms.textContent).toBe(t('label.terms.NEGOTIABLE'));
    fireEvent.click(terms);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: t('label.terms.FIXED') }));
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenLastCalledWith('properties/11111111-1111-4111-8111-111111111111', { price_terms: 'FIXED' });

    fireEvent.click(within(box).getByRole('combobox', { name: t('import.field.price_terms') }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: t('form.unspecified') }));
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenLastCalledWith('properties/11111111-1111-4111-8111-111111111111', { price_terms: null });
  });

  it('refuses a short title and a missing description without calling the server', async () => {
    wrap(<EditListingDialog listing={property()} onClose={() => undefined} />);
    const box = screen.getByTestId('edit-listing');
    fireEvent.change(within(box).getByLabelText(new RegExp(t('list.col.titleLabel'))), { target: { value: 'ab' } });
    fireEvent.change(within(box).getByLabelText(new RegExp(t('list.edit.description'))), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('edit-save'));
    expect(await screen.findByText(t('list.col.titleShort'))).toBeTruthy();
    expect(screen.getByText(t('list.edit.descriptionRequired'))).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it('closes without a request when nothing changed', async () => {
    const onClose = vi.fn();
    wrap(<EditListingDialog listing={property()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(patch).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says why when the server refuses', async () => {
    patch.mockRejectedValue(new Error('not allowed'));
    const onClose = vi.fn();
    wrap(<EditListingDialog listing={property()} onClose={onClose} />);
    fireEvent.change(within(screen.getByTestId('edit-listing')).getByLabelText(new RegExp('^' + t('list.col.price'))), { target: { value: '7000000' } });
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('deleting a listing', () => {
  it('asks the server first, and only then hides it', async () => {
    del.mockRejectedValueOnce(new Error('boom'));
    await expect(deleteListing('a')).rejects.toThrow();
    expect(readStored(DELETED_LISTINGS_KEY)).toBeNull();
    del.mockResolvedValueOnce(undefined);
    await deleteListing('a');
    await deleteListing('b');
    expect(del).toHaveBeenLastCalledWith('properties/b');
    expect(readStored(DELETED_LISTINGS_KEY)).toEqual(['a', 'b']);
  });
});

const pin = (over: Partial<AgencyListingPin> = {}): AgencyListingPin => ({
  id: 'x',
  title: 'آپارتمان نوساز',
  type: 'APARTMENT',
  deal_type: 'RENT',
  status: 'ACTIVE',
  price: 15000,
  currency: 'AFGHANI',
  province: 'کابل',
  district: 'ناحیه ۱۴',
  address: 'کابل',
  lat: 34.5,
  lng: 69.1,
  is_featured: false,
  ...over,
});

describe('the map list is cards', () => {
  it('shows price, the deal as a badge, the type and the place, and focuses on click', () => {
    const onSelect = vi.fn();
    wrap(<MapListingCard listing={pin()} placed selected={false} onSelect={onSelect} />);
    const card = screen.getByTestId('map-card');
    expect(card.textContent).toContain('آپارتمان نوساز');
    expect(card.textContent).toContain('ناحیه ۱۴');
    expect(card.textContent).toContain('۱۵');
    const badge = within(card).getByText(translate('prs', 'label.deal.RENT'));
    expect((badge as HTMLElement).style.background).not.toBe('');
    fireEvent.click(within(card).getAllByRole('button')[0]!);
    expect(onSelect).toHaveBeenCalled();
  });

  it('offers to place a listing that has no pin yet, and marks the selected and sold ones', () => {
    const onPlace = vi.fn();
    wrap(<MapListingCard listing={pin({ lat: null, lng: null, status: 'SOLD', is_featured: true })} placed={false} selected onSelect={() => undefined} onPlace={onPlace} />);
    const card = screen.getByTestId('map-card');
    expect(card.getAttribute('data-selected')).toBe('true');
    expect(within(card).getByText(translate('prs', 'label.status.SOLD'))).toBeTruthy();
    fireEvent.click(within(card).getByText(t('map.place')));
    expect(onPlace).toHaveBeenCalled();
  });
});

