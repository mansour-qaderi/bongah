import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { errorMessage } from '../api/errors';
import { usePricing } from '../api/hooks';
import { useSafeAuth } from '../auth/useSafeAuth';
import { formatDate, formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { useFeaturedCreditSpend } from '../payments/useFeaturedCreditSpend';
import { usePaymentFlow } from '../payments/usePaymentFlow';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Icon from './Icon';
import LadderFrameOption from './LadderFrameOption';
import PaymentProgress from './PaymentProgress';
import { rowStyles } from './SwitchRow';
import { showToast } from './Toast';
import { useErrorToast } from './useErrorToast';

type Promotable = Pick<
  Property,
  'id' | 'title' | 'is_featured' | 'featured_until'
>;

/**
 * «پوشش با کادر ویژه» as a row on the listing's own page, not a sheet that has to be opened first: one press puts the
 * featured frame (the badge, the gold edge and the top of the list, for a number of days) on this listing.
 *
 * What the press does follows what the person holds: a frame bought ahead of time (or the first-subscription gift) is
 * spent at once; otherwise the HesabPay page opens and the payment is followed right here, under the button, until the
 * server confirms it. Seven ladders (نردبان) can pay for the frame too, which is the offer under the row when they
 * are held. The price is the server's; the app only says which listing. The line under the name says which of these
 * a press will do, so nothing is spent or paid by surprise.
 *
 * The row is the one at the foot of the listing form (the featured-frame switch): the same white row with the thick gold
 * edge, the name and what it does on one side. A press (rather than a switch) is what it takes here, so the far end is
 * an arrow in an emerald disc, which is also what shows a spinner while the press is being answered.
 *
 * The caller makes sure the person is signed in and owns the listing.
 */
export default function FeaturedFrameButton({
  property,
}: {
  property: Promotable;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const pricing = usePricing();
  const flow = usePaymentFlow();
  const spend = useFeaturedCreditSpend();
  // Frames bought in a bundle, or the first-subscription gift.
  const credits = useSafeAuth()?.user?.featured_credits ?? 0;
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  const prices = pricing.data;
  const days = formatNumber(prices?.featured_ad_days ?? 0, 0);
  const price = prices ? format.price(prices.featured_ad, prices.currency) : null;
  // What a press will do, in one line.
  const help = credits > 0
    ? t('frame.toggleCredit', { count: formatNumber(credits, 0) })
    : property.is_featured && property.featured_until && prices
    ? t('promotion.featuredExtends', {
        date: formatDate(property.featured_until),
        days,
      })
    : [prices ? t('frame.topOfList', { days }) : null, price]
        .filter(Boolean)
        .join(' · ');

  const busy = spend.isPending || flow.starting;
  const press = () => {
    if (credits > 0) {
      spend.mutate(property.id, {
        onSuccess: used =>
          showToast(
            t('checkout.creditUsed', {
              count: formatNumber(used.featured_credits, 0),
            }),
            'success',
          ),
      });
    } else {
      flow.begin({ purpose: 'FEATURED_AD', property_id: property.id });
    }
  };

  return (
    <View style={styles.box} testID="frame-offer">
      {flow.payment ? (
        <PaymentProgress flow={flow} onDone={flow.reset} />
      ) : (
        <>
          <Pressable
            testID="frame-promote"
            accessibilityRole="button"
            accessibilityLabel={t('property.promote')}
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            onPress={press}
            style={({ pressed }) => [
              rowStyles.row,
              rowStyles.gold,
              pressed && styles.pressed,
            ]}
          >
            <View style={rowStyles.text}>
              <AppText variant="label">{t('property.promote')}</AppText>
              {help ? (
                <AppText
                  variant="caption"
                  color={colors.textMuted}
                  testID="frame-help"
                >
                  {help}
                </AppText>
              ) : null}
            </View>
            <View style={styles.go}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Icon
                  name="arrowUp"
                  size={20}
                  color={colors.textOnPrimary}
                  background={colors.primary}
                  weight={2}
                />
              )}
            </View>
          </Pressable>
          <LadderFrameOption propertyId={property.id} onDone={() => undefined} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  pressed: { opacity: 0.85 },
  go: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
