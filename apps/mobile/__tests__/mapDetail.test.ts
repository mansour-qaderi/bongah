import {
  AREA_LABEL_MAX_ZOOM,
  EXTRUSION_LAYER_ID,
  EXTRUSION_MIN_ZOOM,
  FOOTPRINT_MIN_ZOOM,
  LABEL_COLORS,
  LABEL_HALO_WIDTH,
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
  enhanceStyle,
  planDetail,
  type DetailLayer,
} from '../src/map/detail';
import type { StyleSpecification } from '../src/map/style';

const label = { 'text-field': ['coalesce', ['get', 'name'], ['get', 'name_en']] };
const alongRoad = { ...label, 'symbol-placement': 'line', 'text-size': 12 };

// The shape of Mapbox Streets v12: one vector source, layers told apart by the tile layer they draw.
const streets = (): DetailLayer[] => [
  { id: 'land', type: 'background' },
  { id: 'road-street', type: 'line', source: 'composite', 'source-layer': 'road' },
  {
    id: 'building',
    type: 'fill',
    source: 'composite',
    'source-layer': 'building',
    minzoom: 15,
    paint: { 'fill-color': '#e9e6e0' },
  },
  {
    id: 'road-label',
    type: 'symbol',
    source: 'composite',
    'source-layer': 'road',
    minzoom: 15,
    layout: alongRoad,
    paint: { 'text-color': '#444' },
  },
  {
    id: 'road-number-shield',
    type: 'symbol',
    source: 'composite',
    'source-layer': 'road',
    layout: { 'icon-image': 'shield' },
  },
  {
    id: 'settlement-subdivision-label',
    type: 'symbol',
    source: 'composite',
    'source-layer': 'place_label',
    minzoom: 14,
    maxzoom: 15,
    layout: label,
  },
  {
    id: 'settlement-label',
    type: 'symbol',
    source: 'composite',
    'source-layer': 'place_label',
    minzoom: 3,
    layout: label,
  },
];

const style = (layers: DetailLayer[]): StyleSpecification => ({
  version: 8,
  sources: { composite: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' } },
  layers,
});

describe('the city in more detail', () => {
  it('shows building footprints, with an outline, from the first zoom the tiles have them', () => {
    const building = planDetail(streets()).changes.find(c => c.id === 'building');
    expect(building?.minzoom).toBe(FOOTPRINT_MIN_ZOOM);
    expect(building?.paint).toHaveProperty('fill-outline-color');
  });

  it('shows street, alley and neighbourhood names from earlier zooms, and touches nothing else', () => {
    const { changes } = planDetail(streets());
    expect(changes.find(c => c.id === 'road-label')?.minzoom).toBe(STREET_LABEL_MIN_ZOOM);
    expect(changes.find(c => c.id === 'settlement-subdivision-label')?.minzoom).toBe(NEIGHBORHOOD_LABEL_MIN_ZOOM);
    expect(changes.map(c => c.id).sort()).toEqual(['building', 'road-label', 'settlement-label', 'settlement-subdivision-label']);
  });

  it('never makes a layer start later than the style had it', () => {
    const layers = streets().map(l => (l.id === 'building' ? { ...l, minzoom: 12 } : l));
    expect(planDetail(layers).changes.find(c => c.id === 'building')?.minzoom).toBeUndefined();
  });

  it('adds 3D blocks under the first label only when asked for (the default), and tunes a layer the style already has', () => {
    const add = planDetail(streets()).add;
    expect(add?.layer).toMatchObject({
      id: EXTRUSION_LAYER_ID,
      type: 'fill-extrusion',
      source: 'composite',
      minzoom: EXTRUSION_MIN_ZOOM,
    });
    expect(add?.before).toBe('road-label');
    expect(planDetail(streets(), { extrude: false }).add).toBeNull();
    const own = [
      ...streets(),
      {
        id: 'building-extrusion',
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        minzoom: 16,
      },
    ];
    expect(planDetail(own).add).toBeNull();
    expect(planDetail(own).changes.find(c => c.id === 'building-extrusion')?.minzoom).toBe(EXTRUSION_MIN_ZOOM);
  });

  it('is applied to a style without changing the one it was given', () => {
    const input = streets();
    const snapshot = JSON.stringify(input);
    const out = applyPlan(input, planDetail(input));
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out.find(l => l.id === 'building')).toMatchObject({
      minzoom: FOOTPRINT_MIN_ZOOM,
      paint: { 'fill-color': '#e9e6e0', 'fill-outline-color': '#cdc6b8' },
    });
    const ids = out.map(l => l.id);
    expect(ids.indexOf(EXTRUSION_LAYER_ID)).toBe(ids.indexOf('road-label') - 2);
    expect(ids.indexOf(STREET_NAMES_LAYER_ID)).toBe(ids.indexOf('road-label') - 1);
    expect(out.find(l => l.id === 'settlement-subdivision-label')).toMatchObject({
      minzoom: NEIGHBORHOOD_LABEL_MIN_ZOOM,
      maxzoom: AREA_LABEL_MAX_ZOOM,
    });
    expect(out.find(l => l.id === 'road-label')?.layout).toMatchObject({
      'text-max-angle': 45,
      'symbol-placement': 'line',
    });
  });

  it('is not added twice', () => {
    const once = applyPlan(streets(), planDetail(streets()));
    expect(planDetail(once).add).toBeNull();
  });
});

