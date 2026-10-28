import { describe, expect, it, vi } from 'vitest';
import type { PlaceDetails } from '@bongah/shared-types';
import { lookupPlace, partsFromMapbox, planFill, type AutoFilled, type FormAddress } from '@/lib/reverse-address';

const HERAT = { lat: 34.3529, lng: 62.204 };
const empty: FormAddress = { province: '', district: '', neighborhood: '', address: '' };
const place = (over: Partial<PlaceDetails> = {}) => ({ province: 'Herat', district: 'ناحیه ۵', neighborhood: 'بهارستان', street: 'سرک آسیا', ...over });

describe('what the pin writes into the form', () => {
  it('fills an empty form: province (ours, by name), district, neighbourhood and the whole address line', () => {
    const plan = planFill(place(), empty, {}, HERAT);
    expect(plan.patch).toEqual({
      province: 'هرات',
      district: 'ناحیه ۵',
      neighborhood: 'بهارستان',
      address: 'هرات، ناحیه ۵، بهارستان، سرک آسیا',
    });
    expect(plan.line).toBe('هرات، ناحیه ۵، بهارستان، سرک آسیا');
    expect(plan.provinceGuessed).toBe(false);
    expect(plan.found).toBe(true);
    expect(plan.filled).toEqual(plan.patch);
  });

  it('never overwrites what the person wrote', () => {
    const typed: FormAddress = { province: 'کابل', district: 'پغمان', neighborhood: '', address: 'نزدیک مسجد' };
    const plan = planFill(place(), typed, {}, HERAT);
    expect(plan.patch).toEqual({ neighborhood: 'بهارستان' });
    expect(plan.filled).toEqual({ neighborhood: 'بهارستان' });
  });

  it('follows the pin when it moves, while a field still holds what the last lookup wrote', () => {
    const first = planFill(place(), empty, {}, HERAT);
    const now: FormAddress = { province: 'هرات', district: 'ناحیه ۵', neighborhood: 'بهارستان', address: first.patch.address! };
    const second = planFill(place({ district: 'ناحیه ۷', neighborhood: 'جبرئیل', street: 'سرک ۲' }), now, first.filled, HERAT);
    expect(second.patch).toEqual({ district: 'ناحیه ۷', neighborhood: 'جبرئیل', address: 'هرات، ناحیه ۷، جبرئیل، سرک ۲' });
  });

  it('lets go of a field the person edited after the last lookup', () => {
    const before: AutoFilled = { district: 'ناحیه ۵', address: 'هرات، ناحیه ۵' };
    const now: FormAddress = { province: 'هرات', district: 'ناحیه ۵', neighborhood: '', address: 'خانه من، کوچه ۳' };
    const plan = planFill(place(), now, before, HERAT);
    expect(plan.patch.address).toBeUndefined();
    expect(plan.filled.address).toBeUndefined();
    expect(plan.filled.district).toBe('ناحیه ۵');
  });

  it('guesses the province from the nearest capital only into an empty field, and says so', () => {
    const plan = planFill(place({ province: 'Nowhereland' }), empty, {}, HERAT);
    expect(plan.patch.province).toBe('هرات');
    expect(plan.provinceGuessed).toBe(true);
    const chosen = planFill(place({ province: 'Nowhereland' }), { ...empty, province: 'کابل' }, {}, HERAT);
    expect(chosen.patch.province).toBeUndefined();
    expect(chosen.provinceGuessed).toBe(false);
  });

  it('matches the geocoder\'s province however it writes it', () => {
    for (const written of ['Herat', 'Herat Province', 'ولایت هرات', 'هرات']) {
      expect(planFill(place({ province: written }), empty, {}, HERAT).patch.province).toBe('هرات');
    }
  });

  it('does nothing when the answer knows nothing, and keeps what was auto-filled before', () => {
    const before: AutoFilled = { district: 'x' };
    const none = planFill(null, empty, before, HERAT);
    expect(none).toMatchObject({ patch: {}, found: false, line: '' });
    expect(none.filled).toEqual(before);
    expect(planFill({ province: null, district: null, neighborhood: null, street: null }, empty, {}, HERAT).found).toBe(false);
  });

  it('writes no address line when all it knows is the province', () => {
    const plan = planFill({ province: 'Herat', district: null, neighborhood: null, street: null }, empty, {}, HERAT);
    expect(plan.patch).toEqual({ province: 'هرات' });
    expect(plan.line).toBe('');
  });
});

