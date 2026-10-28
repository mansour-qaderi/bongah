import { describe, expect, it, vi } from 'vitest';
import {
  AREA_LABEL_MAX_ZOOM,
  EXTRUSION_LAYER_ID,
  EXTRUSION_MIN_ZOOM,
  FOOTPRINT_MIN_ZOOM,
  LABEL_COLORS,
  LABEL_HALO_WIDTH,
  MIN_VISIBLE_HEIGHT,
  NEIGHBORHOOD_LABEL_MIN_ZOOM,
  NON_STREET_CLASSES,
  POI_CLASS_COLORS,
  POI_LABELS_LAYER_ID,
  POI_LABELS_MIN_ZOOM,
  STREET_LABEL_MIN_ZOOM,
  STREET_NAMES_LAYER_ID,
  STREET_NAMES_MIN_ZOOM,
  STREET_NAME_SPACING,
  applyPlan,
  enhanceDetail,
  planDetail,
  type DetailLayer,
  type DetailMap,
} from '@/lib/map-detail';

const label = { 'text-field': ['coalesce', ['get', 'name'], ['get', 'name_en']] };
const alongRoad = { ...label, 'symbol-placement': 'line', 'text-size': 12 };

// The shape of Mapbox Streets v12: one vector source (`composite`), layers told apart by the tile layer they draw.
const streets = (): DetailLayer[] => [
  { id: 'land', type: 'background' },
  { id: 'landuse', type: 'fill', source: 'composite', 'source-layer': 'landuse' },
  { id: 'road-street', type: 'line', source: 'composite', 'source-layer': 'road' },
  { id: 'building', type: 'fill', source: 'composite', 'source-layer': 'building', minzoom: 15, paint: { 'fill-color': '#e9e6e0', 'fill-opacity': 0.5 } },
  { id: 'road-label', type: 'symbol', source: 'composite', 'source-layer': 'road', minzoom: 15, layout: alongRoad, paint: { 'text-color': '#444' } },
  { id: 'road-number-shield', type: 'symbol', source: 'composite', 'source-layer': 'road', layout: { 'icon-image': 'shield' } },
  { id: 'settlement-subdivision-label', type: 'symbol', source: 'composite', 'source-layer': 'place_label', minzoom: 14, maxzoom: 15, layout: label },
  { id: 'settlement-label', type: 'symbol', source: 'composite', 'source-layer': 'place_label', minzoom: 3, layout: label },
  { id: 'poi-label', type: 'symbol', source: 'composite', 'source-layer': 'poi_label', layout: label },
];

describe('building footprints', () => {
  it('shows them from the first zoom the tiles have them, with an outline', () => {
    const { changes } = planDetail(streets());
    const building = changes.find((c) => c.id === 'building')!;
    expect(building.minzoom).toBe(FOOTPRINT_MIN_ZOOM);
    expect(building.maxzoom).toBe(24);
    expect(building.paint).toHaveProperty('fill-outline-color');
    expect(building.paint).toHaveProperty('fill-opacity');
  });

  it('never makes a layer start later than the style had it', () => {
    const layers = streets().map((l) => (l.id === 'building' ? { ...l, minzoom: 12 } : l));
    expect(planDetail(layers).changes.find((c) => c.id === 'building')?.minzoom).toBeUndefined();
  });

  it('keeps the maximum zoom a layer already had', () => {
    const layers = streets().map((l) => (l.id === 'building' ? { ...l, maxzoom: 22 } : l));
    expect(planDetail(layers).changes.find((c) => c.id === 'building')?.maxzoom).toBe(22);
  });
});

