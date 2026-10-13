import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentInitiated } from '@bongah/shared-types';
import type { InitiatePaymentInput } from '@bongah/validation';
import { getPayment, initiatePayment } from '../api/endpoints';
import { queryKeys } from '../api/hooks';
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_TIMEOUT_MS } from '../config';

/**
 * One HesabPay payment from start to finish: create it, open the payment page in the browser,
 * then ask the server every few seconds whether it went through. The webhook from HesabPay is
 * what actually confirms a payment; polling just notices.
 *
 * Shared by the checkout screen and the promotion sheet so both behave identically.
 */
export function usePaymentFlow() {
  const queryClient = useQueryClient();
  const [payment, setPayment] = useState<PaymentInitiated | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const startedAt = useRef(0);

  const openPaymentPage = useCallback(async (url: string) => {
    setOpenFailed(false);
    try {
      await Linking.openURL(url);
    } catch {
      setOpenFailed(true);
    }
  }, []);

  const start = useMutation({
    mutationFn: initiatePayment,
    onSuccess: async created => {
      startedAt.current = Date.now();
      setPayment(created);
      await openPaymentPage(created.payment_url);
    },
  });

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

  const status = poll.data?.status ?? payment?.status;
  useEffect(() => {
    if (status === 'SUCCESS') {
      // A new subscription / laddered / featured listing changes what the lists and the agency
      // dashboard show (the dashboard's key sits under `properties`)...
      queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      // ...and a map location payment adds a prepaid pin.
      queryClient.invalidateQueries({ queryKey: queryKeys.mapLocation });
      // ...a contact credits payment adds credits to the allowance...
      queryClient.invalidateQueries({ queryKey: queryKeys.contact });
      // ...and a subscription turns on the chat perks.
      queryClient.invalidateQueries({ queryKey: queryKeys.chatCapabilities });
    }
  }, [status, queryClient]);

  return {
    /** The payment once started; null while the person is still choosing. */
    payment,
    /** PENDING / SUCCESS / FAILED, or undefined before a payment exists. */
    status,
    /** Still PENDING after the polling window; the person can re-check by hand. */
    timedOut:
      status === 'PENDING' &&
      Date.now() - startedAt.current >= PAYMENT_POLL_TIMEOUT_MS,
    /** The browser could not be opened on the payment page. */
    openFailed,
    /** Creating the payment is in progress. */
    starting: start.isPending,
    /** Why creating the payment failed (show with errorMessage()). */
    startError: start.isError ? start.error : null,
    /** Re-checking the status right now. */
    checking: poll.isFetching,
    begin: (input: InitiatePaymentInput) => start.mutate(input),
    /** Ask the server again and restart the polling window. */
    check: () => {
      startedAt.current = Date.now();
      poll.refetch();
    },
    reopen: () => payment && openPaymentPage(payment.payment_url),
    /** Forget the payment and go back to choosing (after a failure). */
    reset: () => {
      setPayment(null);
      start.reset();
    },
  };
}

export type PaymentFlow = ReturnType<typeof usePaymentFlow>;
