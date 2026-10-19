import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatNumber, sqmToJerib } from '../i18n/format';
import { colors, radius, spacing, surfaces } from '../theme';
import AppText from './AppText';
import Button from './Button';
import Icon from './Icon';

interface Props {
  /** The area of the listing being looked at, in square metres: the popup then also says what it is in jerib. */
  areaSqm?: number;
}

/** The conversions people ask for most, as translation keys; one jerib is 2,000 square metres. */
const ROWS = [
  'property.jeribInfoOne',
  'property.jeribInfoHectare',
  'property.jeribInfoHalf',
  'property.jeribInfoQuarter',
] as const;

interface ConversionProps {
  /** The listing's area in square metres. */
  areaSqm: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * What a jerib is and what this listing's area comes to in jerib, as a quiet card that is folded shut until the
 * reader opens it. It lives below the listing's facts so the area row itself stays one clean figure, with no
 * explanation hanging off it.
 */
export function JeribConversion({ areaSqm, style }: ConversionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View testID="jerib-conversion" style={[styles.fold, style]}>
      <Pressable
        testID="jerib-conversion-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => [styles.foldHead, pressed && styles.pressed]}
      >
        <AppText variant="label">{t('property.areaConversion')}</AppText>
        <Icon
          name={open ? 'chevronDown' : 'chevronLeft'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
      {open ? (
        <View style={styles.foldBody} testID="jerib-conversion-body">
          <AppText variant="label" color={colors.primaryDark}>
            {t('property.jeribInfoThis', {
              sqm: `${formatNumber(areaSqm)} ${t('unit.sqm')}`,
              jerib: `${formatNumber(sqmToJerib(areaSqm))} ${t('unit.jerib')}`,
            })}
          </AppText>
          <AppText color={colors.textSecondary}>
            {t('property.jeribInfoIntro')}
          </AppText>
          <View style={styles.rows}>
            {ROWS.map(key => (
              <View key={key} style={styles.row}>
                <AppText variant="label">{t(key)}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The word "جریب" with a small ⓘ before it. Tapping it opens a short card that says what a jerib is and the handful of
 * conversions people use (to square metres and hectares), and, when it knows the area, what this listing comes to in
 * jerib. The conversion lives here instead of under the area, so the listing's figures stay clean and the explanation
 * is one tap away for whoever wants it.
 */
export default function JeribInfoButton({ areaSqm }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID="jerib-info"
        accessibilityRole="button"
        accessibilityLabel={t('property.jeribInfoLabel')}
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Icon name="info" size={16} color={colors.primary} weight={1.9} />
        <AppText variant="label" color={colors.primary}>
          {t('unit.jerib')}
        </AppText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel={t('common.close')}
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View
            testID="jerib-info-card"
            accessibilityViewIsModal
            style={styles.card}
          >
            <View style={styles.head}>
              <Icon name="info" size={22} color={colors.primary} weight={1.9} />
              <AppText variant="heading">
                {t('property.jeribInfoTitle')}
              </AppText>
            </View>
            <AppText color={colors.textSecondary}>
              {t('property.jeribInfoIntro')}
            </AppText>
            <View style={styles.rows}>
              {ROWS.map(key => (
                <View key={key} style={styles.row}>
                  <AppText variant="label">{t(key)}</AppText>
                </View>
              ))}
            </View>
            {areaSqm !== undefined ? (
              <AppText variant="label" color={colors.primaryDark}>
                {t('property.jeribInfoThis', {
                  sqm: `${formatNumber(areaSqm)} ${t('unit.sqm')}`,
                  jerib: `${formatNumber(sqmToJerib(areaSqm))} ${t(
                    'unit.jerib',
                  )}`,
                })}
              </AppText>
            ) : null}
            <Button title={t('common.ok')} onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: spacing.xl,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fold: { ...surfaces.card, overflow: 'hidden' },
  foldHead: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foldBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  rows: { gap: spacing.sm },
  row: {
    backgroundColor: colors.neutralSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
