import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@bongah/shared-types';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import { Chip } from '../../components/Chip';
import { ScrollScreen } from '../../components/Screen';
import { LANGUAGE_META, changeLanguage } from '../../i18n';
import { formatPhone } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing } from '../../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Account'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function AccountScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const { user, signOut } = useAuth();

  const confirmSignOut = () =>
    Alert.alert(t('auth.signOut'), t('auth.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.signOut'),
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);

  const row = (label: string, value: string) => (
    <View style={styles.row} key={label}>
      <AppText color={colors.textMuted}>{label}</AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );

  return (
    <ScrollScreen edges={['left', 'right']}>
      <View style={styles.card}>
        <AppText variant="heading">{t('account.language')}</AppText>
        <View style={styles.languages}>
          {LANGUAGES.map(code => (
            <Chip
              key={code}
              label={LANGUAGE_META[code].nativeName}
              selected={language === code}
              onPress={() => changeLanguage(code)}
            />
          ))}
        </View>
      </View>

      {user ? (
        <View style={styles.card}>
          {row(t('account.name'), user.full_name ?? t('account.notSet'))}
          {row(t('account.phone'), formatPhone(user.phone_number))}
          {row(t('account.role'), t(`role.${user.role}`))}
        </View>
      ) : null}

      {user ? (
        <Button
          title={t('auth.signOut')}
          variant="danger"
          onPress={confirmSignOut}
        />
      ) : (
        <>
          <AppText color={colors.textMuted} style={styles.hint}>
            {t('auth.signInRequired')}
          </AppText>
          <Button
            title={t('auth.signIn')}
            onPress={() => navigation.navigate('Auth')}
          />
        </>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  languages: { flexDirection: 'row', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hint: { marginBottom: spacing.md },
});
