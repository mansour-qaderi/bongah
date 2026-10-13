import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { OTP_LENGTH, toAsciiDigits } from '@bongah/validation';
import { sendOtp, verifyOtp } from '../../api/endpoints';
import { errorMessage, isInvalidReferralCode } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import TextField from '../../components/TextField';
import { formatPhone, toPersianDigits } from '../../i18n/format';
import { closeAuth } from '../../navigation/closeAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

export default function OtpScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const { phone, referralCode } = route.params;

  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState(route.params.devOtp);
  const [secondsLeft, setSecondsLeft] = useState(route.params.resendAfter);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [referralRejected, setReferralRejected] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // Count down to the moment another code may be requested.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /** `withoutReferral`: carry on with the same SMS code after the invite code was refused. */
  const submit = async (withoutReferral = false) => {
    setFailure(null);
    setReferralRejected(false);
    const digits = toAsciiDigits(code).replace(/\s/g, '');
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits)) {
      setFieldError(
        t('auth.invalidOtp', { length: toPersianDigits(OTP_LENGTH) }),
      );
      return;
    }
    setFieldError(null);
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
      // The SMS code was fine and is still usable: only the invite code was refused, and the
      // person decides whether to fix it (back to the phone screen) or carry on without it.
      if (isInvalidReferralCode(error)) setReferralRejected(true);
      else setFailure(errorMessage(error, t, { unauthorized: 'invalidCode' }));
      setVerifying(false);
    }
  };

  const resend = async () => {
    setFailure(null);
    setResending(true);
    try {
      const response = await sendOtp(phone);
      setSecondsLeft(response.resend_after);
      setDevOtp(response.dev_otp);
      setCode('');
    } catch (error) {
      setFailure(errorMessage(error, t));
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

      {failure ? <Banner kind="error" message={failure} /> : null}
      {referralRejected ? (
        <Banner kind="error" message={t('auth.referralInvalid')}>
          <Button
            title={t('auth.continueWithoutReferral')}
            variant="outline"
            onPress={() => submit(true)}
            loading={verifying}
          />
        </Banner>
      ) : null}
      {__DEV__ && devOtp ? (
        <Banner
          kind="info"
          message={t('auth.devCode', { code: toPersianDigits(devOtp) })}
        />
      ) : null}

      <TextField
        label={t('auth.otpLabel')}
        value={code}
        onChangeText={value => {
          setCode(value);
          setFieldError(null);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={OTP_LENGTH}
        ltr
        style={styles.codeInput}
        error={fieldError}
        onSubmitEditing={() => submit()}
      />
      <Button
        title={t('auth.verify')}
        onPress={() => submit()}
        loading={verifying}
      />

      <Button
        title={
          secondsLeft > 0
            ? t('auth.resendIn', { seconds: toPersianDigits(secondsLeft) })
            : t('auth.resend')
        }
        variant="secondary"
        disabled={secondsLeft > 0}
        loading={resending}
        onPress={resend}
        style={styles.secondary}
      />
      <Button
        title={t('auth.changeNumber')}
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
  codeInput: { fontSize: 24, letterSpacing: 8, textAlign: 'center' },
  secondary: { marginTop: spacing.md },
});
