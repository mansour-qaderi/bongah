import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import BaseMap from '../map/BaseMap';
import {
  isInsideAfghanistan,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../map/geo';
import PinMarker from '../map/PinMarker';
import { colors, radius } from '../theme';

interface Props {
  value: Coordinate | null;
  /** Where the map starts / moves to (the chosen province, or the existing pin). */
  camera: MapCamera;
  onChange: (coordinate: Coordinate) => void;
  /** A tap landed outside Afghanistan; nothing was changed. */
  onOutside?: () => void;
}

/** A small map where the person taps to say exactly where the property is. */
export default function LocationPicker({
  value,
  camera,
  onChange,
  onOutside,
}: Props) {
  return (
    <View style={styles.box}>
      <BaseMap
        camera={camera}
        testID="location-picker-map"
        onPress={coordinate => {
          if (isInsideAfghanistan(coordinate)) onChange(coordinate);
          else onOutside?.();
        }}
      >
        {value ? (
          <Marker id="chosen" lngLat={toLngLat(value)}>
            <PinMarker selected />
          </Marker>
        ) : null}
      </BaseMap>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
