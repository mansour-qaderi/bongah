import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import AppText from '../components/AppText';
import { MAP_ATTRIBUTION } from '../config';
import { colors, radius, spacing } from '../theme';
import { fromLngLat, type Coordinate, type MapCamera } from './geo';
import { BASE_MAP_STYLE } from './style';

interface Props {
  /** Where to look. The map flies there whenever this changes (after the first draw). */
  camera: MapCamera;
  /** false: a picture of the place that cannot be moved (listing details). */
  interactive?: boolean;
  /** Called with the tapped point. */
  onPress?: (coordinate: Coordinate) => void;
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
  style,
  testID = 'map',
  children,
}: Props) {
  const cameraRef = useRef<CameraRef>(null);
  const firstDraw = useRef(true);
  const [lng, lat] = camera.center;

  useEffect(() => {
    if (firstDraw.current) {
      firstDraw.current = false; // initialViewState below already placed the first view
      return;
    }
    cameraRef.current?.flyTo({
      center: [lng, lat],
      zoom: camera.zoom,
      duration: 600,
    });
  }, [lng, lat, camera.zoom]);

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
        onPress={
          onPress
            ? event => onPress(fromLngLat(event.nativeEvent.lngLat))
            : undefined
        }
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: camera.center, zoom: camera.zoom }}
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
    bottom: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
});