describe('names', () => {
  it('shows street and alley names from an earlier zoom, and neighbourhood names too', () => {
    const { changes } = planDetail(streets());
    expect(changes.find((c) => c.id === 'road-label')?.minzoom).toBe(STREET_LABEL_MIN_ZOOM);
    expect(changes.find((c) => c.id === 'settlement-subdivision-label')?.minzoom).toBe(NEIGHBORHOOD_LABEL_MIN_ZOOM);
  });

  it('leaves everything else alone: other labels, road shields, roads, land', () => {
    const touched = planDetail(streets()).changes.map((c) => c.id);
    expect(touched.sort()).toEqual(['building', 'poi-label', 'road-label', 'settlement-label', 'settlement-subdivision-label']);
  });

  it('does not make a label start later when it already starts early enough', () => {
    const layers = streets().map((l) => (l.id === 'road-label' ? { ...l, minzoom: 10 } : l));
    expect(planDetail(layers).changes.find((c) => c.id === 'road-label')?.minzoom).toBeUndefined();
  });

  it('keeps area names on the map as far as it zooms in, so they are still there when 3D comes in to zoom 16', () => {
    const area = planDetail(streets()).changes.find((c) => c.id === 'settlement-subdivision-label')!;
    expect(area.maxzoom).toBe(AREA_LABEL_MAX_ZOOM);
    // A name that began early and only ended early gets its end moved and keeps its own start.
    const early = streets().map((l) => (l.id === 'settlement-subdivision-label' ? { ...l, minzoom: 10 } : l));
    expect(planDetail(early).changes.find((c) => c.id === 'settlement-subdivision-label')).toMatchObject({ minzoom: 10, maxzoom: AREA_LABEL_MAX_ZOOM });
  });

  it('widens the zoom range of the town name too, and gives it the same dark-on-white outlined look at every zoom', () => {
    const towns = streets().map((l) => (l.id === 'settlement-label' ? { ...l, maxzoom: 14 } : l));
    const town = planDetail(towns).changes.find((c) => c.id === 'settlement-label')!;
    expect(town).toMatchObject({ minzoom: 3, maxzoom: AREA_LABEL_MAX_ZOOM });
    expect(town.paint).toMatchObject({ 'text-color': LABEL_COLORS.light.text, 'text-halo-color': LABEL_COLORS.light.halo });
  });

  it('gives street and neighbourhood names a dark colour on a solid white outline, so they read over buildings and pale roads', () => {
    const { changes } = planDetail(streets());
    for (const id of ['road-label', 'settlement-subdivision-label']) {
      expect(changes.find((c) => c.id === id)!.paint).toEqual({
        'text-color': LABEL_COLORS.light.text,
        'text-halo-color': LABEL_COLORS.light.halo,
        'text-halo-width': LABEL_HALO_WIDTH,
        'text-halo-blur': 0.25,
      });
    }
  });

  it('turns the colours round for a dark map', () => {
    const paint = planDetail(streets(), { theme: 'dark' }).changes.find((c) => c.id === 'road-label')!.paint!;
    expect(paint).toMatchObject({ 'text-color': LABEL_COLORS.dark.text, 'text-halo-color': LABEL_COLORS.dark.halo });
  });

  it('keeps both colour pairs well above the AAA contrast level (7:1) between the text and its outline', () => {
    const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const theme of ['light', 'dark'] as const) expect(ratio(LABEL_COLORS[theme].text, LABEL_COLORS[theme].halo)).toBeGreaterThan(7);
  });

  it('leaves a road number on its coloured badge in the style’s own colours (dark text there would vanish)', () => {
    const layers = [...streets(), { id: 'road-number-shield-label', type: 'symbol', source: 'composite', 'source-layer': 'road', layout: { ...label, 'icon-image': 'shield', 'symbol-placement': 'line' } }];
    const plan = planDetail(layers);
    expect(plan.changes.find((c) => c.id === 'road-number-shield-label')?.paint).toBeUndefined();
    expect(plan.addNames?.before).toBe('road-label'); // the badge layer is never the one the extra street names are copied from
  });

  it('lets a street name bend along a curved street (names along streets only)', () => {
    const { changes } = planDetail(streets());
    expect(changes.find((c) => c.id === 'road-label')?.layout).toEqual({ 'text-letter-spacing': 0, 'text-max-angle': 45 });
  });

  it('sets no spacing between the letters of any name it touches: Persian letters join, spaced they fall apart', () => {
    const { changes, addNames, addPlaces } = planDetail(streets());
    for (const id of ['road-label', 'settlement-subdivision-label', 'settlement-label', 'poi-label']) {
      expect(changes.find((c) => c.id === id)?.layout).toMatchObject({ 'text-letter-spacing': 0 });
    }
    expect(addNames!.layer.layout).toMatchObject({ 'text-letter-spacing': 0 });
    expect(addPlaces!.layer.layout).toMatchObject({ 'text-letter-spacing': 0 });
    // A road number on its badge keeps the style's own look.
    expect(changes.find((c) => c.id === 'road-number-shield')).toBeUndefined();
  });
});

