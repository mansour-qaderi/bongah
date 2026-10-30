import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { Property } from '@bongah/shared-types';
import { initI18n } from '../src/i18n';
import { formatNumber } from '../src/i18n/format';
import prs from '../src/i18n/locales/prs.json';
import { allText, render } from '../test-utils';
import { Chip } from '../src/components/Chip';
import ClusterListSheet from '../src/components/ClusterListSheet';
import Stepper from '../src/components/Stepper';
import {
  ALL_PROVINCES,
  matchProvince,
  PROVINCES,
} from '../src/constants/provinces';
import {
  lookUpPlace,
  nearestProvince,
  placeFromAddress,
} from '../src/map/geocode';
import { buildItems } from '../src/map/items';
import { comparePriority, planRank, sortByPriority } from '../src/map/priority';
import { overlapWith } from '../src/components/KeyboardAware';
import { PROPERTY_TYPES } from '@bongah/shared-types';

const act = ReactTestRenderer.act;

beforeAll(async () => {
  await initI18n();
});

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p',
  user_id: 'u',
  agency_id: null,
  agency_name: null,
  agency_plan: null,
  title: 'ملک',
  description: '',
  type: 'APARTMENT',
  deal_type: 'SALE',
  price: 1000,
  currency: 'AFGHANI',
  area_sqm: 100,
  bedrooms: null,
  bathrooms: null,
  province: 'kabul',
  district: 'x',
  neighborhood: null,
  address: '',
  lat: 34.5,
  lng: 69.1,
  images: [],
  status: 'ACTIVE',
  is_featured: false,
  featured_until: null,
  laddered_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});

describe('property types', () => {
  it('are offered in the agreed order, garage and other last', () => {
    expect([...PROPERTY_TYPES]).toEqual([
      'HOUSE_HAWILI',
      'APARTMENT',
      'DUPLEX',
      'SHOP',
      'OFFICE',
      'COMMERCIAL',
      'WAREHOUSE',
      'LAND',
      'LAND_OLD',
      'GARDEN',
      'VILLA',
      'VILLA_GARDEN',
      'GARAGE',
      'OTHER',
    ]);
  });

  it('are named in both languages, with the same wording as the brief in Dari', () => {
    expect(PROPERTY_TYPES.map(t => prs.propertyType[t])).toEqual([
      'خانه',
      'آپارتمان',
      'دوبلکس',
      'دکان',
      'دفتر',
      'تجاری',
      'گدام',
      'زمین',
      'خانه کلنگی',
      'باغ',
      'ویلا',
      'باغ و ویلا',
      'گاراج',
      'غیره',
    ]);
  });
});

