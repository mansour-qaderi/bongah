import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import AppText from '../components/AppText';
import { MAP_ATTRIBUTION } from '../config';
import { colors, radius, spacing } from '../theme';
import type { Bounds } from './cluster';
import { fromLngLat, type Coordinate, type MapCamera } from './geo';
import { BASE_MAP_STYLE } from './style';

interface Props {
  /** Where to look. The map flies there whenever this changes (after the first draw). */
  camera: MapCamera;
  /** false: a picture of the place that cannot be moved (listing details). */
  interactive?: boolean;
  /** Called with the tapped point. */
  onPress?: (coordinate: Coordinate) => void;
  /** Called when the person (or a fly-to) has finished moving the map: how far in, and what is visible. */
  onViewChange?: (view: { zoom: number; bounds: Bounds }) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * The one map every screen uses: MapLibre drawing OpenStreetMap tiles (see config.ts). Needs no
 * account or key. Rotation and tilt are off: they only confuse a property search.
 */
export default function BaseMap({
  camera,
  interactive = true,
  onPress,
  onViewChange,
  style,
  testID = 'map',
  children,
}: Props) {
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
        mapStyle={BASE_MAP_STYLE}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        // The credit below is drawn by the app so it is always readable and always matches config.ts.
        attribution={false}
        onRegionDidChange={
          onViewChange
            ? event =>
                onViewChange({
                  zoom: event.nativeEvent.zoom,
                  bounds: event.nativeEvent.bounds,
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
      <View pointerEvents="none" style={styles.credit}>
        <AppText variant="caption" color={colors.textMuted}>
          {MAP_ATTRIBUTION}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden' },
  map: { flex: 1 },
  credit: {
    position: 'absolute',
    start: spacing.xs,
    // At the top: the home screen slides a listing card over the bottom of the map, and the OpenStreetMap
    // credit must stay readable.
    top: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
});
