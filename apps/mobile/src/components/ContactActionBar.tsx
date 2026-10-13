import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { ContactQuota } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import type { useContactActions } from '../contact/useContactActions';
import { formatNumber } from '../i18n/format';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import Button from './Button';

type Actions = ReturnType<typeof useContactActions>;

/** One line about today's allowance, or null while it is not known. */
function allowanceText(
  quota: ContactQuota | null,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  if (!quota) return null;
  if (quota.unlimited) return t('property.unlimitedReveals');
  return quota.free_remaining > 0
    ? t('property.freeRevealsLeft', {
        count: formatNumber(quota.free_remaining, 0),
      })
    : t('property.noFreeRevealsLeft');
}

/**
 * The strip pinned to the bottom of a listing: Call, WhatsApp and Chat in App. Call and WhatsApp
 * reveal the owner's number (metered, see useContactActions); Chat never does.
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

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bar}>
      {actions.error ? (
        <Banner kind="error" message={errorMessage(actions.error, t)} />
      ) : null}
      {actions.openFailed ? (
        <Banner kind="error" message={t('contact.openFailed')} />
      ) : null}
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
          title={t('property.callAction')}
          loading={actions.revealing}
          onPress={actions.call}
          style={styles.button}
        />
        <Button
          title={t('property.whatsappAction')}
          variant="outline"
          disabled={actions.revealing}
          onPress={actions.whatsapp}
          style={styles.button}
        />
        <Button
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
