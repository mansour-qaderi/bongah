import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import type { Property } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import {
  flattenPages,
  useAgencyMapPins,
  usePropertyList,
} from '../../api/hooks';
import type { PropertyFilters } from '../../api/endpoints';
import AgencyPreviewCard from '../../components/AgencyPreviewCard';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import { Chip, ChipRow } from '../../components/Chip';
import ClusterListSheet from '../../components/ClusterListSheet';
import FilterSheet from '../../components/FilterSheet';
import PropertyCard from '../../components/PropertyCard';
import PropertyMap from '../../components/PropertyMap';
import PropertyPreviewCard from '../../components/PropertyPreviewCard';
import { Screen } from '../../components/Screen';
import SegmentedControl from '../../components/SegmentedControl';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import {
  PROVINCES,
  QUICK_PROVINCE_IDS,
  findProvince,
  provinceValue,
} from '../../constants/provinces';
import {
  AFGHANISTAN_CAMERA,
  KABUL_CAMERA,
  provinceCamera,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import type { MapItem } from '../../map/items';
import { locate, type LocateResult } from '../../map/location';
import { formatNumber } from '../../i18n/format';
import { useFormat } from '../../i18n/useFormat';
import { useRequireAuth } from '../../navigation/useRequireAuth';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, radius, shadow, spacing } from '../../theme';
import type { AgencyMapPin } from '@bongah/shared-types';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

type ViewMode = 'list' | 'map';

/** What is open over the map: one listing or one office. */
type Selection =
  | { kind: 'property'; property: Property }
  | { kind: 'agency'; agency: AgencyMapPin }
  | null;

/** The map keeps fetching pages until it has this many (20 listings each); "show more" covers the rest. */
const MAP_MAX_PAGES = 10;
/** How close the map zooms to the person's own position. */
const LOCATION_ZOOM = 14;
/** Never zoom out when a listing is chosen; zoom in to at least street-block level. */
const SELECT_ZOOM = 13;
/** Height of the card covering the map, so the chosen marker is centred in what is still visible. */
const PROPERTY_CARD_PADDING = 320;
const AGENCY_CARD_PADDING = 170;

