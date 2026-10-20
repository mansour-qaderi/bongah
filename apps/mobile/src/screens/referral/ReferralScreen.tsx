import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type {
  ReferralInvitee,
  ReferralSummary,
  RewardItem,
} from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { useReferralSummary } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import { useErrorToast } from '../../components/useErrorToast';
import Button from '../../components/Button';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatDate, formatNumber } from '../../i18n/format';
import type { RootStackParamList } from '../../navigation/types';
import { referralLink, shareReferral } from '../../share/referralLink';
import { useCopy } from '../../share/useCopy';
import { colors, radius, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Referral'>;

/**
 * Invite friends: my code (selectable, so it can be copied), a Share button that opens the
 * phone's share sheet, how many friends joined, and the free ladders I earned.
 */
export default function ReferralScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const query = useReferralSummary(status === 'signedIn');

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('referral.signInHint')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (query.isPending) return <LoadingView />;
  if (query.isError) {
    return (
      <ErrorView
        message={errorMessage(query.error, t)}
        onRetry={() => query.refetch()}
      />
    );
  }

  const data = query.data;
  return (
    <Screen edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => {
              query.refetch();
            }}
          />
        }
      >
        <AppText color={colors.textMuted}>{t('referral.intro')}</AppText>
        <CodeCard data={data} />
        <Stats data={data} />
        {data.stats.rewarded_invites >= data.stats.max_rewarded_invites ? (
          <Banner
            kind="info"
            message={t('referral.capReached', {
              max: formatNumber(data.stats.max_rewarded_invites, 0),
            })}
          />
        ) : null}
        {data.stats.ladder_tokens_available > 0 ? (
          <Banner kind="success" message={t('referral.howToUse')} />
        ) : null}

        <AppText variant="heading" style={styles.sectionTitle}>
          {t('referral.invitedTitle')}
        </AppText>
        {data.invited.length === 0 ? (
          <AppText color={colors.textMuted}>
            {t('referral.invitedEmpty')}
          </AppText>
        ) : (
          data.invited.map((friend, index) => (
            <InviteeRow key={`${friend.joined_at}-${index}`} friend={friend} />
          ))
        )}

        <AppText variant="heading" style={styles.sectionTitle}>
          {t('referral.rewardsTitle')}
        </AppText>
        {data.rewards.length === 0 ? (
          <AppText color={colors.textMuted}>
            {t('referral.rewardsEmpty')}
          </AppText>
        ) : (
          data.rewards.map((reward, index) => (
            <RewardRow key={`${reward.created_at}-${index}`} reward={reward} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function CodeCard({ data }: { data: ReferralSummary }) {
  const { t } = useTranslation();
  const [shareFailed, setShareFailed] = useState(false);
  const { copy, copied, failed } = useCopy();
  const link = referralLink(data);
  useErrorToast(shareFailed ? t('referral.shareFailed') : null, shareFailed);
  useErrorToast(failed ? t('referral.copyFailed') : null, failed);

  const share = async () => {
    setShareFailed(false);
    // Closing the sheet is a normal outcome, not an error; only a failure to open it is.
    setShareFailed(!(await shareReferral(data, t)));
  };

  return (
    <View style={styles.codeCard}>
      <AppText variant="label" color={colors.textMuted}>
        {t('referral.yourCode')}
      </AppText>
      <AppText
        selectable
        latinDigits
        accessibilityLabel={t('referral.yourCode')}
        style={styles.code}
      >
        {data.referral_code}
      </AppText>
      <AppText
        selectable
        latinDigits
        numberOfLines={1}
        ellipsizeMode="middle"
        accessibilityLabel={`${t('referral.linkLabel')}: ${link}`}
        style={styles.link}
      >
        {link}
      </AppText>
      <View style={styles.codeButtons}>
        <Button
          title={copied ? t('referral.copied') : t('referral.copy')}
          variant="secondary"
          onPress={() => {
            copy(link);
          }}
          style={styles.codeButton}
        />
        <Button
          title={t('referral.share')}
          onPress={share}
          style={styles.codeButton}
        />
      </View>
    </View>
  );
}

function Stats({ data }: { data: ReferralSummary }) {
  const { t } = useTranslation();
  const { stats } = data;
  const tiles: [string, number][] = [
    [t('referral.statInvited'), stats.invited_count],
    [t('referral.statEarned'), stats.ladder_tokens_earned],
    [t('referral.statAvailable'), stats.ladder_tokens_available],
  ];
  return (
    <View style={styles.grid}>
      {tiles.map(([label, value]) => (
        <View key={label} style={styles.tile}>
          <AppText variant="title" color={colors.primaryDark}>
            {formatNumber(value, 0)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function InviteeRow({ friend }: { friend: ReferralInvitee }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="label" numberOfLines={1}>
          {friend.name ?? t('referral.unnamedFriend')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.ltr}>
          {friend.phone_masked}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('referral.joinedOn', { date: formatDate(friend.joined_at) })}
        </AppText>
      </View>
      <View
        style={[
          styles.pill,
          friend.reward_granted ? styles.pillGood : styles.pillMuted,
        ]}
      >
        <AppText
          variant="caption"
          color={
            friend.reward_granted ? colors.textOnPrimary : colors.textMuted
          }
        >
          {friend.reward_granted
            ? t('referral.rewardGranted')
            : t('referral.rewardNotGranted')}
        </AppText>
      </View>
    </View>
  );
}

function RewardRow({ reward }: { reward: RewardItem }) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="label">
          {t(`referral.rewardType.${reward.type}`)}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t(`referral.rewardReason.${reward.reason}`)} ·{' '}
          {formatDate(reward.created_at)}
        </AppText>
      </View>
      <View
        style={[
          styles.pill,
          reward.used_at ? styles.pillMuted : styles.pillGood,
        ]}
      >
        <AppText
          variant="caption"
          color={reward.used_at ? colors.textMuted : colors.textOnPrimary}
        >
          {reward.used_at
            ? t('referral.usedOn', { date: formatDate(reward.used_at) })
            : t('referral.available')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  codeCard: {
    ...surfaces.card,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  // The code is Latin letters and digits: always left-to-right, spaced out so look-alike
  // characters stay readable, and never converted to Persian digits (people type it back).
  code: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: '700',
    letterSpacing: 6,
    writingDirection: 'ltr',
    textAlign: 'center',
    color: colors.primaryDark,
  },
  link: {
    writingDirection: 'ltr',
    textAlign: 'left',
    color: colors.textSecondary,
    alignSelf: 'stretch',
  },
  codeButtons: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  codeButton: { flex: 1 },
  grid: { flexDirection: 'row', gap: spacing.md },
  tile: {
    ...surfaces.tile,
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
  },
  sectionTitle: { marginTop: spacing.md },
  row: {
    ...surfaces.tile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowText: { flex: 1, gap: spacing.xs },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pillGood: { backgroundColor: colors.primary },
  pillMuted: { backgroundColor: colors.neutralSoft },
});
