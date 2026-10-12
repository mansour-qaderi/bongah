import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import BaseMap from '../map/BaseMap';
import { cameraAt, toLngLat, type Coordinate } from '../map/geo';
import PinMarker from '../map/PinMarker';
import { radius, spacing } from '../theme';

/** A still picture of where a listing is (details screen). It cannot be dragged, so it never fights the scrolling page. */
export default function PropertyLocationMap({ at }: { at: Coordinate }) {
  return (
    <View style={styles.box}>
      <BaseMap camera={cameraAt(at)} interactive={false} testID="details-map">
        <Marker id="property" lngLat={toLngLat(at)}>
          <PinMarker selected />
        </Marker>
      </BaseMap>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
});
