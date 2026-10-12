import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { normalizeAfghanMobile } from '@bongah/validation';
import { sendOtp } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import TextField from '../../components/TextField';
import { closeAuth } from '../../navigation/closeAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Phone'>;

export default function PhoneScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setFailure(null);
    // The same normaliser the server uses, so what we send is already canonical (+93…).
    const phone = normalizeAfghanMobile(text);
    if (!phone) {
      setFieldError(t('auth.invalidPhone'));
      return;
    }
    setFieldError(null);
    setLoading(true);
    try {
      const response = await sendOtp(phone);
      navigation.navigate('Otp', {
        phone,
        resendAfter: response.resend_after,
        devOtp: response.dev_otp,
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
  close: { marginTop: spacing.md },
});
