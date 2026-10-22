import React from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { formatNumber } from '../i18n/format';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import { inkBetween, SelectionFill, useSelection } from './selection';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** A smaller chip for dense groups (the filter sheet), still a 34-point target. */
  compact?: boolean;
  /** A figure shown after the label in its own small capsule (how many listings are in a status). */
  count?: number;
  /**
   * A tab that moves: the filled pill fades and scales onto the chip being chosen while it leaves the one being left,
   * and the label's ink follows. For chips that act as tabs (My Listings); chips that are options in a sheet stay still.
   */
  animated?: boolean;
}

export function Chip(props: ChipProps) {
  return props.animated ? <AnimatedChip {...props} /> : <PlainChip {...props} />;
}

/** The tab form of a chip: an edge, a pill that fills in, and the label on top. */
function AnimatedChip({
  label,
  selected = false,
  onPress,
  compact = false,
  count,
}: ChipProps) {
  const value = useSelection(selected);
  const height = compact ? 34 : CHIP_HEIGHT;
  return (
    <Animated.View
      style={[
        styles.tab,
        {
          height,
          borderColor: value.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.border, colors.primary],
          }),
        },
      ]}
    >
      <SelectionFill value={value} radius={height / 2} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabInner,
          compact && styles.chipCompact,
          pressed && styles.chipPressed,
        ]}
      >
        <AppText
          variant="label"
          animatedColor={inkBetween(value, colors.text, colors.textOnPrimary)}
          numberOfLines={1}
          style={styles.label}
        >
          {label}
        </AppText>
        {count !== undefined ? (
          <Animated.View
            style={[
              styles.count,
              {
                backgroundColor: value.interpolate({
                  inputRange: [0, 1],
                  outputRange: [colors.neutralSoft, 'rgba(255,255,255,0.22)'],
                }),
              },
            ]}
          >
            <AppText
              variant="caption"
              animatedColor={inkBetween(
                value,
                colors.neutralText,
                colors.textOnPrimary,
              )}
              style={styles.countText}
            >
              {formatNumber(count, 0)}
            </AppText>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function PlainChip({
  label,
  selected = false,
  onPress,
  compact = false,
  count,
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      {/* One line, never shrunk: a long label ("دکان و دفتر") must not wrap into a second line the fixed-height pill then cuts off (that is how "دکان و دفتر" showed as "دکان و"). */}
      <AppText
        variant="label"
        color={selected ? colors.textOnPrimary : colors.text}
        numberOfLines={1}
        style={styles.label}
      >
        {label}
      </AppText>
      {count !== undefined ? (
        <View style={[styles.count, selected && styles.countSelected]}>
          <AppText
            variant="caption"
            color={selected ? colors.textOnPrimary : colors.neutralText}
            style={styles.countText}
          >
            {formatNumber(count, 0)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A horizontally scrolling row of chips. In RTL it starts at the right edge by itself.
 *
 * A horizontal ScrollView grows to fill any spare height by default (React Native gives every ScrollView
 * `flexGrow: 1`), and its children are stretched to that height. Inside a screen that has a flexible area
 * below it, that turned the chips into tall pills. The row is pinned to its content's height here, so no
 * screen has to remember to do it.
 */
export function ChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={[styles.row, style]}
    >
      {children}
    </ScrollView>
  );
}

/** A comfortable tap target that still reads as a light pill. */
export const CHIP_HEIGHT = 36;

const styles = StyleSheet.create({
  // The edge and the clip of an animated tab; the pill that fills it and the pressable sit inside.
  tab: {
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tabInner: {
    flex: 1,
    paddingHorizontal: spacing.lg - 1,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipCompact: { height: 34, paddingHorizontal: spacing.md + 2 },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: { opacity: 0.8 },
  label: { flexShrink: 0 },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  countSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText: { lineHeight: 18, fontSize: 12 },
  scroller: { flexGrow: 0, flexShrink: 0 },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
