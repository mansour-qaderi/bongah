import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  title: string;
  subtitle?: string;
  /** Shown at the far end, e.g. the price. */
  trailing?: string;
  selected: boolean;
  onPress: () => void;
}

/** A tappable card where exactly one of a group is selected (packages, promotion types, listings). */
export default function OptionCard({
  title,
  subtitle,
  trailing,
  selected,
  onPress,
}: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={styles.text}>
        <AppText
          variant="label"
          color={selected ? colors.primaryDark : colors.text}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={colors.textMuted}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ? (
        <AppText variant="label" color={colors.primaryDark}>
          {trailing}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1 },
});