describe('more street names', () => {
  it('adds a copy of the style’s street-name layer that shows every named street and repeats names more often', () => {
    const { addNames } = planDetail(streets());
    expect(addNames?.before).toBe('road-label');
    expect(addNames?.layer).toMatchObject({
      id: STREET_NAMES_LAYER_ID,
      type: 'symbol',
      source: 'composite',
      'source-layer': 'road',
      minzoom: STREET_NAMES_MIN_ZOOM,
    });
    const layout = addNames!.layer.layout!;
    expect(layout['text-field']).toEqual(label['text-field']); // the same name logic (and language) as the style’s
    // Its own size by zoom, so alleys are not drawn at the style’s smallest.
    expect(layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], STREET_NAMES_MIN_ZOOM, 11, 17, 13, 20, 15]);
    expect(layout['symbol-spacing']).toBe(STREET_NAME_SPACING);
    expect(layout['symbol-placement']).toBe('line');
    expect(addNames!.layer.paint).toMatchObject({ 'text-color': LABEL_COLORS.light.text, 'text-halo-color': LABEL_COLORS.light.halo, 'text-halo-width': LABEL_HALO_WIDTH });
  });

  it('leaves out ferries, rails and the like, and anything without a name', () => {
    const filter = JSON.stringify(planDetail(streets()).addNames!.layer.filter);
    expect(filter).toContain('"has","name"');
    for (const kind of NON_STREET_CLASSES) expect(filter).toContain(kind);
  });

  it('goes under the style’s own street names, so those win when two collide', () => {
    const out = applyPlan(streets(), planDetail(streets()));
    const ids = out.map((l) => l.id);
    expect(ids.indexOf(STREET_NAMES_LAYER_ID)).toBe(ids.indexOf('road-label') - 1);
  });

  it('is not added twice, and not at all when the style has no street names along streets', () => {
    expect(planDetail(applyPlan(streets(), planDetail(streets()))).addNames).toBeNull();
    const none = streets().filter((l) => l.id !== 'road-label');
    expect(planDetail(none).addNames).toBeNull();
    const flat = streets().map((l) => (l.id === 'road-label' ? { ...l, layout: label } : l));
    expect(planDetail(flat).addNames).toBeNull();
  });
});

describe('more places (mosques, clinics, shops)', () => {
  it('adds a copy of the style’s place layer that shows every named place from zoom 14, keeping its icon and name logic', () => {
    const layers = streets().map((l) => (l.id === 'poi-label' ? { ...l, layout: { ...label, 'icon-image': ['get', 'maki'], 'text-size': 10 }, filter: ['<=', ['get', 'filterrank'], 1] } : l));
    const { addPlaces } = planDetail(layers);
    expect(addPlaces?.before).toBe('poi-label');
    expect(addPlaces?.layer).toMatchObject({ id: POI_LABELS_LAYER_ID, type: 'symbol', 'source-layer': 'poi_label', minzoom: POI_LABELS_MIN_ZOOM, filter: ['has', 'name'] });
    const layout = addPlaces!.layer.layout!;
    expect(layout['icon-image']).toEqual(['get', 'maki']);
    expect(layout['text-field']).toEqual(label['text-field']);
    expect(layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], POI_LABELS_MIN_ZOOM, 10.5, 17, 12.5, 20, 14]);
    expect(layout['text-allow-overlap']).toBe(false);
    expect(addPlaces!.layer.paint).toMatchObject({ 'text-halo-color': LABEL_COLORS.light.halo, 'text-halo-width': LABEL_HALO_WIDTH });
  });

  it('gives the style’s own place labels the outline, goes under them, and is not added twice', () => {
    const plan = planDetail(streets());
    expect(plan.changes.find((c) => c.id === 'poi-label')?.paint).toMatchObject({ 'text-halo-color': LABEL_COLORS.light.halo });
    const out = applyPlan(streets(), plan).map((l) => l.id);
    expect(out.indexOf(POI_LABELS_LAYER_ID)).toBe(out.indexOf('poi-label') - 1);
    expect(planDetail(applyPlan(streets(), plan)).addPlaces).toBeNull();
  });

  it('colours a name by what the place is (food, shops, medical, parks…), the plain dark grey for anything else', () => {
    const colour = planDetail(streets()).addPlaces!.layer.paint!['text-color'] as unknown[];
    expect(colour[0]).toBe('match');
    expect(colour[1]).toEqual(['get', 'class']);
    expect(colour[colour.length - 1]).toBe(LABEL_COLORS.light.text);
    const byClass = (cls: string) => {
      const at = colour.findIndex((v) => Array.isArray(v) && (v as string[]).includes(cls));
      return colour[at + 1];
    };
    expect(byClass('medical')).toBe('#991b1b');
    expect(byClass('food_and_drink')).toBe('#9a3412');
    expect(byClass('park_like')).toBe('#166534');
  });

  it('keeps every one of those colours above the AAA contrast level (7:1) against the white outline', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const color of Object.keys(POI_CLASS_COLORS)) {
      expect(1.05 / (luminance(color) + 0.05), color).toBeGreaterThanOrEqual(7);
    }
  });

  it('adds nothing when the style has no place labels', () => {
    expect(planDetail(streets().filter((l) => l.id !== 'poi-label')).addPlaces).toBeNull();
  });
});

