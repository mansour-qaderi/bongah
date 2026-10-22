import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import type { Bounds } from './cluster';
import { fromLngLat, type Coordinate, type LngLat, type MapCamera } from './geo';
import { useMapStyle } from './mapStyleStore';
import { styleFor } from './style';

interface Props {
  /** Where to look. The map flies there whenever this changes (after the first draw). */
  camera: MapCamera;
  /** false: a picture of the place that cannot be moved (listing details). */
  interactive?: boolean;
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

/** The middle of a [west, south, east, north] box: the centre when the platform did not say it. */
const middleOf = ([west, south, east, north]: Bounds): LngLat => [
  (west + east) / 2,
  (south + north) / 2,
];

/**
 * The one map every screen uses: MapLibre drawing OpenStreetMap tiles (see config.ts), or satellite photographs when
 * the person switched to them (see mapStyleStore.ts). Needs no account or key. Rotation and tilt are off: they only
 * confuse a property search.
 */
export default function BaseMap({
  camera,
  interactive = true,
  onPress,
  onViewChange,
  style,
  testID = 'map',
  androidView = 'surface',
  children,
}: Props) {
  // The street map or the satellite photographs, whichever the person chose (the one choice every map follows).
  const { kind } = useMapStyle();
  const cameraRef = useRef<CameraRef>(null);
  const firstDraw = useRef(true);
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

  return (
    <View style={[styles.box, style]}>
      <Map
        testID={testID}
        style={styles.map}
        androidView={androidView}
        mapStyle={styleFor(kind)}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        // No credit is drawn on the map. The OpenStreetMap and imagery credits their licences ask for are in the Account tab.
        attribution={false}
        onRegionDidChange={
          onViewChange
            ? event =>
                onViewChange({
                  center:
                    event.nativeEvent.center ??
                    middleOf(event.nativeEvent.bounds),
                  zoom: event.nativeEvent.zoom,
                  bounds: event.nativeEvent.bounds,
                  userMoved: event.nativeEvent.userInteraction === true,
                })
            : undefined
        }
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
});
