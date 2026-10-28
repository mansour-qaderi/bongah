import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ManualPaymentAccount } from "@bongah/shared-types";
import { errorMessage } from "../api/errors";
import { useFormat } from "../i18n/useFormat";
import type { PaymentFlow } from "../payments/usePaymentFlow";
import { pickReceipt } from "../payments/pickReceipt";
import { cleanReference, isValidReference } from "../payments/reference";
import { copyText } from "../share/clipboard";
import { colors, spacing, surfaces } from "../theme";
import AppText from "./AppText";
import Banner from "./Banner";
import Button from "./Button";
import TextField from "./TextField";
import { showToast } from "./Toast";
import { useErrorToast } from "./useErrorToast";

/**
 * Paying by hand (manual mode): where to send the money, then proof of it: the picture of the receipt, the transaction
 * id printed on it, or both. The accounts come from the server (the operator sets them; none is written into the app),
 * and nothing here activates anything: an admin looks at the proof and confirms, and the payment screen's polling
 * notices.
 */
export default function ManualPaymentPanel({
  flow,
  onDone,
}: {
  flow: PaymentFlow;
  /** The "done" button after the admin confirmed. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { payment, status, details } = flow;
  const [pickFailed, setPickFailed] = useState(false);
  const [reference, setReference] = useState("");
  const [refInvalid, setRefInvalid] = useState(false);
  const [editRef, setEditRef] = useState(false);
  useErrorToast(
    flow.receiptError ? errorMessage(flow.receiptError, t) : null,
    flow.receiptError
  );
  useErrorToast(pickFailed ? t("manualPay.pickFailed") : null, pickFailed);
  useErrorToast(
    flow.referenceError ? errorMessage(flow.referenceError, t) : null,
    flow.referenceError
  );
  if (!payment) return null;

  const reason =
    details && "review_note" in details ? details.review_note ?? null : null;
  const accounts = details?.manual?.accounts ?? [];
  const note = details?.manual?.note ?? "";
  const pictureSent = details?.receipt_uploaded === true;
  const savedReference = details?.reference ?? null;
  const referenceSent = savedReference !== null && !editRef;
  const sent = pictureSent || referenceSent;

  const sendReference = () => {
    if (!isValidReference(reference)) {
      setRefInvalid(true);
      return;
    }
    setRefInvalid(false);
    flow.sendReference(cleanReference(reference));
    setEditRef(false);
    setReference("");
  };

  const choose = async () => {
    setPickFailed(false);
    const picked = await pickReceipt();
    if (picked.kind === "picked")
      flow.sendReceipt(picked.uri, picked.contentType);
    else if (picked.kind === "unsupported")
      showToast(t("manualPay.badType"), "error");
    else if (picked.kind === "failed") setPickFailed(true);
  };

  if (status === "SUCCESS") {
    return (
      <>
        <Banner kind="success" message={t("checkout.success")} />
        <Button icon="check" title={t("common.done")} onPress={onDone} />
      </>
    );
  }
  if (status === "FAILED") {
    return (
      <>
        <Banner
          kind="error"
          message={
            reason ? t("manualPay.rejected", { reason }) : t("checkout.failed")
          }
        />
        <Button icon="refresh" title={t("common.retry")} onPress={flow.reset} />
      </>
    );
  }

  return (
    <View testID="manual-payment">
      <AppText variant="body" color={colors.textSecondary}>
        {t("manualPay.intro")}
      </AppText>
      <AppText variant="heading" style={styles.amount}>
        {t("checkout.amount")}: {format.price(payment.amount, payment.currency)}
      </AppText>

      {accounts.map((account) => (
        <AccountCard
          key={`${account.kind}:${account.number}`}
          account={account}
        />
      ))}
      {note ? (
        <AppText
          variant="bodySm"
          color={colors.textSecondary}
          style={styles.note}
        >
          {note}
        </AppText>
      ) : null}

      {sent ? (
        <Banner
          kind="success"
          message={pictureSent ? t("manualPay.sent") : t("manualPay.refSent")}
        >
          {referenceSent ? (
            <AppText
              selectable
              latinDigits
              variant="label"
              style={styles.savedRef}
              testID="manual-reference-saved"
            >
              {savedReference}
            </AppText>
          ) : null}
          <AppText variant="bodySm" color={colors.textSecondary}>
            {t("manualPay.sentHelp")}
          </AppText>
        </Banner>
      ) : (
        <AppText variant="bodySm" color={colors.textMuted} style={styles.note}>
          {t("manualPay.steps")}
        </AppText>
      )}

      <Button
        icon="camera"
        title={pictureSent ? t("manualPay.replace") : t("manualPay.choose")}
        variant={sent ? "secondary" : "primary"}
        loading={flow.sendingReceipt}
        onPress={choose}
        testID="manual-choose"
      />

      {referenceSent ? (
        <Button
          icon="edit"
          title={t("manualPay.refChange")}
          variant="secondary"
          onPress={() => setEditRef(true)}
          style={styles.gap}
          testID="manual-reference-change"
        />
      ) : (
        <View style={styles.refBox} testID="manual-reference-box">
          <TextField
            label={t("manualPay.refTitle")}
            ltr
            digits="keep"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={64}
            value={reference}
            placeholder={t("manualPay.refPlaceholder")}
            helper={t("manualPay.refHint")}
            error={refInvalid ? t("manualPay.refInvalid") : null}
            onChangeText={text => {
              setReference(text);
              setRefInvalid(false);
            }}
            testID="manual-reference"
          />
          <Button
            icon="send"
            title={t("manualPay.refSend")}
            variant="secondary"
            loading={flow.sendingReference}
            disabled={reference.trim().length === 0}
            onPress={sendReference}
            testID="manual-reference-send"
          />
        </View>
      )}
      <Button
        icon="refresh"
        title={t("checkout.checkStatus")}
        variant="secondary"
        loading={flow.checking}
        onPress={flow.check}
        style={styles.gap}
      />
    </View>
  );
}

function AccountCard({ account }: { account: ManualPaymentAccount }) {
  const { t } = useTranslation();
  const copy = async () => {
    const ok = await copyText(account.number.replace(/\s+/g, ""));
    showToast(
      ok ? t("manualPay.copied") : t("manualPay.copyFailed"),
      ok ? "success" : "error"
    );
  };
  return (
    <View style={styles.card} testID={`manual-account-${account.kind}`}>
      <AppText variant="label" color={colors.textMuted}>
        {t(`manualPay.kind.${account.kind}`)}
        {account.bank ? ` · ${account.bank}` : ""}
      </AppText>
      <AppText selectable latinDigits variant="heading" style={styles.number}>
        {account.number}
      </AppText>
      <AppText variant="bodySm" color={colors.textSecondary}>
        {t("manualPay.holder")}: {account.holder}
      </AppText>
      <Button
        icon="copy"
        title={t("manualPay.copy")}
        variant="secondary"
        onPress={copy}
        style={styles.gap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { marginVertical: spacing.lg },
  card: { ...surfaces.card, padding: spacing.lg, marginBottom: spacing.md },
  number: { marginVertical: spacing.sm, writingDirection: "ltr" },
  note: { marginBottom: spacing.lg },
  gap: { marginTop: spacing.md },
  refBox: { marginTop: spacing.lg },
  savedRef: { marginVertical: spacing.xs, writingDirection: "ltr" },
});
