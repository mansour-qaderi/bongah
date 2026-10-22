import React from 'react';
import {
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';

interface Props {
  label: string;
  /** A line under the label that says what turning it on does. */
  helper?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Draws the row in the gold of a featured listing (a thicker gold edge) instead of the quiet grey one. */
  gold?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A setting that is on or off: its name and what it does on one side, the switch on the other. The whole row is
 * what a screen reader announces ("<label>, on"), so the switch needs no label of its own.
 */
export default function SwitchRow({
  label,
  helper,
  value,
  onValueChange,
  disabled = false,
  gold = false,
  testID,
  style,
}: Props) {
  return (
    <View style={[styles.row, gold && styles.gold, style]}>
      <View style={styles.text}>
        <AppText variant="label">{label}</AppText>
        {helper ? (
          <AppText variant="caption" color={colors.textMuted}>
            {helper}
          </AppText>
        ) : null}
      </View>
      <Switch
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.handle, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gold: { borderWidth: 2.5, borderColor: colors.accentBright },
  text: { flex: 1, gap: spacing.xs },
});

/** The row's own look, for the other rows that must read as the same thing (the featured frame on a listing's page). */
export const rowStyles = styles;