describe('names that are easier to find', () => {
  it('keeps area names on the map as far as it zooms in, so they are still there in the 3D view (zoom 16)', () => {
    const area = planDetail(streets()).changes.find(c => c.id === 'settlement-subdivision-label');
    expect(area?.maxzoom).toBe(AREA_LABEL_MAX_ZOOM);
    const early = streets().map(l => (l.id === 'settlement-subdivision-label' ? { ...l, minzoom: 10 } : l));
    expect(planDetail(early).changes.find(c => c.id === 'settlement-subdivision-label')).toMatchObject({
      minzoom: 10,
      maxzoom: AREA_LABEL_MAX_ZOOM,
    });
  });

  it('widens the town name’s zoom range, and gives it the same dark-on-white outlined look at every zoom', () => {
    const towns = streets().map(l => (l.id === 'settlement-label' ? { ...l, maxzoom: 14 } : l));
    const town = planDetail(towns).changes.find(c => c.id === 'settlement-label');
    expect(town).toMatchObject({ minzoom: 3, maxzoom: AREA_LABEL_MAX_ZOOM });
    expect(town?.paint).toMatchObject({ 'text-color': LABEL_COLORS.light.text, 'text-halo-color': LABEL_COLORS.light.halo });
  });

  it('gives street and neighbourhood names a dark colour on a solid white outline', () => {
    const { changes } = planDetail(streets());
    for (const id of ['road-label', 'settlement-subdivision-label']) {
      expect(changes.find(c => c.id === id)?.paint).toEqual({
        'text-color': LABEL_COLORS.light.text,
        'text-halo-color': LABEL_COLORS.light.halo,
        'text-halo-width': LABEL_HALO_WIDTH,
        'text-halo-blur': 0.25,
      });
    }
  });

  it('turns the colours round for a dark map', () => {
    const paint = planDetail(streets(), { theme: 'dark' }).changes.find(c => c.id === 'road-label')?.paint;
    expect(paint).toMatchObject({ 'text-color': LABEL_COLORS.dark.text, 'text-halo-color': LABEL_COLORS.dark.halo });
  });

  it('keeps both colour pairs well above the AAA contrast level (7:1)', () => {
    const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const theme of ['light', 'dark'] as const) {
      expect(ratio(LABEL_COLORS[theme].text, LABEL_COLORS[theme].halo)).toBeGreaterThan(7);
    }
  });

  it('leaves a road number on its coloured badge in the style’s own colours', () => {
    const layers = [
      ...streets(),
      { id: 'road-number-shield-label', type: 'symbol', source: 'composite', 'source-layer': 'road', layout: { ...label, 'icon-image': 'shield', 'symbol-placement': 'line' } },
    ];
    const plan = planDetail(layers);
    expect(plan.changes.find(c => c.id === 'road-number-shield-label')?.paint).toBeUndefined();
    expect(plan.addNames?.before).toBe('road-label');
  });

  it('adds a copy of the street-name layer that shows every named street and repeats names more often', () => {
    const { addNames } = planDetail(streets());
    expect(addNames?.before).toBe('road-label');
    expect(addNames?.layer).toMatchObject({
      id: STREET_NAMES_LAYER_ID,
      type: 'symbol',
      'source-layer': 'road',
      minzoom: STREET_NAMES_MIN_ZOOM,
    });
    const layout = addNames?.layer.layout ?? {};
    expect(layout['text-field']).toEqual(label['text-field']);
    expect(layout['symbol-spacing']).toBe(STREET_NAME_SPACING);
    const filter = JSON.stringify(addNames?.layer.filter);
    expect(filter).toContain('"has","name"');
    for (const kind of NON_STREET_CLASSES) expect(filter).toContain(kind);
  });

  it('adds it once, and only when the style has street names along streets', () => {
    expect(planDetail(applyPlan(streets(), planDetail(streets()))).addNames).toBeNull();
    expect(planDetail(streets().filter(l => l.id !== 'road-label')).addNames).toBeNull();
    const flat = streets().map(l => (l.id === 'road-label' ? { ...l, layout: label } : l));
    expect(planDetail(flat).addNames).toBeNull();
  });
});

