import i18next from 'i18next';
import { initI18n } from '../src/i18n';
import { GEOCODER_GAP_MS } from '../src/config';
import {
  addressQueries,
  findAddressLoosely,
  lookUpPlace,
  MAX_ADDRESS_QUERIES,
  placeFromAddress,
  provinceFromIsoCode,
} from '../src/map/geocode';
import {
  durationLabel,
  monthsFromInput,
  splitMonths,
} from '../src/screens/property/mortgage';
import { PROVINCES } from '../src/constants/provinces';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(() => jest.useRealTimers());

const reply = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
});
const hit = {
  lat: '34.53',
  lon: '69.17',
  boundingbox: ['34.5', '34.55', '69.1', '69.2'],
};
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));
const KABUL = { latitude: 34.53, longitude: 69.17 };

describe('the province of an address answer', () => {
  it('knows every province by its ISO code, in any case', () => {
    expect(provinceFromIsoCode('AF-KAB')?.id).toBe('kabul');
    expect(provinceFromIsoCode('af-nim')?.id).toBe('nimroz');
    expect(provinceFromIsoCode('AF-SAR')?.id).toBe('sar-e-pol');
    expect(provinceFromIsoCode('AF-XXX')).toBeNull();
    expect(provinceFromIsoCode(undefined)).toBeNull();
    // Every one of the 34 provinces has a code (no province can be missed by the fallback).
    const found = new Set(
      [
        'KAB',
        'HER',
        'BAL',
        'KAN',
        'NAN',
        'KDZ',
        'GHA',
        'BAM',
        'BDS',
        'TAK',
        'BGL',
        'PAR',
        'KAP',
        'PAN',
        'LOG',
        'WAR',
        'PIA',
        'PKA',
        'KHO',
        'LAG',
        'KNR',
        'NUR',
        'SAM',
        'SAR',
        'JOW',
        'FYB',
        'BDG',
        'GHO',
        'DAY',
        'URU',
        'ZAB',
        'HEL',
        'NIM',
        'FRA',
      ].map(code => provinceFromIsoCode(`AF-${code}`)?.id),
    );
    expect(found.size).toBe(PROVINCES.length);
    expect(found.has(undefined)).toBe(false);
  });

  it('falls back from "state" to "region", "state_district" and the ISO code instead of guessing the nearest capital', () => {
    const at = KABUL;
    expect(placeFromAddress({ state: 'Herat Province' }, at).province?.id).toBe(
      'herat',
    );
    // "state" is there but is not a province name: the next field decides, not the capital nearest the pin.
    const region = placeFromAddress(
      { state: 'Unknown', region: 'ولایت بلخ' },
      at,
    );
    expect(region.province?.id).toBe('balkh');
    expect(region.provinceApproximate).toBe(false);
    expect(
      placeFromAddress({ state_district: 'Kandahar Province' }, at).province
        ?.id,
    ).toBe('kandahar');
    const iso = placeFromAddress(
      { state: '???', 'ISO3166-2-lvl4': 'AF-HEL' },
      at,
    );
    expect(iso.province?.id).toBe('helmand');
    expect(iso.provinceApproximate).toBe(false);
    // Nothing at all: the nearest capital, said to be a guess.
    const none = placeFromAddress({ country: 'Afghanistan' }, at);
    expect(none.province?.id).toBe('kabul');
    expect(none.provinceApproximate).toBe(true);
  });

  it('reads the district, neighbourhood and street from the fields Afghan places use', () => {
    const place = placeFromAddress(
      {
        state_district: 'ولسوالی دهبوری',
        city_block: 'بلاک ۴',
        road: 'سرک اول',
      },
      KABUL,
    );
    expect(place).toMatchObject({
      district: 'ولسوالی دهبوری',
      neighborhood: 'بلاک ۴',
      street: 'سرک اول',
    });
  });
});

