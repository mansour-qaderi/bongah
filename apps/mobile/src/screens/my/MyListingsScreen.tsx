import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Property, PropertyStatus } from '@bongah/shared-types';
import { archiveProperty, updateProperty } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import {
  flattenPages,
  queryClient,
  queryKeys,
  useMyProperties,
} from '../../api/hooks';
import { useAuth } from '../../auth/AuthContext';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { Chip, ChipRow } from '../../components/Chip';
import PromotionSheet from '../../components/PromotionSheet';
import Fab from '../../components/Fab';
import ListingCard, { type ListingAction } from '../../components/ListingCard';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatNumber } from '../../i18n/format';
import { markDeleted, useDeletedListings } from '../../listings/deleted';
import { useShareListing } from '../../share/listingShare';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'MyListings'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** The tabs above the list: everything, or only the listings in one status. */
type StatusFilter = 'ALL' | PropertyStatus;
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'SOLD', 'ARCHIVED'];

/**
 * The things an owner does to a listing. `sold` / `activate` / `deactivate` change its status (PATCH): "traded"
 * ("معامله شد"), and the on/off switch between active and inactive, which is the API's ARCHIVED. `delete` is
 * DELETE, which also leaves the listing archived on the server; see listings/deleted.ts for what that means here.
 */
type Change = {
  id: string;
  kind: 'sold' | 'activate' | 'deactivate' | 'delete';
};

const changeListing = ({ id, kind }: Change): Promise<unknown> => {
  switch (kind) {
    case 'sold':
      return updateProperty(id, { status: 'SOLD' });
    case 'activate':
      return updateProperty(id, { status: 'ACTIVE' });
    case 'deactivate':
      return updateProperty(id, { status: 'ARCHIVED' });
    case 'delete':
      return archiveProperty(id);
  }
};

