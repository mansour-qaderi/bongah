import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { AgencyDashboard, DashboardListing } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { useAgencyDashboard } from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import { Chip } from '../../components/Chip';
import PromotionSheet from '../../components/PromotionSheet';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatDate, formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import type { RootStackParamList } from '../../navigation/types';
import { colors, radius, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

/**
 * The agency's CRM home: how many listings it has and how many people looked at them, how long
 * the subscription lasts, its most viewed listings (each can be promoted right here), and the
 * shortcuts to post a property or manage the existing ones.
 */
export default function AgencyDashboardScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const isAgency = user?.role === 'AGENCY';
  const query = useAgencyDashboard(status === 'signedIn' && isAgency);
  const [promoting, setPromoting] = useState<DashboardListing | null>(null);

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('dashboard.signInHint')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }
  if (!isAgency) {
    return <EmptyView message={t('dashboard.agenciesOnly')} />;
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
  const subscribe = () =>
    navigation.navigate('Checkout', { tab: 'subscription' });

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
        <AgencyHeader data={data} />
        <SubscriptionCard data={data} onSubscribe={subscribe} />
        <StatGrid data={data} />

        <AppText variant="heading" style={styles.sectionTitle}>
          {t('dashboard.quickActions')}
        </AppText>
        <View style={styles.actions}>
          <Button
            title={t('dashboard.post')}
            style={styles.action}
            onPress={() => navigation.navigate('AddProperty')}
          />
          <Button
            title={t('dashboard.manage')}
            variant="outline"
            style={styles.action}
            onPress={() =>
              navigation.navigate('Tabs', { screen: 'MyListings' })
            }
          />
        </View>

        <AppText variant="heading" style={styles.sectionTitle}>
          {t('dashboard.topListings')}
        </AppText>
        {data.top_listings.length === 0 ? (
          <AppText color={colors.textMuted}>
            {t('dashboard.noListings')}
          </AppText>
        ) : (
          data.top_listings.map(listing => (
            <TopListingRow
              key={listing.id}
              listing={listing}
              onOpen={() =>
                navigation.navigate('PropertyDetails', { id: listing.id })
              }
              onPromote={() => setPromoting(listing)}
            />
          ))
        )}
      </ScrollView>

      <PromotionSheet property={promoting} onClose={() => setPromoting(null)} />
    </Screen>
  );
}

function AgencyHeader({ data }: { data: AgencyDashboard }) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      <AppText variant="title" style={styles.agencyName} numberOfLines={2}>
        {data.agency.agency_name}
      </AppText>
      <View
        style={[
          styles.pill,
          data.agency.is_verified ? styles.pillGood : styles.pillMuted,
        ]}
      >
        <AppText
          variant="caption"
          color={data.agency.is_verified ? colors.success : colors.textMuted}
        >
          {data.agency.is_verified
            ? t('dashboard.verified')
            : t('dashboard.pending')}
        </AppText>
      </View>
    </View>
  );
}

/** The active-subscription badge, or a prompt to buy one. */
function SubscriptionCard({
  data,
  onSubscribe,
}: {
  data: AgencyDashboard;
  onSubscribe: () => void;
}) {
  const { t } = useTranslation();
  const { subscription } = data;

  if (!subscription.is_active) {
    return (
      <View style={[styles.card, styles.cardWarning]}>
        <AppText variant="label" color={colors.danger}>
          {t('dashboard.subscriptionInactive')}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {t('dashboard.subscriptionInactiveHelp')}
        </AppText>
        <Button title={t('dashboard.subscribe')} onPress={onSubscribe} />
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.cardGood]}>
      <View style={styles.subscriptionRow}>
        <View style={[styles.pill, styles.pillGood]}>
          <AppText variant="label" color={colors.success}>
            {t('dashboard.subscriptionActive')}
            {subscription.package_type
              ? ` · ${t(`package.${subscription.package_type}`)}`
              : ''}
          </AppText>
        </View>
        <AppText variant="heading" color={colors.primaryDark}>
          {t('dashboard.daysLeft', {
            days: formatNumber(subscription.remaining_days, 0),
          })}
        </AppText>
      </View>
      {subscription.ends_at ? (
        <AppText variant="caption" color={colors.textMuted}>
          {t('dashboard.endsAt', { date: formatDate(subscription.ends_at) })}
        </AppText>
      ) : null}
      <Button
        title={t('dashboard.renew')}
        variant="outline"
        onPress={onSubscribe}
      />
    </View>
  );
}

function StatGrid({ data }: { data: AgencyDashboard }) {
  const { t } = useTranslation();
  const { stats } = data;
  const tiles: [string, number][] = [
    [t('dashboard.statTotal'), stats.total_properties],
    [t('dashboard.statActive'), stats.active_listings],
    [t('dashboard.statFeatured'), stats.featured_listings],
    [t('dashboard.statViews'), stats.total_views],
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

function TopListingRow({
  listing,
  onOpen,
  onPromote,
}: {
  listing: DashboardListing;
  onOpen: () => void;
  onPromote: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText
          variant="label"
          numberOfLines={1}
          accessibilityRole="button"
          onPress={onOpen}
        >
          {listing.title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {format.price(listing.price, listing.currency)} ·{' '}
          {t('dashboard.views', { count: formatNumber(listing.view_count, 0) })}
        </AppText>
        {listing.is_featured ? (
          <View style={styles.chipWrap}>
            <Chip label={t('property.featured')} selected onPress={onOpen} />
          </View>
        ) : null}
      </View>
      <Button
        title={t('dashboard.promote')}
        variant="secondary"
        style={styles.promote}
        onPress={onPromote}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  agencyName: { flex: 1 },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pillGood: { backgroundColor: colors.successSoft },
  pillMuted: { backgroundColor: colors.border },
  card: {
    ...surfaces.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardGood: { backgroundColor: colors.surface, borderColor: colors.border },
  cardWarning: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    ...surfaces.tile,
    flexBasis: '47%',
    flexGrow: 1,
    padding: spacing.lg,
  },
  sectionTitle: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  row: {
    ...surfaces.tile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  rowText: { flex: 1, gap: spacing.xs },
  chipWrap: { flexDirection: 'row' },
  promote: { minHeight: 40, paddingHorizontal: spacing.md },
});
