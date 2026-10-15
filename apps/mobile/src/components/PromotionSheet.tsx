import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Property } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import {
  usePricing,
  useRedeemLadderToken,
  useReferralSummary,
} from '../api/hooks';
import { formatDate, formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { usePaymentFlow } from '../payments/usePaymentFlow';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import Button from './Button';
import OptionCard from './OptionCard';
import PaymentProgress from './PaymentProgress';
import { ErrorView, LoadingView } from './States';

type Promotion = 'LADDER' | 'FEATURED_AD';
type Promotable = Pick<
  Property,
  'id' | 'title' | 'is_featured' | 'featured_until'
>;

interface Props {
  /** The listing to promote. null keeps the sheet closed. */
  property: Promotable | null;
  onClose: () => void;
}

/**
 * Bottom sheet for the two paid promotions of one listing: "Ladder" (back to the top of search)
 * and "Featured" (badge and frame for a number of days). The person picks one, pays on the
 * HesabPay page, and the sheet follows the payment until the server confirms it. The price is
 * the server's; the app only says which promotion and which listing.
 *
 * The caller makes sure the person is signed in and owns the listing.
 */
export default function PromotionSheet({ property, onClose }: Props) {
  return (
    <Modal
      visible={property !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* The body only exists while open, so each opening starts from a clean choice. */}
      {property ? <SheetBody property={property} onClose={onClose} /> : null}
    </Modal>
  );
}

function SheetBody({
  property,
  onClose,
}: {
  property: Promotable;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const pricing = usePricing();
  const flow = usePaymentFlow();
  // A free ladder earned by inviting friends. Only counted when the server says so.
  const referral = useReferralSummary(true);
  const redeem = useRedeemLadderToken();
  const freeTokens = referral.data?.stats.ladder_tokens_available ?? 0;
  const [choice, setChoice] = useState<Promotion>('LADDER');

  const prices = pricing.data;
  const featuredHelp =
    property.is_featured && property.featured_until && prices
      ? t('promotion.featuredExtends', {
          date: formatDate(property.featured_until),
          days: formatNumber(prices.featured_ad_days, 0),
        })
      : t('checkout.featuredHelp', {
          days: formatNumber(prices?.featured_ad_days ?? 0, 0),
        });
  const amount = prices
    ? choice === 'LADDER'
      ? prices.ladder
      : prices.featured_ad
    : null;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityLabel={t('common.close')}
        style={styles.backdrop}
        onPress={onClose}
      />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="heading">{t('promotion.title')}</AppText>
            <AppText
              variant="caption"
              color={colors.textMuted}
              numberOfLines={1}
            >
              {property.title}
            </AppText>
          </View>
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
          {redeem.isSuccess ? (
            <>
              <Banner
                kind="success"
                message={t('promotion.freeTokenDone', {
                  count: formatNumber(redeem.data.ladder_tokens_available, 0),
                })}
              />
              <Button title={t('common.close')} onPress={onClose} />
            </>
          ) : flow.payment ? (
            <PaymentProgress flow={flow} onDone={onClose} />
          ) : pricing.isPending ? (
            <LoadingView />
          ) : !prices ? (
            <ErrorView
              message={t('checkout.pricesFailed')}
              onRetry={() => pricing.refetch()}
            />
          ) : (
            <>
              {flow.startError ? (
                <Banner
                  kind="error"
                  message={errorMessage(flow.startError, t)}
                />
              ) : null}
              <AppText variant="label" style={styles.help}>
                {t('promotion.choose')}
              </AppText>
              <OptionCard
                title={t('checkout.ladder')}
                subtitle={t('checkout.ladderHelp')}
                trailing={format.price(prices.ladder, prices.currency)}
                selected={choice === 'LADDER'}
                onPress={() => setChoice('LADDER')}
              />
              <OptionCard
                title={t('checkout.featured')}
                subtitle={featuredHelp}
                trailing={format.price(prices.featured_ad, prices.currency)}
                selected={choice === 'FEATURED_AD'}
                onPress={() => setChoice('FEATURED_AD')}
              />
              {choice === 'LADDER' && freeTokens > 0 ? (
                <View style={styles.freeToken}>
                  <AppText variant="label" color={colors.success}>
                    {t('promotion.freeTokens', {
                      count: formatNumber(freeTokens, 0),
                    })}
                  </AppText>
                  {redeem.isError ? (
                    <Banner
                      kind="error"
                      message={errorMessage(redeem.error, t)}
                    />
                  ) : null}
                  <Button
                    title={t('promotion.useFreeToken')}
                    loading={redeem.isPending}
                    onPress={() => redeem.mutate(property.id)}
                  />
                </View>
              ) : null}
              <AppText variant="heading" style={styles.amount}>
                {t('checkout.amount')}:{' '}
                {format.price(amount ?? 0, prices.currency)}
              </AppText>
              <Button
                title={t('checkout.pay')}
                loading={flow.starting}
                onPress={() =>
                  flow.begin({ purpose: choice, property_id: property.id })
                }
              />
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
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  scroll: { flexGrow: 0 },
  content: { padding: spacing.lg, paddingTop: spacing.sm },
  help: { marginBottom: spacing.md },
  amount: { marginVertical: spacing.lg },
  freeToken: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
});