export default function MyListingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const query = useMyProperties(status === 'signedIn');
  const deleted = useDeletedListings();
  const properties = flattenPages(query.data).filter(
    property => !deleted.includes(property.id),
  );
  const share = useShareListing();
  const [promoting, setPromoting] = useState<Property | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const change = useMutation({
    mutationFn: changeListing,
    onSuccess: async (_result, { id, kind }) => {
      // Only once the server has accepted the delete does the listing leave this screen.
      if (kind === 'delete') await markDeleted(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties });
    },
  });

  if (status !== 'signedIn') {
    return (
      <EmptyView message={t('my.signInHint')}>
        <Button
          title={t('auth.signIn')}
          onPress={() => navigation.navigate('Auth')}
        />
      </EmptyView>
    );
  }

  const confirm = (
    property: Property,
    kind: Change['kind'],
    message: string,
    confirmLabel: string,
    destructive: boolean,
  ) =>
    Alert.alert(property.title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => change.mutate({ id: property.id, kind }),
      },
    ]);

  /**
   * Every listing shows two buttons, Edit and Share, and a "more" button whose sheet holds the rest. An active
   * listing can be promoted, marked traded, switched off or deleted; one that is not active (traded or switched
   * off) can be switched back on or deleted. While one action runs, the "more" button shows a spinner and the
   * listing's other buttons wait, so two changes can never race.
   */
  const actionsFor = (
    property: Property,
  ): { actions: ListingAction[]; menu: ListingAction[] } => {
    const busy = change.isPending && change.variables?.id === property.id;
    const state = (kind: Change['kind']) => ({
      loading: busy && change.variables?.kind === kind,
      disabled: busy,
    });
    const primary: ListingAction[] = [
      {
        label: t('my.edit'),
        icon: 'edit',
        disabled: busy,
        onPress: () =>
          navigation.navigate('AddProperty', { propertyId: property.id }),
      },
      {
        label: t('property.share'),
        icon: 'share',
        disabled: busy,
        onPress: () => {
          share(property);
        },
      },
    ];
    const remove: ListingAction = {
      label: t('common.delete'),
      icon: 'trash',
      tone: 'danger',
      ...state('delete'),
      onPress: () =>
        confirm(
          property,
          'delete',
          t('my.deleteConfirm'),
          t('common.delete'),
          true,
        ),
    };
    if (property.status === 'ACTIVE') {
      return {
        actions: primary,
        menu: [
          {
            label: t('my.promote'),
            icon: 'arrowUp',
            tone: 'brand',
            disabled: busy,
            onPress: () => setPromoting(property),
          },
          {
            label: t('my.markSold'),
            icon: 'check',
            ...state('sold'),
            onPress: () =>
              confirm(
                property,
                'sold',
                t('my.markSoldConfirm'),
                t('my.markSold'),
                false,
              ),
          },
          {
            label: t('my.archive'),
            icon: 'toggleOff',
            ...state('deactivate'),
            onPress: () =>
              confirm(
                property,
                'deactivate',
                t('my.archiveConfirm'),
                t('my.archive'),
                false,
              ),
          },
          remove,
        ],
      };
    }
    return {
      actions: primary,
      menu: [
        {
          label: t('my.activate'),
          icon: 'toggleOn',
          tone: 'brand',
          ...state('activate'),
          onPress: () => change.mutate({ id: property.id, kind: 'activate' }),
        },
        remove,
      ],
    };
  };

  const counts: Record<StatusFilter, number> = {
    ALL: properties.length,
    ACTIVE: properties.filter(p => p.status === 'ACTIVE').length,
    SOLD: properties.filter(p => p.status === 'SOLD').length,
    ARCHIVED: properties.filter(p => p.status === 'ARCHIVED').length,
  };
  const shown =
    filter === 'ALL' ? properties : properties.filter(p => p.status === filter);

  let body: React.ReactNode;
  if (query.isPending) body = <LoadingView />;
  else if (query.isError)
    body = (
      <ErrorView
        message={errorMessage(query.error, t)}
        onRetry={() => query.refetch()}
      />
    );
  else if (properties.length === 0)
    body = (
      <EmptyView message={t('my.empty')}>
        <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
          {t('my.emptyHint')}
        </AppText>
        <Button
          title={t('my.newListing')}
          onPress={() => navigation.navigate('AddProperty')}
        />
      </EmptyView>
    );
  else
    body = (
      <View style={styles.flex}>
        {/* The tabs sit above the list, not inside it, so they stay put while the cards scroll. */}
        <View style={styles.header}>
          <AppText
            variant="label"
            color={colors.textMuted}
            style={styles.count}
          >
            {t('my.count', { count: formatNumber(shown.length, 0) })}
          </AppText>
          <ChipRow style={styles.filters}>
            {STATUS_FILTERS.map(value => (
              <Chip
                key={value}
                label={
                  value === 'ALL' ? t('my.filterAll') : t(`status.${value}`)
                }
                count={counts[value]}
                selected={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </ChipRow>
        </View>
        {shown.length === 0 ? (
          <EmptyView message={t('my.emptyFilter')} />
        ) : (
          <FlatList
            // A new list for each tab: nothing of the last tab's rows (or its scroll position) is carried over.
            key={filter}
            data={shown}
            keyExtractor={p => p.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const { actions, menu } = actionsFor(item);
              return (
                <ListingCard
                  property={item}
                  actions={actions}
                  menu={menu}
                  onPress={() =>
                    navigation.navigate('PropertyDetails', { id: item.id })
                  }
                />
              );
            }}
            onEndReached={() => {
              if (query.hasNextPage && !query.isFetchingNextPage)
                query.fetchNextPage();
            }}
            onEndReachedThreshold={0.6}
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => query.refetch()}
            ListFooterComponent={
              query.isFetchingNextPage ? (
                <ActivityIndicator color={colors.primary} />
              ) : undefined
            }
          />
        )}
      </View>
    );

  return (
    <Screen edges={['left', 'right']}>
      {change.isError ? (
        <View style={styles.banner}>
          <Banner kind="error" message={errorMessage(change.error, t)} />
        </View>
      ) : null}
      {body}
      {properties.length > 0 ? (
        <Fab
          label={t('my.newListing')}
          onPress={() => navigation.navigate('AddProperty')}
        />
      ) : null}
      <PromotionSheet property={promoting} onClose={() => setPromoting(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { padding: spacing.lg, paddingBottom: 0 },
  // Room under the last card for the floating button.
  list: { paddingBottom: 104 },
  flex: { flex: 1 },
  header: { paddingTop: spacing.md },
  count: { paddingHorizontal: spacing.lg },
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  hint: { textAlign: 'center' },
});
