import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { MARKET_CONFIG, type DealType, type Market } from '@bongah/shared-types';
import AppText from '../../components/AppText';
import Icon, { type IconName } from '../../components/Icon';
import MapLoader from '../../components/MapLoader';
import { dealTypeLabel } from '../../i18n/market';
import { useActiveMarket } from '../../market/marketStore';
import {
  inkBetween,
  SelectionFill,
  useSelection,
} from '../../components/selection';
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
        <View style={styles.roundLoader}>
          <MapLoader size={26} onBrand={filled} />
        </View>
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

/**
 * The deals the quick filter offers: every deal of the market except the daily rental, which has too few listings to
 * earn a place in the capsule (it is still in the filter sheet, and its markers keep their colour on the map).
 */
export const quickDeals = (market: Market): readonly DealType[] =>
  MARKET_CONFIG[market].dealTypes.filter(deal => deal !== 'DAILY_RENT');

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
  const market = useActiveMarket();
  return (
    <View style={styles.capsule} testID="deal-filter">
      {quickDeals(market).map(deal => {
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
              {dealTypeLabel(deal, market, t)}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The small chip under the top row: how many listings are in view. It is also where the map says it is busy, so
 * nothing spins on its own anywhere else on the map: a spinner sits beside its words while the first listings load,
 * while a newer count is on its way, and while the phone's position is being found.
 */
export function StatusPill({
  loading,
  refreshing = false,
  locating = false,
  message,
}: {
  /** Nothing to count yet: the chip says it is loading instead of giving a count. */
  loading: boolean;
  /** A newer count is on its way: the spinner joins the count already on screen. */
  refreshing?: boolean;
  /** The phone's position is being looked for. */
  locating?: boolean;
  message: string | null;
}) {
  const { t } = useTranslation();
  const busy = loading || refreshing || locating;
  const words = loading ? t('common.loading') : message;
  if (!words) return null;
  return (
    <View style={styles.status} testID="map-status">
      {busy ? (
        // The map's own busy sign (a pin that hops, with radar rings). Its slot is as tall as the words, so the chip does
        // not grow while it is busy and shrink when it is done.
        <View style={styles.statusLoader}>
          <MapLoader size={24} label={t('common.loading')} />
        </View>
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        {words}
      </AppText>
    </View>
  );
}

/**
 * The place the middle of the map is over («neighbourhood، district، province»), as a quiet pill under the top row.
 * Nothing is drawn until a name is known, so the map never shows a placeholder.
 */
export function AreaTitle({ name }: { name: string | null }) {
  const { t } = useTranslation();
  if (!name) return null;
  return (
    <View
      style={styles.area}
      testID="map-area"
      accessible
      accessibilityLabel={`${t('map.areaAria')}: ${name}`}
    >
      <Icon name="pin" size={14} color={colors.primary} background={colors.surface} />
      <AppText variant="caption" color={colors.text} numberOfLines={1} style={styles.areaText}>
        {name}
      </AppText>
    </View>
  );
}

/**
 * The pill at the foot of the map that swaps between the map and the list: both choices side by side. The current one
 * is filled in emerald; choosing the other one passes the fill over to it (it fades and scales in on the new tab while
 * it leaves the old one, and the icons and words change ink with it) instead of jumping. Tapping the current one does
 * nothing.
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
  return (
    <View testID="mode-toggle" style={styles.toggle}>
      <ModeSegment
        value="map"
        icon="map-pin"
        label={mapLabel}
        selected={mode === 'map'}
        onChange={onChange}
      />
      <ModeSegment
        value="list"
        icon="list"
        label={listLabel}
        selected={mode === 'list'}
        onChange={onChange}
      />
    </View>
  );
}

function ModeSegment({
  value,
  icon,
  label,
  selected,
  onChange,
}: {
  value: 'map' | 'list';
  icon: IconName;
  label: string;
  selected: boolean;
  onChange: (mode: 'map' | 'list') => void;
}) {
  const progress = useSelection(selected);
  return (
    <Pressable
      testID={`mode-${value}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => (selected ? undefined : onChange(value))}
      style={styles.modeSegment}
    >
      <SelectionFill value={progress} radius={20} />
      {/* Two icons on top of each other, one in each ink, and the one that is not wanted fades out. */}
      <View style={styles.modeIcon}>
        <Animated.View
          style={{
            opacity: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          }}
        >
          <Icon name={icon} size={18} color={colors.textMuted} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          <Icon
            name={icon}
            size={18}
            color={WHITE}
            background={colors.primary}
          />
        </Animated.View>
      </View>
      <AppText
        variant="label"
        animatedColor={inkBetween(progress, colors.textMuted, WHITE)}
      >
        {label}
      </AppText>
    </Pressable>
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
  // The pin stands on the middle of its box and hops above it: moved down a little, the pin and its rings look centred.
  roundLoader: { marginTop: 4 },
  statusLoader: {
    width: 24,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  area: {
    alignSelf: 'center',
    maxWidth: '80%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...surfaces.floating,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  areaText: { flexShrink: 1, fontWeight: '600' },
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
  // The icon's own box, so the second ink can lie exactly over the first.
  modeIcon: { width: 18, height: 18 },
});