describe('more places (mosques, clinics, shops)', () => {
  const withPlaces = (): DetailLayer[] => [
    ...streets(),
    {
      id: 'poi-label',
      type: 'symbol',
      source: 'composite',
      'source-layer': 'poi_label',
      layout: { ...label, 'icon-image': ['get', 'maki'], 'text-size': 10 },
      filter: ['<=', ['get', 'filterrank'], 1],
    },
  ];

  it('adds a copy of the style’s place layer that shows every named place from zoom 14, keeping its icon and name logic', () => {
    const { addPlaces } = planDetail(withPlaces());
    expect(addPlaces?.before).toBe('poi-label');
    expect(addPlaces?.layer).toMatchObject({
      id: POI_LABELS_LAYER_ID,
      type: 'symbol',
      'source-layer': 'poi_label',
      minzoom: POI_LABELS_MIN_ZOOM,
      filter: ['has', 'name'],
    });
    const layout = addPlaces!.layer.layout!;
    expect(layout['icon-image']).toEqual(['get', 'maki']);
    expect(layout['text-field']).toEqual(label['text-field']);
    expect(layout['text-size']).toEqual(['interpolate', ['linear'], ['zoom'], POI_LABELS_MIN_ZOOM, 10.5, 17, 12.5, 20, 14]);
    expect(layout['text-allow-overlap']).toBe(false);
    expect(addPlaces!.layer.paint).toMatchObject({
      'text-halo-color': LABEL_COLORS.light.halo,
      'text-halo-width': LABEL_HALO_WIDTH,
    });
  });

  it('colours a name by what the place is, the plain dark grey for anything else, every colour above 7:1 on the white outline', () => {
    const colour = planDetail(withPlaces()).addPlaces!.layer.paint!['text-color'] as unknown[];
    expect(colour[0]).toBe('match');
    expect(colour[colour.length - 1]).toBe(LABEL_COLORS.light.text);
    const byClass = (cls: string) => colour[colour.findIndex(v => Array.isArray(v) && (v as string[]).includes(cls)) + 1];
    expect(byClass('medical')).toBe('#991b1b');
    expect(byClass('food_and_drink')).toBe('#9a3412');
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5]
        .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const color of Object.keys(POI_CLASS_COLORS)) {
      expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(7);
    }
  });

  it('sets no spacing between letters on any name it touches (Persian letters join; spaced they fall apart)', () => {
    const { changes, addNames, addPlaces } = planDetail(withPlaces());
    for (const id of ['road-label', 'settlement-subdivision-label', 'settlement-label', 'poi-label']) {
      expect(changes.find(c => c.id === id)?.layout).toMatchObject({ 'text-letter-spacing': 0 });
    }
    expect(addNames!.layer.layout).toMatchObject({ 'text-letter-spacing': 0 });
    expect(addPlaces!.layer.layout).toMatchObject({ 'text-letter-spacing': 0 });
  });

  it('gives the style’s own place labels the outline, goes under them, and is not added twice', () => {
    const plan = planDetail(withPlaces());
    expect(plan.changes.find(c => c.id === 'poi-label')?.paint).toMatchObject({ 'text-halo-color': LABEL_COLORS.light.halo });
    const out = applyPlan(withPlaces(), plan);
    const ids = out.map(l => l.id);
    expect(ids.indexOf(POI_LABELS_LAYER_ID)).toBe(ids.indexOf('poi-label') - 1);
    expect(planDetail(out).addPlaces).toBeNull();
  });

  it('adds nothing when the style has no place labels, and counts the new layer in enhanceStyle', () => {
    expect(planDetail(streets()).addPlaces).toBeNull();
    const { style: out, changed } = enhanceStyle(style(withPlaces()), { extrude: false });
    expect(out.layers.some(l => l.id === POI_LABELS_LAYER_ID)).toBe(true);
    expect(changed).toBe(7); // five adjusted layers (the place layer too), the extra street names, the extra places
  });
});

describe('enhanceStyle (what the phone app does to the style it downloads)', () => {
  it('draws footprints and earlier names but no 3D blocks when asked for flat', () => {
    const input = style(streets());
    const { style: out, changed } = enhanceStyle(input, { extrude: false });
    expect(changed).toBe(5); // four adjusted layers and the extra street names
    expect(out.layers.some(l => l.id === EXTRUSION_LAYER_ID)).toBe(false);
    expect(out.layers.some(l => l.id === STREET_NAMES_LAYER_ID)).toBe(true);
    expect(out.layers.find(l => l.id === 'building')?.minzoom).toBe(FOOTPRINT_MIN_ZOOM);
    expect(out.sources).toBe(input.sources);
    expect(input.layers.find(l => l.id === 'building')?.minzoom).toBe(15);
  });

  it('returns the very same style when it is not one it knows (nothing to adjust)', () => {
    const raster = style([{ id: 'basemap', type: 'raster', source: 'basemap' }]);
    expect(enhanceStyle(raster)).toEqual({ style: raster, changed: 0 });
    expect(enhanceStyle(raster).style).toBe(raster);
  });
});
