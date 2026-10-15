import React from 'react';
import {
  Alert,
  I18nManager,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Role } from '@bongah/shared-types';
import { useAgencyDashboard } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Avatar from '../../components/Avatar';
import Badge, { type BadgeTone } from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import { Chip } from '../../components/Chip';
import { ScrollScreen } from '../../components/Screen';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../config';
import { LANGUAGE_META, changeLanguage } from '../../i18n';
import { formatPhone } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, gradients, radius, shadow, spacing } from '../../theme';
import MorningMessagesCard from './MorningMessagesCard';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Account'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Badges that sit on the emerald profile card: frosted white, and a warm gold for a running plan. */
const ON_HERO: Record<'role' | 'plan' | 'none', BadgeTone> = {
  role: { soft: 'rgba(255,255,255,0.2)', strong: colors.textOnPrimary },
  plan: { soft: colors.accentSoft, strong: colors.warningText },
  none: { soft: 'rgba(255,255,255,0.2)', strong: colors.textOnPrimary },
};

/** What kind of account this is and, for an office, which plan is running and for how long. */
function TierBadges({ role }: { role: Role }) {
  const { t } = useTranslation();
  const isAgency = role === 'AGENCY';
  const dashboard = useAgencyDashboard(isAgency);
  const subscription = dashboard.data?.subscription;
  return (
    <View style={styles.badges}>
      <Badge label={t(`role.${role}`)} tone={ON_HERO.role} />
      {isAgency && subscription ? (
        subscription.is_active && subscription.package_type ? (
          <Badge
            dot
            tone={ON_HERO.plan}
            label={t('account.subscriptionLeft', {
              plan: t(`package.${subscription.package_type}`),
              count: subscription.remaining_days,
            })}
          />
        ) : (
          <Badge tone={ON_HERO.none} label={t('account.noSubscription')} />
        )
      ) : null}
    </View>
  );
}

/** A tappable line in a card: a label, an optional hint and an arrow pointing the way forward. */
function NavRow({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.pressed]}
    >
      <View style={styles.navText}>
        <AppText variant="label">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <AppText color={colors.textMuted} style={styles.arrow}>
        {I18nManager.isRTL ? '‹' : '›'}
      </AppText>
    </Pressable>
  );
}

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

  return (
    <ScrollScreen edges={['left', 'right']}>
      {user ? (
        <View style={[styles.hero, shadow.floating]}>
          <View style={styles.heroTop}>
            <View style={styles.avatarRing}>
              <Avatar
                name={user.full_name}
                uri={user.avatar}
                seed={user.id}
                size={64}
              />
            </View>
            <View style={styles.heroText}>
              <AppText
                variant="heading"
                color={colors.textOnPrimary}
                numberOfLines={1}
              >
                {user.full_name ?? t('account.notSet')}
              </AppText>
              <AppText variant="body" color="rgba(255,255,255,0.88)">
                {formatPhone(user.phone_number)}
              </AppText>
            </View>
          </View>
          <TierBadges role={user.role} />
        </View>
      ) : (
        <View style={[styles.hero, shadow.floating]}>
          <AppText variant="heading" color={colors.textOnPrimary}>
            {t('welcome.title')}
          </AppText>
          <AppText color="rgba(255,255,255,0.88)">
            {t('account.guestHint')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('auth.signIn')}
            onPress={() => navigation.navigate('Auth')}
            style={({ pressed }) => [styles.heroCta, pressed && styles.pressed]}
          >
            <AppText variant="label" color={colors.primaryDark}>
              {t('auth.signIn')}
            </AppText>
          </Pressable>
        </View>
      )}

      {user ? (
        <Card title={t('account.settings')}>
          <MorningMessagesCard embedded />
        </Card>
      ) : null}

      <Card title={t('account.language')}>
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
      </Card>

      {user ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('account.invite')}
          onPress={() => navigation.navigate('Referral')}
          style={({ pressed }) => [styles.invite, pressed && styles.pressed]}
        >
          <AppText style={styles.inviteGlyph}>🎁</AppText>
          <View style={styles.navText}>
            <AppText variant="label" color={colors.primaryDark}>
              {t('account.invite')}
            </AppText>
            <AppText variant="caption" color={colors.primaryDark}>
              {t('account.inviteHint')}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {user?.role === 'AGENCY' ? (
        <Card title={t('account.agencyTools')}>
          <NavRow
            label={t('nav.dashboard')}
            onPress={() => navigation.navigate('Dashboard')}
          />
          <View style={styles.divider} />
          <NavRow
            label={t('nav.templates')}
            onPress={() => navigation.navigate('Templates')}
          />
        </Card>
      ) : null}

      {user ? (
        <Button
          title={t('auth.signOut')}
          variant="danger"
          onPress={confirmSignOut}
        />
      ) : null}

      {/* The credit OpenStreetMap's licence asks for, in plain sight but off the map itself. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('home.mapCredits')}
        onPress={() => Linking.openURL(MAP_ATTRIBUTION_URL).catch(() => {})}
        style={styles.credit}
      >
        <AppText variant="caption" color={colors.textMuted} latinDigits>
          {t('home.mapCredits')}: {MAP_ATTRIBUTION}
        </AppText>
      </Pressable>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  // The emerald profile card. The gradient is the look; the plain colour is what shows where it is not drawn.
  hero: {
    borderRadius: radius.xl + 4,
    padding: spacing.lg + 2,
    marginBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.primary,
    backgroundImage: gradients.hero,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroText: { flex: 1, gap: 2 },
  avatarRing: {
    padding: 3,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  heroCta: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languages: { flexDirection: 'row', gap: spacing.sm },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  inviteGlyph: { fontSize: 30, lineHeight: 40 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
  },
  navText: { flex: 1, gap: 2 },
  arrow: { fontSize: 22, lineHeight: 28 },
  divider: { height: 1, backgroundColor: colors.border },
  pressed: { opacity: 0.85 },
  credit: { alignSelf: 'center', paddingVertical: spacing.lg },
});
