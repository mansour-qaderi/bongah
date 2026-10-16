import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import prs from '../src/i18n/locales/prs.json';
import { queryClient } from '../src/api/hooks';
import {
  allText,
  flush,
  jsonResponse,
  pressableWith,
  render,
} from '../test-utils';

const property = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  agency_id: null,
  agency_name: null,
  title: 'آپارتمان سه‌خوابه در شهر نو',
  description: 'تازه‌ساز',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 1200000,
  currency: 'AFGHANI',
  area_sqm: 120,
  bedrooms: 3,
  bathrooms: 2,
  province: 'کابل',
  district: 'شهر نو',
  neighborhood: 'قلعه فتح‌الله',
  address: 'کابل',
  lat: 34.53,
  lng: 69.17,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

// Jest has no native layout engine, so RTL never becomes active; skip the dev-only warning.
jest.mock('../src/i18n/rtl', () => ({
  ...jest.requireActual('../src/i18n/rtl'),
  isRtlActive: () => true,
}));

afterEach(() => queryClient.clear());

test('the app opens on the map in Dari, and the list shows Persian digits and the right currency word', async () => {
  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes('/properties?')) {
      return jsonResponse(200, {
        data: [property],
        meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
      });
    }
    if (url.endsWith('/agencies/map')) return jsonResponse(200, []);
    return jsonResponse(404, {});
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

  const tree = await render(<App />);
  await flush();
  await flush();

  // Map first: a marker that says what it is, what for, the short price (Afghani sign) and who is selling.
  let text = allText(tree.root);
  const spoken = tree.root
    .findAll(
      n =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.includes('۱٫۲ میلیون ؋'),
    )
    .map(n => n.props.accessibilityLabel as string);
  expect(spoken.length).toBeGreaterThan(0);
  expect(spoken[0]).toContain(prs.propertyType.APARTMENT);
  expect(spoken[0]).toContain(prs.dealType.SALE);
  expect(spoken[0]).toContain(prs.property.owner);
  // Only what is on screen is asked for: an area of the map, 50 to a page.
  expect(fetchMock.mock.calls[0][0]).toMatch(
    /\/properties\?min_lat=[\d.]+&max_lat=[\d.]+&min_lng=[\d.]+&max_lng=[\d.]+&page=1&limit=50$/,
  );

  // The list one tap away shows the full price.
  await ReactTestRenderer.act(async () => {
    pressableWith(tree.root, prs.home.list).props.onPress();
  });
  // React Query tells React about new data on a 0 ms timer, so let real time pass.
  for (let i = 0; i < 3; i += 1) {
    await ReactTestRenderer.act(async () => {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 5));
    });
  }
  text = allText(tree.root);
  expect(text).toContain(property.title);
  // Thousands are grouped with plain commas, and the sign is its own, smaller piece of text.
  expect(text).toContain('۱,۲۰۰,۰۰۰');
  expect(text).toContain('؋');
  expect(text).not.toContain('٬');
  expect(text).toContain('۱۲۰ متر مربع');

  ReactTestRenderer.act(() => tree.unmount());
});

test('the bottom bar has exactly four tabs, in this order: home, my listings, messages, my account', async () => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string) =>
      url.includes('/properties?')
        ? jsonResponse(200, {
            data: [],
            meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
          })
        : jsonResponse(200, []),
  );
  const tree = await render(<App />);
  await flush();

  const tabs = tree.root
    .findAll(
      n => n.props.accessibilityRole === 'tab' && typeof n.type === 'string',
    )
    .map(n => ({
      id: n.props.testID as string,
      label: n.props.accessibilityLabel as string,
    }));
  expect(tabs).toEqual([
    { id: 'tab-Home', label: prs.nav.home },
    { id: 'tab-MyListings', label: prs.nav.myListings },
    { id: 'tab-Messages', label: prs.nav.messages },
    { id: 'tab-Account', label: prs.nav.account },
  ]);
  // One profile entry only: no account button left over on the map.
  expect(
    tree.root.findAll(
      n =>
        n.props.accessibilityLabel === prs.nav.account &&
        typeof n.type === 'string',
    ),
  ).toHaveLength(1);

  ReactTestRenderer.act(() => tree.unmount());
});
