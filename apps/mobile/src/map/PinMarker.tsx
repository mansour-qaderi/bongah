import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { DealType, PropertyType } from '@bongah/shared-types';
import Icon from '../components/Icon';
import { colors, dealColors } from '../theme';
import { propertyLineIcon } from './markers';

/** The head's width, and the whole pin's size: fixed, so the map never resizes the view it draws it in. */
const HEAD = 34;
const TAIL = 12;
export const PIN_WIDTH = 40;
export const PIN_HEIGHT = 46;
/** Half the diagonal of the tail's square: how far its point reaches below its own centre. */
const TAIL_REACH = (TAIL * Math.SQRT2) / 2;

/**
 * Where a property is. With a `deal` it is a pin (a round head on a point) in the colour of what the property is
 * offered for, the same colours as its marker on the Home map: green for sale, blue for rent, orange for a mortgage
 * (گروی); `type` puts the kind of property in its head. Put it on a map with `anchor="bottom"`: the point is the
 * bottom edge of the view, so the point and not the middle of the head is on the spot.
 *
 * Without a `deal` (the chat's "send a place" map, which is not about a listing) it is the plain dot it always was,
 * anchored at its centre.
 */
export default function PinMarker({
  selected = false,
  deal,
  type,
}: {
  selected?: boolean;
  deal?: DealType;
  type?: PropertyType;
}) {
  if (!deal) {
    return (
      <View
        style={[styles.dot, selected ? styles.selected : null]}
        accessibilityLabel="pin"
      />
    );
  }
  const tone = dealColors[deal].main;
  return (
    <View style={styles.pin} accessibilityLabel="pin" testID="deal-pin">
      <View style={[styles.tail, { backgroundColor: tone }]} />
      <View style={[styles.head, { backgroundColor: tone }]}>
        {type ? (
          <Icon
            name={propertyLineIcon(type)}
            size={18}
            color={dealColors[deal].on}
            background={tone}
            weight={2.1}
          />
        ) : (
          <View style={styles.core} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  selected: { backgroundColor: colors.accent },
  // Drawn left-to-right whatever the language: its parts are placed by offsets, which a right-to-left layout mirrors.
  pin: {
    direction: 'ltr',
    width: PIN_WIDTH,
    height: PIN_HEIGHT,
    alignItems: 'center',
  },
  head: {
    width: HEAD,
    height: HEAD,
    borderRadius: HEAD / 2,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A square turned 45 degrees under the head; its lowest corner is the pin's point, on the view's bottom edge.
  tail: {
    position: 'absolute',
    width: TAIL,
    height: TAIL,
    left: (PIN_WIDTH - TAIL) / 2,
    top: PIN_HEIGHT - TAIL_REACH - TAIL / 2,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
  core: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
  },
});
