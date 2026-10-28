import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentInitiated, PaymentStatus } from "@bongah/shared-types";
import type { InitiatePaymentInput } from "@bongah/validation";
import {
  getPayment,
  initiatePayment,
  submitPaymentReference,
  uploadPaymentProof,
} from "../api/endpoints";
import { queryKeys } from "../api/hooks";
import { useSafeAuth } from "../auth/useSafeAuth";
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_TIMEOUT_MS } from "../config";

/**
 * One HesabPay payment from start to finish: create it, open the payment page in the browser,
 * then ask the server every few seconds whether it went through. The webhook from HesabPay is
 * what actually confirms a payment; polling just notices.
 *
 * In manual mode the server gives no payment page (`payment_url` is null): the person pays by hand, sends a picture
 * of the receipt (`sendReceipt`) and an admin confirms. The polling is the same; it notices the admin's decision.
 *
 * Shared by the checkout screen and the promotion sheet so both behave identically.
 */
export function usePaymentFlow() {
  const queryClient = useQueryClient();
  const auth = useSafeAuth();
  const refreshUser = auth?.refreshUser;
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
    onSuccess: async (created) => {
      startedAt.current = Date.now();
      setPayment(created);
      // Manual mode has no page to open: the payment screen shows where to send the money instead.
      if (created.payment_url !== null)
        await openPaymentPage(created.payment_url);
    },
  });

  const proof = useMutation({
    mutationFn: ({ uri, contentType }: { uri: string; contentType: string }) =>
      uploadPaymentProof(payment!.id, uri, contentType),
    onSuccess: (updated) => {
      // The screen shows "under review" from the answer, and the polling keeps watching for the admin's decision.
      queryClient.setQueryData(["payment", updated.id], updated);
      startedAt.current = Date.now();
    },
  });

  const refMutation = useMutation({
    mutationFn: (reference: string) => submitPaymentReference(payment!.id, reference),
    onSuccess: (updated) => {
      queryClient.setQueryData(["payment", updated.id], updated);
      startedAt.current = Date.now();
    },
  });

  const poll = useQuery({
    queryKey: ["payment", payment?.id],
    queryFn: () => getPayment(payment!.id),
    enabled: payment !== null,
    refetchInterval: (query) => {
      const pending = (query.state.data?.status ?? "PENDING") === "PENDING";
      const withinTime =
        Date.now() - startedAt.current < PAYMENT_POLL_TIMEOUT_MS;
      return pending && withinTime ? PAYMENT_POLL_INTERVAL_MS : false;
    },
  });

  const status = poll.data?.status ?? payment?.status;
  // What the server last said about the payment (the answer to the start, until the first poll comes back).
  const details: PaymentStatus | PaymentInitiated | undefined =
    poll.data ?? payment ?? undefined;
  const manual = payment !== null && payment.payment_url === null;
  useEffect(() => {
    if (status === "SUCCESS") {
      // A new subscription / featured listing changes what the lists and the agency
      // dashboard show (the dashboard's key sits under `properties`)...
      queryClient.invalidateQueries({ queryKey: queryKeys.properties });
      // ...a contact credits payment adds credits to the allowance...
      queryClient.invalidateQueries({ queryKey: queryKeys.contact });
      // ...and a subscription turns on the chat perks.
      queryClient.invalidateQueries({ queryKey: queryKeys.chatCapabilities });
      // ...and a first subscription or a featured bundle changes the credits on the user (bonus listings, featured).
      refreshUser?.();
    }
  }, [status, queryClient, refreshUser]);

  return {
    /** The payment once started; null while the person is still choosing. */
    payment,
    /** PENDING / SUCCESS / FAILED, or undefined before a payment exists. */
    status,
    /** Still PENDING after the polling window; the person can re-check by hand. */
    timedOut:
      status === "PENDING" &&
      Date.now() - startedAt.current >= PAYMENT_POLL_TIMEOUT_MS,
    /** The payment is made by hand (no payment page): accounts to pay to, a receipt to send, an admin to confirm. */
    manual,
    /** Latest server view of the payment: accounts, whether a receipt is on file, the refusal reason. */
    details,
    /** Send a picture of the receipt (manual payments). */
    sendReceipt: (uri: string, contentType: string) =>
      proof.mutate({ uri, contentType }),
    sendingReceipt: proof.isPending,
    /** Why sending the receipt failed (show with errorMessage()). */
    receiptError: proof.isError ? proof.error : null,
    /** Send the transaction id from the receipt (manual payments), with or without a picture. */
    sendReference: (reference: string) => refMutation.mutate(reference),
    sendingReference: refMutation.isPending,
    /** Why sending the transaction id failed (show with errorMessage()). */
    referenceError: refMutation.isError ? refMutation.error : null,
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
    reopen: () =>
      payment && payment.payment_url !== null
        ? openPaymentPage(payment.payment_url)
        : undefined,
    /** Forget the payment and go back to choosing (after a failure). */
    reset: () => {
      setPayment(null);
      start.reset();
      proof.reset();
    },
  };
}

export type PaymentFlow = ReturnType<typeof usePaymentFlow>;
