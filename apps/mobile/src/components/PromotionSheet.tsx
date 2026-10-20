import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Property } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import { usePricing } from '../api/hooks';
import { useSafeAuth } from '../auth/useSafeAuth';
import { formatDate, formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { useFeaturedCreditSpend } from '../payments/useFeaturedCreditSpend';
import { usePaymentFlow } from '../payments/usePaymentFlow';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import PaymentProgress from './PaymentProgress';
import LadderFrameOption from './LadderFrameOption';
import { ErrorView, LoadingView } from './States';
import { showToast, ToastHost } from './Toast';
import { useErrorToast } from './useErrorToast';

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
 * Bottom sheet for the one paid promotion of a listing: the featured frame («کادر ویژه برای آگهی»), which puts the
 * listing at the top of the list with a badge and a frame for a number of days. A frame already bought ahead of time
 * is spent with one tap, so are seven ladders (نردبان) when they hold that many; otherwise the person pays on the HesabPay page and the sheet follows the payment until the
 * server confirms it. The price is the server's; the app only says which listing.
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
  const spend = useFeaturedCreditSpend();
  // Credits for featured listings: bought in a bundle, or the first-subscription bonus.
  const credits = useSafeAuth()?.user?.featured_credits ?? 0;
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  const prices = pricing.data;
  const featuredHelp =
    property.is_featured && property.featured_until && prices
      ? t('promotion.featuredExtends', {
          date: formatDate(property.featured_until),
          days: formatNumber(prices.featured_ad_days, 0),
        })
      : t('frame.topOfList', {
          days: formatNumber(prices?.featured_ad_days ?? 0, 0),
        });

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
          {flow.payment ? (
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
              <View style={styles.offer} testID="frame-offer">
                <View style={styles.offerText}>
                  <AppText variant="label" color={colors.primaryDark}>
                    {t('frame.title')}
                  </AppText>
                  <AppText variant="caption" color={colors.textMuted}>
                    {featuredHelp}
                  </AppText>
                </View>
                <AppText variant="label" color={colors.primaryDark}>
                  {format.price(prices.featured_ad, prices.currency)}
                </AppText>
              </View>
              {credits > 0 ? (
                <View style={styles.freeToken}>
                  <AppText variant="label" color={colors.success}>
                    {t('frame.credits', {
                      count: formatNumber(credits, 0),
                    })}
                  </AppText>
                  <Button
                    icon="check"
                    title={t('frame.useCredit')}
                    loading={spend.isPending}
                    onPress={() =>
                      spend.mutate(property.id, {
                        onSuccess: used => {
                          showToast(
                            t('checkout.creditUsed', {
                              count: formatNumber(used.featured_credits, 0),
                            }),
                            'success',
                          );
                          onClose();
                        },
                      })
                    }
                  />
                </View>
              ) : null}
              <LadderFrameOption propertyId={property.id} onDone={onClose} />
              <AppText variant="heading" style={styles.amount}>
                {t('checkout.amount')}:{' '}
                {format.price(prices.featured_ad, prices.currency)}
              </AppText>
              <Button
                icon="card"
                title={t('checkout.pay')}
                loading={flow.starting}
                onPress={() =>
                  flow.begin({
                    purpose: 'FEATURED_AD',
                    property_id: property.id,
                  })
                }
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      {/* The sheet is a modal: a toast has to be drawn inside it to be seen over it. */}
      <ToastHost />
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
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.accentBright,
    backgroundColor: colors.surface,
  },
  offerText: { flex: 1, gap: 2 },
  amount: { marginVertical: spacing.lg },
  freeToken: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
});
