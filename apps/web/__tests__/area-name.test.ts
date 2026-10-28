import { describe, expect, it } from 'vitest';
import { areaKey, areaLabel, insideAfghanistan, matchProvince } from '@/lib/area-name';
import { DEFAULT_MAPBOX_STYLE, detailTheme, fallbackStyle, localizeLabel, lightStyle, localizeLabels, mapStyle, OSM_ATTRIBUTION, TILE_MAX_ZOOM, type LabelMap } from '@/lib/map-config';
import { nearestProvince, provinceLabel } from '@/lib/provinces';

const KABUL = { lat: 34.5281, lng: 69.1761 };
const HERAT = { lat: 34.3529, lng: 62.2040 };

describe('map style', () => {
  it('is Mapbox Streets by default', () => {
    expect(DEFAULT_MAPBOX_STYLE).toBe('mapbox://styles/mapbox/streets-v12');
    expect(mapStyle()).toBe(DEFAULT_MAPBOX_STYLE);
  });
  it('keeps no token in the source: it comes from NEXT_PUBLIC_MAPBOX_TOKEN', () => {
    expect(mapStyle()).not.toMatch(/pk\.|sk\.|access_token/);
    expect(JSON.stringify(fallbackStyle())).not.toMatch(/pk\.|sk\.|access_token/);
  });
  it('falls back to plain OpenStreetMap raster tiles, credited, which need no token', () => {
    const style = fallbackStyle();
    expect(style.sources.base).toMatchObject({ type: 'raster', tileSize: 256, attribution: OSM_ATTRIBUTION });
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'base']);
    expect(style).not.toHaveProperty('glyphs');
  });
  it('can be zoomed well past the stored tile levels', () => {
    expect(TILE_MAX_ZOOM).toBeGreaterThanOrEqual(19);
  });
});

