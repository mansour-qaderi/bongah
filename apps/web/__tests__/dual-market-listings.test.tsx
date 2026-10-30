// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Property } from '@bongah/shared-types';

const patch = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('swr', () => ({ default: () => ({ data: undefined }), mutate: vi.fn(async () => undefined) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, patch: (...a: unknown[]) => patch(...a) } };
});
vi.mock('@/lib/listing-actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/listing-actions')>('@/lib/listing-actions');
  return { ...actual, refreshListingData: vi.fn(async () => undefined), patchCachedListings: vi.fn(async () => undefined) };
});

import { LanguageProvider } from '@/i18n/provider';
import { translate } from '@/i18n/translate';
import { setActiveLanguage } from '@/i18n/active';
import { EditListingDialog } from '@/components/listings/edit-listing-dialog';
import { ListingFilters } from '@/components/listings/filters';
import { toApiQuery, type ListingQuery } from '@/hooks/use-listing-query';
import { listingPrice } from '@/lib/price';
import { setActiveMarket } from '@/lib/market';

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('prs', key, vars);
const wrap = (node: React.ReactNode) => render(<LanguageProvider initialLanguage="prs">{node}</LanguageProvider>);

beforeEach(() => {
  window.localStorage.clear();
  patch.mockReset();
  setActiveLanguage('prs');
  setActiveMarket('AF');
});
afterEach(() => cleanup());

const property = (over: Partial<Property> = {}): Property =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    title: 'آپارتمان در تهران',
    description: 'توضیح کامل',
    type: 'APARTMENT',
    market: 'IR',
    deal_type: 'MORTGAGE_RENT',
    price: 200_000_000,
    monthly_rent: 8_000_000,
    currency: 'TOMAN',
    features: ['ELEVATOR'],
    deed_type: null,
    area_sqm: 85,
    bedrooms: 2,
    bathrooms: 1,
    province: 'تهران',
    district: 'سعادت آباد',
    neighborhood: null,
    address: 'تهران، سعادت آباد',
    status: 'ACTIVE',
    is_featured: false,
    ...over,
  }) as Property;

describe('a listing’s price', () => {
  it('is the deposit and the monthly rent for a mortgage-and-rent, and one amount for any other deal', () => {
    const rent = listingPrice(property());
    expect(rent).toContain('رهن');
    expect(rent).toContain('اجاره');
    expect(rent).toContain('تومان');
    expect(rent.match(/تومان/g)).toHaveLength(2);
    const sale = listingPrice(property({ deal_type: 'SALE', monthly_rent: null }));
    expect(sale).not.toContain('اجاره');
    expect(sale.match(/تومان/g)).toHaveLength(1);
    // An old row of that deal with no rent stored shows its price alone.
    expect(listingPrice(property({ monthly_rent: null })).match(/تومان/g)).toHaveLength(1);
  });
});

describe('editing an Iranian mortgage-and-rent listing', () => {
  it('shows the deposit and the rent apart, with the listing’s tags ticked and no deed', () => {
    wrap(<EditListingDialog listing={property()} onClose={() => undefined} />);
    const box = screen.getByTestId('edit-listing');
    expect(within(box).getByLabelText(t('form.deposit'), { exact: false })).toHaveProperty('value', '200000000');
    expect((screen.getByTestId('edit-monthly-rent') as HTMLInputElement).value).toBe('8000000');
    const ticked = within(box).getAllByRole('checkbox').filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.getAttribute('aria-label'));
    expect(ticked).toEqual(['آسانسور']);
    expect(within(box).queryByRole('combobox', { name: new RegExp(t('form.deed')) })).toBeNull();
  });

  it('sends only the rent and the tags that changed', async () => {
    patch.mockResolvedValue(property());
    wrap(<EditListingDialog listing={property()} onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId('edit-monthly-rent'), { target: { value: '9000000' } });
    fireEvent.click(within(screen.getByTestId('edit-listing')).getByRole('checkbox', { name: 'پارکینگ' }));
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('properties/22222222-2222-4222-8222-222222222222', { monthly_rent: 9_000_000, features: ['ELEVATOR', 'PARKING'] });
  });

  it('refuses an emptied rent without calling the server', async () => {
    wrap(<EditListingDialog listing={property()} onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId('edit-monthly-rent'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-save'));
    expect(await screen.findByText(t('v.monthlyRent.required'))).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });

  it('does not ask a sale for a rent', () => {
    wrap(<EditListingDialog listing={property({ deal_type: 'SALE', monthly_rent: null })} onClose={() => undefined} />);
    expect(screen.queryByTestId('edit-monthly-rent')).toBeNull();
    expect(within(screen.getByTestId('edit-listing')).queryByLabelText(t('form.deposit'), { exact: false })).toBeNull();
  });
});

describe('editing an Afghan listing', () => {
  it('offers the deed, not the tags, and sends the deed chosen or null to clear it', async () => {
    patch.mockResolvedValue(property());
    const afghan = property({ market: 'AF', deal_type: 'SALE', monthly_rent: null, currency: 'AFGHANI', type: 'HOUSE_HAWILI', features: [], province: 'هرات' });
    wrap(<EditListingDialog listing={afghan} onClose={() => undefined} />);
    const box = screen.getByTestId('edit-listing');
    expect(within(box).queryAllByRole('checkbox')).toHaveLength(0);
    fireEvent.click(within(box).getByRole('combobox', { name: new RegExp(t('form.deed')) }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: 'عرفی' }));
    fireEvent.click(screen.getByTestId('edit-save'));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenLastCalledWith('properties/22222222-2222-4222-8222-222222222222', { deed_type: 'ORFI' });
  });
});

