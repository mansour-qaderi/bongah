import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Icon from './Icon';

interface Props {
  label: string;
  onPress: () => void;
  /** Distance from the bottom of the screen it floats over. */
  bottom?: number;
}

/**
 * A floating "add" button with its words ("ثبت آگهی جدید"): an emerald capsule with a plus, in the corner a
 * thumb reaches first. `end` is the left edge in Dari and Pashto and the right edge in a left-to-right language.
 */
export default function Fab({ label, onPress, bottom = spacing.lg }: Props) {
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => [styles.fab, pressed ? styles.pressed : null]}
      >
        <Icon name="plus" size={22} color={colors.textOnPrimary} weight={1.5} />
        <AppText variant="label" color={colors.textOnPrimary}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', end: spacing.lg },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
});
