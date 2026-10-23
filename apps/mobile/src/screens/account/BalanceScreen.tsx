import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  LADDERS_PER_FRAME,
  LADDERS_PER_LISTING,
  type ListingQuota,
} from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { usePricing, useWallet } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import Icon, { type IconName } from '../../components/Icon';
import { Screen } from '../../components/Screen';
import { Reveal, useReveal } from '../../components/Reveal';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { useErrorToast } from '../../components/useErrorToast';
import { showToast } from '../../components/Toast';
import { formatNumber } from '../../i18n/format';
import { formatSolarDate } from '../../i18n/solarHijri';
import type { RootStackParamList } from '../../navigation/types';
import { useLadderSpend } from '../../payments/useLadderSpend';
import { colors, radius, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Balance'>;

/** Used up: no free listing left and no gift listing on top (an admin's listings never run out). */
export const quotaExhausted = (quota: ListingQuota | undefined): boolean =>
  quota !== undefined &&
  quota.limit !== null &&
  quota.used >= quota.limit &&
  quota.extra === 0;

/**
 * Everything the person has left, in one place: the listings they can still publish (the monthly free listing, an
 * office's plan, and any gift listings on top), the featured frames («کادر ویژه برای آگهی») they hold, and their ladders
 * (نردبان, earned by inviting friends; three buy one more listing, seven a frame). The ladders are a bare count (no
 * progress bar): the explanation says what they buy. Two buttons lead on: upgrade the account, buy frames. Ladders are
 * spent here for a listing quota, and on a listing's frame from the form or its promotion sheet.
 */
export default function BalanceScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const wallet = useWallet(status === 'signedIn');
  const pricing = usePricing(status === 'signedIn');
  const spend = useLadderSpend();
  useErrorToast(spend.error ? errorMessage(spend.error, t) : null, spend.error);

  const reveal = useReveal(wallet.isPending);

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('referral.signInHint')}>
        <Button
          icon="login"
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (wallet.isPending) return <LoadingView />;
  if (wallet.isError) {
    return (
      <ErrorView
        message={errorMessage(wallet.error, t)}
        onRetry={() => wallet.refetch()}
      />
    );
  }

  const data = wallet.data;
  const quota = data.listing_quota;
  const frames = user?.featured_credits ?? 0;
  const ladders = data.ladder_tokens;
  const days = pricing.data?.featured_ad_days;
  const exhausted = quotaExhausted(quota);
  const canUnlock = exhausted && ladders >= LADDERS_PER_LISTING;
  const listingCost = formatNumber(LADDERS_PER_LISTING, 0);
  const frameCost = formatNumber(LADDERS_PER_FRAME, 0);

  const unlock = () => {
    spend.mutate(
      { purpose: 'LISTING_QUOTA' },
      { onSuccess: () => showToast(t('ladder.unlocked'), 'success') },
    );
  };

  const page = (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={wallet.isRefetching}
            onRefresh={() => {
              wallet.refetch();
            }}
          />
        }
      >
        {/* 1. The listings still available to publish. */}
        <View style={styles.card} testID="balance-quota-card">
          <Row icon="listings" label={t('balance.quota')}>
            <AppText variant="heading" testID="balance-quota-value">
              {quota
                ? quota.limit === null
                  ? t('balance.quotaUnlimited')
                  : t('balance.quotaValue', {
                      left: formatNumber(
                        Math.max(0, quota.limit - quota.used) + quota.extra,
                        0,
                      ),
                      total: formatNumber(quota.limit + quota.extra, 0),
                    })
                : '—'}
            </AppText>
          </Row>
          <AppText variant="bodySm" color={colors.textSecondary}>
            {t('balance.quotaExplain')}
          </AppText>
          {quota ? (
            quota.resets_at ? (
              <AppText
                variant="label"
                color={colors.primaryDark}
                testID="balance-quota-next"
              >
                {t('balance.quotaNextDate', {
                  date: formatSolarDate(quota.resets_at, t),
                })}
              </AppText>
            ) : null
          ) : (
            <AppText variant="caption" color={colors.textMuted}>
              {t('balance.quotaMissing')}
            </AppText>
          )}
        </View>

        {/* 2. The featured frames in hand. */}
        <View style={styles.card} testID="balance-frames-card">
          <Row icon="frameStar" label={t('balance.frames')}>
            <AppText variant="heading" testID="balance-frames-value">
              {formatNumber(frames, 0)}
            </AppText>
          </Row>
          {days ? (
            <AppText variant="caption" color={colors.textMuted}>
              {t('frame.topOfList', { days: formatNumber(days, 0) })}
            </AppText>
          ) : null}
        </View>

        {/* 3. Ladders: how many, and what they buy. */}
        <View style={styles.card} testID="balance-ladders-card">
          <Row icon="arrowUp" label={t('balance.ladders')}>
            <AppText variant="heading" testID="balance-ladders-value">
              {formatNumber(ladders, 0)}
            </AppText>
          </Row>
          <AppText variant="bodySm" color={colors.textSecondary}>
            {t('ladder.explain', { listing: listingCost, frame: frameCost })}
          </AppText>

          {/* Only the offer, when it can be taken. The button below already says what it costs; a grey line of
              "not yet" under the explanation only repeated it. */}
          {canUnlock ? (
            <Banner
              kind="promo"
              message={t('ladder.unlockOffer', { total: listingCost })}
            />
          ) : null}
          {quota && quota.limit !== null ? (
            <Button
              icon="plus"
              title={t('ladder.unlockQuota', { total: listingCost })}
              disabled={!canUnlock}
              loading={spend.isPending}
              onPress={unlock}
            />
          ) : null}
          {ladders >= LADDERS_PER_FRAME ? (
            <>
              <AppText variant="caption" color={colors.textMuted}>
                {t('ladder.frameHow')}
              </AppText>
              <Button
                icon="arrow"
                variant="outline"
                title={t('balance.myListings')}
                onPress={() =>
                  navigation.navigate('Tabs', { screen: 'MyListings' })
                }
              />
            </>
          ) : (
            <Button
              icon="gift"
              variant="outline"
              title={t('ladder.inviteFriends')}
              onPress={() => navigation.navigate('Referral')}
            />
          )}
        </View>

        {/* Where to go from here. */}
        <View style={styles.actions} testID="balance-actions">
          <Button
            icon="up"
            title={t('balance.upgrade')}
            onPress={() => navigation.navigate('Upgrade')}
            style={styles.action}
          />
          <Button
            icon="card"
            title={t('balance.buyFrames')}
            variant="secondary"
            onPress={() => navigation.navigate('Checkout')}
            style={styles.action}
          />
        </View>
      </ScrollView>
    </Screen>
  );
  return (
    <Reveal {...reveal} loader={<LoadingView />}>
      {page}
    </Reveal>
  );
}

/** A line of a balance card: its icon in a grey tile, what it is, and its number at the other end. */
function Row({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.iconTile}>
        <Icon name={icon} size={20} color={colors.textSecondary} weight={1.8} />
      </View>
      <AppText variant="label" style={styles.rowLabel}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  card: { ...surfaces.card, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { flex: 1 },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutralSoft,
  },
  actions: { gap: spacing.md },
  action: {},
});
