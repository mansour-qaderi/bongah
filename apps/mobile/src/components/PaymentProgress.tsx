import React from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PaymentFlow } from '../payments/usePaymentFlow';
import { useFormat } from '../i18n/useFormat';
import { colors, spacing } from '../theme';
import AppText from './AppText';
import Banner from './Banner';
import { useErrorToast } from './useErrorToast';
import Button from './Button';

/**
 * What the person sees after the HesabPay page was opened: waiting, paid, or failed, with the
 * matching buttons. Used by the checkout screen and the promotion sheet.
 */
export default function PaymentProgress({
  flow,
  onDone,
}: {
  flow: PaymentFlow;
  /** Called from the "done" button after a successful payment. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { payment, status, timedOut } = flow;
  useErrorToast(
    flow.openFailed ? t('checkout.openFailed') : null,
    flow.openFailed,
  );
  if (!payment) return null;

  return (
    <>
      {status === 'SUCCESS' ? (
        <Banner kind="success" message={t('checkout.success')} />
      ) : status === 'FAILED' ? (
        <Banner kind="error" message={t('checkout.failed')} />
      ) : (
        <Banner
          kind="info"
          message={timedOut ? t('checkout.timedOut') : t('checkout.opened')}
        />
      )}
      {status === 'PENDING' && !timedOut ? (
        <AppText color={colors.textMuted} style={styles.waiting}>
          {t('checkout.awaiting')}
        </AppText>
      ) : null}
      <AppText variant="heading" style={styles.amount}>
        {t('checkout.amount')}: {format.price(payment.amount, payment.currency)}
      </AppText>

      {status === 'SUCCESS' ? (
        <Button icon="check" title={t('common.done')} onPress={onDone} />
      ) : status === 'FAILED' ? (
        <Button icon="refresh" title={t('common.retry')} onPress={flow.reset} />
      ) : (
        <>
          <Button
            icon="refresh"
            title={t('checkout.checkStatus')}
            loading={flow.checking}
            onPress={flow.check}
          />
          <Button
            icon="arrow"
            title={t('checkout.reopen')}
            variant="secondary"
            onPress={flow.reopen}
            style={styles.gap}
          />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  amount: { marginVertical: spacing.lg },
  waiting: { marginBottom: spacing.sm },
  gap: { marginTop: spacing.md },
});
