import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Mapbox, {
  Camera as MapboxCamera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  MarkerView,
  PointAnnotation,
  ShapeSource,
  SymbolLayer,
  locationManager,
  requestAndroidLocationPermissions,
  type Camera as MapboxCameraHandle,
  type Location,
  type MapState,
} from '@rnmapbox/maps';
import { MAPBOX_ACCESS_TOKEN } from '../config';
import type { MapStyle } from './style';

/**
 * The one place the app touches the Mapbox SDK (@rnmapbox/maps). Everything else (BaseMap, the markers, the route
 * and plot layers, the location hooks) is written against the small interface below, so the screens read the same
 * whichever SDK draws underneath, and the tests replace this single file with a plain-view stand-in
 * (jest.setup.js). Positions are always [longitude, latitude], the order maps use.
 */

// The token goes to the SDK once, as soon as the app loads this file. Without one nothing is sent: BaseMap then uses
// the plain OpenStreetMap tiles, which need no token. (A token the SDK refuses is written to the log, never swallowed:
// it is the first thing to look at when every Mapbox style fails to load.)
if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN).catch(error => {
    console.warn(`[map] Mapbox refused the access token: ${String(error)}`);
  });
} else {
  console.warn(
    '[map] MAPBOX_ACCESS_TOKEN is empty in this build, so the map uses the plain OpenStreetMap tiles. Put a public ' +
      '"pk." token in apps/mobile/.env and restart Metro with `pnpm start --reset-cache`.',
  );
}

type LngLat = [number, number];

// ───────────────────────────── the map ─────────────────────────────

/** What `onRegionDidChange` reports once the map has stopped moving. */
export interface RegionChange {
  center: LngLat;
  zoom: number;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  /** A finger moved the map (not a fly-to the app asked for). */
  userInteraction: boolean;
}

export interface MapProps {
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** Android only: 'surface' pans smoother; 'texture' can sit inside something that scrolls or has rounded corners. */
  androidView?: 'surface' | 'texture';
  /** The address of a style, or the style itself. */
  mapStyle: MapStyle;
  /** The style (or its data) could not be loaded: the caller switches to another. */
  onDidFailLoadingMap?: () => void;
  /**
   * For a style whose picture is made of tiles the map cannot draw without (the satellite photographs: a style whose
   * photographs fail to arrive is a near-black canvas with names on it): the map counts as failed after this many
   * tiles could not be had since the style was set. Without it a failed tile is only logged, as one lost tile on a
   * bad network leaves a perfectly good map.
   */
  failAfterTileErrors?: number;
  dragPan?: boolean;
  touchZoom?: boolean;
  doubleTapZoom?: boolean;
  doubleTapHoldZoom?: boolean;
  touchRotate?: boolean;
  touchPitch?: boolean;
  compass?: boolean;
  /** The Mapbox logo. Off in every map of this app (the product owner's decision), on only when asked for. */
  logo?: boolean;
  /** The credit button (ⓘ) and its dialog. Off like the logo. */
  attribution?: boolean;
  onRegionDidChange?: (event: { nativeEvent: RegionChange }) => void;
  /** Called with the tapped point. */
  onPress?: (event: {
    nativeEvent: { lngLat: LngLat; point: [number, number] };
  }) => void;
  children?: ReactNode;
}

// The logo and the credit button sit side by side at the bottom left, clear of the buttons on the right.
const LOGO_POSITION = { bottom: 6, left: 6 } as const;
const ATTRIBUTION_POSITION = { bottom: 6, left: 96 } as const;

/** What the SDK says about a load problem (the same on iOS and Android). */
export interface LoadErrorPayload {
  error?: string;
  type?: string;
  sourceId?: string;
  tileId?: string;
}

/**
 * The exact error, on one line, for the log: the kind (style, sprite, glyphs, source, tile), the source and tile it
 * concerned, and the SDK's own words (which carry the HTTP status of the request that failed).
 */
export function describeLoadError(payload: LoadErrorPayload | undefined): string {
  if (!payload) return 'no details from the SDK';
  const parts = [payload.type ?? 'unknown kind'];
  if (payload.sourceId) parts.push(`source ${payload.sourceId}`);
  if (payload.tileId) parts.push(`tile ${payload.tileId}`);
  return `${parts.join(', ')}: ${payload.error ?? 'no message'}`;
}

// The SDK words a refused token as an HTTP 401 / 403 on whatever it asked for.
const REFUSED = /status code:?\s*(401|403)\b|unauthori[sz]ed|forbidden/i;

