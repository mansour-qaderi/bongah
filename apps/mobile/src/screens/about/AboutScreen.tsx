import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../appInfo';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import Card from '../../components/Card';
import FeedbackSheet from '../../components/FeedbackSheet';
import Logo from '../../components/Logo';
import { ScrollScreen } from '../../components/Screen';
import { toPersianDigits } from '../../i18n/format';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

/** One "label … value" line of the app's details. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="label">
        {value}
      </AppText>
    </View>
  );
}

/**
 * "درباره ما": what Bongah is for, what it lets you do, the app's own details (name, version, languages) and a way to reach the team, which is the feedback sheet. Plain facts only: nothing here is a claim the
 * app cannot back up.
 */
type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

export default function AboutScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <ScrollScreen edges={['left', 'right']}>
      <View style={styles.brand}>
        {/* The app's own mark, drawn as it is everywhere else (the splash screen, the app icon). */}
        <Logo size={96} testID="about-logo" style={styles.logo} />
        <AppText variant="title">{t('app.name')}</AppText>
        <AppText color={colors.textMuted}>{t('app.tagline')}</AppText>
      </View>

      <Card title={t('about.missionTitle')}>
        <AppText>{t('about.mission')}</AppText>
      </Card>

      <Card title={t('about.whatTitle')}>
        {(['point1', 'point2', 'point3'] as const).map(key => (
          <View key={key} style={styles.point}>
            <View style={styles.bullet} />
            <AppText style={styles.pointText}>{t(`about.${key}`)}</AppText>
          </View>
        ))}
      </Card>

      <Card title={t('about.detailsTitle')}>
        <Detail label={t('about.appName')} value={t('app.name')} />
        <Detail
          label={t('about.version')}
          value={toPersianDigits(APP_VERSION)}
        />
        <Detail
          label={t('about.languages')}
          value={t('about.languagesValue')}
        />
      </Card>

      <Card>
        <AppText color={colors.textSecondary}>{t('about.contactNote')}</AppText>
        <Button
          icon="send"
          title={t('about.sendFeedback')}
          variant="outline"
          onPress={() => setFeedbackOpen(true)}
        />
      </Card>

      <FeedbackSheet
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSignIn={() => navigation.navigate('Auth')}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  logo: { marginBottom: spacing.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 9,
    backgroundColor: colors.primary,
  },
  pointText: { flex: 1 },
  detail: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
