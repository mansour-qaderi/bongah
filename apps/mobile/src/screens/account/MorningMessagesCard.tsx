import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { updatePreferences } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { useFormat } from '../../i18n/useFormat';
import { enablePush } from '../../push/registration';
import { colors, radius, spacing } from '../../theme';

/**
 * The on/off switch for the morning message ("پیام‌های انرژی‌بخش صبحگاهی"). Turning it on also asks the phone for permission to
 * show notifications, because that is the moment the person has just said they want them.
 *
 * The switch moves at once and goes back if the server says no. If the phone refuses notifications the choice is still
 * saved (it is what the person asked for) and a line explains where to allow them.
 */
export default function MorningMessagesCard() {
  const { t } = useTranslation();
  const { language } = useFormat();
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  // The latest user, for rolling back without overwriting a change that arrived while the request was out.
  const latest = useRef(user);
  latest.current = user;

  if (!user) return null;
  // A saved session from before the setting existed has no value: that is "on", like the server's default.
  const enabled = user.enable_daily_motivation !== false;

  const toggle = async (next: boolean) => {
    if (saving) return;
    setSaving(true);
    setFailure(null);
    setBlocked(false);
    await updateUser({ ...user, enable_daily_motivation: next });
    try {
      await updateUser(await updatePreferences({ enable_daily_motivation: next }));
    } catch (error) {
      if (latest.current) {
        await updateUser({ ...latest.current, enable_daily_motivation: !next });
      }
      setFailure(errorMessage(error, t));
      setSaving(false);
      return;
    }
    if (next) setBlocked((await enablePush(language)) === 'no-permission');
    setSaving(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="heading">{t('account.morningMessages')}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('account.morningMessagesHint')}
          </AppText>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={saving}
          accessibilityLabel={t('account.morningMessages')}
          trackColor={{ false: colors.border, true: colors.primary }}
        />
      </View>
      {failure ? <Banner kind="error" message={failure} /> : null}
      {blocked && enabled ? (
        <Banner kind="info" message={t('account.morningMessagesBlocked')}>
          <Button
            title={t('account.openSettings')}
            variant="outline"
            onPress={() => Linking.openSettings()}
          />
        </Banner>
      ) : null}
    </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  text: { flex: 1, gap: spacing.xs },
});