describe('3D buildings', () => {
  it('adds a block layer on the style’s own building tiles, under the first label so names stay on top', () => {
    const { add } = planDetail(streets());
    expect(add?.layer).toMatchObject({ id: EXTRUSION_LAYER_ID, type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: EXTRUSION_MIN_ZOOM });
    expect(add?.before).toBe('road-label');
  });

  it('draws a building without a height as one storey, and a part that floats above its base', () => {
    const paint = planDetail(streets()).add!.layer.paint!;
    expect(JSON.stringify(paint['fill-extrusion-height'])).toContain(String(MIN_VISIBLE_HEIGHT));
    expect(JSON.stringify(paint['fill-extrusion-height'])).toContain('min_height');
    expect(JSON.stringify(paint['fill-extrusion-base'])).toContain('min_height');
  });

  it('lets the blocks grow out of the ground rather than pop up', () => {
    const paint = planDetail(streets()).add!.layer.paint!;
    const height = paint['fill-extrusion-height'] as unknown[];
    expect(height.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']]);
    expect(height[3]).toBe(EXTRUSION_MIN_ZOOM);
    expect(height[4]).toBe(0);
  });

  it('tunes a 3D layer the style already has instead of adding another', () => {
    const layers = [...streets(), { id: 'building-extrusion', type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: 16 }];
    const plan = planDetail(layers);
    expect(plan.add).toBeNull();
    expect(plan.changes.find((c) => c.id === 'building-extrusion')).toMatchObject({ minzoom: EXTRUSION_MIN_ZOOM });
  });

  it('is not added twice (a style that already got it)', () => {
    const first = applyPlan(streets(), planDetail(streets()));
    expect(planDetail(first).add).toBeNull();
  });

  it('is left out when asked for flat only, and a 3D layer of the style’s own is left as it is', () => {
    expect(planDetail(streets(), { extrude: false }).add).toBeNull();
    const own = [...streets(), { id: 'building-extrusion', type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: 16 }];
    expect(planDetail(own, { extrude: false }).changes.some((c) => c.id === 'building-extrusion')).toBe(false);
  });
});

describe('a style that is not Mapbox Streets', () => {
  it('is left exactly as it is (the OpenStreetMap fallback, a satellite style)', () => {
    const raster: DetailLayer[] = [
      { id: 'background', type: 'background' },
      { id: 'base', type: 'raster', source: 'base' },
    ];
    expect(planDetail(raster)).toEqual({ changes: [], add: null, addNames: null, addPlaces: null });
  });

  it('adds no 3D layer when it cannot tell which source the buildings are in', () => {
    const noBuildings = streets().filter((l) => l.id !== 'building');
    expect(planDetail(noBuildings).add).toBeNull();
  });
});

describe('applying the plan to a style', () => {
  it('changes the layers it planned, adds the block layer before the first label, and does not modify its input', () => {
    const input = streets();
    const snapshot = JSON.stringify(input);
    const out = applyPlan(input, planDetail(input));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out.find((l) => l.id === 'building')).toMatchObject({ minzoom: FOOTPRINT_MIN_ZOOM, paint: { 'fill-color': '#e9e6e0', 'fill-outline-color': '#cdc6b8' } });
    expect(out.find((l) => l.id === 'road-label')?.minzoom).toBe(STREET_LABEL_MIN_ZOOM);
    const ids = out.map((l) => l.id);
    expect(ids.indexOf(EXTRUSION_LAYER_ID)).toBe(ids.indexOf('road-label') - 2);
    expect(out).toHaveLength(input.length + 3);
    expect(out.find((l) => l.id === 'settlement-subdivision-label')).toMatchObject({ minzoom: NEIGHBORHOOD_LABEL_MIN_ZOOM, maxzoom: AREA_LABEL_MAX_ZOOM });
    expect(out.find((l) => l.id === 'road-label')?.layout).toMatchObject({ 'text-max-angle': 45, 'symbol-placement': 'line' });
  });

  it('puts the block layer on top when the style has no label at all', () => {
    const noLabels = streets().filter((l) => l.type !== 'symbol');
    expect(applyPlan(noLabels, planDetail(noLabels)).at(-1)?.id).toBe(EXTRUSION_LAYER_ID);
  });
});

