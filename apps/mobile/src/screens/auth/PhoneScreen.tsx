import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  normalizeAfghanMobile,
  normalizeReferralCode,
  REFERRAL_CODE_LENGTH,
} from '@bongah/validation';
import { sendOtp } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import TextField from '../../components/TextField';
import { toPersianDigits } from '../../i18n/format';
import { closeAuth } from '../../navigation/closeAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Phone'>;

export default function PhoneScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [referral, setReferral] = useState('');
  const [referralError, setReferralError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setFailure(null);
    // The same normaliser the server uses, so what we send is already canonical (+93…).
    const phone = normalizeAfghanMobile(text);
    // The invite code is optional: empty means none; anything else must look like a code
    // (null = typed but not a code). Whether it exists is only known once the SMS code is checked.
    const referralCode = referral.trim()
      ? normalizeReferralCode(referral)
      : undefined;
    if (!phone || referralCode === null) {
      setFieldError(phone ? null : t('auth.invalidPhone'));
      setReferralError(
        referralCode === null
          ? t('auth.referralInvalidFormat', {
              length: toPersianDigits(REFERRAL_CODE_LENGTH),
            })
          : null,
      );
      return;
    }
    setFieldError(null);
    setReferralError(null);
    setLoading(true);
    try {
      const response = await sendOtp(phone);
      navigation.navigate('Otp', {
        phone,
        resendAfter: response.resend_after,
        devOtp: response.dev_otp,
        ...(referralCode ? { referralCode } : {}),
      });
    } catch (error) {
      setFailure(errorMessage(error, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollScreen style={styles.content}>
      <AppText variant="title">{t('app.name')}</AppText>
      <AppText color={colors.textMuted} style={styles.hint}>
        {t('auth.phoneHint')}
      </AppText>

      {failure ? <Banner kind="error" message={failure} /> : null}

      <TextField
        label={t('auth.phoneLabel')}
        value={text}
        onChangeText={value => {
          setText(value);
          setFieldError(null);
        }}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={20}
        ltr
        error={fieldError}
        onSubmitEditing={submit}
      />
      <AppText
        variant="caption"
        color={colors.textMuted}
        style={styles.referralHint}
      >
        {t('auth.referralHint')}
      </AppText>
      <TextField
        label={t('auth.referralLabel')}
        value={referral}
        onChangeText={value => {
          setReferral(value);
          setReferralError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={24}
        digits="keep"
        ltr
        error={referralError}
        onSubmitEditing={submit}
      />
      <Button title={t('auth.sendCode')} onPress={submit} loading={loading} />
      <Button
        title={t('common.close')}
        variant="outline"
        onPress={() => closeAuth(navigation)}
        style={styles.close}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl },
  hint: { marginTop: spacing.sm, marginBottom: spacing.xl },
  referralHint: { marginBottom: spacing.xs },
  close: { marginTop: spacing.md },
});