describe('asking the map about a spot', () => {
  it('asks once when the first answer says something about the place', async () => {
    fetchMock.mockResolvedValue(
      reply({ address: { state: 'Kabul', suburb: 'شهر نو' } }),
    );
    const place = await lookUpPlace(KABUL);
    expect(place.neighborhood).toBe('شهر نو');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urls()[0]).toContain('zoom=17');
  });

  it('asks again at district level when street level gives only the country, and uses the better answer', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(reply({ address: { country: 'Afghanistan' } }))
      .mockResolvedValueOnce(
        reply({ address: { state: 'Kabul', city_district: 'ناحیه پنجم' } }),
      );
    const pending = lookUpPlace(KABUL);
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS + 50);
    const place = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urls()[1]).toContain('zoom=13');
    expect(place.district).toBe('ناحیه پنجم');
    expect(place.answered).toBe(true);
  });

  it('waits the geocoder gap between the two questions', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(reply({ address: { country: 'Afghanistan' } }));
    const pending = lookUpPlace(KABUL);
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS - 100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await pending;
  });

  it('does not ask twice when the network is down, and still answers with the nearest province', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const place = await lookUpPlace(KABUL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(place).toMatchObject({ answered: false, provinceApproximate: true });
  });

  it('stops at once when the caller gives up', async () => {
    fetchMock.mockResolvedValue(reply({ address: { country: 'Afghanistan' } }));
    const abort = new AbortController();
    const pending = lookUpPlace(KABUL, abort.signal);
    abort.abort();
    await pending;
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('the questions asked for a written address', () => {
  it('drops the narrowest parts one at a time and keeps the province after each', () => {
    expect(
      addressQueries(
        'زرنج، ناحیه ۵، پهلوی شفاخانه ABC، داخل کوچه موتررو',
        'نیمروز',
      ),
    ).toEqual([
      'زرنج، ناحیه ۵، پهلوی شفاخانه ABC، داخل کوچه موتررو، نیمروز',
      'زرنج، ناحیه ۵، پهلوی شفاخانه ABC، نیمروز',
      'زرنج، ناحیه ۵، نیمروز',
      'زرنج، نیمروز',
    ]);
  });

  it('never asks more than the limit, and adds the first part alone when the list has room', () => {
    expect(addressQueries('الف، ب، ج، د، ه، و', 'کابل')).toHaveLength(
      MAX_ADDRESS_QUERIES,
    );
    expect(addressQueries('قلعه فتح‌الله', 'کابل')).toEqual([
      'قلعه فتح‌الله، کابل',
      'قلعه فتح‌الله',
    ]);
  });

  it('splits at Persian and Latin commas, drops blanks and repeats, and does not name the province twice', () => {
    expect(
      addressQueries(' شهر نو ,, شهر نو ،  کوچه ۳ ، کابل ', 'کابل'),
    ).toEqual(['شهر نو، کوچه ۳، کابل', 'شهر نو، کابل', 'شهر نو']);
    expect(addressQueries('   ', 'کابل')).toEqual([]);
    expect(addressQueries('شهر نو')).toEqual(['شهر نو']);
  });
});

describe('finding a written address the map only partly knows', () => {
  it('takes the first question that finds something, and says the whole address was understood', async () => {
    fetchMock.mockResolvedValue(reply([hit]));
    const found = await findAddressLoosely('شهر نو، کوچه ۳', 'کابل');
    expect(found).toMatchObject({ status: 'found', exact: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(urls()[0])).toContain('q=شهر نو، کوچه ۳، کابل');
    expect(urls()[0]).toContain('countrycodes=af');
  });

  it('asks again with less when the map has never heard of the whole address, a gap apart, and says it is not exact', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValueOnce(reply([hit]));
    const pending = findAddressLoosely(
      'زرنج، ناحیه ۵، پهلوی شفاخانه ABC',
      'نیمروز',
    );
    await jest.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS);
    const found = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(found).toMatchObject({ status: 'found', exact: false });
    expect(decodeURIComponent(urls()[2])).toContain('q=زرنج، نیمروز');
  });

  it('is "none" when every question came back empty, and "failed" at once when the network is down', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(reply([]));
    const pending = findAddressLoosely('الف، ب', 'کابل');
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS * MAX_ADDRESS_QUERIES);
    expect(await pending).toEqual({ status: 'none' });

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await findAddressLoosely('الف، ب', 'کابل')).toEqual({
      status: 'failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a place outside Afghanistan and goes on to the next question', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(reply([{ lat: '48.8', lon: '2.3' }]))
      .mockResolvedValueOnce(reply([hit]));
    const pending = findAddressLoosely('الف، ب', 'کابل');
    await jest.advanceTimersByTimeAsync(GEOCODER_GAP_MS + 50);
    expect(await pending).toMatchObject({ status: 'found', exact: false });
  });
});

describe('the mortgage length', () => {
  beforeAll(async () => {
    await initI18n();
  });

  it('is read in whole months, from months or from years', () => {
    expect(monthsFromInput('18', 'month')).toBe(18);
    expect(monthsFromInput('۲', 'year')).toBe(24);
    expect(monthsFromInput('۱٫۵', 'year')).toBe(18);
    expect(monthsFromInput('50', 'year')).toBe(600);
  });

  it('says empty for nothing and invalid for what cannot be a length', () => {
    expect(monthsFromInput('', 'month')).toBe('empty');
    expect(monthsFromInput('   ', 'year')).toBe('empty');
    expect(monthsFromInput('abc', 'month')).toBe('empty');
    expect(monthsFromInput('0', 'month')).toBe('invalid');
    expect(monthsFromInput('1.5', 'month')).toBe('invalid');
    expect(monthsFromInput('0.1', 'year')).toBe('invalid'); // 1.2 months
    expect(monthsFromInput('601', 'month')).toBe('invalid');
    expect(monthsFromInput('51', 'year')).toBe('invalid');
  });

  it('is written back as whole years when it is a round number of them', () => {
    expect(splitMonths(24)).toEqual({ text: '2', unit: 'year' });
    expect(splitMonths(18)).toEqual({ text: '18', unit: 'month' });
    expect(splitMonths(null)).toEqual({ text: '', unit: 'month' });
    expect(splitMonths(undefined)).toEqual({ text: '', unit: 'month' });
  });

  it('is said the way a person says it', () => {
    const t = i18next.t.bind(i18next);
    expect(durationLabel(6, t as never)).toBe('۶ ماه');
    expect(durationLabel(24, t as never)).toBe('۲ سال');
    expect(durationLabel(30, t as never)).toBe('۲ سال و ۶ ماه');
  });
});
