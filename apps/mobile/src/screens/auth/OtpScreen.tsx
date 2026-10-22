import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH, toAsciiDigits } from '@bongah/validation';
import { sendOtp, verifyOtp } from '../../api/endpoints';
import { errorMessage, isInvalidReferralCode } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import OtpInput from '../../components/OtpInput';
import { showToast } from '../../components/Toast';
import { formatPhone, toPersianDigits } from '../../i18n/format';
import { closeAuth } from '../../navigation/closeAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

/** The code as plain 0-9, whatever digits or spaces it was typed or pasted with. */
const cleanCode = (code: string): string =>
  toAsciiDigits(code).replace(/\s/g, '');

/**
 * Enter the 6-digit code that was sent to WhatsApp. "تأیید و ورود" stays off until all six digits are there.
 *
 * When the server runs without a WhatsApp gateway (test mode), or its gateway could not deliver the message and the
 * server's development fallback is on, it hands the code back with the "code sent" answer. This screen then fills it
 * into the boxes without a word about it (no "test mode" banner or toast over the page): nothing reached WhatsApp, so
 * without the fill nobody could read the code and sign-in would be blocked. With the real gateway working the server
 * never returns a code and the boxes start empty.
 *
 * What goes wrong is said in a toast (a wrong code also outlines the boxes in red until the next edit).
 */
export default function OtpScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { phone, referralCode } = route.params;

  const [code, setCode] = useState(route.params.devOtp ?? '');
  const [secondsLeft, setSecondsLeft] = useState(route.params.resendAfter);
  const [codeRefused, setCodeRefused] = useState(false);
  const [referralRejected, setReferralRejected] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const digits = cleanCode(code);
  const complete = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits);

  // Count down to the moment another code may be requested.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /** `withoutReferral`: carry on with the same code after the invite code was refused. */
  const submit = async (withoutReferral = false) => {
    if (!complete) {
      showToast(t('auth.verifyFirst', { length: toPersianDigits(OTP_LENGTH) }));
      return;
    }
    setCodeRefused(false);
    setReferralRejected(false);
    setVerifying(true);
    try {
      const response = await verifyOtp(
        phone,
        digits,
        withoutReferral ? undefined : referralCode,
      );
      await signIn(response);
      if (response.is_new_user) {
        if (response.referral_applied) {
          navigation.replace('ProfileSetup', { referralApplied: true });
        } else {
          navigation.replace('ProfileSetup');
        }
      } else {
        closeAuth(navigation);
      }
    } catch (error) {
      // The code was fine and is still usable: only the invite code was refused, and the person decides whether to
      // fix it (back to the phone screen) or carry on without it.
      if (isInvalidReferralCode(error)) {
        setReferralRejected(true);
        showToast(t('auth.referralInvalid'));
      } else {
        setCodeRefused(true);
        showToast(errorMessage(error, t, { unauthorized: 'invalidCode' }));
      }
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const response = await sendOtp(phone);
      setSecondsLeft(response.resend_after);
      setCode(response.dev_otp ?? '');
      setCodeRefused(false);
    } catch (error) {
      showToast(errorMessage(error, t, { sendingCode: true }));
    } finally {
      setResending(false);
    }
  };

  return (
    <ScrollScreen style={styles.content}>
      <AppText color={colors.textMuted} style={styles.hint}>
        {t('auth.otpHint', {
          length: toPersianDigits(OTP_LENGTH),
          phone: formatPhone(phone),
        })}
      </AppText>

      <AppText variant="label" style={styles.codeLabel}>
        {t('auth.otpLabel')}
      </AppText>
      <OtpInput
        label={t('auth.otpLabel')}
        length={OTP_LENGTH}
        value={code}
        invalid={codeRefused}
        onChange={value => {
          setCode(value);
          setCodeRefused(false);
        }}
      />
      <AppText
        variant="caption"
        color={colors.textMuted}
        style={styles.codeNote}
      >
        {t('auth.otpPasteHintWhatsapp')}
      </AppText>

      {referralRejected ? (
        <Button
          icon="arrow"
          title={t('auth.continueWithoutReferral')}
          variant="outline"
          onPress={() => submit(true)}
          loading={verifying}
          style={styles.secondary}
        />
      ) : null}
      <Button
        title={t('auth.verify')}
        icon="check"
        onPress={() => submit()}
        loading={verifying}
        disabled={!complete}
      />

      <Button
        title={
          secondsLeft > 0
            ? t('auth.resendIn', { seconds: toPersianDigits(secondsLeft) })
            : t('auth.resend')
        }
        icon="refresh"
        variant="secondary"
        disabled={secondsLeft > 0}
        loading={resending}
        onPress={resend}
        style={styles.secondary}
      />
      <Button
        title={t('auth.changeNumber')}
        icon="edit"
        variant="outline"
        onPress={() => navigation.goBack()}
        style={styles.secondary}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl },
  hint: { marginBottom: spacing.xl },
  codeLabel: { marginBottom: spacing.sm },
  codeNote: { marginTop: spacing.sm, marginBottom: spacing.xl },
  secondary: { marginTop: spacing.md },
});