describe('Mapbox\'s own answer', () => {
  const body = {
    features: [
      {
        properties: {
          context: {
            region: { name: 'Herat' },
            place: { name: 'Herat' },
            locality: { name: ' Bahar  Estan ' },
            street: { name: 'Asia Street' },
          },
        },
      },
    ],
  };
  it('is read like the server reads it: district falls back to the place, neighbourhood to the locality', () => {
    expect(partsFromMapbox(body)).toEqual({ province: 'Herat', district: 'Herat', neighborhood: 'Bahar Estan', street: 'Asia Street' });
    expect(partsFromMapbox({ features: [] })).toBeNull();
    expect(partsFromMapbox(null)).toBeNull();
  });
});

describe('asking', () => {
  const details = (): PlaceDetails => ({ provider: 'google', title: '', address: '', lat: HERAT.lat, lng: HERAT.lng, province: 'Herat', district: 'ناحیه ۵', neighborhood: null, street: null });
  const mapboxResponse = (ok = true) =>
    vi.fn(async () => ({ ok, json: async () => ({ features: [{ properties: { context: { region: { name: 'Herat' }, street: { name: 'S' } } } }] }) }) as unknown as Response);

  it('takes the server\'s answer and does not bother Mapbox', async () => {
    const fetchImpl = mapboxResponse();
    const answer = await lookupPlace(HERAT, { language: 'prs', token: 'pk.x', server: async () => details(), fetchImpl: fetchImpl as never });
    expect(answer.source).toBe('server');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not ask again anywhere when the server says nothing is known there', async () => {
    const fetchImpl = mapboxResponse();
    const answer = await lookupPlace(HERAT, { language: 'prs', token: 'pk.x', server: async () => null, fetchImpl: fetchImpl as never });
    expect(answer).toEqual({ place: null, source: 'none' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks Mapbox directly, in the right language, when the server cannot answer', async () => {
    const fetchImpl = mapboxResponse();
    const answer = await lookupPlace(HERAT, {
      language: 'ps',
      token: 'pk.x',
      server: async () => {
        throw new Error('503');
      },
      fetchImpl: fetchImpl as never,
    });
    expect(answer.source).toBe('mapbox');
    expect(answer.place?.street).toBe('S');
    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/search/geocode/v6/reverse');
    expect(url.searchParams.get('language')).toBe('ps');
    expect(url.searchParams.get('latitude')).toBe(String(HERAT.lat));
    expect(url.searchParams.get('longitude')).toBe(String(HERAT.lng));
    expect(url.searchParams.get('access_token')).toBe('pk.x');
  });

  it('gives nothing, never an error, when everything fails or there is no token', async () => {
    const down = async () => {
      throw new Error('offline');
    };
    expect((await lookupPlace(HERAT, { language: 'prs', token: '', server: down })).source).toBe('none');
    expect((await lookupPlace(HERAT, { language: 'prs', token: 'pk.x', server: down, fetchImpl: mapboxResponse(false) as never })).source).toBe('none');
    expect((await lookupPlace(HERAT, { language: 'prs', token: 'pk.x', server: down, fetchImpl: (async () => { throw new Error('x'); }) as never })).source).toBe('none');
  });

  it('does not ask about a place outside Afghanistan, nor after being cancelled', async () => {
    const server = vi.fn(async () => details());
    expect((await lookupPlace({ lat: 51.5, lng: -0.12 }, { language: 'prs', token: 'pk.x', server })).source).toBe('none');
    expect(server).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = mapboxResponse();
    const answer = await lookupPlace(HERAT, {
      language: 'prs',
      token: 'pk.x',
      signal: controller.signal,
      server: async () => {
        throw new Error('aborted');
      },
      fetchImpl: fetchImpl as never,
    });
    expect(answer.source).toBe('none');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
