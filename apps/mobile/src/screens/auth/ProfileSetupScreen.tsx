import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { registerUserSchema } from '@bongah/validation';
import { registerUser } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { ScrollScreen } from '../../components/Screen';
import TextField from '../../components/TextField';
import { showToast } from '../../components/Toast';
import { closeAuth } from '../../navigation/closeAuth';
import type { AuthStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ProfileSetup'>;

/** Shown once after the first login: asks for a name. It can be skipped and set later. */
export default function ProfileSetupScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    const parsed = registerUserSchema.safeParse({ full_name: name });
    if (!parsed.success) {
      setFieldError(t('auth.invalidName'));
      showToast(t('auth.invalidName'));
      return;
    }
    setFieldError(null);
    setLoading(true);
    try {
      const user = await registerUser(parsed.data.full_name);
      await updateUser(user);
      closeAuth(navigation);
    } catch (error) {
      showToast(errorMessage(error, t));
      setLoading(false);
    }
  };

  return (
    <ScrollScreen style={styles.content}>
      <AppText color={colors.textMuted} style={styles.hint}>
        {t('auth.profileHint')}
      </AppText>
      {route?.params?.referralApplied ? (
        <Banner kind="success" message={t('auth.referralAppliedLadder')} />
      ) : null}
      <TextField
        label={t('auth.fullName')}
        value={name}
        onChangeText={value => {
          setName(value);
          setFieldError(null);
        }}
        placeholder={t('auth.fullNamePlaceholder')}
        autoComplete="name"
        textContentType="name"
        maxLength={100}
        invalid={fieldError !== null}
        onSubmitEditing={save}
      />
      <Button
        icon="check"
        title={t('common.save')}
        onPress={save}
        loading={loading}
      />
      <Button
        icon="arrow"
        title={t('auth.skip')}
        variant="outline"
        onPress={() => closeAuth(navigation)}
        style={styles.skip}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl },
  hint: { marginBottom: spacing.xl },
  skip: { marginTop: spacing.md },
});