describe('local-language labels', () => {
  const local = ['coalesce', ['get', 'name'], ['get', 'name_en']];
  it('puts the local name before the English one in Mapbox\'s default label expression', () => {
    const next = localizeLabel(['coalesce', ['get', 'name_en'], ['get', 'name']]) as unknown[];
    // The first thing tried is now the local name.
    expect(JSON.stringify(next)).toBe(JSON.stringify(['coalesce', local, ['get', 'name']]));
  });
  it('changes a bare English lookup and the old token form', () => {
    expect(localizeLabel(['get', 'name_en'])).toEqual(local);
    expect(localizeLabel('{name_en}')).toEqual(local);
  });
  it('leaves everything else in a label alone: formats, numbers, shields, local-only names', () => {
    const format = ['format', ['get', 'ref'], { 'font-scale': 0.8 }];
    expect(localizeLabel(format)).toEqual(format);
    expect(localizeLabel(['to-string', ['get', 'ref']])).toEqual(['to-string', ['get', 'ref']]);
    expect(localizeLabel(['get', 'name'])).toEqual(['get', 'name']);
    expect(localizeLabel('{name}')).toBe('{name}');
    expect(localizeLabel('Kabul')).toBe('Kabul');
  });
  it('rewrites a name inside a longer expression (a label with a second line)', () => {
    const next = localizeLabel(['format', ['coalesce', ['get', 'name_en'], ['get', 'name']], { 'font-scale': 1 }]);
    expect(JSON.stringify(next)).toContain('"coalesce",["coalesce",["get","name"],["get","name_en"]]');
  });

  it('is applied to every symbol layer of the loaded style, and only those that change', () => {
    const calls: Array<[string, string, unknown]> = [];
    const map: LabelMap = {
      getStyle: () => ({
        layers: [
          { id: 'place-label', type: 'symbol', layout: { 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']] } },
          { id: 'road-number', type: 'symbol', layout: { 'text-field': ['get', 'ref'] } },
          { id: 'icon-only', type: 'symbol', layout: {} },
          { id: 'water', type: 'fill' },
        ],
      }),
      setLayoutProperty: (id, name, value) => void calls.push([id, name, value]),
    };
    expect(localizeLabels(map)).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('place-label');
    expect(calls[0][1]).toBe('text-field');
  });
  it('survives a layer that refuses the change', () => {
    const map: LabelMap = {
      getStyle: () => ({ layers: [{ id: 'a', type: 'symbol', layout: { 'text-field': ['get', 'name_en'] } }] }),
      setLayoutProperty: () => {
        throw new Error('nope');
      },
    };
    expect(localizeLabels(map)).toBe(0);
  });
});

describe('nearestProvince', () => {
  it('finds the province whose capital is closest', () => {
    expect(nearestProvince(KABUL.lat, KABUL.lng).id).toBe('kabul');
    expect(nearestProvince(34.55, 69.2).id).toBe('kabul');
    expect(nearestProvince(HERAT.lat, HERAT.lng).id).toBe('herat');
    expect(nearestProvince(36.7, 67.1).id).toBe('balkh');
  });
});

describe('matchProvince', () => {
  it('reads the names a geocoder uses', () => {
    const kabul = nearestProvince(KABUL.lat, KABUL.lng);
    expect(matchProvince('Kabul Province')?.id).toBe(kabul.id);
    expect(matchProvince('kabul')?.id).toBe(kabul.id);
    expect(matchProvince(`ولایت ${kabul.name}`)?.id).toBe(kabul.id);
  });
  it('returns null for nothing or for places that are not provinces', () => {
    expect(matchProvince(undefined)).toBeNull();
    expect(matchProvince('')).toBeNull();
    expect(matchProvince('Atlantis')).toBeNull();
  });
});

describe('areaLabel', () => {
  const kabul = nearestProvince(KABUL.lat, KABUL.lng);
  it('joins neighbourhood, district and province', () => {
    expect(areaLabel({ neighborhood: 'شهر نو', district: 'ناحیه ۱۰', province: 'Kabul Province' }, KABUL, 'prs')).toBe(`شهر نو، ناحیه ۱۰، ${provinceLabel(kabul, 'prs')}`);
  });
  it('falls back to the nearest province when the geocoder knows nothing', () => {
    expect(areaLabel(null, KABUL, 'prs')).toBe(provinceLabel(kabul, 'prs'));
    expect(areaLabel({ province: null, district: null, neighborhood: null }, KABUL, 'ps')).toBe(provinceLabel(kabul, 'ps'));
  });
  it('does not say a name twice', () => {
    const name = provinceLabel(kabul, 'prs');
    expect(areaLabel({ province: 'Kabul', district: name, neighborhood: name }, KABUL, 'prs')).toBe(name);
  });
});

describe('areaKey / insideAfghanistan', () => {
  it('shares one key inside a neighbourhood and splits by language', () => {
    expect(areaKey(34.5281, 69.1761, 'prs')).toBe(areaKey(34.5339, 69.1780, 'prs'));
    expect(areaKey(34.5281, 69.1761, 'prs')).not.toBe(areaKey(34.5281, 69.1761, 'ps'));
  });
  it('knows the country box', () => {
    expect(insideAfghanistan(KABUL.lat, KABUL.lng)).toBe(true);
    expect(insideAfghanistan(48.85, 2.35)).toBe(false);
  });
});

describe('the map is always a light, daytime one', () => {
  it('uses a light style of the deployment’s own as it is', () => {
    expect(lightStyle('mapbox://styles/mapbox/light-v11')).toBe('mapbox://styles/mapbox/light-v11');
    expect(lightStyle('  mapbox://styles/acme/kabul-day  ')).toBe('mapbox://styles/acme/kabul-day');
  });
  it('ignores a dark or night style, and an empty setting, for Mapbox Streets', () => {
    for (const wanted of ['mapbox://styles/mapbox/dark-v11', 'mapbox://styles/mapbox/navigation-night-v1', 'mapbox://styles/acme/Night-Kabul', '', '   ', undefined, null]) {
      expect(lightStyle(wanted)).toBe(DEFAULT_MAPBOX_STYLE);
    }
  });
  it('draws names dark on white, whatever the style', () => {
    expect(detailTheme()).toBe('light');
  });
});
