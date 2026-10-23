import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  FEATURED_BUNDLE_SIZES,
  type Currency,
  type FeaturedBundle,
} from '@bongah/shared-types';
import type { InitiatePaymentInput } from '@bongah/validation';
import { errorMessage } from '../../api/errors';
import { usePricing } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Badge, { badgeTones } from '../../components/Badge';
import Button from '../../components/Button';
import OptionCard from '../../components/OptionCard';
import PaymentProgress from '../../components/PaymentProgress';
import { ScrollScreen } from '../../components/Screen';
import { Reveal, useReveal } from '../../components/Reveal';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { useErrorToast } from '../../components/useErrorToast';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { usePaymentFlow } from '../../payments/usePaymentFlow';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;

/**
 * Featured frames («کادر ویژه برای آگهی») in packs of 1, 3, 5, 10 or 20, and nothing else. A pack is stock for later:
 * it needs no listing, and its credits are spent on a listing from the add/edit form or from that listing's own
 * promotion sheet. A subscription is bought on the account upgrade screen, never here.
 */
export default function CheckoutScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, status } = useAuth();

  const [size, setSize] = useState<number | null>(null);
  const flow = usePaymentFlow();
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );

  const pricing = usePricing();

  const reveal = useReveal(pricing.isPending);

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
          icon="login"
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (pricing.isPending) return <LoadingView />;
  if (pricing.isError) {
    return (
      <ErrorView
        message={t('checkout.pricesFailed')}
        onRetry={() => pricing.refetch()}
      />
    );
  }
  const prices = pricing.data;

  // Every pack the server offers, smallest first; one whose size the API would refuse is not shown.
  const bundles = (prices.featured_bundles ?? [])
    .filter(b => FEATURED_BUNDLE_SIZES.some(allowed => allowed === b.size))
    .sort((a, b) => a.size - b.size);
  // The chosen pack; until one is touched, the smallest (a single frame).
  const bundle = bundles.find(b => b.size === size) ?? bundles[0];
  const credits = user?.featured_credits ?? 0;
  const amount = bundle?.price ?? 0;
  const input: InitiatePaymentInput | null = bundle
    ? {
        purpose: 'FEATURED_CREDITS',
        bundle_size: bundle.size as InitiatePaymentFeaturedSize,
      }
    : null;

  // ───── After the payment page has been opened ─────
  if (flow.payment) {
    return (
      <ScrollScreen>
        <PaymentProgress flow={flow} onDone={() => navigation.goBack()} />
      </ScrollScreen>
    );
  }

  // ───── Choosing what to buy ─────
  const page = (
    <ScrollScreen>
      <View style={styles.section}>
        {/* The featured frame is the premium offer: a gold frame and its badge around the packs, the only thing here. */}
        <View style={styles.premium} testID="featured-panel">
          <View style={styles.premiumTop}>
            <AppText variant="label" color={colors.accentText}>
              {t('frame.title')}
            </AppText>
            <Badge
              label={t('checkout.featuredBadge')}
              tone={badgeTones.warning}
            />
          </View>
          <AppText variant="caption" color={colors.textMuted}>
            {t('frame.topOfList', {
              days: formatNumber(prices.featured_ad_days, 0),
            })}
          </AppText>
          {credits > 0 ? (
            <AppText variant="caption" color={colors.success}>
              {t('frame.credits', {
                count: formatNumber(credits, 0),
              })}
            </AppText>
          ) : null}
          {bundles.map(b => (
            <BundleCard
              key={b.size}
              bundle={b}
              days={prices.featured_ad_days}
              currency={prices.currency}
              selected={bundle?.size === b.size}
              onPress={() => setSize(b.size)}
            />
          ))}
        </View>

        <AppText variant="heading" style={styles.amount}>
          {t('checkout.amount')}: {format.price(amount, prices.currency)}
        </AppText>
        <Button
          icon="card"
          title={t('checkout.pay')}
          disabled={input === null}
          loading={flow.starting}
          onPress={() => input && flow.begin(input)}
        />
      </View>
    </ScrollScreen>
  );
  return (
    <Reveal {...reveal} loader={<LoadingView />}>
      {page}
    </Reveal>
  );
}

type InitiatePaymentFeaturedSize = (typeof FEATURED_BUNDLE_SIZES)[number];

function BundleCard({
  bundle,
  days,
  currency,
  selected,
  onPress,
}: {
  bundle: FeaturedBundle;
  days: number;
  currency: Currency;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  // One frame is just «کادر ویژه برای آگهی» at the full price; a pack says how many and what it saves.
  const single = bundle.size === 1;
  return (
    <OptionCard
      title={
        single
          ? t('frame.title')
          : t('frame.bundle', { count: formatNumber(bundle.size, 0) })
      }
      subtitle={
        single
          ? t('frame.topOfList', { days: formatNumber(days, 0) })
          : `${t('checkout.bundleDiscount', {
              percent: formatNumber(bundle.discount_percent, 0),
            })} · ${t('frame.bundleHelp', {
              count: formatNumber(bundle.size, 0),
              days: formatNumber(days, 0),
            })}`
      }
      trailing={format.price(bundle.price, currency)}
      selected={selected}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  premium: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2.5,
    borderColor: colors.accentBright,
    backgroundColor: colors.surface,
  },
  premiumTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amount: { marginVertical: spacing.lg },
});
