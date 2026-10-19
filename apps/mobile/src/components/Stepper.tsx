import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../i18n/format';
import { colors, radius, spacing, surfaces } from '../theme';
import AppText from './AppText';

interface Props {
  label: string;
  /** null = not given. The first tap on + gives 1; going below 0 clears it again. */
  value: number | null;
  onChange: (value: number | null) => void;
  max?: number;
  error?: string;
  /** Marks the count as one the form cannot be sent without (a red star after the label). */
  required?: boolean;
}

const BUTTON = 36;

/**
 * A count the person sets with two big buttons instead of the keyboard: rooms, bathrooms. It is a tile in its
 * own right so these two figures sit as prominently on the form as the price and the area. The row is drawn
 * "- n +" whatever the language, as such controls always are.
 */
export default function Stepper({
  label,
  value,
  onChange,
  max = 50,
  error,
  required,
}: Props) {
  const { t } = useTranslation();
  const canAdd = (value ?? -1) < max;
  const press = (step: 1 | -1) => {
    if (step === 1) onChange(value === null ? 1 : Math.min(max, value + 1));
    else onChange(value === null || value <= 0 ? null : value - 1);
  };
  return (
    <View style={styles.tileWrap}>
      <View style={[styles.tile, error ? styles.tileError : null]}>
        <AppText variant="label" numberOfLines={2} style={styles.label}>
          {label}
          {required ? (
            <AppText variant="label" color={colors.danger}>
              {' *'}
            </AppText>
          ) : null}
        </AppText>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${t('common.decrease')}`}
            accessibilityState={{ disabled: value === null }}
            disabled={value === null}
            hitSlop={6}
            onPress={() => press(-1)}
            style={({ pressed }) => [
              styles.button,
              value === null ? styles.buttonOff : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <AppText
              variant="heading"
              color={value === null ? colors.textMuted : colors.primary}
              style={styles.glyph}
            >
              −
            </AppText>
          </Pressable>
          <AppText
            variant="heading"
            color={value === null ? colors.textMuted : colors.text}
            style={styles.value}
            accessibilityLabel={label}
          >
            {value === null ? '—' : formatNumber(value, 0)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${t('common.increase')}`}
            accessibilityState={{ disabled: !canAdd }}
            disabled={!canAdd}
            hitSlop={6}
            onPress={() => press(1)}
            style={({ pressed }) => [
              styles.button,
              styles.buttonOn,
              !canAdd ? styles.buttonOff : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <AppText
              variant="heading"
              color={colors.textOnPrimary}
              style={styles.glyph}
            >
              +
            </AppText>
          </Pressable>
        </View>
      </View>
      {error ? (
        <AppText variant="caption" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tileWrap: { flex: 1, gap: spacing.xs },
  tile: {
    ...surfaces.tile,
    padding: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  tileError: { borderColor: colors.danger, borderWidth: 1 },
  label: { textAlign: 'center', minHeight: 44 },
  row: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  value: { minWidth: 36, textAlign: 'center' },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  buttonOn: { backgroundColor: colors.primary },
  buttonOff: { opacity: 0.35 },
  pressed: { opacity: 0.8 },
  glyph: { lineHeight: 24, textAlign: 'center' },
});
