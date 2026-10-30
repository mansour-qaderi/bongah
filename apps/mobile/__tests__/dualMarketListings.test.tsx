import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import i18n from 'i18next';
import { MARKET_CONFIG, PROPERTY_FEATURES, DEED_TYPES } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import prs from '../src/i18n/locales/prs.json';
import ps from '../src/i18n/locales/ps.json';
import { formatCurrency } from '../src/i18n/format';
import { dealPriceLabel, dealTypeLabel } from '../src/i18n/market';
import { listingPriceText, monthlyRentOf } from '../src/i18n/rentPrice';
import { priceStops } from '../src/constants/priceStops';
import { resetMarketForTests, setMarket } from '../src/market/marketStore';
import { KV_KEYS, kv } from '../src/storage/kv';
import FilterSheet from '../src/components/FilterSheet';
import PriceLine from '../src/components/PriceLine';
import { listingShareMessage } from '../src/share/listingShare';
import { listProperties } from '../src/api/endpoints';
import { allText, pressableWith, render } from '../test-utils';

const act = ReactTestRenderer.act;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
const show = async (element: React.ReactElement) => {
  const tree = await render(element);
  mounted.push(tree);
  return tree;
};
type Root = ReactTestRenderer.ReactTestInstance;
const byId = (root: Root, id: string) => root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const isSelected = (root: Root, id: string) => {
  const node = byId(root, id);
  return node?.props.selected === true || node?.props.accessibilityState?.selected === true;
};

const iranRent = {
  deal_type: 'MORTGAGE_RENT',
  price: 200_000_000,
  monthly_rent: 8_000_000,
  currency: 'TOMAN',
  price_terms: null,
} as const;

beforeAll(async () => {
  await initI18n();
});
beforeEach(async () => {
  await kv.remove(KV_KEYS.market);
  resetMarketForTests();
  await setMarket('AF');
});
afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

const t = i18n.t.bind(i18n);

describe('the price of a mortgage-and-rent', () => {

  it('has a monthly rent only for that deal', () => {
    expect(monthlyRentOf(iranRent)).toBe(8_000_000);
    expect(monthlyRentOf({ ...iranRent, deal_type: 'SALE' })).toBeNull();
    // An older row of that deal with no rent stored shows its deposit alone.
    expect(monthlyRentOf({ ...iranRent, monthly_rent: null })).toBeNull();
    expect(monthlyRentOf({ deal_type: 'SALE' })).toBeNull();
  });

  it('is one line of deposit and rent, and one amount for every other deal', () => {
    const line = listingPriceText(iranRent, formatCurrency, t);
    expect(line).toContain(formatCurrency(200_000_000, 'TOMAN'));
    expect(line).toContain(formatCurrency(8_000_000, 'TOMAN'));
    expect(line).toContain('رهن');
    expect(line).toContain('اجاره');
    expect(listingPriceText({ ...iranRent, deal_type: 'SALE' }, formatCurrency, t)).toBe(formatCurrency(200_000_000, 'TOMAN'));
  });

  it('shows the rent under the deposit on a card, and nothing extra for a sale', async () => {
    const tree = await show(<PriceLine property={iranRent} />);
    const rent = tree.root.findAll(n => n.props.testID === 'monthly-rent');
    expect(rent.length).toBeGreaterThan(0);
    expect(allText(rent[0])).toBe(t('price.rentPerMonth', { amount: formatCurrency(8_000_000, 'TOMAN') }));
    const sale = await show(<PriceLine property={{ ...iranRent, deal_type: 'SALE' }} />);
    expect(sale.root.findAll(n => n.props.testID === 'monthly-rent')).toHaveLength(0);
  });

  it('goes into a share message as deposit and rent', () => {
    const message = listingShareMessage(
      { id: 'abc', title: 'آپارتمان', ...iranRent, province: 'تهران', district: '', neighborhood: null, address: '' } as never,
      t,
    );
    expect(message).toContain(formatCurrency(200_000_000, 'TOMAN'));
    expect(message).toContain(formatCurrency(8_000_000, 'TOMAN'));
  });

  it('is worded for Iran: «اجاره» with a deposit and a monthly rent, in both languages', () => {
    for (const lang of [prs, ps]) {
      expect(lang.dealTypeIR.MORTGAGE_RENT).toBeTruthy();
      expect(lang.dealPriceIR.MORTGAGE_RENT).toBeTruthy();
      expect(lang.price.rentPerMonth).toContain('{{amount}}');
      expect(lang.price.depositAndRent).toContain('{{deposit}}');
      expect(lang.price.depositAndRent).toContain('{{rent}}');
    }
    expect(dealTypeLabel('MORTGAGE_RENT', 'IR', t)).toBe('اجاره');
    expect(dealPriceLabel('MORTGAGE_RENT', 'IR', t)).toBe('مبلغ رهن (ودیعه)');
  });

  it('has a slider ladder in every currency, and the deposit climbs like the full mortgage', () => {
    for (const currency of ['TOMAN', 'RIAL', 'AFGHANI', 'USD'] as const) {
      expect(priceStops('MORTGAGE_RENT', currency)).toEqual(priceStops('MORTGAGE_GROWI', currency));
    }
  });
});

