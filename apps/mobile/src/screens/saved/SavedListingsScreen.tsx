import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { ApiError } from '../../api/client';
import { getProperty } from '../../api/endpoints';
import { errorMessage } from '../../api/errors';
import { queryKeys } from '../../api/hooks';
import AppText from '../../components/AppText';
import EmptyState from '../../components/EmptyState';
import PropertyCard from '../../components/PropertyCard';
import { Screen } from '../../components/Screen';
import { PropertyCardSkeleton } from '../../components/SkeletonLoader';

import { formatNumber } from '../../i18n/format';
import { useSaved } from '../../favorites/store';
import type { RootStackParamList } from '../../navigation/types';
import { colors, spacing, surfaces } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Saved'>;

/** What the list shows for one saved id: the listing, or why there is none. */
type Entry =
  | { id: string; kind: 'loading' }
  | { id: string; kind: 'ready'; property: Property }
  | { id: string; kind: 'gone' }
  | { id: string; kind: 'failed'; message: string; retry: () => void };

/**
 * "ذخیره‌شده‌ها": every listing the person bookmarked, newest save first, drawn with the same card as the Home list.
 * The ids live on the phone (see favorites/store), so each listing is fetched by its id. One that was removed since
 * (404) stays as a short note with a button to forget it, and one that could not be loaded offers a retry, so a single
 * bad listing never hides the others. Un-saving from a card takes it off the list at once (one tap on its ribbon).
 * With nothing saved, the screen shows a picture and "هیچ آگهی نشان نشده است".
 */
export default function SavedListingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { ids, toggle } = useSaved();
  // Newest save first: the store appends.
  const ordered = React.useMemo(() => [...ids].reverse(), [ids]);

  const results = useQueries({
    queries: ordered.map(id => ({
      queryKey: queryKeys.property(id),
      queryFn: () => getProperty(id),
      retry: (count: number, error: unknown) =>
        !(error instanceof ApiError && error.status === 404) && count < 1,
    })),
  });

  const entries: Entry[] = ordered.map((id, index) => {
    const result = results[index];
    if (result?.data) return { id, kind: 'ready', property: result.data };
    if (result?.isError) {
      return result.error instanceof ApiError && result.error.status === 404
        ? { id, kind: 'gone' }
        : {
            id,
            kind: 'failed',
            message: errorMessage(result.error, t),
            retry: () => {
              result.refetch();
            },
          };
    }
    return { id, kind: 'loading' };
  });

  if (ordered.length === 0) {
    return (
      <Screen edges={['left', 'right']}>
        <EmptyState
          illustration="saved"
          title={t('saved.empty')}
          hint={t('saved.emptyHint')}
          actionIcon="search"
          actionLabel={t('saved.browse')}
          onAction={() => navigation.navigate('Tabs', { screen: 'Home' })}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right']}>
      <FlatList
        testID="saved-list"
        data={entries}
        keyExtractor={entry => entry.id}
        ListHeaderComponent={
          <AppText
            variant="caption"
            color={colors.textMuted}
            style={styles.count}
          >
            {t('saved.count', { count: formatNumber(ordered.length, 0) })}
          </AppText>
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          if (item.kind === 'ready') {
            return (
              <PropertyCard
                property={item.property}
                onPress={() =>
                  navigation.navigate('PropertyDetails', { id: item.id })
                }
              />
            );
          }
          if (item.kind === 'loading') {
            return (
              <PropertyCardSkeleton testID={`saved-loading-${item.id}`} />
            );
          }
          return (
            <View style={styles.note} testID={`saved-${item.kind}-${item.id}`}>
              <AppText color={colors.textSecondary}>
                {item.kind === 'gone' ? t('saved.gone') : item.message}
              </AppText>
              {item.kind === 'failed' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={item.retry}
                  style={styles.noteButton}
                >
                  <AppText variant="label" color={colors.primary}>
                    {t('common.retry')}
                  </AppText>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('saved.remove')}: ${item.id}`}
                onPress={() => toggle(item.id)}
                style={styles.noteButton}
              >
                <AppText variant="label" color={colors.danger}>
                  {t('saved.remove')}
                </AppText>
              </Pressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  count: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  // A card-sized grey block while a saved listing is on its way, so the list does not jump when it arrives.
  note: {
    ...surfaces.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  noteButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
});