const cameraForProvince = (value: string | undefined): MapCamera => {
  const province = findProvince(value);
  return province ? provinceCamera(province) : AFGHANISTAN_CAMERA;
};

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
  // The map is the first thing people see; the list is one tap away.
  const [mode, setMode] = useState<ViewMode>('map');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [clusterItems, setClusterItems] = useState<MapItem[] | null>(null);
  const [showAgencies, setShowAgencies] = useState(true);
  const [camera, setCamera] = useState<MapCamera>(KABUL_CAMERA);
  const [me, setMe] = useState<Coordinate | null>(null);
  const [locateState, setLocateState] = useState<
    'idle' | 'locating' | Exclude<LocateResult['status'], 'ok'>
  >('idle');
  const zoom = useRef(KABUL_CAMERA.zoom);
  // Set once the person has chosen where to look, so a slow first GPS fix does not yank the map away.
  const steered = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // The map can only draw listings that have an exact pin, so it asks the server for just those.
  const query = usePropertyList(
    mode === 'map' ? { ...filters, has_location: true } : filters,
  );
  const properties = useMemo(() => flattenPages(query.data), [query.data]);
  const total = query.data?.pages[0]?.meta.total ?? 0;

  // On the map, keep fetching pages (up to a limit) so the whole area fills in without button presses.
  const loadedPages = query.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (
      mode === 'map' &&
      hasNextPage &&
      !isFetchingNextPage &&
      loadedPages < MAP_MAX_PAGES
    ) {
      fetchNextPage();
    }
  }, [mode, hasNextPage, isFetchingNextPage, loadedPages, fetchNextPage]);

  const agencyQuery = useAgencyMapPins(mode === 'map' && showAgencies);
  const agencies = useMemo(
    () => (mode === 'map' && showAgencies ? agencyQuery.data ?? [] : []),
    [mode, showAgencies, agencyQuery.data],
  );

  const province = findProvince(filters.province);

  const flyTo = (center: Coordinate, toZoom: number, cardPadding: number) =>
    setCamera(current => ({
      center: toLngLat(center),
      zoom: toZoom,
      padding: { bottom: cardPadding },
      nonce: (current.nonce ?? 0) + 1,
    }));

  const lookAtProvince = (value: string | undefined) => {
    steered.current = true;
    setCamera(current => ({
      ...cameraForProvince(value),
      nonce: (current.nonce ?? 0) + 1,
    }));
  };

  // A quiet first look at where the phone is: never shows a permission prompt, so it only works for people
  // who already allowed location. Everyone else uses the "my location" button.
  useEffect(() => {
    locate({ ask: false }).then(result => {
      if (!mounted.current || result.status !== 'ok') return;
      setMe(result.coordinate);
      if (!steered.current) flyTo(result.coordinate, LOCATION_ZOOM, 0);
    });
  }, []);

  const onLocate = async () => {
    setLocateState('locating');
    const result = await locate({ ask: true });
    if (!mounted.current) return;
    if (result.status === 'ok') {
      setMe(result.coordinate);
      setLocateState('idle');
      steered.current = true;
      flyTo(result.coordinate, LOCATION_ZOOM, 0);
    } else {
      setLocateState(result.status);
    }
  };

  const selectProperty = (property: Property) => {
    setLocateState('idle');
    setSelection({ kind: 'property', property });
    if (property.lat !== null && property.lng !== null) {
      flyTo(
        { latitude: property.lat, longitude: property.lng },
        Math.max(zoom.current, SELECT_ZOOM),
        PROPERTY_CARD_PADDING,
      );
    }
  };
  const selectAgency = (agency: AgencyMapPin) => {
    setLocateState('idle');
    setSelection({ kind: 'agency', agency });
    flyTo(
      { latitude: agency.lat, longitude: agency.lng },
      Math.max(zoom.current, SELECT_ZOOM),
      AGENCY_CARD_PADDING,
    );
  };
  const pickFromCluster = (item: MapItem) => {
    setClusterItems(null);
    if (item.kind === 'property') selectProperty(item.property);
    else selectAgency(item.agency);
  };

  const applyFilters = (next: PropertyFilters) => {
    setFilters(next);
    setSelection(null);
    setFilterOpen(false);
    lookAtProvince(next.province);
  };

  const toggleQuickProvince = (id: string) => {
    const target = PROVINCES.find(p => p.id === id)!;
    const value = provinceValue(target);
    setSelection(null);
    const next = filters.province === value ? undefined : value;
    setFilters({ ...filters, province: next });
    lookAtProvince(next);
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
  if (mode === 'list') {
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
      body = <EmptyView message={t('home.noResults')} />;
    } else {
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
    }
  } else {
    // The map is always on screen (even while loading or empty): the phone's position and the offices
    // are useful on their own, and a blank screen is the worst first impression for a map app.
    let status: React.ReactNode;
    if (query.isPending) {
      status = (
        <View style={[styles.pill, shadow.card]}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption">{t('common.loading')}</AppText>
        </View>
      );
    } else if (query.isError) {
      status = (
        <View style={styles.notice}>
          <Banner kind="error" message={errorMessage(query.error, t)}>
            <Button
              title={t('common.retry')}
              variant="outline"
              onPress={() => query.refetch()}
            />
          </Banner>
        </View>
      );
    } else {
      status = (
        <View style={[styles.pill, shadow.card]}>
          <AppText variant="caption">
            {properties.length === 0
              ? t('home.noMapResults')
              : t('home.mapShowing', {
                  count: formatNumber(properties.length, 0),
                })}
          </AppText>
        </View>
      );
    }

    let locateNote: React.ReactNode = null;
    if (locateState === 'locating') {
      locateNote = (
        <View style={[styles.pill, shadow.card]}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption">{t('home.locating')}</AppText>
        </View>
      );
    } else if (locateState === 'denied') {
      locateNote = (
        <View style={styles.notice}>
          <Banner kind="error" message={t('home.locationDenied')}>
            <Button
              title={t('account.openSettings')}
              variant="outline"
              onPress={() => Linking.openSettings()}
            />
          </Banner>
        </View>
      );
    } else if (locateState === 'unavailable') {
      locateNote = (
        <View style={styles.notice}>
          <Banner kind="error" message={t('home.locationUnavailable')} />
        </View>
      );
    } else if (locateState === 'outside') {
      locateNote = (
        <View style={styles.notice}>
          <Banner kind="info" message={t('home.locationOutside')} />
        </View>
      );
    }

    let bottom: React.ReactNode;
    if (selection?.kind === 'property') {
      bottom = (
        <PropertyPreviewCard
          key={selection.property.id}
          property={selection.property}
          onOpen={() => openDetails(selection.property)}
          onClose={() => setSelection(null)}
        />
      );
    } else if (selection?.kind === 'agency') {
      bottom = (
        <AgencyPreviewCard
          key={selection.agency.id}
          agency={selection.agency}
          onClose={() => setSelection(null)}
        />
      );
    } else {
      bottom = (
        <View style={styles.bottomHint}>
          {query.hasNextPage && !query.isFetchingNextPage ? (
            <Button
              title={t('home.loadMore')}
              variant="secondary"
              onPress={() => query.fetchNextPage()}
            />
          ) : null}
          <View style={[styles.pill, shadow.card]}>
            <AppText variant="caption" color={colors.textMuted}>
              {t('home.mapHint')}
            </AppText>
          </View>
        </View>
      );
    }

    body = (
      <View style={styles.mapWrap}>
        <PropertyMap
          properties={properties}
          agencies={agencies}
          camera={camera}
          selected={
            selection?.kind === 'property'
              ? { kind: 'property', id: selection.property.id }
              : selection?.kind === 'agency'
              ? { kind: 'agency', id: selection.agency.id }
              : null
          }
          userLocation={me}
          onSelectProperty={selectProperty}
          onSelectAgency={selectAgency}
          onOpenCluster={setClusterItems}
          onZoomChange={value => {
            zoom.current = value;
          }}
        />
        <View style={styles.mapOverlay} pointerEvents="box-none">
          <View style={styles.mapTop} pointerEvents="box-none">
            {status}
            {locateNote}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.locate')}
            disabled={locateState === 'locating'}
            onPress={onLocate}
            style={[styles.locate, shadow.card]}
          >
            <AppText variant="label" color={colors.primaryDark}>
              🎯 {t('home.locate')}
            </AppText>
          </Pressable>
          <View style={styles.bottom} pointerEvents="box-none">
            {bottom}
          </View>
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
        {mode === 'map' ? (
          <Chip
            label={`🏛️ ${t('home.agencies')}`}
            selected={showAgencies}
            onPress={() => setShowAgencies(value => !value)}
          />
        ) : null}
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

      {mode === 'map' && selection ? null : (
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

      <ClusterListSheet
        items={clusterItems}
        onPick={pickFromCluster}
        onClose={() => setClusterItems(null)}
      />

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
  mapOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  mapTop: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  notice: { alignSelf: 'stretch', paddingHorizontal: spacing.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  locate: {
    position: 'absolute',
    end: spacing.lg,
    top: '38%',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  bottom: { justifyContent: 'flex-end' },
  bottomHint: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
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
