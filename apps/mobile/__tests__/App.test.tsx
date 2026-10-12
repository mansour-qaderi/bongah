import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import prs from '../src/i18n/locales/prs.json';
import { queryClient } from '../src/api/hooks';
import { allText, flush, jsonResponse, render } from '../test-utils';

const property = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'u1',
  agency_id: null,
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

test('the app starts in Dari and shows listings with Persian digits and the right currency word', async () => {
  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes('/properties?')) {
      return jsonResponse(200, {
        data: [property],
        meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
      });
    }
    return jsonResponse(404, {});
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

  const tree = await render(<App />);
  await flush();
  await flush();

  const text = allText(tree.root);
  expect(text).toContain(prs.app.tagline);
  expect(text).toContain(property.title);
  expect(text).toContain('۱٬۲۰۰٬۰۰۰ افغانی');
  expect(text).toContain('۱۲۰ متر مربع');
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/properties\?page=1&limit=20$/);

  ReactTestRenderer.act(() => tree.unmount());
});