/**
 * What a failed load means. The SDK reports every kind of load problem here, some of them harmless (one sprite, one
 * missing tile on a bad network); only a style or a source that cannot be had means there is no map to draw. A
 * request the token was refused for (401 / 403) is fatal whatever it was for: every other request fails the same way.
 */
export function isFatalLoadError(payload: LoadErrorPayload | undefined): boolean {
  const type = payload?.type;
  if (type === undefined || type === 'style' || type === 'source') return true;
  return REFUSED.test(payload?.error ?? '');
}

// Written once per distinct problem: a map that cannot reach Mapbox reports hundreds of the same failed tile.
const LOGGED_LIMIT = 50;
const logged = new Set<string>();
function logLoadError(payload: LoadErrorPayload | undefined, fatal: boolean) {
  const line = `[map] ${fatal ? 'load failed' : 'load error'} (${describeLoadError(payload)})`;
  if (logged.has(line) || logged.size >= LOGGED_LIMIT) return;
  logged.add(line);
  console.warn(line);
}

export function Map({
  testID,
  style,
  androidView = 'surface',
  mapStyle,
  onDidFailLoadingMap,
  failAfterTileErrors,
  dragPan = true,
  touchZoom = true,
  doubleTapZoom = true,
  doubleTapHoldZoom = true,
  touchRotate = true,
  touchPitch = true,
  compass = false,
  logo = false,
  attribution = false,
  onRegionDidChange,
  onPress,
  children,
}: MapProps) {
  // A style object goes to the SDK as text. Made once per object, so the same style is not read again on every render.
  const styleJSON = useMemo(
    () => (typeof mapStyle === 'string' ? undefined : JSON.stringify(mapStyle)),
    [mapStyle],
  );
  // The SDK tells us a finger is on the map while the camera moves, but not when it settles: remember it until then.
  const touched = useRef(false);

  // Tiles that could not be had since this style was set (see failAfterTileErrors).
  const tileErrors = useRef(0);
  useEffect(() => {
    tileErrors.current = 0;
  }, [mapStyle]);

  const onLoadingError = useCallback(
    (payload?: LoadErrorPayload) => {
      let fatal = isFatalLoadError(payload);
      if (!fatal && payload?.type === 'tile' && failAfterTileErrors) {
        tileErrors.current += 1;
        fatal = tileErrors.current >= failAfterTileErrors;
      }
      logLoadError(payload, fatal);
      if (fatal) onDidFailLoadingMap?.();
    },
    [failAfterTileErrors, onDidFailLoadingMap],
  );

  const onCameraChanged = useCallback((state: MapState) => {
    if (state.gestures.isGestureActive) touched.current = true;
  }, []);

  const onMapIdle = useCallback(
    (state: MapState) => {
      const userInteraction = touched.current;
      touched.current = false;
      if (!onRegionDidChange) return;
      const { center, zoom, bounds } = state.properties;
      onRegionDidChange({
        nativeEvent: {
          center: [center[0], center[1]],
          zoom,
          bounds: [bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]],
          userInteraction,
        },
      });
    },
    [onRegionDidChange],
  );

  return (
    <MapView
      testID={testID}
      style={style}
      styleURL={typeof mapStyle === 'string' ? mapStyle : undefined}
      styleJSON={styleJSON}
      surfaceView={androidView === 'surface'}
      scrollEnabled={dragPan}
      zoomEnabled={touchZoom}
      rotateEnabled={touchRotate}
      pitchEnabled={touchPitch}
      gestureSettings={{
        doubleTapToZoomInEnabled: doubleTapZoom,
        doubleTouchToZoomOutEnabled: doubleTapZoom,
        quickZoomEnabled: doubleTapHoldZoom,
      }}
      compassEnabled={compass}
      scaleBarEnabled={false}
      logoEnabled={logo}
      logoPosition={LOGO_POSITION}
      attributionEnabled={attribution}
      attributionPosition={ATTRIBUTION_POSITION}
      onMapLoadingError={onLoadingError}
      onCameraChanged={onCameraChanged}
      onMapIdle={onMapIdle}
      onPress={
        onPress
          ? feature => {
              const [lng, lat] = feature.geometry.coordinates;
              onPress({
                nativeEvent: {
                  lngLat: [lng, lat],
                  point: [
                    feature.properties?.screenPointX ?? 0,
                    feature.properties?.screenPointY ?? 0,
                  ],
                },
              });
            }
          : undefined
      }
    >
      {children}
    </MapView>
  );
}

// ───────────────────────────── the camera ─────────────────────────────

