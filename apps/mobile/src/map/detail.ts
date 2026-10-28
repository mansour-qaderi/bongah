/**
 * More of the city on the map: building footprints from the earliest zoom the tiles have them, street / alley and
 * neighbourhood names earlier, and (on request) buildings as 3D blocks.
 *
 * Mapbox Streets is a finished style: this does not replace it, it adjusts the layers it recognises by what they are
 * (the tile layer they draw: «building», «road», «place_label»), never by name alone, so a style that is not Streets (the
 * plain OpenStreetMap fallback) is left exactly as it was. Anything unexpected is skipped: the map is never worse for it.
 *
 * The planning part is pure (a list of layers in, a plan out) and is written the same way on the website
 * (apps/web/lib/map-detail.ts, which applies the plan to the live map): keep the two in step.
 *
 * What the tiles cannot give: Mapbox Streets has no neighbourhood *boundaries* (only country and province borders), so
 * neighbourhoods are shown by their names; and building heights are whatever the tiles carry, which in much of the
 * country is little (hence MIN_VISIBLE_HEIGHT: a drawing choice so a building is a block, not a sheet, not data).
 */

export interface DetailLayer {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  minzoom?: number;
  maxzoom?: number;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  filter?: unknown;
  [key: string]: unknown;
}

/** Mapbox Streets has buildings from this zoom on: a footprint is shown from there instead of from the style's later zoom. */
export const FOOTPRINT_MIN_ZOOM = 13;
/** Blocks start to rise here and are full height half a zoom level later. */
export const EXTRUSION_MIN_ZOOM = 14;
/** Street, lane and alley names. (The style's own density rules still decide which fit.) */
export const STREET_LABEL_MIN_ZOOM = 13;
/** Neighbourhood and suburb names. */
export const NEIGHBORHOOD_LABEL_MIN_ZOOM = 12;
/**
 * Area names (neighbourhood, suburb, town) stay on the map up to here. Mapbox Streets stops drawing some of them a few
 * zoom levels before the map's own limit, which is exactly where the 3D view sits (it comes in to zoom 16): the names
 * that told the person where they are were gone just when the buildings appeared.
 */
export const AREA_LABEL_MAX_ZOOM = 24;
/** The extra street-name layer this adds starts here (the style's own street names start at STREET_LABEL_MIN_ZOOM). */
export const STREET_NAMES_MIN_ZOOM = 14;
/** The extra street-name layer's id. */
export const STREET_NAMES_LAYER_ID = "bongah-street-names";
/** Pixels between two repeats of one street's name along the street (the style's own is about 250). */
export const STREET_NAME_SPACING = 140;
/** A name may bend along a street up to this many degrees per character (the style's default is 45; kept explicit). */
export const STREET_NAME_MAX_ANGLE = 45;
/**
 * Places (mosques, clinics, shops, cafes, schools): the extra place layer this adds starts here. Mapbox Streets shows a
 * place only when its rank passes a bar that rises with the zoom, so at street level most of the named places the tiles
 * do carry are left off; this layer shows every named one the labels can fit.
 */
export const POI_LABELS_MIN_ZOOM = 14;
/** The extra place layer's id. */
export const POI_LABELS_LAYER_ID = "bongah-poi-labels";
/** The place layer's own text size by zoom (pixels): the style's smallest are 10 or less, hard to read on a phone. */
const POI_TEXT_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  POI_LABELS_MIN_ZOOM,
  10.5,
  17,
  12.5,
  20,
  14,
] as const;
/** The extra street-name layer's text size by zoom: alleys are drawn at the style's smallest size otherwise. */
const STREET_NAME_TEXT_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  STREET_NAMES_MIN_ZOOM,
  11,
  17,
  13,
  20,
  15,
] as const;
/** The outline that keeps a name readable over buildings, roads and busy ground, in pixels. */
export const LABEL_HALO_WIDTH = 2.5;
/** Whether the base map is light (Mapbox Streets, Light) or dark (Dark, or a dark style of the operator's own). */
export type DetailTheme = "light" | "dark";
/**
 * Street and neighbourhood name colours. The style's own greys (about #666 on a pale ground, with a thin translucent
 * outline) were hard to read over buildings and pale roads; these are near-black on a white outline (light) or
 * near-white on a near-black one (dark), each better than 7:1 against its outline, which is the AAA level for text.
 */
export const LABEL_COLORS: Record<DetailTheme, { text: string; halo: string }> =
  {
    light: { text: "#1f2937", halo: "#ffffff" },
    dark: { text: "#f3f4f6", halo: "#111827" },
  };
/**
 * A place's name is drawn in the colour of what it is, as on Google Maps (food orange, shops blue, medical red, parks
 * green, lodging pink, culture purple), each a dark shade: better than 7:1 against the white outline (checked in the
 * tests). Anything else (a mosque, a school, an office) keeps the plain dark grey.
 */
