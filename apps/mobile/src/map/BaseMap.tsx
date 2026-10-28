import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MAPBOX_ACCESS_TOKEN } from '../config';
import { colors } from '../theme';
import type { Bounds } from './cluster';
import { fromLngLat, type Coordinate, type LngLat, type MapCamera } from './geo';
import { setMapStyle, useMapStyle } from './mapStyleStore';
import { Camera, Map, type CameraRef } from './native';
import { styleFor } from './style';
import { useSatelliteStyle, useStreetStyle } from './streetStyle';

interface Props {
  /** Where to look. The map flies there whenever this changes (after the first draw). */
  camera: MapCamera;
  /** false: a picture of the place that cannot be moved (listing details). */
  interactive?: boolean;
  /**
   * The 3D view: the map leans back so buildings stand up as blocks (see TILT_PITCH), and comes close enough to see them.
   * It is the 3D button that sets this; a finger cannot tilt the map (it only confuses a property search).
   */
  tilted?: boolean;
  /** Called with the tapped point. */
  onPress?: (coordinate: Coordinate) => void;
  /**
   * Called when the person (or a fly-to) has finished moving the map: where it is looking and how far in, what is
   * visible, and whether a finger (rather than a fly-to the app asked for) moved it. `center` and `zoom` are what a
   * screen keeps to put a map back exactly where it was (a tab switch, a fullscreen map closing).
   */
  onViewChange?: (view: MapViewChange) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Android only. A map inside something that scrolls, has rounded corners or sits under a header (a form, a card, a
   * sheet) must be 'texture': the default 'surface' is a separate layer that Android draws over its neighbours and does
   * not clip to its parent, so such a map spilled over the sheet's edges and header. Full-screen maps keep 'surface',
   * which pans a little smoother.
   */
  androidView?: 'surface' | 'texture';
  children?: React.ReactNode;
}

/** What `onViewChange` reports. */
export interface MapViewChange {
  center: LngLat;
  zoom: number;
  bounds: Bounds;
  userMoved: boolean;
}

/** How far the map leans back in the 3D view (degrees), and the farthest out it is still worth doing it (buildings rise from zoom 14). */
export const TILT_PITCH = 55;
export const TILT_ZOOM = 16;

/** How many satellite tiles may fail to load before the satellite style is given up for the street map. */
export const SATELLITE_TILE_ERRORS = 3;

/** The middle of a [west, south, east, north] box: the centre when the platform did not say it. */
const middleOf = ([west, south, east, north]: Bounds): LngLat => [
  (west + east) / 2,
  (south + north) / 2,
];

/**
 * The one map every screen uses: Mapbox Streets (vector, with the local name first on every label; see config.ts and
 * streetStyle.ts), or Mapbox Satellite Streets (aerial photographs with the roads and names drawn over them) when the
 * person switched to it (see mapStyleStore.ts). Rotation and
 * tilt are off: they only confuse a property search.
 */
export default function BaseMap({
  camera,
  interactive = true,
  tilted = false,
  onPress,
  onViewChange,
  style,
  testID = 'map',
  androidView = 'surface',
  children,
}: Props) {
  // The street map or the satellite photographs, whichever the person chose (the one choice every map follows).
  const { kind } = useMapStyle();
  // The street style (Mapbox Streets, `streets-v12`) could not be loaded (no Mapbox token, service down, token refused):
  // plain raster street tiles stand in until this map is drawn again, when the vector style gets another chance.
  // The satellite style has no such state of its own: when it fails the street map takes its place (see below), so
  // what is on screen is always a bright, readable map, never the near-black canvas a satellite style leaves behind
  // when its photographs do not arrive.
  const [streetFailed, setStreetFailed] = useState(false);
  const failed = (kind === 'street' && streetFailed) || !MAPBOX_ACCESS_TOKEN;
  // Mapbox Streets, or Mapbox Satellite Streets, with local-language labels. The map is drawn without waiting only
  // when they will not come (no token, download failed); otherwise a moment's wait is cheaper than a map that redraws
  // its labels. (A kind that is not on screen downloads nothing.)
  const street = useStreetStyle(kind === 'street' && !failed);
  const satellite = useSatelliteStyle(kind === 'satellite' && !failed);
  const labelled = kind === 'satellite' ? satellite : street;
  const waitingForLabels = !failed && labelled.status === 'loading';
  const cameraRef = useRef<CameraRef>(null);
  const firstDraw = useRef(true);
  // How far in the map is now, so the 3D view comes no closer than needed (and never further out).
  const lastZoom = useRef(camera.zoom);
  const wasTilted = useRef(false);
  const [lng, lat] = camera.center;
  const bottomPadding = camera.padding?.bottom ?? 0;

  useEffect(() => {
    if (firstDraw.current) {
      firstDraw.current = false; // initialViewState below already placed the first view
      return;
    }
    cameraRef.current?.flyTo({
      center: [lng, lat],
      zoom: camera.zoom,
      padding: { bottom: bottomPadding },
      duration: 600,
    });
  }, [lng, lat, camera.zoom, camera.nonce, bottomPadding]);

  useEffect(() => {
    if (tilted === wasTilted.current) return;
    wasTilted.current = tilted;
    cameraRef.current?.tilt(
      tilted
        ? {
            pitch: TILT_PITCH,
            zoom: Math.max(lastZoom.current, TILT_ZOOM),
            duration: 900,
          }
        : { pitch: 0, duration: 700 },
    );
  }, [tilted]);

  if (waitingForLabels) {
    return <View style={[styles.box, styles.waiting, style]} testID={testID} />;
  }

  return (
    <View style={[styles.box, style]}>
      <Map
        testID={testID}
        style={styles.map}
        androidView={androidView}
        mapStyle={styleFor(
          kind,
          failed,
          labelled.status === 'ready' ? labelled.style : null,
        )}
        // Satellite photographs that do not arrive leave a near-black canvas with names on it, so a few lost tiles
        // are enough to give up on that style; the street map has all its detail in the vector tiles, which a bad
        // network only thins out, so only a style that cannot be had at all makes it give up.
        failAfterTileErrors={kind === 'satellite' ? SATELLITE_TILE_ERRORS : undefined}
        onDidFailLoadingMap={() => {
          if (kind === 'satellite') {
            // Back to the street map, for every map in the app (and the next start): the style button shows what is
            // on screen, and a tap on it tries the satellite photographs again.
            setMapStyle('street').catch(() => undefined);
          } else {
            setStreetFailed(true);
          }
        }}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        // The product owner asked for a map with no logo and no credit button (and so no credits dialog).
        logo={false}
        attribution={false}
        onRegionDidChange={event => {
          lastZoom.current = event.nativeEvent.zoom;
          onViewChange?.({
            center:
              event.nativeEvent.center ?? middleOf(event.nativeEvent.bounds),
            zoom: event.nativeEvent.zoom,
            bounds: event.nativeEvent.bounds,
            userMoved: event.nativeEvent.userInteraction === true,
          });
        }}
        onPress={
          onPress
            ? event => onPress(fromLngLat(event.nativeEvent.lngLat))
            : undefined
        }
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: camera.center,
            zoom: camera.zoom,
            padding: { bottom: bottomPadding },
          }}
        />
        {children}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden' },
  map: { flex: 1 },
  // While the label-adjusted style is on its way: a quiet grey, never a blank white flash.
  waiting: { backgroundColor: colors.neutralSoft },
});
