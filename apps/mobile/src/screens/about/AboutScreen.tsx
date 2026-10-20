import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../appInfo';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import Card from '../../components/Card';
import FeedbackSheet from '../../components/FeedbackSheet';
import Logo from '../../components/Logo';
import { ScrollScreen } from '../../components/Screen';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../config';
import { toPersianDigits } from '../../i18n/format';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

/** One "label … value" line of the app's details. */
function Detail({
  label,
  value,
  latin,
}: {
  label: string;
  value: string;
  /** The value is Latin text (a credit line) that must keep its digits and letters as they are. */
  latin?: boolean;
}) {
  return (
    <View style={styles.detail}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="label" latinDigits={latin}>
        {value}
      </AppText>
    </View>
  );
}

/**
 * "درباره ما": what Bongah is for, what it lets you do, the app's own details (name, version, languages, where the map
 * comes from) and a way to reach the team, which is the feedback sheet. Plain facts only: nothing here is a claim the
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
        <Detail label={t('about.manager')} value={t('about.managerValue')} />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${t('about.map')}: ${MAP_ATTRIBUTION}`}
          onPress={() => Linking.openURL(MAP_ATTRIBUTION_URL).catch(() => {})}
        >
          <Detail label={t('about.map')} value={MAP_ATTRIBUTION} latin />
        </Pressable>
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
