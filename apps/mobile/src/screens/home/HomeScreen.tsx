import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import { flattenPages, usePropertyList } from '../../api/hooks';
import type { PropertyFilters } from '../../api/endpoints';
import AppText from '../../components/AppText';
import Button from '../../components/Button';
import { Chip, ChipRow } from '../../components/Chip';
import FilterSheet from '../../components/FilterSheet';
import PropertyCard from '../../components/PropertyCard';
import PropertyMap from '../../components/PropertyMap';
import { Screen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import {
  PROVINCES,
  QUICK_PROVINCE_IDS,
  findProvince,
  provinceValue,
} from '../../constants/provinces';
import { AFGHANISTAN_CAMERA, provinceCamera } from '../../map/geo';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import { useRequireAuth } from '../../navigation/useRequireAuth';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, shadow, spacing } from '../../theme';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

type ViewMode = 'list' | 'map';

function activeFilterCount(filters: PropertyFilters): number {
  return [
    filters.province,
    filters.district,
    filters.type,
    filters.deal_type,
    filters.min_price ?? filters.max_price,
  ].filter(value => value !== undefined).length;
}

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const requireAuth = useRequireAuth();

  const [filters, setFilters] = useState<PropertyFilters>({});
  const [mode, setMode] = useState<ViewMode>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Property | null>(null);

  // The map can only draw listings that have an exact pin, so it asks the server for just those.
  const query = usePropertyList(
    mode === 'map' ? { ...filters, has_location: true } : filters,
  );
  const properties = useMemo(() => flattenPages(query.data), [query.data]);
  const total = query.data?.pages[0]?.meta.total ?? 0;

  const province = findProvince(filters.province);
  const provinceId = province?.id;
  const camera = useMemo(
    () =>
      provinceId
        ? provinceCamera(PROVINCES.find(p => p.id === provinceId)!)
        : AFGHANISTAN_CAMERA,
    [provinceId],
  );

  const applyFilters = (next: PropertyFilters) => {
    setFilters(next);
    setSelected(null);
    setFilterOpen(false);
  };

  const toggleQuickProvince = (id: string) => {
    const target = PROVINCES.find(p => p.id === id)!;
    const value = provinceValue(target);
    setSelected(null);
    setFilters(current => ({
      ...current,
      province: current.province === value ? undefined : value,
    }));
  };

  const openAdd = () => requireAuth(() => navigation.navigate('AddProperty'));
  const openDetails = (property: Property) =>
    navigation.navigate('PropertyDetails', { id: property.id });

  const filterCount = activeFilterCount(filters);

  const footer = query.hasNextPage ? (
    <View style={styles.footer}>
      {query.isFetchingNextPage ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Button
          title={t('home.loadMore')}
          variant="outline"
          onPress={() => query.fetchNextPage()}
        />
      )}
    </View>
  ) : undefined;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <LoadingView />;
  } else if (query.isError) {
    body = (
      <ErrorView
        message={errorMessage(query.error, t)}
        onRetry={() => query.refetch()}
      />
    );
  } else if (properties.length === 0) {
    body = (
      <EmptyView
        message={mode === 'map' ? t('home.noMapResults') : t('home.noResults')}
      />
    );
  } else if (mode === 'list') {
    body = (
      <FlatList
        data={properties}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <PropertyCard property={item} onPress={() => openDetails(item)} />
        )}
        contentContainerStyle={styles.list}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage)
            query.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onRefresh={() => query.refetch()}
        ListFooterComponent={footer}
      />
    );
  } else {
    body = (
      <View style={styles.mapWrap}>
        <PropertyMap
          properties={properties}
          camera={camera}
          selectedId={selected?.id}
          onSelect={setSelected}
        />
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <View style={[styles.mapCount, shadow.card]}>
            <AppText variant="caption">
              {t('home.mapShowing', {
                count: formatNumber(properties.length, 0),
              })}
            </AppText>
          </View>
          {query.hasNextPage ? (
            <Button
              title={t('home.loadMore')}
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => query.fetchNextPage()}
              style={styles.mapMore}
            />
          ) : null}
          {selected ? (
            <PropertyCard
              property={selected}
              onPress={() => openDetails(selected)}
            />
          ) : (
            <View style={[styles.mapCount, shadow.card]}>
              <AppText variant="caption" color={colors.textMuted}>
                {t('home.mapHint')}
              </AppText>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <AppText variant="title" color={colors.primaryDark}>
            {t('app.name')}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {t('app.tagline')}
          </AppText>
        </View>
        <View style={styles.toggle}>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: 'list', label: t('home.list') },
              { value: 'map', label: t('home.map') },
            ]}
          />
        </View>
      </View>

      <ChipRow>
        <Chip
          label={`⚙︎ ${t('home.filters')}${
            filterCount ? ` (${formatNumber(filterCount, 0)})` : ''
          }`}
          selected={filterCount > 0}
          onPress={() => setFilterOpen(true)}
        />
        {QUICK_PROVINCE_IDS.map(id => {
          const p = PROVINCES.find(item => item.id === id)!;
          const label =
            p.capital && id === 'balkh'
              ? p.capital[language]
              : p.name[language];
          return (
            <Chip
              key={id}
              label={label}
              selected={province?.id === id}
              onPress={() => toggleQuickProvince(id)}
            />
          );
        })}
      </ChipRow>

      {!query.isPending && !query.isError ? (
        <AppText
          variant="caption"
          color={colors.textMuted}
          style={styles.count}
        >
          {t('home.resultsCount', { count: formatNumber(total, 0) })}
          {filters.district ? ` · ${filters.district}` : ''}
        </AppText>
      ) : null}

      <View style={styles.body}>{body}</View>

      {mode === 'map' && selected ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nav.addProperty')}
          onPress={openAdd}
          style={[styles.fab, shadow.card]}
        >
          <AppText
            variant="title"
            color={colors.textOnPrimary}
            style={styles.fabPlus}
          >
            +
          </AppText>
        </Pressable>
      )}

      <FilterSheet
        visible={filterOpen}
        value={filters}
        onApply={applyFilters}
        onClose={() => setFilterOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  toggle: { width: 150 },
  count: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  body: { flex: 1, marginTop: spacing.sm },
  list: { paddingBottom: 96 },
  footer: { padding: spacing.lg },
  mapWrap: { flex: 1 },
  mapOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  mapCount: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  mapMore: { alignSelf: 'center' },
  fab: {
    position: 'absolute',
    end: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPlus: { lineHeight: 34 },
});