describe('priority', () => {
  it('ranks a longer plan higher and no plan last', () => {
    expect(planRank(property({ agency_plan: 'YEARLY' }))).toBeGreaterThan(
      planRank(property({ agency_plan: 'QUARTERLY' })),
    );
    expect(planRank(property({ agency_plan: 'MONTHLY' }))).toBeGreaterThan(
      planRank(property({ agency_plan: null })),
    );
    expect(planRank(property())).toBe(0);
  });

  it('puts featured listings first, then subscribed ones by tier, then the newest', () => {
    const list = [
      property({ id: 'free-new', created_at: '2026-10-10T00:00:00Z' }),
      property({ id: 'monthly', agency_plan: 'MONTHLY' }),
      property({ id: 'yearly', agency_plan: 'YEARLY' }),
      property({ id: 'quarterly', agency_plan: 'QUARTERLY' }),
      property({
        id: 'free-featured',
        is_featured: true,
        created_at: '2026-09-01T00:00:00Z',
      }),
      property({ id: 'free-old', created_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(sortByPriority(list).map(p => p.id)).toEqual([
      'free-featured',
      'yearly',
      'quarterly',
      'monthly',
      'free-new',
      'free-old',
    ]);
  });

  it('lets a featured listing of a short plan go ahead of an ordinary one of the longest plan', () => {
    const featuredMonthly = property({
      id: 'featured-monthly',
      agency_plan: 'MONTHLY',
      is_featured: true,
    });
    const yearly = property({ id: 'yearly', agency_plan: 'YEARLY' });
    expect(comparePriority(featuredMonthly, yearly)).toBeLessThan(0);
    // Among featured ones the longer plan still goes first.
    const featuredYearly = {
      ...yearly,
      id: 'featured-yearly',
      is_featured: true,
    };
    expect(comparePriority(featuredYearly, featuredMonthly)).toBeLessThan(0);
  });

  it('lets a ladder lift a listing within its tier, and breaks full ties by id', () => {
    const laddered = property({
      id: 'b',
      created_at: '2026-01-01T00:00:00Z',
      laddered_at: '2026-10-12T00:00:00Z',
    });
    const posted = property({ id: 'a', created_at: '2026-10-01T00:00:00Z' });
    expect(comparePriority(laddered, posted)).toBeLessThan(0);
    const twin = property({ id: 'c' });
    expect(comparePriority(posted, twin)).toBeLessThan(0);
    expect(comparePriority(twin, posted)).toBeGreaterThan(0);
  });

  it('does not reorder the input it is given', () => {
    const list = [
      property({ id: 'b' }),
      property({ id: 'a', agency_plan: 'YEARLY' }),
    ];
    sortByPriority(list);
    expect(list.map(p => p.id)).toEqual(['b', 'a']);
  });
});

describe('ClusterListSheet', () => {
  it('lists paying listings first, then the rest, then offices', async () => {
    const items = buildItems(
      [
        property({ id: '1', title: 'رایگان' }),
        property({ id: '2', title: 'ماهانه', agency_plan: 'MONTHLY' }),
        property({ id: '3', title: 'سالانه', agency_plan: 'YEARLY' }),
      ],
      [
        {
          id: 'ag',
          agency_name: 'دفتر نور',
          lat: 34.5,
          lng: 69.1,
        } as never,
      ],
    );
    const tree = await render(
      <ClusterListSheet items={items} onPick={jest.fn()} onClose={jest.fn()} />,
    );
    const text = allText(tree.root);
    const at = (needle: string) => text.indexOf(needle);
    expect(at('سالانه')).toBeGreaterThanOrEqual(0);
    expect(at('سالانه')).toBeLessThan(at('ماهانه'));
    expect(at('ماهانه')).toBeLessThan(at('رایگان'));
    expect(at('رایگان')).toBeLessThan(at('دفتر نور'));
  });
});

describe('Stepper', () => {
  const mount = async (value: number | null, onChange = jest.fn()) => {
    const tree = await render(
      <Stepper label="تعداد اتاق" value={value} onChange={onChange} />,
    );
    const button = (kind: 'increase' | 'decrease') =>
      tree.root.find(
        n =>
          typeof n.props.onPress === 'function' &&
          n.props.accessibilityLabel === `تعداد اتاق: ${prs.common[kind]}`,
      );
    return { tree, onChange, button };
  };

  it('starts at "not given": the first + gives 1 and − is off', async () => {
    const { button, onChange } = await mount(null);
    expect(button('decrease').props.disabled).toBe(true);
    await act(async () => button('increase').props.onPress());
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('counts up and down, and going below 0 clears it again', async () => {
    const up = await mount(3);
    await act(async () => up.button('increase').props.onPress());
    expect(up.onChange).toHaveBeenLastCalledWith(4);
    await act(async () => up.button('decrease').props.onPress());
    expect(up.onChange).toHaveBeenLastCalledWith(2);

    const zero = await mount(0);
    await act(async () => zero.button('decrease').props.onPress());
    expect(zero.onChange).toHaveBeenCalledWith(null);
  });

  it('stops at its maximum', async () => {
    const onChange = jest.fn();
    const tree = await render(
      <Stepper label="n" value={50} onChange={onChange} max={50} />,
    );
    const plus = tree.root.find(
      n => n.props.accessibilityLabel === `n: ${prs.common.increase}`,
    );
    await act(async () => plus.props.onPress());
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it('writes the value in Persian digits and shows an error', async () => {
    const tree = await render(
      <Stepper label="n" value={12} onChange={jest.fn()} error="لازم است" />,
    );
    const text = allText(tree.root);
    expect(text).toContain(formatNumber(12, 0));
    expect(text).toContain('لازم است');
    expect(text).not.toMatch(/[0-9]/);
  });
});

describe('Chip count', () => {
  it('shows the figure in its own capsule, in Persian digits', async () => {
    const tree = await render(
      <Chip label="فعال" count={3} onPress={jest.fn()} />,
    );
    expect(allText(tree.root)).toContain(formatNumber(3, 0));
    const none = await render(<Chip label="فعال" onPress={jest.fn()} />);
    expect(allText(none.root)).not.toContain(formatNumber(3, 0));
  });
});

describe('provinces from names', () => {
  it('matches Latin, Dari and capital names, and nothing else', () => {
    expect(matchProvince('Kabul')?.id).toBe('kabul');
    expect(matchProvince('Kabul Province')?.id).toBe('kabul');
    expect(matchProvince('هرات')?.id).toBe('herat');
    expect(matchProvince('مزار شریف')?.id).toBe('balkh');
    expect(matchProvince('Narnia')).toBeNull();
    expect(matchProvince('')).toBeNull();
    expect(matchProvince(undefined)).toBeNull();
  });

  it('finds the nearest capital for a point', () => {
    expect(nearestProvince({ latitude: 34.5, longitude: 69.1 }).id).toBe(
      'kabul',
    );
    expect(nearestProvince({ latitude: 36.7, longitude: 67.1 }).id).toBe(
      'balkh',
    );
    expect(nearestProvince({ latitude: 31.6, longitude: 65.7 }).id).toBe(
      'kandahar',
    );
    // Whatever the point, it names one of the provinces: of Afghanistan's 34 when the market says so, else of either country.
    expect(PROVINCES).toContain(
      nearestProvince({ latitude: 0, longitude: 0 }, 'AF'),
    );
    expect(ALL_PROVINCES).toContain(
      nearestProvince({ latitude: 0, longitude: 0 }),
    );
    // A point in Iran names an Iranian province, not the nearest Afghan one.
    expect(nearestProvince({ latitude: 35.7, longitude: 51.4 }).id).toBe('tehran');
  });
});

describe('geocode', () => {
  const point = { latitude: 34.5, longitude: 69.1 };

  it('reads the parts the form has fields for', () => {
    const place = placeFromAddress(
      {
        state: 'Kabul',
        county: 'ناحیه ۳',
        neighbourhood: 'شهر نو',
        road: 'سرک چهارم',
      },
      point,
    );
    expect(place).toMatchObject({
      district: 'ناحیه ۳',
      neighborhood: 'شهر نو',
      street: 'سرک چهارم',
      provinceApproximate: false,
    });
    expect(place.province?.id).toBe('kabul');
  });

  it('falls back to the nearest province, marked as a guess, when the state is unknown', () => {
    const place = placeFromAddress({ state: 'Somewhere' }, point);
    expect(place.province?.id).toBe('kabul');
    expect(place.provinceApproximate).toBe(true);
    expect(placeFromAddress(undefined, point)).toMatchObject({
      provinceApproximate: true,
      district: '',
    });
  });

  describe('lookUpPlace', () => {
    const original = (globalThis as unknown as { fetch: unknown }).fetch;
    afterEach(() => {
      (globalThis as unknown as { fetch: unknown }).fetch = original;
    });
    const answer = (impl: () => unknown) => {
      const fetchMock = jest.fn(async () => impl());
      (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
      return fetchMock;
    };

    it('asks with the point, an identifying User-Agent and the app languages', async () => {
      const fetchMock = answer(() => ({
        ok: true,
        json: async () => ({ address: { state: 'Herat', road: 'x' } }),
      }));
      const place = await lookUpPlace(point);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toContain('lat=34.5');
      expect(url).toContain('lon=69.1');
      expect(url).toContain('accept-language=fa,ps,en');
      expect((init.headers as Record<string, string>)['User-Agent']).toMatch(
        /Bongah/,
      );
      expect(place.province?.id).toBe('herat');
    });

    it('never throws: an error, a bad status or bad JSON are the nearest province', async () => {
      answer(() => {
        throw new Error('offline');
      });
      expect((await lookUpPlace(point)).provinceApproximate).toBe(true);
      answer(() => ({ ok: false }));
      expect((await lookUpPlace(point)).province?.id).toBe('kabul');
      answer(() => ({
        ok: true,
        json: async () => {
          throw new Error('not json');
        },
      }));
      expect((await lookUpPlace(point)).province?.id).toBe('kabul');
    });
  });
});

describe('overlapWith, capped', () => {
  it('never lifts a box by more than the keyboard covers', () => {
    // A mismeasured keyboard top (far above the real one) would ask for 700; the keyboard is 300 tall.
    expect(overlapWith({ top: 0, bottom: 800 }, 100, 300)).toBe(300);
    expect(overlapWith({ top: 0, bottom: 800 }, 500, 300)).toBe(300);
    expect(overlapWith({ top: 0, bottom: 800 }, 600, 300)).toBe(200);
    expect(overlapWith({ top: 0, bottom: 800 }, Infinity, 300)).toBe(0);
  });
});
