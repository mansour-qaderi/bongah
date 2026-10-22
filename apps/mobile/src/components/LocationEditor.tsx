import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import type { DealType, PropertyType } from '@bongah/shared-types';
import BaseMap, { type MapViewChange } from '../map/BaseMap';
import { useMapStyle } from '../map/mapStyleStore';
import {
  fromLngLat,
  isInsideAfghanistan,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../map/geo';
import { UserDot } from '../map/markers';
import PinMarker from '../map/PinMarker';
import { spacing } from '../theme';
import CircleIconButton from './CircleIconButton';

interface Props {
  pin: Coordinate | null;
  onPin: (coordinate: Coordinate) => void;
  /** What the property is offered for and what it is: the pin takes its colour and its icon from them. */
  deal: DealType;
  type: PropertyType;
  camera: MapCamera;
  /** The phone's position, drawn as the pulsing blue marker. */
  me: Coordinate | null;
  onLocate: () => void;
  locating: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Where the map is looking after every move: the form keeps it so the other map (fullscreen or not) opens there. */
  onView?: (view: MapViewChange) => void;
  /** A tap or a drop landed outside Afghanistan; nothing was changed. */
  onOutside?: () => void;
  testID?: string;
  /** The map's own test id (the form's small map keeps the one the chat's picker and the tests know). */
  mapTestID?: string;
}

/**
 * The listing form's map, the same in the form and fullscreen: one component, so both behave alike and share one
 * state (the form holds the pin; this only draws and reports). The property's place is its pin and nothing else:
 * tap the map to put it there, or press it and drag it. The pin is in the colour of the deal (green for a sale, blue
 * for a rent, orange for a mortgage) with the kind of property in its head, and its point is on the spot.
 *
 * Overlaid at the top: the fullscreen toggle, "my location" and the street/satellite switch.
 */
export default function LocationEditor({
  pin,
  onPin,
  deal,
  type,
  camera,
  me,
  onLocate,
  locating,
  fullscreen,
  onToggleFullscreen,
  onView,
  onOutside,
  testID = 'location-editor',
  mapTestID = `${testID}-map`,
}: Props) {
  const { t } = useTranslation();
  // A drop outside Afghanistan is refused, but the pin has already moved under the finger: a new key puts it back.
  const [reset, setReset] = useState(0);
  const mapStyle = useMapStyle();
  const satellite = mapStyle.kind === 'satellite';

  const tap = (point: Coordinate) => {
    if (isInsideAfghanistan(point)) onPin(point);
    else onOutside?.();
  };

  return (
    <View style={styles.box} testID={testID}>
      <BaseMap
        camera={camera}
        // Inline in the form (a scrolling sheet) the map must be clipped by it; fullscreen it is the whole screen.
        androidView={fullscreen ? 'surface' : 'texture'}
        testID={mapTestID}
        onPress={tap}
        onViewChange={onView}
      >
        {pin ? (
          <ViewAnnotation
            key={`pin-${reset}`}
            id="chosen"
            lngLat={toLngLat(pin)}
            anchor="bottom"
            draggable
            onDragEnd={event => {
              const dropped = fromLngLat(event.nativeEvent.lngLat);
              if (isInsideAfghanistan(dropped)) onPin(dropped);
              else {
                setReset(count => count + 1);
                onOutside?.();
              }
            }}
          >
            <PinMarker selected deal={deal} type={type} />
          </ViewAnnotation>
        ) : null}
        {me ? (
          <Marker id="me" lngLat={toLngLat(me)}>
            <UserDot testID="my-position" />
          </Marker>
        ) : null}
      </BaseMap>

      {/* Top: fullscreen, my location and the map style. */}
      <View style={styles.top} pointerEvents="box-none">
        <CircleIconButton
          testID={`${testID}-fullscreen`}
          icon={fullscreen ? 'collapse' : 'expand'}
          label={fullscreen ? t('map.closeFullscreen') : t('map.fullscreen')}
          onPress={onToggleFullscreen}
        />
        <View style={styles.side}>
          <CircleIconButton
            testID={`${testID}-locate`}
            icon="locate"
            tone="brand"
            label={t('home.locate')}
            loading={locating}
            onPress={onLocate}
          />
          {/* Street map or satellite photographs; the label says what a press does. */}
          <CircleIconButton
            testID={`${testID}-style`}
            icon="satellite"
            tone={satellite ? 'brand' : 'neutral'}
            selected={satellite}
            label={satellite ? t('map.styleStreet') : t('map.styleSatellite')}
            onPress={mapStyle.toggle}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden' },
  top: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  side: { gap: spacing.sm },
});
