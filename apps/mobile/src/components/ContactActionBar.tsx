import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ContactQuota } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import type { useContactActions } from '../contact/useContactActions';
import { formatNumber } from '../i18n/format';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import { useErrorToast } from './useErrorToast';

type Actions = ReturnType<typeof useContactActions>;

/**
 * One line about today's allowance, or null while it is not known. Someone with no limit has nothing to be told (a
 * line saying "unlimited" is only noise), so only a metered allowance is written.
 */
function allowanceText(
  quota: ContactQuota | null,
  t: TFunction,
): string | null {
  if (!quota || quota.unlimited) return null;
  return quota.free_remaining > 0
    ? t('property.freeRevealsLeft', {
        count: formatNumber(quota.free_remaining, 0),
      })
    : t('property.noFreeRevealsLeft');
}

/**
 * The strip pinned to the bottom of a listing: Call and Chat in App. Call reveals the owner's number (metered, see
 * useContactActions); Chat never does. (WhatsApp is on the cards and the map sheet, not here.)
 */
export default function ContactActionBar({
  actions,
  signedIn,
}: {
  actions: Actions;
  signedIn: boolean;
}) {
  const { t } = useTranslation();
  const caption = signedIn
    ? allowanceText(actions.quota, t)
    : t('property.contactSignIn');
  useErrorToast(
    actions.error ? errorMessage(actions.error, t) : null,
    actions.error,
  );
  useErrorToast(actions.openFailed ? t('contact.openFailed') : null);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bar}>
      {caption ? (
        <AppText
          variant="caption"
          color={colors.textMuted}
          style={styles.caption}
        >
          {caption}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <Button
          icon="phone"
          title={t('property.callAction')}
          loading={actions.revealing}
          onPress={actions.call}
          style={styles.button}
        />
        <Button
          icon="chat"
          title={t('property.chatAction')}
          variant="secondary"
          loading={actions.openingChat}
          onPress={actions.chat}
          style={styles.button}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  caption: { textAlign: 'center', marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1, paddingHorizontal: spacing.sm },
});