describe('the labels of the tags and deeds', () => {
  it('has every tag and deed in both languages, with the same keys', () => {
    for (const lang of [prs, ps]) {
      for (const feature of PROPERTY_FEATURES) expect((lang.listingFeature as Record<string, string>)[feature]).toBeTruthy();
      for (const deed of DEED_TYPES) expect((lang.deed as Record<string, string>)[deed]).toBeTruthy();
    }
    expect(Object.keys(ps.listingFeature).sort()).toEqual(Object.keys(prs.listingFeature).sort());
    expect(Object.keys(ps.deed).sort()).toEqual(Object.keys(prs.deed).sort());
    // «بدون قید» already names the price terms' third choice; the deed's must not be confused with it.
    expect(prs.deed.none).not.toBe(prs.priceTerms.NONE);
  });
});

describe('the filter sheet in each country', () => {
  it("offers Iran's tags (all must match) and no deed, and sends them in the market's order", async () => {
    await setMarket('IR');
    const onApply = jest.fn();
    const tree = await show(<FilterSheet visible value={{}} onApply={onApply} onClose={() => undefined} />);
    for (const feature of MARKET_CONFIG.IR.features) expect(byId(tree.root, `filter-feature-${feature}`)).toBeDefined();
    expect(tree.root.findAll(n => n.props.testID === 'filter-deed')).toHaveLength(0);
    // Ticked out of order, sent in the market's.
    await act(async () => byId(tree.root, 'filter-feature-PARKING').props.onPress());
    await act(async () => byId(tree.root, 'filter-feature-ELEVATOR').props.onPress());
    expect(isSelected(tree.root, 'filter-feature-PARKING')).toBe(true);
    await act(async () => pressableWith(tree.root, prs.home.applyFilters).props.onPress());
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ features: ['ELEVATOR', 'PARKING'] }));
    expect(onApply.mock.calls[0][0].deed_type).toBeUndefined();
    // A second tap takes a tag off again.
    await act(async () => byId(tree.root, 'filter-feature-ELEVATOR').props.onPress());
    expect(isSelected(tree.root, 'filter-feature-ELEVATOR')).toBe(false);
  });

  it("offers Afghanistan's deed and no tags, and sends the deed chosen", async () => {
    const onApply = jest.fn();
    const tree = await show(<FilterSheet visible value={{}} onApply={onApply} onClose={() => undefined} />);
    expect(tree.root.findAll(n => n.props.testID === 'filter-features')).toHaveLength(0);
    await act(async () => byId(tree.root, 'filter-deed-ORFI').props.onPress());
    await act(async () => pressableWith(tree.root, prs.home.applyFilters).props.onPress());
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ deed_type: 'ORFI' }));
    expect(onApply.mock.calls[0][0].features).toBeUndefined();
  });

  it('starts from the filters already applied, and drops a choice the market does not have', async () => {
    await setMarket('IR');
    const onApply = jest.fn();
    const tree = await show(
      <FilterSheet visible value={{ features: ['PENTHOUSE'], deed_type: 'SHARI' }} onApply={onApply} onClose={() => undefined} />,
    );
    expect(isSelected(tree.root, 'filter-feature-PENTHOUSE')).toBe(true);
    await act(async () => pressableWith(tree.root, prs.home.applyFilters).props.onPress());
    expect(onApply.mock.calls[0][0].features).toEqual(['PENTHOUSE']);
    // The deed is Afghanistan's: an old link's deed does not survive in Iran.
    expect(onApply.mock.calls[0][0].deed_type).toBeUndefined();
  });

  it('puts the tags in the request as one comma list', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } }), text: async () => '' }));
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    await listProperties({ market: 'IR', features: ['ELEVATOR', 'PARKING'], deed_type: undefined }, 1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(new URL(url).searchParams.get('features')).toBe('ELEVATOR,PARKING');
    expect(new URL(url).searchParams.get('deed_type')).toBeNull();
  });
});
