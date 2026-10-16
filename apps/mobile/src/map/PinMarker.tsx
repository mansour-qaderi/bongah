import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** The dot that marks a property. Anchored at its centre, so it sits exactly on the point. */
export default function PinMarker({
  selected = false,
}: {
  selected?: boolean;
}) {
  return (
    <View
      style={[styles.dot, selected ? styles.selected : null]}
      accessibilityLabel="pin"
    />
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
});