describe('the filters of the owner’s list', () => {
  const base: ListingQuery = { q: '', tab: 'ALL', type: '', deal: '', features: [], deed: '', currency: '', min: '', max: '', sort: 'newest', page: 1 };
  const mount = (query: Partial<ListingQuery> = {}, update = vi.fn()) => {
    wrap(<ListingFilters query={{ ...base, ...query }} update={update} reset={() => undefined} activeFilters={0} />);
    return update;
  };
  const options = (name: string): string[] => {
    const trigger = screen.getByRole('combobox', { name });
    fireEvent.click(trigger);
    const names = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    return names;
  };

  it('offers Afghanistan its kinds, deals, currencies and deeds, and no tags', () => {
    setActiveMarket('AF');
    mount();
    expect(options(t('filter.deal'))).toEqual([t('filter.allDeals'), 'فروشی', 'کرایی', 'گروی', 'اجاره روزانه']);
    expect(options(t('filter.type'))).toContain('گدام');
    expect(options(t('filter.type'))).not.toContain('زمین و کلنگی');
    expect(options(t('filter.currency'))).toEqual([t('filter.allCurrencies'), 'افغانی', 'دالر']);
    expect(options(t('filter.deed'))).toEqual([t('filter.allDeeds'), 'قباله شرعی', 'عرفی']);
    expect(screen.queryByTestId('filter-features')).toBeNull();
  });

  it('offers Iran its six kinds, its deals, tomans only, and the tags — and no deed', () => {
    setActiveMarket('IR');
    mount();
    expect(options(t('filter.type')).slice(1)).toEqual(['آپارتمان', 'خانه / ویلایی', 'باغ و ویلا', 'زمین', 'خانه کلنگی', 'تجاری و اداری']);
    expect(options(t('filter.deal')).slice(1)).toEqual(['فروش', 'اجاره', 'رهن کامل', 'اجاره روزانه']);
    expect(options(t('filter.currency')).slice(1)).toEqual(['تومان']); // no rial, no dollar
    expect(screen.queryByRole('combobox', { name: t('filter.deed') })).toBeNull();
    expect(within(screen.getByTestId('filter-features')).getAllByRole('checkbox')).toHaveLength(7);
  });

  it('keeps a value from the address bar that the market does not offer, so the box shows what filters', () => {
    setActiveMarket('IR');
    mount({ type: 'SHOP' });
    expect(options(t('filter.type'))).toContain('دکان');
  });

  it('adds and removes a tag in the query', () => {
    setActiveMarket('IR');
    const update = mount({ features: ['ELEVATOR'] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'پارکینگ' }));
    expect(update).toHaveBeenLastCalledWith({ features: ['ELEVATOR', 'PARKING'] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'آسانسور' }));
    expect(update).toHaveBeenLastCalledWith({ features: [] });
  });

  it('asks the API for the tags together and for the deed', () => {
    expect(toApiQuery({ ...base, features: ['ELEVATOR', 'PARKING'], deed: 'SHARI' })).toMatchObject({ features: 'ELEVATOR,PARKING', deed_type: 'SHARI' });
    const none = toApiQuery(base);
    expect(none.features).toBeUndefined();
    expect(none.deed_type).toBeUndefined();
  });
});
