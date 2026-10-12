import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  SUBSCRIPTION_PACKAGES,
  type PaymentInitiated,
  type SubscriptionPackage,
} from '@bongah/shared-types';
import type { InitiatePaymentInput } from '@bongah/validation';
import { getPayment, initiatePayment } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import {
  flattenPages,
  queryClient,
  queryKeys,
  useMapLocationStatus,
  useMyProperties,
  usePricing,
} from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import OptionCard from '../../components/OptionCard';
import { ScrollScreen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_TIMEOUT_MS,
} from '../../config';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkout'>;
type Tab = 'subscription' | 'promotion' | 'map';
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
  const [payment, setPayment] = useState<PaymentInitiated | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const startedAt = useRef(0);

  const pricing = usePricing();
  const mapStatus = useMapLocationStatus(status === 'signedIn');
  const mine = useMyProperties(status === 'signedIn');
  const listings = flattenPages(mine.data).filter(p => p.status === 'ACTIVE');

  const start = useMutation({
    mutationFn: initiatePayment,
    onSuccess: async created => {
      startedAt.current = Date.now();
      setPayment(created);
      await openPaymentPage(created.payment_url);
    },
  });

  // While a payment is pending, ask the server every few seconds. The webhook from HesabPay
  // is what actually confirms it; this just notices.
  const poll = useQuery({
    queryKey: ['payment', payment?.id],
    queryFn: () => getPayment(payment!.id),
    enabled: payment !== null,
    refetchInterval: query => {
      const pending = (query.state.data?.status ?? 'PENDING') === 'PENDING';
      const withinTime =
        Date.now() - startedAt.current < PAYMENT_POLL_TIMEOUT_MS;
      return pending && withinTime ? PAYMENT_POLL_INTERVAL_MS : false;
    },
  });

  const paymentStatus = poll.data?.status ?? payment?.status;
  useEffect(() => {
    if (paymentStatus === 'SUCCESS') {
      // A new subscription / laddered / featured listing changes what the lists show.
      queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      // ...and a map location payment adds a prepaid pin.
      queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation });
    }
  }, [paymentStatus]);

  async function openPaymentPage(url: string) {
    setOpenFailed(false);
    try {
      await Linking.openURL(url);
    } catch {
      setOpenFailed(true);
    }
  }

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
  const timedOut =
    paymentStatus === 'PENDING' &&
    Date.now() - startedAt.current >= PAYMENT_POLL_TIMEOUT_MS;

  // Accounts that already pin for free (an agency on an active plan, an admin) are not sold the add-on.
  const alreadyUnlimited = mapStatus.data?.unlimited === true;

  let input: InitiatePaymentInput | null = null;
  let amount: number;
  if (tab === 'subscription') {
    amount = prices.subscription[pkg];
    if (isAgency) input = { purpose: 'SUBSCRIPTION', package_type: pkg };
  } else if (tab === 'map') {
    amount = prices.map_location;
    if (mapStatus.isSuccess && !alreadyUnlimited) {
      input = { purpose: 'MAP_LOCATION' };
    }
  } else {
    amount = promotion === 'LADDER' ? prices.ladder : prices.featured_ad;
    if (propertyId) input = { purpose: promotion, property_id: propertyId };
  }

  // ───── After the payment page has been opened ─────
  if (payment) {
    return (
      <ScrollScreen>
        {paymentStatus === 'SUCCESS' ? (
          <Banner kind="success" message={t('checkout.success')} />
        ) : paymentStatus === 'FAILED' ? (
          <Banner kind="error" message={t('checkout.failed')} />
        ) : (
          <Banner
            kind="info"
            message={timedOut ? t('checkout.timedOut') : t('checkout.opened')}
          />
        )}
        {paymentStatus === 'PENDING' && !timedOut ? (
          <AppText color={colors.textMuted} style={styles.waiting}>
            {t('checkout.awaiting')}
          </AppText>
        ) : null}
        <AppText variant="heading" style={styles.amount}>
          {t('checkout.amount')}:{' '}
          {format.price(payment.amount, payment.currency)}
        </AppText>
        {openFailed ? (
          <Banner kind="error" message={t('checkout.openFailed')} />
        ) : null}

        {paymentStatus === 'SUCCESS' ? (
          <Button
            title={t('common.done')}
            onPress={() => navigation.goBack()}
          />
        ) : (
          <>
            {paymentStatus === 'FAILED' ? (
              <Button
                title={t('common.retry')}
                onPress={() => setPayment(null)}
              />
            ) : (
              <>
                <Button
                  title={t('checkout.checkStatus')}
                  loading={poll.isFetching}
                  onPress={() => {
                    startedAt.current = Date.now();
                    poll.refetch();
                  }}
                />
                <Button
                  title={t('checkout.reopen')}
                  variant="secondary"
                  onPress={() => openPaymentPage(payment.payment_url)}
                  style={styles.gap}
                />
              </>
            )}
          </>
        )}
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
          { value: 'map', label: t('checkout.tabMap') },
        ]}
      />
      <View style={styles.section}>
        {start.isError ? (
          <Banner kind="error" message={errorMessage(start.error, t)} />
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
        ) : tab === 'map' ? (
          <>
            <AppText color={colors.textMuted} style={styles.help}>
              {t('checkout.mapHelp')}
            </AppText>
            {alreadyUnlimited ? (
              <Banner kind="info" message={t('map.alreadyUnlimited')} />
            ) : null}
            <OptionCard
              title={t('checkout.mapItem')}
              subtitle={t('checkout.mapItemHelp')}
              trailing={format.price(prices.map_location, prices.currency)}
              selected
              onPress={() => undefined}
            />
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
          loading={start.isPending}
          onPress={() => input && start.mutate(input)}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.lg },
  help: { marginBottom: spacing.md },
  amount: { marginVertical: spacing.lg },
  waiting: { marginBottom: spacing.sm },
  gap: { marginTop: spacing.md },
});