describe('on a live map', () => {
  const fakeMap = (layers: DetailLayer[], failOn?: string) => {
    const calls: Record<string, unknown[][]> = { zoom: [], paint: [], layout: [], add: [] };
    const map: DetailMap = {
      getStyle: () => ({ layers }),
      getLayer: (id) => layers.find((l) => l.id === id),
      setLayerZoomRange: (...a) => {
        if (a[0] === failOn) throw new Error('refused');
        calls.zoom!.push(a);
      },
      setPaintProperty: (...a) => {
        calls.paint!.push(a);
      },
      setLayoutProperty: (...a) => {
        calls.layout!.push(a);
      },
      addLayer: (...a) => {
        calls.add!.push(a);
      },
    };
    return { map, calls };
  };

  it('sets zoom ranges and paint on the layers, and adds the blocks', () => {
    const { map, calls } = fakeMap(streets());
    const done = enhanceDetail(map);
    expect(done).toBe(8);
    expect(calls.zoom).toContainEqual(['building', FOOTPRINT_MIN_ZOOM, 24]);
    expect(calls.zoom).toContainEqual(['settlement-subdivision-label', NEIGHBORHOOD_LABEL_MIN_ZOOM, AREA_LABEL_MAX_ZOOM]);
    expect(calls.layout).toContainEqual(['road-label', 'text-max-angle', 45]);
    expect(calls.zoom).toContainEqual(['road-label', STREET_LABEL_MIN_ZOOM, 24]);
    expect(calls.paint!.some((c) => c[0] === 'building' && c[1] === 'fill-outline-color')).toBe(true);
    expect(calls.add).toHaveLength(3);
    expect((calls.add![2]![0] as DetailLayer).id).toBe(POI_LABELS_LAYER_ID);
    expect(calls.add![2]![1]).toBe('poi-label');
    expect((calls.add![0]![0] as DetailLayer).id).toBe(EXTRUSION_LAYER_ID);
    expect(calls.add![0]![1]).toBe('road-label');
    expect((calls.add![1]![0] as DetailLayer).id).toBe(STREET_NAMES_LAYER_ID);
    expect(calls.add![1]![1]).toBe('road-label');
  });

  it('skips a layer that refuses and carries on with the rest', () => {
    const { map, calls } = fakeMap(streets(), 'building');
    expect(enhanceDetail(map)).toBe(7);
    expect(calls.zoom!.some((c) => c[0] === 'road-label')).toBe(true);
  });

  it('survives a map that cannot add the layer', () => {
    const { map } = fakeMap(streets());
    map.addLayer = vi.fn(() => {
      throw new Error('bad expression');
    });
    expect(() => enhanceDetail(map)).not.toThrow();
  });

  it('keeps the 3D blocks and the places when only the extra street names are refused', () => {
    const { map, calls } = fakeMap(streets());
    map.addLayer = vi.fn((layer: never) => {
      if ((layer as DetailLayer).id === STREET_NAMES_LAYER_ID) throw new Error('bad expression');
      calls.add!.push([layer]);
    });
    expect(enhanceDetail(map)).toBe(7);
    expect(calls.add).toHaveLength(2);
  });

  it('does nothing when the style is not there yet', () => {
    const { map } = fakeMap([]);
    map.getStyle = () => undefined;
    expect(enhanceDetail(map)).toBe(0);
  });
});
