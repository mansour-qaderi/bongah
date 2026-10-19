import React, { useState } from 'react';
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
import { Chip } from '../../components/Chip';
import EditProfileSheet from '../../components/EditProfileSheet';
import FeedbackSheet from '../../components/FeedbackSheet';
import Icon, { type IconName } from '../../components/Icon';
import { ScrollScreen } from '../../components/Screen';
import { APP_VERSION } from '../../appInfo';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../config';
import { LANGUAGE_META, changeLanguage } from '../../i18n';
import { formatPhone, toPersianDigits } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, spacing, surfaces } from '../../theme';
import MorningMessagesCard from './MorningMessagesCard';
import ReferralBanner from './ReferralBanner';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Account'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** Badges that sit on the emerald profile card: solid white with emerald ink, and solid gold for a running plan. */
const ON_HERO: Record<'role' | 'plan' | 'none', BadgeTone> = {
  role: { bg: colors.surface, fg: colors.primaryDark },
  plan: { bg: colors.accentBright, fg: colors.textOnAccent },
  none: { bg: colors.surface, fg: colors.textSecondary },
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

/** The little square an icon sits in, at the start of a menu line. */
function IconTile({ name }: { name: IconName }) {
  return (
    <View style={styles.iconTile}>
      <Icon name={name} size={20} color={colors.textSecondary} weight={1.8} />
    </View>
  );
}

/**
 * One line of a menu group: its icon in a grey tile, the label with a quiet hint under it, and an arrow pointing
 * the way forward. `trailing` replaces the arrow (a switch, the language choice).
 */
function MenuRow({
  icon,
  label,
  hint,
  onPress,
  tone = 'default',
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
    >
      <IconTile name={icon} />
      <View style={styles.menuText}>
        <AppText
          variant="label"
          color={tone === 'danger' ? colors.danger : colors.text}
        >
          {label}
        </AppText>
        {hint ? (
          <AppText variant="caption" color={colors.textMuted}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Icon
        name={I18nManager.isRTL ? 'chevronLeft' : 'chevronRight'}
        size={20}
        color={colors.textMuted}
        weight={1.8}
      />
    </Pressable>
  );
}

/** A titled group of lines in one flat white container, a hairline between them. */
function MenuGroup({
  title,
  children,
  testID,
}: {
  title?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const lines = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group} testID={testID}>
      {title ? (
        <AppText
          variant="label"
          color={colors.textMuted}
          style={styles.groupTitle}
        >
          {title}
        </AppText>
      ) : null}
      <View style={styles.groupBox}>
        {lines.map((line, index) => (
          <React.Fragment key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {line}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** A square shortcut under the profile card: an icon over one short word. */
function QuickTile({
  icon,
  label,
  onPress,
  a11yLabel,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  a11yLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <IconTile name={icon} />
      <AppText variant="caption" color={colors.text} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function AccountScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const { user, signOut } = useAuth();
  const [editing, setEditing] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('account.editProfile')}
              onPress={() => setEditing(true)}
              style={styles.avatarRing}
            >
              <Avatar
                name={user.full_name}
                uri={user.avatar}
                seed={user.id}
                size={64}
              />
            </Pressable>
            <View style={styles.heroText}>
              <AppText
                variant="heading"
                color={colors.textOnPrimary}
                numberOfLines={1}
              >
                {user.full_name ?? t('account.notSet')}
              </AppText>
              <AppText variant="bodySm" color="rgba(255,255,255,0.88)">
                {formatPhone(user.phone_number)}
              </AppText>
            </View>
          </View>
          <View style={styles.heroFoot}>
            <TierBadges role={user.role} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('account.editProfile')}
              onPress={() => setEditing(true)}
              style={({ pressed }) => [
                styles.editPill,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="caption" color={colors.textOnPrimary}>
                {t('account.editProfile')}
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.hero}>
          <AppText variant="heading" color={colors.textOnPrimary}>
            {t('welcome.title')}
          </AppText>
          <AppText variant="bodySm" color="rgba(255,255,255,0.88)">
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

      <View style={styles.tiles} testID="quick-actions">
        <QuickTile
          icon="bookmark"
          label={t('nav.saved')}
          onPress={() => navigation.navigate('Saved')}
        />
        <QuickTile
          icon="listings"
          label={t('nav.myListings')}
          onPress={() => navigation.navigate('MyListings')}
        />
        <QuickTile
          icon="plus"
          label={t('nav.addProperty')}
          onPress={() => navigation.navigate('AddProperty')}
        />
      </View>

      {user ? (
        <ReferralBanner onOpen={() => navigation.navigate('Referral')} />
      ) : null}

      <MenuGroup title={t('account.settings')} testID="settings-group">
        {user ? <MorningMessagesCard embedded /> : null}
        <View style={styles.languageRow}>
          <IconTile name="globe" />
          <AppText variant="label" style={styles.menuText}>
            {t('account.language')}
          </AppText>
          <View style={styles.languages}>
            {LANGUAGES.map(code => (
              <Chip
                compact
                key={code}
                label={LANGUAGE_META[code].nativeName}
                selected={language === code}
                onPress={() => changeLanguage(code)}
              />
            ))}
          </View>
        </View>
      </MenuGroup>

      {user?.role === 'AGENCY' ? (
        <MenuGroup title={t('account.agencyTools')}>
          <MenuRow
            icon="dashboard"
            label={t('nav.dashboard')}
            onPress={() => navigation.navigate('Dashboard')}
          />
          <MenuRow
            icon="chat"
            label={t('nav.templates')}
            onPress={() => navigation.navigate('Templates')}
          />
        </MenuGroup>
      ) : null}

      <MenuGroup title={t('account.groupSupport')}>
        <MenuRow
          icon="chat"
          label={t('account.feedback')}
          hint={t('account.feedbackHint')}
          onPress={() => setFeedbackOpen(true)}
        />
        <MenuRow
          icon="info"
          label={t('account.about')}
          hint={t('account.aboutHint')}
          onPress={() => navigation.navigate('About')}
        />
      </MenuGroup>

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
      <AppText
        variant="caption"
        color={colors.textMuted}
        style={styles.version}
      >
        {t('account.version', { version: toPersianDigits(APP_VERSION) })}
      </AppText>
      <EditProfileSheet visible={editing} onClose={() => setEditing(false)} />
      <FeedbackSheet
        visible={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSignIn={() => navigation.navigate('Auth')}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  // The emerald profile card: one flat, solid colour.
  hero: {
    borderRadius: radius.xl + 4,
    padding: spacing.lg + 2,
    marginBottom: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.primary,
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
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  editPill: {
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.textOnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  languages: { flexDirection: 'row', gap: spacing.sm },
  // The same rhythm as a `menuRow`, so every line of every group is spaced alike.
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  tiles: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  tile: {
    ...surfaces.card,
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  group: { marginBottom: spacing.lg, gap: spacing.sm },
  groupTitle: { paddingHorizontal: spacing.xs },
  groupBox: {
    ...surfaces.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  menuText: { flex: 1, gap: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  pressed: { opacity: 0.85 },
  version: { alignSelf: 'center', paddingBottom: spacing.sm },
  credit: { alignSelf: 'center', paddingVertical: spacing.lg },
});
