import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import Icon from './Icon';

/** Why the map could not find the person: they refused (or the phone blocks it), or the GPS is off. */
export type LocationProblem = 'denied' | 'unavailable';

interface Props {
  /** null keeps it closed. */
  problem: LocationProblem | null;
  onOpenSettings: () => void;
  onClose: () => void;
}

/**
 * A quiet, centred card shown when the map could not use the phone's position: it says in one breath what is
 * missing and why it is asked for, and offers the one thing that fixes it (the phone's settings) next to a
 * "not now" that leaves the map exactly as it is. The person is never blocked: the map works without it.
 */
export default function LocationPermissionModal({
  problem,
  onOpenSettings,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const denied = problem === 'denied';
  return (
    <Modal
      visible={problem !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel={t('common.close')}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          testID="location-permission"
          accessibilityViewIsModal
          style={styles.card}
        >
          <View style={styles.halo}>
            <View style={styles.disc}>
              <Icon name="locate" size={34} color={colors.primary} />
            </View>
          </View>
          <AppText variant="heading" style={styles.centred}>
            {t(
              denied ? 'home.permissionDeniedTitle' : 'home.permissionOffTitle',
            )}
          </AppText>
          <AppText
            variant="body"
            color={colors.textMuted}
            style={styles.centred}
          >
            {t(denied ? 'home.locationDenied' : 'home.locationUnavailable')}
          </AppText>
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.centred}
          >
            {t('home.permissionPrivacy')}
          </AppText>
          <View style={styles.actions}>
            <Button
              title={t('account.openSettings')}
              onPress={onOpenSettings}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={8}
              style={styles.later}
            >
              <AppText variant="label" color={colors.textMuted}>
                {t('home.permissionLater')}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'stretch',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  halo: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  disc: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centred: { textAlign: 'center' },
  actions: { gap: spacing.xs, marginTop: spacing.sm },
  later: { alignSelf: 'center', paddingVertical: spacing.sm },
});