export const POI_CLASS_COLORS: Readonly<Record<string, readonly string[]>> = {
  "#9a3412": ["food_and_drink", "food_and_drink_stores"],
  "#1e40af": ["store_like", "commercial_services"],
  "#991b1b": ["medical"],
  "#166534": ["park_like"],
  "#9d174d": ["lodging"],
  "#6b21a8": ["arts_and_entertainment", "historic", "landmark"],
  "#115e59": ["sport_and_leisure"],
};
const POI_TEXT_COLOR = [
  "match",
  ["get", "class"],
  ...Object.entries(POI_CLASS_COLORS).flatMap(([color, classes]) => [
    [...classes],
    color,
  ]),
  LABEL_COLORS.light.text,
] as const;
/**
 * Arabic-script letters join: spacing between letters (the style sets some on place and road names) pulls a word apart
 * into separate letters, so every name this touches is set with none.
 */
const NO_LETTER_SPACING = { "text-letter-spacing": 0 } as const;
/** Road kinds that are not streets: no names for ferries, rails and the like. */
export const NON_STREET_CLASSES = [
  "ferry",
  "ferry_auto",
  "aerialway",
  "major_rail",
  "minor_rail",
  "service_rail",
  "golf",
] as const;
/** A building with no height in the tiles is drawn this tall (metres): one storey, so it reads as a block. */
export const MIN_VISIBLE_HEIGHT = 3;
/** The 3D layer this adds, when the style has none of its own. */
export const EXTRUSION_LAYER_ID = "bongah-buildings-3d";

const FOOTPRINT_PAINT = {
  "fill-opacity": [
    "interpolate",
    ["linear"],
    ["zoom"],
    FOOTPRINT_MIN_ZOOM,
    0.6,
    16,
    1,
  ],
  "fill-outline-color": "#cdc6b8",
} as const;

const heightOf = [
  "max",
  ["to-number", ["get", "height"], 0],
  ["to-number", ["get", "min_height"], 0],
  MIN_VISIBLE_HEIGHT,
];
const rise = (value: unknown) => [
  "interpolate",
  ["linear"],
  ["zoom"],
  EXTRUSION_MIN_ZOOM,
  0,
  EXTRUSION_MIN_ZOOM + 0.6,
  value,
];

const EXTRUSION_PAINT = {
  "fill-extrusion-color": [
    "interpolate",
    ["linear"],
    ["zoom"],
    EXTRUSION_MIN_ZOOM,
    "#ebe7df",
    17,
    "#ddd6c9",
  ],
  "fill-extrusion-height": rise(heightOf),
  "fill-extrusion-base": rise(["to-number", ["get", "min_height"], 0]),
  "fill-extrusion-opacity": 0.85,
  "fill-extrusion-vertical-gradient": true,
} as const;

export interface DetailOptions {
  /** Draw buildings as 3D blocks (default true). Without it only the flat footprints and the labels change. */
  extrude?: boolean;
  /** Which colours the names get (default 'light': Mapbox Streets, the style both apps use). */
  theme?: DetailTheme;
}

