import { AFGHANISTAN_BOUNDS } from '@bongah/shared-types';
import { normalizePlaceName, placeName } from '@bongah/validation';
import {
  PROVINCES,
  QUICK_PROVINCE_IDS,
  findProvince,
  provinceLabel,
  provinceValue,
} from '../src/constants/provinces';
import { provinceCamera } from '../src/map/geo';

describe('provinces', () => {
  it('lists all 34 provinces once', () => {
    expect(PROVINCES).toHaveLength(34);
    expect(new Set(PROVINCES.map(p => p.id)).size).toBe(34);
    expect(new Set(PROVINCES.map(provinceValue)).size).toBe(34);
  });

  it('stores names exactly as the API will normalise them', () => {
    for (const p of PROVINCES) {
      expect(provinceValue(p)).toBe(normalizePlaceName(provinceValue(p)));
      // The API validates `province` with placeName(60); a value it rejects could never be saved.
      expect({
        id: p.id,
        ok: placeName(60).safeParse(provinceValue(p)).success,
      }).toEqual({
        id: p.id,
        ok: true,
      });
    }
  });

  it('keeps every centre inside the bounds the API enforces on listing coordinates', () => {
    for (const p of PROVINCES) {
      expect(p.lat).toBeGreaterThanOrEqual(AFGHANISTAN_BOUNDS.minLat);
      expect(p.lat).toBeLessThanOrEqual(AFGHANISTAN_BOUNDS.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(AFGHANISTAN_BOUNDS.minLng);
      expect(p.lng).toBeLessThanOrEqual(AFGHANISTAN_BOUNDS.maxLng);
    }
  });

  it('has a name in both languages for every province', () => {
    for (const p of PROVINCES) {
      expect(p.name.prs.trim()).not.toBe('');
      expect(p.name.ps.trim()).not.toBe('');
    }
  });

  it('knows the launch cities', () => {
    for (const id of QUICK_PROVINCE_IDS) {
      expect(PROVINCES.some(p => p.id === id)).toBe(true);
    }
    expect(findProvince('بلخ')?.capital?.prs).toBe('مزار شریف');
  });

  it('finds a province whichever spelling was stored', () => {
    expect(findProvince('کابل')?.id).toBe('kabul');
    expect(findProvince(' كابل ')?.id).toBe('kabul'); // Arabic kaf
    expect(findProvince('ننګرهار')?.id).toBe('nangarhar'); // Pashto spelling
    expect(findProvince('Atlantis')).toBeUndefined();
    expect(findProvince(undefined)).toBeUndefined();
  });

  it('labels in the UI language and shows unknown values as stored', () => {
    expect(provinceLabel('ننگرهار', 'ps')).toBe('ننګرهار');
    expect(provinceLabel('ننگرهار', 'prs')).toBe('ننگرهار');
    expect(provinceLabel('جای دیگر', 'ps')).toBe('جای دیگر');
  });

  it('centres the map on the province (the map wants [longitude, latitude])', () => {
    const herat = findProvince('هرات')!;
    expect(provinceCamera(herat).center).toEqual([herat.lng, herat.lat]);
  });
});
