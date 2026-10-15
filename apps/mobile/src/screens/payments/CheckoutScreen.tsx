import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  SUBSCRIPTION_PACKAGES,
  type SubscriptionPackage,
} from '@bongah/shared-types';
import type { InitiatePaymentInput } from '@bongah/validation';
import { errorMessage } from '../../api/errors';
import { flattenPages, useMyProperties, usePricing } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import OptionCard from '../../components/OptionCard';
import PaymentProgress from '../../components/PaymentProgress';
import { ScrollScreen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { usePaymentFlow } from '../../payments/usePaymentFlow';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type Tab = 'subscription' | 'promotion';
type Promotion = 'LADDER' | 'FEATURED_AD';

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
  let input: InitiatePaymentInput | null = null;
  let amount: number;
  if (tab === 'subscription') {
    amount = prices.subscription[pkg];
    if (isAgency) input = { purpose: 'SUBSCRIPTION', package_type: pkg };
  } else {
    amount = promotion === 'LADDER' ? prices.ladder : prices.featured_ad;
    if (propertyId) input = { purpose: promotion, property_id: propertyId };
  }

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
        {flow.startError ? (
          <Banner kind="error" message={errorMessage(flow.startError, t)} />
        ) : null}

        {tab === 'subscription' ? (
          <>
            <AppText color={colors.textMuted} style={styles.help}>
              {t('checkout.subscriptionHelp')}
            </AppText>
            {!isAgency ? (
              <Banner kind="info" message={t('checkout.agenciesOnly')} />
            ) : null}
            {SUBSCRIPTION_PACKAGES.map(p => (
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

            <OptionCard
              title={t('checkout.ladder')}
              subtitle={t('checkout.ladderHelp')}
              trailing={format.price(prices.ladder, prices.currency)}
              selected={promotion === 'LADDER'}
              onPress={() => setPromotion('LADDER')}
            />
            <OptionCard
              title={t('checkout.featured')}
              subtitle={t('checkout.featuredHelp', {
                days: formatNumber(prices.featured_ad_days, 0),
              })}
              trailing={format.price(prices.featured_ad, prices.currency)}
              selected={promotion === 'FEATURED_AD'}
              onPress={() => setPromotion('FEATURED_AD')}
            />
          </>
        )}

        <AppText variant="heading" style={styles.amount}>
          {t('checkout.amount')}: {format.price(amount, prices.currency)}
        </AppText>
        <Button
          title={t('checkout.pay')}
          disabled={input === null}
          loading={flow.starting}
          onPress={() => input && flow.begin(input)}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  help: { marginBottom: spacing.md },
  amount: { marginVertical: spacing.lg },
});
