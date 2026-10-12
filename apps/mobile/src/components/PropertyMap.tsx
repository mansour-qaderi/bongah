import React, { useMemo } from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { Property } from '@bongah/shared-types';
import BaseMap from '../map/BaseMap';
import { hasPin, pinFeatures, type MapCamera } from '../map/geo';
import { colors } from '../theme';

interface Props {
  properties: Property[];
  /** Where to look. Changing it moves the map (e.g. when a province filter is applied). */
  camera: MapCamera;
  selectedId?: string | null;
  onSelect: (property: Property) => void;
}

/**
 * Interactive map of listings. Only listings with an exact pin appear (the rest have no place to
 * be drawn). Pins are one map layer rather than one view per listing, which stays smooth with
 * hundreds of listings.
 */
export default function PropertyMap({
  properties,
  camera,
  selectedId,
  onSelect,
}: Props) {
  const data = useMemo(
    () => pinFeatures(properties, selectedId),
    [properties, selectedId],
  );

  return (
    <BaseMap camera={camera} testID="property-map">
      <GeoJSONSource
        id="listings"
        data={data}
        onPress={event => {
          const id = event.nativeEvent.features[0]?.properties?.id;
          const hit = properties.find(p => p.id === id);
          if (hit && hasPin(hit)) onSelect(hit);
        }}
      >
        <Layer
          id="listing-pins"
          type="circle"
          paint={{
            'circle-radius': ['case', ['==', ['get', 'selected'], 1], 13, 10],
            'circle-color': [
              'case',
              ['==', ['get', 'selected'], 1],
              colors.accent,
              colors.primary,
            ],
            'circle-stroke-width': 3,
            'circle-stroke-color': colors.surface,
          }}
        />
      </GeoJSONSource>
    </BaseMap>
  );
}
