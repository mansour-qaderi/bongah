import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DEAL_TYPES, type DealType } from '@bongah/shared-types';
import AppText from '../../components/AppText';
import Icon, { type IconName } from '../../components/Icon';
import { colors, dealColors, radius, spacing, surfaces } from '../../theme';

/** The round controls and the capsule that float over the map. One size, one flat white + 1 px border, so they read as a set. */
export const CONTROL_SIZE = 46;
/** The "my location" button is the one control that stands alone on the map, so it is a little larger. */
export const LOCATE_SIZE = 54;
const WHITE = '#FFFFFF';

interface RoundButtonProps {
  icon: IconName;
  /** What a screen reader says (there is no visible text). */
  label: string;
  onPress: () => void;
  /** On: filled with the brand colour (a filter is active, offices are shown). */
  active?: boolean;
  /** Shows a spinner in place of the icon, and ignores taps. */
  busy?: boolean;
  /** A small count on the corner (the number of active filters), already formatted. */
  badge?: string;
  size?: number;
  tone?: 'light' | 'brand';
  /** The icon in the brand colour on the white disc (a lone control that should stand out from the map). */
  accent?: boolean;
  testID?: string;
}

/** A floating round button: a white disc with a thin line icon, or the brand colour when it is the main action. */
export function RoundButton({
  icon,
  label,
  onPress,
  active = false,
  busy = false,
  badge,
  size = CONTROL_SIZE,
  tone = 'light',
  accent = false,
  testID,
}: RoundButtonProps) {
  const brand = tone === 'brand';
  const filled = brand || active;
  const ink = filled ? WHITE : accent ? colors.primary : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: filled ? colors.primary : colors.surface,
          borderColor: filled ? colors.primary : colors.border,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={ink} />
      ) : (
        <Icon
          name={icon}
          size={brand ? 28 : accent ? 26 : 22}
          color={ink}
          background={filled ? colors.primary : colors.surface}
          weight={brand ? 2 : undefined}
        />
      )}
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="caption" color={colors.textOnAccent}>
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

interface DealFilterProps {
  value: DealType | undefined;
  /** undefined: show every deal. */
  onChange: (deal: DealType | undefined) => void;
}

/**
 * The quick filter: a capsule with one segment per kind of deal. It doubles as the map's legend, because each
 * segment wears the colour its markers have. Tap a segment to show only that deal, tap it again to show all.
 */
export function DealFilter({ value, onChange }: DealFilterProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.capsule} testID="deal-filter">
      {DEAL_TYPES.map(deal => {
        const selected = value === deal;
        const tone = dealColors[deal];
        return (
          <Pressable
            key={deal}
            testID={`deal-${deal}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(selected ? undefined : deal)}
            style={[
              styles.segment,
              selected ? { backgroundColor: tone.main } : null,
            ]}
          >
            <View
              style={[
                styles.swatch,
                { backgroundColor: selected ? WHITE : tone.main },
              ]}
            />
            <AppText
              variant="caption"
              color={selected ? WHITE : colors.text}
              numberOfLines={1}
              style={styles.segmentText}
            >
              {t(`dealType.${deal}`)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The small line under the top row: how many listings are in view, or a spinner while they load. */
export function StatusPill({
  loading,
  refreshing = false,
  message,
}: {
  /** Nothing to count yet: just the spinner. */
  loading: boolean;
  /** A newer count is on its way: a small spinner beside the one on screen. */
  refreshing?: boolean;
  message: string | null;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
        style={styles.loader}
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  if (!message) return null;
  return (
    <View style={styles.status} testID="map-status">
      {refreshing ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          accessibilityLabel={t('common.loading')}
        />
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        {message}
      </AppText>
    </View>
  );
}

/**
 * The pill at the foot of the map that swaps between the map and the list: both choices side by side, the
 * current one filled in emerald. Tapping the other one switches; tapping the current one does nothing.
 */
export function ModeToggle({
  mode,
  mapLabel,
  listLabel,
  onChange,
}: {
  /** What is showing now. */
  mode: 'map' | 'list';
  mapLabel: string;
  listLabel: string;
  onChange: (mode: 'map' | 'list') => void;
}) {
  const segment = (value: 'map' | 'list', icon: IconName, label: string) => {
    const selected = mode === value;
    const ink = selected ? WHITE : colors.textMuted;
    return (
      <Pressable
        key={value}
        testID={`mode-${value}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        onPress={() => (selected ? undefined : onChange(value))}
        style={[styles.modeSegment, selected ? styles.modeSelected : null]}
      >
        <Icon
          name={icon}
          size={18}
          color={ink}
          background={selected ? colors.primary : colors.surface}
        />
        <AppText variant="label" color={ink}>
          {label}
        </AppText>
      </Pressable>
    );
  };
  return (
    <View testID="mode-toggle" style={styles.toggle}>
      {segment('map', 'pin', mapLabel)}
      {segment('list', 'list', listLabel)}
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: -3,
    end: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.accentBright,
    borderWidth: 2,
    borderColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: {
    height: CONTROL_SIZE,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    ...surfaces.floating,
    borderRadius: CONTROL_SIZE / 2,
  },
  segment: {
    flexShrink: 1,
    height: CONTROL_SIZE - 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: (CONTROL_SIZE - 8) / 2,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  segmentText: { flexShrink: 1, fontWeight: '600' },
  loader: {
    width: 40,
    height: 40,
    borderRadius: 20,
    ...surfaces.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...surfaces.floating,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  toggle: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    gap: 2,
    borderRadius: 24,
    ...surfaces.floating,
  },
  modeSegment: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
  },
  modeSelected: { backgroundColor: colors.primary },
});
