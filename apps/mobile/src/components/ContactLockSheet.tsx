import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ContactQuota, PropertyContact } from '@bongah/shared-types';
import { unlockContact } from '../api/endpoints';
import { errorMessage } from '../api/errors';
import { usePricing, useReferralSummary } from '../api/hooks';
import { formatDate, formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { usePaymentFlow } from '../payments/usePaymentFlow';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import Button from './Button';
import PaymentProgress from './PaymentProgress';

interface Props {
  /** The listing whose number was asked for. */
  propertyId: string;
  visible: boolean;
  /** Today's allowance as the server last reported it. */
  quota: ContactQuota | null;
  onClose: () => void;
  /** A credit was spent and the number is now revealed. */
  onUnlocked: (contact: PropertyContact) => void;
  /** Keeps the cached allowance truthful after a reveal. */
  onResult: (result: Awaited<ReturnType<typeof unlockContact>>) => void;
}

/**
 * Bottom sheet shown when today's free phone number reveals are used up. The person can spend a
 * credit they already hold (bought, or earned by inviting friends), buy a pack of credits on the
 * HesabPay page, or go invite friends. The price, the pack size and the referral reward are the
 * server's; the app only displays them.
 *
 * Credits are only ever spent by the "use 1 credit" button here: the server refuses to spend one
 * unless the request says so.
 */
export default function ContactLockSheet(props: Props) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      {/* The body only exists while open, so each opening starts from a clean state. */}
      {props.visible ? <SheetBody {...props} /> : null}
    </Modal>
  );
}

function SheetBody({
  propertyId,
  quota,
  onClose,
  onUnlocked,
  onResult,
}: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const navigation = useNavigation();
  const pricing = usePricing();
  const flow = usePaymentFlow();
  const referral = useReferralSummary(true);
  const perInvite = referral.data?.stats.contact_credits_per_invite ?? 0;

  const spend = useMutation({
    mutationFn: () => unlockContact(propertyId, true),
    onSuccess: result => {
      onResult(result);
      if (result.contact) onUnlocked(result.contact);
    },
  });

  const prices = pricing.data;
  const credits = quota?.credits ?? 0;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={styles.backdrop}
        onPress={onClose}
      />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            {t('contact.limitTitle')}
          </AppText>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <AppText variant="label" color={colors.primary}>
              {t('common.close')}
            </AppText>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {flow.payment ? (
            <PaymentProgress flow={flow} onDone={flow.reset} />
          ) : (
            <>
              {quota ? (
                <AppText color={colors.textMuted}>
                  {t('contact.limitBody', {
                    limit: formatNumber(quota.free_limit, 0),
                    date: formatDate(quota.resets_at),
                  })}
                </AppText>
              ) : null}

              {credits > 0 ? (
                <View style={styles.credits}>
                  <AppText variant="label" color={colors.success}>
                    {t('contact.creditsLeft', {
                      count: formatNumber(credits, 0),
                    })}
                  </AppText>
                  {quota && quota.referral_credits > 0 ? (
                    <AppText variant="caption" color={colors.success}>
                      {t('contact.referralCreditsLeft', {
                        count: formatNumber(quota.referral_credits, 0),
                      })}
                    </AppText>
                  ) : null}
                  {spend.isError ? (
                    <Banner kind="error" message={errorMessage(spend.error, t)} />
                  ) : null}
                  <Button
                    title={t('contact.useCredit')}
                    loading={spend.isPending}
                    onPress={() => spend.mutate()}
                  />
                  <AppText variant="caption" color={colors.textMuted}>
                    {t('contact.useCreditHelp')}
                  </AppText>
                </View>
              ) : null}

              <AppText variant="heading" style={styles.section}>
                {t('contact.buyTitle')}
              </AppText>
              {flow.startError ? (
                <Banner kind="error" message={errorMessage(flow.startError, t)} />
              ) : null}
              {pricing.isPending ? (
                <ActivityIndicator color={colors.primary} />
              ) : !prices ? (
                <Banner kind="error" message={t('checkout.pricesFailed')}>
                  <Button
                    title={t('common.retry')}
                    variant="outline"
                    onPress={() => pricing.refetch()}
                  />
                </Banner>
              ) : (
                <View style={styles.pack}>
                  <View style={styles.packRow}>
                    <AppText variant="label" style={styles.packTitle}>
                      {t('contact.buyItem', {
                        count: formatNumber(prices.contact_credits_per_pack, 0),
                      })}
                    </AppText>
                    <AppText variant="label" color={colors.primaryDark}>
                      {format.price(prices.contact_credits, prices.currency)}
                    </AppText>
                  </View>
                  <AppText variant="caption" color={colors.textMuted}>
                    {t('contact.buyHelp')}
                  </AppText>
                  <Button
                    title={t('contact.buy')}
                    loading={flow.starting}
                    onPress={() => flow.begin({ purpose: 'CONTACT_CREDITS' })}
                  />
                </View>
              )}

              {perInvite > 0 ? (
                <Button
                  title={t('contact.inviteFriends', {
                    count: formatNumber(perInvite, 0),
                  })}
                  variant="secondary"
                  onPress={() => {
                    onClose();
                    navigation.navigate('Referral');
                  }}
                  style={styles.invite}
                />
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1 },
  scroll: { flexGrow: 0 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  credits: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  section: { marginTop: spacing.sm },
  pack: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  packTitle: { flex: 1 },
  invite: { marginTop: spacing.sm },
});
