import React from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../api/errors';
import { usePricing } from '../api/hooks';
import { formatNumber } from '../i18n/format';
import { useFormat } from '../i18n/useFormat';
import { usePaymentFlow } from '../payments/usePaymentFlow';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import Button from './Button';
import LadderFrameOption from './LadderFrameOption';
import PaymentProgress from './PaymentProgress';
import { ErrorView, LoadingView } from './States';
import { useErrorToast } from './useErrorToast';

/**
 * The last step of a listing form that asked for the featured frame with no credit to spend: the listing is saved,
 * and this pays for its frame right where the person is (the HesabPay page opens in the browser; this follows the
 * payment). "Not now" leaves the listing as saved; the frame can be bought later from the listing's own page.
 */
export default function FramePayStep({
  propertyId,
  onDone,
}: {
  propertyId: string;
  /** Called when the payment is done, and when the person chooses to skip it. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const pricing = usePricing();
  const flow = usePaymentFlow();
  useErrorToast(
    flow.startError ? errorMessage(flow.startError, t) : null,
    flow.startError,
  );
  const prices = pricing.data;

  if (flow.payment) return <PaymentProgress flow={flow} onDone={onDone} />;
  if (pricing.isPending) return <LoadingView />;
  if (!prices) {
    return (
      <>
        <ErrorView
          message={t('checkout.pricesFailed')}
          onRetry={() => pricing.refetch()}
        />
        <Button
          icon="arrow"
          title={t('frame.skip')}
          variant="secondary"
          onPress={onDone}
          style={styles.gap}
        />
      </>
    );
  }
  return (
    <>
      <Banner kind="success" message={t('frame.payTitle')} />
      <AppText variant="caption" color={colors.textMuted}>
        {t('frame.payHelp', { days: formatNumber(prices.featured_ad_days, 0) })}
      </AppText>
      <LadderFrameOption propertyId={propertyId} onDone={onDone} />
      <AppText variant="heading" style={styles.amount}>
        {t('checkout.amount')}:{' '}
        {format.price(prices.featured_ad, prices.currency)}
      </AppText>
      <Button
        icon="card"
        title={t('checkout.pay')}
        loading={flow.starting}
        onPress={() =>
          flow.begin({ purpose: 'FEATURED_AD', property_id: propertyId })
        }
      />
      <Button
        icon="arrow"
        title={t('frame.skip')}
        variant="secondary"
        onPress={onDone}
        style={styles.gap}
      />
    </>
  );
}

const styles = StyleSheet.create({
  amount: { marginVertical: spacing.lg },
  gap: { marginTop: spacing.md },
});
