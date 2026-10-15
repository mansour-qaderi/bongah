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
import { archiveProperty } from '../../api/endpoints';
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
import PromotionSheet from '../../components/PromotionSheet';
import { Chip, ChipRow } from '../../components/Chip';
import Fab from '../../components/Fab';
import ListingCard, { type ListingAction } from '../../components/ListingCard';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatNumber } from '../../i18n/format';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'MyListings'>,
  NativeStackScreenProps<RootStackParamList>
>;

type StatusFilter = 'ALL' | PropertyStatus;
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'ACTIVE', 'SOLD', 'ARCHIVED'];

export default function MyListingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const query = useMyProperties(status === 'signedIn');
  const properties = flattenPages(query.data);
  const [promoting, setPromoting] = useState<Property | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const archive = useMutation({
    mutationFn: archiveProperty,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.properties }),
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

  const confirmArchive = (property: Property) =>
    Alert.alert(property.title, t('my.archiveConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('my.archive'),
        style: 'destructive',
        onPress: () => archive.mutate(property.id),
      },
    ]);

  const actionsFor = (property: Property): ListingAction[] =>
    property.status === 'ACTIVE'
      ? [
          {
            label: t('my.promote'),
            tone: 'brand',
            onPress: () => setPromoting(property),
          },
          {
            label: t('my.edit'),
            onPress: () =>
              navigation.navigate('AddProperty', { propertyId: property.id }),
          },
          {
            label: t('my.archive'),
            tone: 'danger',
            loading: archive.isPending && archive.variables === property.id,
            onPress: () => confirmArchive(property),
          },
        ]
      : [];

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
      <FlatList
        data={shown}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <AppText
              variant="label"
              color={colors.textMuted}
              style={styles.count}
            >
              {t('my.count', { count: formatNumber(properties.length, 0) })}
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
        }
        renderItem={({ item }) => (
          <ListingCard
            property={item}
            actions={actionsFor(item)}
            onPress={() =>
              navigation.navigate('PropertyDetails', { id: item.id })
            }
          />
        )}
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
    );

  return (
    <Screen edges={['left', 'right']}>
      {archive.isError ? (
        <View style={styles.banner}>
          <Banner kind="error" message={errorMessage(archive.error, t)} />
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
  header: { paddingTop: spacing.md, gap: spacing.xs },
  count: { paddingHorizontal: spacing.lg },
  // The chips sit in a row of their own, with room around them to breathe.
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  hint: { textAlign: 'center' },
});
