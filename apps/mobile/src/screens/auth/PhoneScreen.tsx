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
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import TextField from '../../components/TextField';
import { showToast } from '../../components/Toast';
import { toPersianDigits } from '../../i18n/format';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Phone'>;

/**
 * Sign in or register: the phone number (and an invite code, if a friend gave one), then a code is sent to that
 * number's WhatsApp. Whatever is wrong is said in a toast, and the field it is about gets a red outline; the page
 * itself keeps its shape. The screen's own back arrow leaves it, so there is no separate close button.
 */
export default function PhoneScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [referral, setReferral] = useState('');
  const [referralInvalid, setReferralInvalid] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    // The same normaliser the server uses, so what we send is already canonical (+93…).
    const phone = normalizeAfghanMobile(text);
    // The invite code is optional: empty means none; anything else must look like a code
    // (null = typed but not a code). Whether it exists is only known once the WhatsApp code is checked.
    const referralCode = referral.trim()
      ? normalizeReferralCode(referral)
      : undefined;
    if (!phone || referralCode === null) {
      setPhoneInvalid(!phone);
      setReferralInvalid(referralCode === null);
      showToast(
        !phone
          ? t('auth.invalidPhone')
          : t('auth.referralInvalidFormat', {
              length: toPersianDigits(REFERRAL_CODE_LENGTH),
            }),
      );
      return;
    }
    setPhoneInvalid(false);
    setReferralInvalid(false);
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
      showToast(errorMessage(error, t, { sendingCode: true }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollScreen style={styles.content}>
      <AppText variant="title">{t('app.name')}</AppText>
      <AppText color={colors.textMuted} style={styles.hint}>
        {t('auth.phoneHintWhatsapp')}
      </AppText>

      <TextField
        label={t('auth.phoneLabel')}
        value={text}
        onChangeText={value => {
          setText(value);
          setPhoneInvalid(false);
        }}
        placeholder={t('auth.phonePlaceholder')}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={20}
        ltr
        invalid={phoneInvalid}
        onSubmitEditing={submit}
      />
      <AppText
        variant="caption"
        color={colors.textMuted}
        style={styles.referralHint}
      >
        {t('auth.referralHintLadder')}
      </AppText>
      <TextField
        label={t('auth.referralLabel')}
        value={referral}
        onChangeText={value => {
          setReferral(value);
          setReferralInvalid(false);
        }}
        placeholder={t('auth.referralPlaceholder')}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={24}
        digits="keep"
        ltr
        invalid={referralInvalid}
        onSubmitEditing={submit}
      />
      <Button
        title={t('auth.sendCode')}
        icon="send"
        onPress={submit}
        loading={loading}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl },
  hint: { marginTop: spacing.sm, marginBottom: spacing.xl },
  referralHint: { marginBottom: spacing.xs },
});
