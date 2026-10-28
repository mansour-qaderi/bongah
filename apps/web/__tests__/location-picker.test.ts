import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COUNTRY_VIEW,
  DISTRICT_ZOOM,
  PIN_ZOOM,
  PROVINCE_ZOOM,
  districtQuery,
  findDistrict,
  forgetDistricts,
  pickDistrictAnswer,
  pinOf,
  provinceByName,
  provinceView,
  roundCoordinate,
  startView,
  toPicked,
} from '@/lib/location-picker';
import { PROVINCES } from '@/lib/provinces';

describe('what the pin hands to the form', () => {
  it('rounds to six decimals, as text', () => {
    expect(roundCoordinate(34.52812345678)).toBe(34.528123);
    expect(toPicked(34.52812345678, 69.17612345678)).toEqual({ lat: '34.528123', lng: '69.176123' });
    expect(toPicked(34.5, 69)).toEqual({ lat: '34.5', lng: '69' });
  });

  it.each([
    [0, 0],
    [51.5, -0.12],
    [34.5, 80],
    [Number.NaN, 69],
    [34.5, Number.POSITIVE_INFINITY],
  ])('refuses %s, %s: not in Afghanistan', (lat, lng) => {
    expect(toPicked(lat, lng)).toBeNull();
  });

  it('reads the form’s two text fields back into a pin', () => {
    expect(pinOf('34.5281', '69.1761')).toEqual({ lat: 34.5281, lng: 69.1761 });
    expect(pinOf('۳۴.۵۲۸۱', '۶۹.۱۷۶۱')).toEqual({ lat: 34.5281, lng: 69.1761 });
    expect(pinOf('', '')).toBeNull();
    expect(pinOf('34.5', '')).toBeNull();
    expect(pinOf('abc', '69')).toBeNull();
    expect(pinOf('10', '10')).toBeNull();
  });
});

describe('where the map looks', () => {
  it('goes to the province’s capital at city zoom', () => {
    const herat = PROVINCES.find((p) => p.id === 'herat')!;
    expect(provinceView('هرات')).toEqual({ center: [herat.lng, herat.lat], zoom: PROVINCE_ZOOM });
    const kabul = PROVINCES.find((p) => p.id === 'kabul')!;
    expect(provinceView(' کابل ')).toEqual({ center: [kabul.lng, kabul.lat], zoom: PROVINCE_ZOOM });
  });

  it('knows every province the form can offer', () => {
    for (const p of PROVINCES) expect(provinceView(p.name), p.name).not.toBeNull();
  });

  it('stays put for no province or one it does not know', () => {
    expect(provinceView('')).toBeNull();
    expect(provinceView('ولایت نامعلوم')).toBeNull();
    expect(provinceByName('')).toBeNull();
  });

  it('starts on the pin, else the province, else the country', () => {
    expect(startView({ lat: 34.3, lng: 62.2 }, 'کابل')).toEqual({ center: [62.2, 34.3], zoom: PIN_ZOOM });
    expect(startView(null, 'هرات').zoom).toBe(PROVINCE_ZOOM);
    expect(startView(null, '')).toEqual(COUNTRY_VIEW);
  });
});

describe('finding a district', () => {
  it('asks for «district، province، Afghanistan», without the administrative word', () => {
    expect(districtQuery('ولسوالی پغمان', 'کابل')).toBe('پغمان، کابل، افغانستان');
    expect(districtQuery('  ناحیه   ۴ ', 'کابل')).toBe('ناحیه ۴، کابل، افغانستان');
    expect(districtQuery('قرغه', 'کابل')).toBe('قرغه، کابل، افغانستان');
    expect(districtQuery('ق', 'کابل')).toBeNull();
    expect(districtQuery('', 'کابل')).toBeNull();
  });

  const kabul = provinceByName('کابل');
  const feature = (lng: number, lat: number) => ({ geometry: { coordinates: [lng, lat] } });

  it('takes the first answer that is in the country and near the province', () => {
    expect(pickDistrictAnswer([feature(68.95, 34.6)], kabul)).toEqual([68.95, 34.6]);
    // a place of the same name in Herat is not Kabul's
    expect(pickDistrictAnswer([feature(62.2, 34.3), feature(68.95, 34.6)], kabul)).toEqual([68.95, 34.6]);
    // one in another country is no answer at all
    expect(pickDistrictAnswer([feature(74.3, 31.5), feature(-0.1, 51.5)], kabul)).toBeNull();
    expect(pickDistrictAnswer([{ geometry: { coordinates: ['x', 1] } }, {}], kabul)).toBeNull();
    expect(pickDistrictAnswer([], kabul)).toBeNull();
  });

  describe('asking Mapbox', () => {
    beforeEach(() => forgetDistricts());
    const reply = (features: unknown[], ok = true) => vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok, json: async () => ({ features }) }) as unknown as Response);

    it('sends the country, language, area limits and the province as the place to look near', async () => {
      const fetchImpl = reply([{ geometry: { coordinates: [68.95, 34.6] } }]);
      const at = await findDistrict('پغمان', 'کابل', 'pk.test', undefined, fetchImpl);
      expect(at).toEqual([68.95, 34.6]);
      const url = new URL(String(fetchImpl.mock.calls[0]![0]));
      expect(url.hostname).toBe('api.mapbox.com');
      expect(url.searchParams.get('country')).toBe('af');
      expect(url.searchParams.get('language')).toBe('fa');
      expect(url.searchParams.get('q')).toBe('پغمان، کابل، افغانستان');
      expect(url.searchParams.get('proximity')).toBe('69.17,34.53');
      expect(url.searchParams.get('bbox')).toBe('60.4,29.3,75,38.6');
      expect(url.searchParams.get('access_token')).toBe('pk.test');
    });

    it('asks once for the same question', async () => {
      const fetchImpl = reply([{ geometry: { coordinates: [68.95, 34.6] } }]);
      await findDistrict('پغمان', 'کابل', 'pk.test', undefined, fetchImpl);
      await findDistrict('پغمان', 'کابل', 'pk.test', undefined, fetchImpl);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('answers null, and does not ask, with no token or no usable name', async () => {
      const fetchImpl = reply([]);
      expect(await findDistrict('پغمان', 'کابل', '', undefined, fetchImpl)).toBeNull();
      expect(await findDistrict('', 'کابل', 'pk.test', undefined, fetchImpl)).toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('answers null when Mapbox refuses or cannot be reached, and asks again next time', async () => {
      expect(await findDistrict('پغمان', 'کابل', 'pk.test', undefined, reply([], false))).toBeNull();
      const failing = vi.fn(async () => {
        throw new Error('offline');
      });
      expect(await findDistrict('پغمان', 'کابل', 'pk.test', undefined, failing as unknown as typeof fetch)).toBeNull();
      const later = reply([{ geometry: { coordinates: [68.95, 34.6] } }]);
      expect(await findDistrict('پغمان', 'کابل', 'pk.test', undefined, later)).toEqual([68.95, 34.6]);
    });
  });
});

describe('zoom levels', () => {
  it('get closer from province to district to pin', () => {
    expect(PROVINCE_ZOOM).toBeLessThan(DISTRICT_ZOOM);
    expect(DISTRICT_ZOOM).toBeLessThan(PIN_ZOOM);
  });
});