export interface LayerChange {
  id: string;
  /** The zoom the layer starts at, with the `maxzoom` it keeps (a zoom range is always set as a pair). */
  minzoom?: number;
  maxzoom?: number;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export interface DetailPlan {
  changes: LayerChange[];
  /** A layer to add, and the id of the layer it goes in front of (the first label, so names stay on top); none: on top. */
  add: { layer: DetailLayer; before?: string } | null;
  /**
   * More street names: a copy of the style's own street-name layer that shows every named street (the style's shows
   * the bigger ones first) and repeats a name more often along a long street. It goes just under the original so the
   * style's own labels keep their place when two collide.
   */
  addNames: { layer: DetailLayer; before: string } | null;
  /**
   * More places: a copy of the style's own place-label layer (same icon and name, so a mosque keeps its mosque mark)
   * that shows every named place, smallest rank last, under the original so the original keeps its place on a clash.
   */
  addPlaces: { layer: DetailLayer; before: string } | null;
}

/** The place-name layers whose zoom range is widened: neighbourhoods and the towns around them. */
const AREA_LAYER = /subdivision|neighbou?rhood|suburb|settlement/i;
/** The paint that makes a name stand out: its colour, and a solid outline in the opposite one. */
const labelPaint = (theme: DetailTheme) =>
  ({
    "text-color": LABEL_COLORS[theme].text,
    "text-halo-color": LABEL_COLORS[theme].halo,
    "text-halo-width": LABEL_HALO_WIDTH,
    "text-halo-blur": 0.25,
  } as const);

/** What to change in a list of style layers (a style's, or a live map's) to show the city in detail. Pure. */
export function planDetail(
  layers: readonly DetailLayer[],
  { extrude = true, theme = "light" }: DetailOptions = {}
): DetailPlan {
  const HALO = labelPaint(theme);
  const changes: LayerChange[] = [];
  let buildingSource: string | undefined;
  let hasExtrusion = false;
  let firstLabel: string | undefined;
  let streetNames: DetailLayer | undefined;
  let placeNames: DetailLayer | undefined;

  const earlier = (layer: DetailLayer, zoom: number): LayerChange | null => {
    // Only ever earlier: a layer that already starts sooner keeps its own zoom.
    if ((layer.minzoom ?? 0) <= zoom) return null;
    return { id: layer.id, minzoom: zoom, maxzoom: layer.maxzoom ?? 24 };
  };
  /** An area name starts no later than `zoom` and stays up to AREA_LABEL_MAX_ZOOM; null when it already does both. */
  const areaRange = (layer: DetailLayer, zoom: number): LayerChange | null => {
    const startsLate = (layer.minzoom ?? 0) > zoom;
    const endsEarly = (layer.maxzoom ?? 24) < AREA_LABEL_MAX_ZOOM;
    if (!startsLate && !endsEarly) return null;
    return {
      id: layer.id,
      minzoom: startsLate ? zoom : layer.minzoom ?? 0,
      maxzoom: AREA_LABEL_MAX_ZOOM,
    };
  };
  const merge = (
    id: string,
    change: LayerChange | null,
    paint?: Record<string, unknown>,
    layout?: Record<string, unknown>
  ) => {
    if (!change && !paint && !layout) return;
    const existing = changes.find((c) => c.id === id);
    const next: LayerChange = {
      ...(existing ?? { id }),
      ...(change ?? {}),
      ...(paint ? { paint: { ...existing?.paint, ...paint } } : {}),
      ...(layout ? { layout: { ...existing?.layout, ...layout } } : {}),
    };
    if (existing) Object.assign(existing, next);
    else changes.push(next);
  };

  for (const layer of layers) {
    const tileLayer = layer["source-layer"];
    if (layer.id === EXTRUSION_LAYER_ID) hasExtrusion = true;
    if (
      firstLabel === undefined &&
      layer.type === "symbol" &&
      layer.layout?.["text-field"] !== undefined
    )
      firstLabel = layer.id;

    if (tileLayer === "building" && layer.type === "fill") {
      buildingSource ??= layer.source;
      merge(layer.id, earlier(layer, FOOTPRINT_MIN_ZOOM), FOOTPRINT_PAINT);
    } else if (tileLayer === "building" && layer.type === "fill-extrusion") {
      buildingSource ??= layer.source;
      hasExtrusion = true;
      if (extrude)
        merge(layer.id, earlier(layer, EXTRUSION_MIN_ZOOM), EXTRUSION_PAINT);
    } else if (
      layer.type === "symbol" &&
      layer.layout?.["text-field"] !== undefined
    ) {
      if (tileLayer === "road") {
        const alongLine = layer.layout["symbol-placement"] === "line";
        // A road shield (a number on a coloured badge) keeps the style's own colours: dark text on its badge would vanish.
        const onBadge = layer.layout["icon-image"] !== undefined;
        merge(
          layer.id,
          earlier(layer, STREET_LABEL_MIN_ZOOM),
          onBadge ? undefined : HALO,
          onBadge
            ? undefined
            : {
                ...NO_LETTER_SPACING,
                ...(alongLine ? { "text-max-angle": STREET_NAME_MAX_ANGLE } : {}),
              }
        );
        if (alongLine && !onBadge && layer.id !== STREET_NAMES_LAYER_ID)
          streetNames ??= layer;
      } else if (tileLayer === "poi_label") {
        // Places keep their icon; the name gets the colour of its kind, the outline (so it reads over a building) and no
        // letter spacing, and starts as early as the extra layer does.
        merge(
          layer.id,
          earlier(layer, POI_LABELS_MIN_ZOOM),
          { ...HALO, "text-color": [...POI_TEXT_COLOR] },
          NO_LETTER_SPACING
        );
        if (layer.id !== POI_LABELS_LAYER_ID) placeNames ??= layer;
      } else if (tileLayer === "place_label" && AREA_LAYER.test(layer.id)) {
        // Neighbourhood and town names get the dark-on-white outlined look, at every zoom they are shown at.
        merge(
          layer.id,
          areaRange(layer, NEIGHBORHOOD_LABEL_MIN_ZOOM),
          HALO,
          NO_LETTER_SPACING
        );
      } else if (tileLayer === "place_label") {
        // Provinces and countries: same colours and outline, their zoom range is the style's own.
        merge(layer.id, null, HALO, NO_LETTER_SPACING);
      }
    }
  }

  const add =
    extrude && !hasExtrusion && buildingSource
      ? {
          layer: {
            id: EXTRUSION_LAYER_ID,
            type: "fill-extrusion",
            source: buildingSource,
            "source-layer": "building",
            minzoom: EXTRUSION_MIN_ZOOM,
            filter: ["!=", ["get", "underground"], "true"],
            paint: { ...EXTRUSION_PAINT },
          } satisfies DetailLayer,
          before: firstLabel,
        }
      : null;
  const hasNames = layers.some((l) => l.id === STREET_NAMES_LAYER_ID);
  const addNames =
    streetNames && !hasNames
      ? {
          layer: {
            ...streetNames,
            id: STREET_NAMES_LAYER_ID,
            minzoom: STREET_NAMES_MIN_ZOOM,
            maxzoom: 24,
            filter: [
              "all",
              ["has", "name"],
              [
                "!",
                ["in", ["get", "class"], ["literal", [...NON_STREET_CLASSES]]],
              ],
            ],
            layout: {
              ...streetNames.layout,
              "symbol-placement": "line",
              "symbol-spacing": STREET_NAME_SPACING,
              "text-max-angle": STREET_NAME_MAX_ANGLE,
              "text-padding": 2,
              "text-letter-spacing": 0,
              "text-size": [...STREET_NAME_TEXT_SIZE],
            },
            paint: { ...streetNames.paint, ...HALO },
          } satisfies DetailLayer,
          before: streetNames.id,
        }
      : null;
  const hasPlaces = layers.some((l) => l.id === POI_LABELS_LAYER_ID);
  const addPlaces =
    placeNames && !hasPlaces
      ? {
          layer: {
            ...placeNames,
            id: POI_LABELS_LAYER_ID,
            minzoom: POI_LABELS_MIN_ZOOM,
            maxzoom: 24,
            filter: ["has", "name"],
            layout: {
              ...placeNames.layout,
              "text-size": [...POI_TEXT_SIZE],
              "text-padding": 1,
              "text-letter-spacing": 0,
              "text-allow-overlap": false,
              "icon-allow-overlap": false,
              // The more important place (rank 1) is placed first when two do not both fit.
              "symbol-sort-key": [
                "coalesce",
                ["to-number", ["get", "filterrank"], 5],
                5,
              ],
            },
            paint: {
              ...placeNames.paint,
              ...HALO,
              "text-color": [...POI_TEXT_COLOR],
            },
          } satisfies DetailLayer,
          before: placeNames.id,
        }
      : null;
  return { changes, add, addNames, addPlaces };
}

/** The same plan applied to a style's layer list (the phone app's downloaded style): a new list, the input is not touched. */
export function applyPlan(
  layers: readonly DetailLayer[],
  plan: DetailPlan
): DetailLayer[] {
  const byId = new Map(plan.changes.map((c) => [c.id, c]));
  const out = layers.map((layer) => {
    const change = byId.get(layer.id);
    if (!change) return layer;
    return {
      ...layer,
      ...(change.minzoom !== undefined ? { minzoom: change.minzoom } : {}),
      ...(change.maxzoom !== undefined ? { maxzoom: change.maxzoom } : {}),
      ...(change.paint ? { paint: { ...layer.paint, ...change.paint } } : {}),
      ...(change.layout
        ? { layout: { ...layer.layout, ...change.layout } }
        : {}),
    };
  });
  for (const added of [plan.add, plan.addNames, plan.addPlaces]) {
    if (!added) continue;
    const at = added.before ? out.findIndex((l) => l.id === added.before) : -1;
    if (at >= 0) out.splice(at, 0, added.layer);
    else out.push(added.layer);
  }
  return out;
}

import type { StyleSpecification } from "./style";

/**
 * A copy of the style (Mapbox Streets, downloaded by streetStyle.ts) with the plan applied. The input is never
 * changed. `changed` is how many layers were adjusted or added (0: not a style this knows how to adjust).
 *
 * The phone map has no tilt gesture (see BaseMap.tsx): the 3D button tilts it, and only then do the blocks read as
 * buildings. `extrude: false` leaves them out (footprints and names only).
 */
export function enhanceStyle(
  style: StyleSpecification,
  options?: DetailOptions
): { style: StyleSpecification; changed: number } {
  const layers = style.layers as DetailLayer[];
  const plan = planDetail(layers, options);
  const changed =
    plan.changes.length +
    (plan.add ? 1 : 0) +
    (plan.addNames ? 1 : 0) +
    (plan.addPlaces ? 1 : 0);
  if (changed === 0) return { style, changed: 0 };
  return {
    style: {
      ...style,
      layers: applyPlan(layers, plan) as StyleSpecification["layers"],
    },
    changed,
  };
}