export interface CameraRef {
  /** Glides to a place. `padding.bottom` keeps the place clear of a sheet covering the foot of the map. */
  flyTo(options: {
    center: LngLat;
    zoom?: number;
    padding?: { bottom?: number };
    duration?: number;
  }): void;
  /**
   * Tilts the map to look at the buildings from the side (`pitch` in degrees, 0 = flat), optionally coming closer on the
   * way. The centre stays where it is.
   */
  tilt(options: { pitch: number; zoom?: number; duration?: number }): void;
}

interface CameraProps {
  /** Where the map starts. After that the camera only moves through `flyTo`. */
  initialViewState: {
    center: LngLat;
    zoom: number;
    padding?: { bottom?: number };
  };
}

export const Camera = forwardRef<CameraRef, CameraProps>(
  ({ initialViewState }, ref) => {
    const camera = useRef<MapboxCameraHandle>(null);
    useImperativeHandle(ref, () => ({
      flyTo: ({ center, zoom, padding, duration }) => {
        camera.current?.setCamera({
          centerCoordinate: center,
          zoomLevel: zoom,
          padding:
            padding?.bottom === undefined
              ? undefined
              : { paddingBottom: padding.bottom },
          animationDuration: duration,
          animationMode: 'flyTo',
        });
      },
      tilt: ({ pitch, zoom, duration }) => {
        camera.current?.setCamera({
          pitch,
          zoomLevel: zoom,
          animationDuration: duration,
          animationMode: 'easeTo',
        });
      },
    }));
    // Only the starting view is declared: a camera that is told its centre on every render would pull the map back
    // after each pan.
    return (
      <MapboxCamera
        ref={camera}
        defaultSettings={{
          centerCoordinate: initialViewState.center,
          zoomLevel: initialViewState.zoom,
          padding:
            initialViewState.padding?.bottom === undefined
              ? undefined
              : { paddingBottom: initialViewState.padding.bottom },
        }}
      />
    );
  },
);
Camera.displayName = 'Camera';

// ───────────────────────────── markers ─────────────────────────────

type Anchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** The point of the marker that sits on the coordinate, as the SDK wants it: 0–1 across and down. */
export function anchorPoint(anchor: Anchor = 'center'): { x: number; y: number } {
  const x = anchor.includes('left') ? 0 : anchor.includes('right') ? 1 : 0.5;
  const y = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : 0.5;
  return { x, y };
}

export interface MarkerProps {
  id?: string;
  lngLat: LngLat;
  anchor?: Anchor;
  onPress?: () => void;
  children: ReactElement;
}

/** A view on the map at a place. Every marker is drawn: the app groups close ones itself (map/cluster.ts). */
export function Marker({ id, lngLat, anchor, onPress, children }: MarkerProps) {
  return (
    <MarkerView
      id={id}
      coordinate={lngLat}
      anchor={anchorPoint(anchor)}
      allowOverlap
    >
      {onPress ? (
        <Pressable onPress={onPress}>{children}</Pressable>
      ) : (
        <View>{children}</View>
      )}
    </MarkerView>
  );
}

export interface ViewAnnotationProps {
  id: string;
  lngLat: LngLat;
  anchor?: Anchor;
  /** A pin the person can pick up and drop. */
  draggable?: boolean;
  /** Where the pin was dropped. */
  onDragEnd?: (event: { nativeEvent: { lngLat: LngLat } }) => void;
  children: ReactElement;
}

/** A marker that can be dragged (the pin of the location pickers). Without `draggable` it is a plain Marker. */
export function ViewAnnotation({
  id,
  lngLat,
  anchor,
  draggable,
  onDragEnd,
  children,
}: ViewAnnotationProps) {
  if (!draggable) {
    return (
      <Marker id={id} lngLat={lngLat} anchor={anchor}>
        {children}
      </Marker>
    );
  }
  return (
    <PointAnnotation
      id={id}
      coordinate={lngLat}
      anchor={anchorPoint(anchor)}
      draggable
      onDragEnd={feature => {
        const [lng, lat] = feature.geometry.coordinates;
        onDragEnd?.({ nativeEvent: { lngLat: [lng, lat] } });
      }}
    >
      {children}
    </PointAnnotation>
  );
}

// ───────────────────────────── lines and areas ─────────────────────────────

export interface GeoJSONSourceProps {
  id: string;
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry;
  children?: ReactElement | ReactElement[];
}

