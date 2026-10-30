import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ViewAnnotation } from '../map/native';
import BaseMap from '../map/BaseMap';
import {
  fromLngLat,
  isInsideSupportedArea,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../map/geo';
import PinMarker from '../map/PinMarker';
import { colors, radius } from '../theme';

interface Props {
  value: Coordinate | null;
  /** Where the map starts / moves to (the chosen province, the written address, or the existing pin). */
  camera: MapCamera;
  onChange: (coordinate: Coordinate) => void;
  /** A tap or a drop landed outside Afghanistan; nothing was changed. */
  onOutside?: () => void;
}

/**
 * A small map where the person says exactly where the property is: tap to put the pin there, or press the pin and
 * drag it to the right spot. Either way `onChange` gets the new point once, when the finger lifts.
 */
export default function LocationPicker({
  value,
  camera,
  onChange,
  onOutside,
}: Props) {
  // A drop outside Afghanistan is refused, but the pin has already moved under the finger: changing the key puts a
  // fresh pin back on the stored point.
  const [reset, setReset] = useState(0);
  return (
    <View style={styles.box}>
      <BaseMap
        camera={camera}
        testID="location-picker-map"
        onPress={coordinate => {
          if (isInsideSupportedArea(coordinate)) onChange(coordinate);
          else onOutside?.();
        }}
      >
        {value ? (
          <ViewAnnotation
            key={`chosen-${reset}`}
            id="chosen"
            lngLat={toLngLat(value)}
            draggable
            onDragEnd={event => {
              const dropped = fromLngLat(event.nativeEvent.lngLat);
              if (isInsideSupportedArea(dropped)) onChange(dropped);
              else {
                setReset(count => count + 1);
                onOutside?.();
              }
            }}
          >
            <PinMarker selected />
          </ViewAnnotation>
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
