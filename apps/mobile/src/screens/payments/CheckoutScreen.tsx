import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  FEATURED_BUNDLE_SIZES,
  SUBSCRIPTION_PACKAGES,
  type Currency,
  type FeaturedBundle,
  type SubscriptionPackage,
} from '@bongah/shared-types';
import type { InitiatePaymentInput } from '@bongah/validation';
import { errorMessage } from '../../api/errors';
import { flattenPages, useMyProperties, usePricing } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Badge, { badgeTones } from '../../components/Badge';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import OptionCard from '../../components/OptionCard';
import PaymentProgress from '../../components/PaymentProgress';
import { ScrollScreen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { showToast } from '../../components/Toast';
import { useErrorToast } from '../../components/useErrorToast';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { useFeaturedCreditSpend } from '../../payments/useFeaturedCreditSpend';
import { usePaymentFlow } from '../../payments/usePaymentFlow';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type Tab = 'subscription' | 'promotion';
/** What is chosen on the promotion tab: one listing's ladder or featured badge, or a bundle of featured credits. */
type Promotion = 'LADDER' | 'FEATURED_AD' | `BUNDLE_${number}`;
type BundleSize = (typeof FEATURED_BUNDLE_SIZES)[number];
const bundleKey = (size: number): Promotion => `BUNDLE_${size}`;
/** The bundle a choice stands for, or null when it is not one. */
const bundleSizeOf = (promotion: Promotion): BundleSize | null => {
  if (!promotion.startsWith('BUNDLE_')) return null;
  const size = Number(promotion.slice('BUNDLE_'.length));
  return FEATURED_BUNDLE_SIZES.find(s => s === size) ?? null;
};

export default function CheckoutScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, status } = useAuth();
  const params = route.params;

  const [tab, setTab] = useState<Tab>(params?.tab ?? 'subscription');
  const [pkg, setPkg] = useState<SubscriptionPackage>('MONTHLY');
  const [promotion, setPromotion] = useState<Promotion>(
    params?.purpose ?? 'LADDER',
  );
  const [propertyId, setPropertyId] = useState<string | null>(
    params?.propertyId ?? null,
  );
  const flow = usePaymentFlow();
  const spend = useFeaturedCreditSpend();
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  const pricing = usePricing();
  const mine = useMyProperties(status === 'signedIn');
  const listings = flattenPages(mine.data).filter(p => p.status === 'ACTIVE');

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('auth.signInRequired')}>
        <Button
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

  const isAgency = user?.role === 'AGENCY';
  const plans = SUBSCRIPTION_PACKAGES.filter(p => prices.subscription[p] > 0);
  // Every bundle the server offers, smallest first; one whose size the API would refuse is not shown.
  const bundles = (prices.featured_bundles ?? [])
    .filter(b => FEATURED_BUNDLE_SIZES.some(size => size === b.size))
    .sort((a, b) => a.size - b.size);
  const chosenSize = bundleSizeOf(promotion);
  const bundle =
    chosenSize === null ? undefined : bundles.find(b => b.size === chosenSize);
  const credits = user?.featured_credits ?? 0;
  let input: InitiatePaymentInput | null = null;
  let amount: number;
  if (tab === 'subscription') {
    amount = prices.subscription[pkg] ?? 0;
    if (isAgency) input = { purpose: 'SUBSCRIPTION', package_type: pkg };
  } else if (chosenSize !== null) {
    // A bundle is stock for later: it needs no listing.
    amount = bundle?.price ?? 0;
    if (bundle)
      input = { purpose: 'FEATURED_CREDITS', bundle_size: chosenSize };
  } else {
    const single = promotion === 'LADDER' ? 'LADDER' : 'FEATURED_AD';
    amount = single === 'LADDER' ? prices.ladder : prices.featured_ad;
    if (propertyId) input = { purpose: single, property_id: propertyId };
  }
  const forListing = chosenSize === null;
  const canSpendCredit =
    tab === 'promotion' && promotion === 'FEATURED_AD' && credits > 0;
  const spendCredit = () => {
    if (!propertyId) {
      showToast(t('checkout.selectListing'), 'info');
      return;
    }
    spend.mutate(propertyId, {
      onSuccess: used =>
        showToast(
          t('checkout.creditUsed', {
            count: formatNumber(used.featured_credits, 0),
          }),
          'success',
        ),
    });
  };

  // ───── After the payment page has been opened ─────
  if (flow.payment) {
    return (
      <ScrollScreen>
        <PaymentProgress flow={flow} onDone={() => navigation.goBack()} />
      </ScrollScreen>
    );
  }

  // ───── Choosing what to buy ─────
  return (
    <ScrollScreen>
      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: 'subscription', label: t('checkout.tabSubscription') },
          { value: 'promotion', label: t('checkout.tabPromotion') },
        ]}
      />
      <View style={styles.section}>
        {tab === 'subscription' ? (
          <>
            <AppText color={colors.textMuted} style={styles.help}>
              {t('checkout.subscriptionHelp')}
            </AppText>
            {!isAgency ? (
              <Banner kind="info" message={t('checkout.agenciesOnly')} />
            ) : null}
            {plans.map(p => (
              <OptionCard
                key={p}
                title={t(`package.${p}`)}
                trailing={format.price(prices.subscription[p], prices.currency)}
                selected={pkg === p}
                onPress={() => setPkg(p)}
              />
            ))}
          </>
        ) : (
          <>
            {forListing ? (
              <>
                <AppText variant="label" style={styles.help}>
                  {t('checkout.selectListing')}
                </AppText>
                {mine.isPending ? (
                  <LoadingView />
                ) : listings.length === 0 ? (
                  <Banner kind="info" message={t('checkout.noListings')} />
                ) : (
                  listings.map(p => (
                    <OptionCard
                      key={p.id}
                      title={p.title}
                      subtitle={format.price(p.price, p.currency)}
                      selected={propertyId === p.id}
                      onPress={() => setPropertyId(p.id)}
                    />
                  ))
                )}
              </>
            ) : null}

            <OptionCard
              title={t('checkout.ladder')}
              subtitle={t('checkout.ladderHelp')}
              trailing={format.price(prices.ladder, prices.currency)}
              selected={promotion === 'LADDER'}
              onPress={() => setPromotion('LADDER')}
            />

            {/* The featured listing is the premium offer: a gold frame and its badge around its three ways to buy. */}
            <View style={styles.premium} testID="featured-panel">
              <View style={styles.premiumTop}>
                <AppText variant="label" color={colors.accentText}>
                  {t('checkout.featured')}
                </AppText>
                <Badge
                  label={t('checkout.featuredBadge')}
                  tone={badgeTones.warning}
                />
              </View>
              <AppText variant="caption" color={colors.textMuted}>
                {t('checkout.featuredPerks', {
                  days: formatNumber(prices.featured_ad_days, 0),
                })}
              </AppText>
              {credits > 0 ? (
                <AppText variant="caption" color={colors.success}>
                  {t('checkout.featuredCredits', {
                    count: formatNumber(credits, 0),
                  })}
                </AppText>
              ) : null}
              <OptionCard
                title={t('checkout.featured')}
                subtitle={t('checkout.featuredHelp', {
                  days: formatNumber(prices.featured_ad_days, 0),
                })}
                trailing={format.price(prices.featured_ad, prices.currency)}
                selected={promotion === 'FEATURED_AD'}
                onPress={() => setPromotion('FEATURED_AD')}
              />
              {bundles.map(b => (
                <BundleCard
                  key={b.size}
                  bundle={b}
                  days={prices.featured_ad_days}
                  currency={prices.currency}
                  selected={promotion === bundleKey(b.size)}
                  onPress={() => setPromotion(bundleKey(b.size))}
                />
              ))}
            </View>
          </>
        )}

        <AppText variant="heading" style={styles.amount}>
          {t('checkout.amount')}: {format.price(amount, prices.currency)}
        </AppText>
        {canSpendCredit ? (
          <Button
            title={t('checkout.useCredit')}
            loading={spend.isPending}
            onPress={spendCredit}
            style={styles.credit}
          />
        ) : null}
        <Button
          title={t('checkout.pay')}
          variant={canSpendCredit ? 'outline' : 'primary'}
          disabled={input === null}
          loading={flow.starting}
          onPress={() => input && flow.begin(input)}
        />
      </View>
    </ScrollScreen>
  );
}

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
  return (
    <OptionCard
      title={t('checkout.featuredBundle', {
        count: formatNumber(bundle.size, 0),
      })}
      subtitle={`${t('checkout.bundleDiscount', {
        percent: formatNumber(bundle.discount_percent, 0),
      })} · ${t('checkout.featuredBundleHelp', {
        count: formatNumber(bundle.size, 0),
        days: formatNumber(days, 0),
      })}`}
      trailing={format.price(bundle.price, currency)}
      selected={selected}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  credit: { marginBottom: spacing.md },
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
  help: { marginBottom: spacing.md },
  amount: { marginVertical: spacing.lg },
});