/** Shapes the layers inside it are drawn from. */
export function GeoJSONSource({ id, data, children }: GeoJSONSourceProps) {
  return (
    <ShapeSource id={id} shape={data}>
      {children}
    </ShapeSource>
  );
}

type LayerKind = 'fill' | 'line' | 'circle' | 'symbol';

export interface LayerProps {
  id: string;
  type: LayerKind;
  minzoom?: number;
  maxzoom?: number;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
}

/**
 * "line-dasharray" → "lineDasharray": the style specification's property names are written kebab-case, the SDK's
 * style objects camelCase. Layout and paint properties share one object there.
 */
export function layerStyle(
  layout: Record<string, unknown> = {},
  paint: Record<string, unknown> = {},
): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  for (const [name, value] of Object.entries({ ...layout, ...paint })) {
    style[name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return style;
}

/** One layer of the shapes in the GeoJSONSource around it. */
export function Layer({ id, type, minzoom, maxzoom, layout, paint }: LayerProps) {
  const common = {
    id,
    minZoomLevel: minzoom,
    maxZoomLevel: maxzoom,
    style: layerStyle(layout, paint) as never,
  };
  switch (type) {
    case 'fill':
      return <FillLayer {...common} />;
    case 'line':
      return <LineLayer {...common} />;
    case 'circle':
      return <CircleLayer {...common} />;
    default:
      return <SymbolLayer {...common} />;
  }
}

// ───────────────────────────── the phone's position ─────────────────────────────

/** What the phone reports as a position. */
export interface LocationFix {
  coords: {
    latitude: number;
    longitude: number;
    /** Metres per second. */
    speed?: number;
    /** Degrees from north. */
    heading?: number;
    /** Metres of uncertainty. */
    accuracy?: number;
  };
  /** Milliseconds since 1970, as the phone stamped it. */
  timestamp: number;
}

/** The SDK's position, with a timestamp always present (the moment it arrived, when the phone gave none). */
const toFix = (location: Location): LocationFix => ({
  coords: location.coords,
  timestamp: location.timestamp ?? Date.now(),
});

// A listener is handed to the SDK in a wrapper that does the conversion above; this finds the wrapper again to remove it.
// (A WeakMap: this file's own `Map` is the map component.)
const wrappers = new WeakMap<
  (fix: LocationFix) => void,
  (location: Location) => void
>();

/** A position older than this is not "where the phone is now": a fresh one is waited for. */
const STALE_FIX_MS = 30_000;
/** Longest one fix is waited for before giving up (callers ask for less; this only stops a forgotten listener). */
const FIX_WAIT_MS = 15_000;

/**
 * The phone's position, from the Mapbox SDK's own location module. Native setup: iOS needs
 * NSLocationWhenInUseUsageDescription in Info.plist; the Android permissions are declared by the SDK's manifest.
 */
export const LocationManager = {
  /**
   * Asks for permission (Android shows its prompt). iOS has no way to ask from here: its prompt appears when the
   * location module starts, so this only says "go ahead" and a refusal shows up as "no position came back".
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      return await requestAndroidLocationPermissions();
    } catch {
      return false;
    }
  },

  /** One current position, or undefined when none arrives in time. Never throws. */
  getCurrentPosition(): Promise<LocationFix | undefined> {
    return new Promise(resolve => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (fix: LocationFix | undefined) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        try {
          locationManager.removeListener(listener);
        } catch {
          // Nothing to undo: the listener never got registered.
        }
        resolve(fix);
      };
      const listener = (location: Location) => {
        const stamp = location.timestamp;
        // The SDK hands a listener the last position it knew straight away, which can be hours old.
        if (stamp && Date.now() - stamp > STALE_FIX_MS) return;
        finish(toFix(location));
      };
      timer = setTimeout(() => finish(undefined), FIX_WAIT_MS);
      try {
        locationManager.addListener(listener);
      } catch {
        finish(undefined);
      }
    });
  },

  /** Streams positions until removed. The module runs only while someone listens. */
  addListener(listener: (fix: LocationFix) => void) {
    if (wrappers.has(listener)) return;
    const wrapper = (location: Location) => listener(toFix(location));
    wrappers.set(listener, wrapper);
    locationManager.addListener(wrapper);
  },
  removeListener(listener: (fix: LocationFix) => void) {
    const wrapper = wrappers.get(listener);
    if (!wrapper) return;
    wrappers.delete(listener);
    locationManager.removeListener(wrapper);
  },
  /** Metres the phone must move before the next position is reported (0: every one). */
  setMinDisplacement(metres: number) {
    locationManager.setMinDisplacement(metres);
  },
};
