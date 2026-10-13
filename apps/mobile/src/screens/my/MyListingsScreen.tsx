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
import type { Property } from '@bongah/shared-types';
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
import PropertyCard from '../../components/PropertyCard';
import { Screen } from '../../components/Screen';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { formatDate } from '../../i18n/format';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'MyListings'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function MyListingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const query = useMyProperties(status === 'signedIn');
  const properties = flattenPages(query.data);
  const [promoting, setPromoting] = useState<Property | null>(null);

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

  const footer = (property: Property) => (
    <View style={styles.footer}>
      <View style={styles.statusRow}>
        <AppText variant="caption" color={colors.textMuted}>
          {t(`status.${property.status}`)}
          {property.is_featured && property.featured_until
            ? ` · ${t('my.featuredUntil', {
                date: formatDate(property.featured_until),
              })}`
            : ''}
        </AppText>
      </View>
      {property.status === 'ACTIVE' ? (
        <View style={styles.actions}>
          <Button
            title={property.lat === null ? t('my.addPin') : t('my.movePin')}
            variant="outline"
            style={styles.action}
            onPress={() =>
              navigation.navigate('SetLocation', { propertyId: property.id })
            }
          />
        </View>
      ) : null}
      {property.status === 'ACTIVE' ? (
        <View style={styles.actions}>
          <Button
            title={t('my.promote')}
            variant="secondary"
            style={styles.action}
            onPress={() => setPromoting(property)}
          />
          <Button
            title={t('my.archive')}
            variant="danger"
            style={styles.action}
            loading={archive.isPending && archive.variables === property.id}
            onPress={() => confirmArchive(property)}
          />
        </View>
      ) : null}
    </View>
  );

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
        <Button
          title={t('my.add')}
          onPress={() => navigation.navigate('AddProperty')}
        />
      </EmptyView>
    );
  else
    body = (
      <FlatList
        data={properties}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <PropertyCard
            property={item}
            footer={footer(item)}
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
      {properties.length > 0 ? (
        <View style={styles.top}>
          <Button
            title={t('my.add')}
            onPress={() => navigation.navigate('AddProperty')}
          />
        </View>
      ) : null}
      {body}
      <PromotionSheet property={promoting} onClose={() => setPromoting(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { padding: spacing.lg },
  banner: { padding: spacing.lg, paddingBottom: 0 },
  list: { paddingBottom: spacing.xl },
  footer: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  statusRow: { flexDirection: 'row' },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
