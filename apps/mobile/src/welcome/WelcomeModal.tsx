import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AppText from '../components/AppText';
import Button from '../components/Button';
import { colors, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  /** The quote of gratitude: the admin's, or the app's own when there is none. */
  quote: string;
  /** "Start": closes the card, and (if the person wants the morning messages) asks to allow notifications. */
  onStart: () => void;
  /** Close without being asked anything (the close button, the Android back button). */
  onClose: () => void;
}

/**
 * The card shown once, on a new account's first visit: a welcome, thanks, and a line of gratitude. Presentational
 * only: WelcomeGate decides when it appears and what closing it does.
 */
export default function WelcomeModal({
  visible,
  quote,
  onStart,
  onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal
          testID="welcome-card"
        >
          <AppText style={styles.sun} accessible={false}>
            🌅
          </AppText>
          <AppText variant="title" style={styles.center}>
            {t('welcome.title')}
          </AppText>
          <AppText color={colors.textMuted} style={styles.center}>
            {t('welcome.thanks')}
          </AppText>

          <View style={styles.quoteBox} testID="welcome-quote">
            <AppText
              variant="heading"
              color={colors.primaryDark}
              style={styles.center}
            >
              {quote}
            </AppText>
          </View>

          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.center}
          >
            {t('welcome.notifyHint')}
          </AppText>

          <Button
            icon="arrow"
            title={t('welcome.start')}
            onPress={onStart}
            style={styles.start}
          />
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            hitSlop={8}
            style={styles.close}
          >
            <AppText color={colors.textMuted}>{t('common.close')}</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  sun: { fontSize: 44, lineHeight: 56, textAlign: 'center' },
  center: { textAlign: 'center' },
  quoteBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginVertical: spacing.sm,
  },
  start: { marginTop: spacing.sm },
  close: { alignSelf: 'center', paddingVertical: spacing.sm },
});
