import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { AgencyMapPin, DealType, Property } from '@bongah/shared-types';
import { errorMessage } from '../../api/errors';
import {
  flattenPages,
  useAgencyMapPins,
  useMapProperties,
  usePropertyList,
} from '../../api/hooks';
import type { PropertyFilters } from '../../api/endpoints';
import AgencyPreviewCard from '../../components/AgencyPreviewCard';
import AppText from '../../components/AppText';
import Banner from '../../components/Banner';
import Button from '../../components/Button';
import ClusterListSheet from '../../components/ClusterListSheet';
import FilterSheet from '../../components/FilterSheet';
import LocationPermissionModal, {
  type LocationProblem,
} from '../../components/LocationPermissionModal';
import PropertyCard from '../../components/PropertyCard';
import PropertyMap from '../../components/PropertyMap';
import PropertyBottomSheet from '../../components/PropertyBottomSheet';
import { EmptyView, ErrorView, LoadingView } from '../../components/States';
import { findProvince } from '../../constants/provinces';
import { MAP_TILE_MAX_ZOOM } from '../../config';
import { centroid, zoomToSeparate, type Bounds } from '../../map/cluster';
import {
  AFGHANISTAN_CAMERA,
  KABUL_CAMERA,
  provinceCamera,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import type { MapItem } from '../../map/items';
import { locate } from '../../map/location';
import {
  areaFor,
  boundsFromCamera,
  nextArea,
  type Area,
} from '../../map/viewport';
import { formatNumber } from '../../i18n/format';
import { floatingBarClearance } from '../../navigation/FloatingTabBar';
import type { RootStackParamList, TabParamList } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  DealFilter,
  LOCATE_SIZE,
  ModeToggle,
  RoundButton,
  StatusPill,
} from './MapControls';

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

/** The map keeps fetching pages (50 listings each) until it has this many; the markers drawn are capped anyway. */
const MAP_MAX_PAGES = 3;
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

/**
 * Home: the map, edge to edge. Everything else floats over it: the profile and filter buttons and the quick
 * deal filter along the top, "my location", the offices switch and the add button on one edge, the list switch
 * at the foot, and the tab bar below. The list of listings is one tap away for people who prefer rows.
 *
 * The map asks the server only for what is on screen (plus a margin), so panning from Kabul to Herat to
 * Mazar fills each place in as it arrives. On start it asks for the phone's position once; if that is refused
 * or the GPS is off, a card explains and offers the settings, and the map simply stays on Kabul.
 */
export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const clearance = floatingBarClearance(insets.bottom);

  const [filters, setFilters] = useState<PropertyFilters>({});
  // The map is the first thing people see; the list is one tap away.
  const [mode, setMode] = useState<ViewMode>('map');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [clusterItems, setClusterItems] = useState<MapItem[] | null>(null);
  const [camera, setCamera] = useState<MapCamera>(KABUL_CAMERA);
  const [me, setMe] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  // Until the map reports what it shows, ask for the area its starting camera implies.
  const [area, setArea] = useState<Area>(() =>
    areaFor(
      boundsFromCamera(KABUL_CAMERA.center, KABUL_CAMERA.zoom, width, height),
    ),
  );
  const zoom = useRef(KABUL_CAMERA.zoom);
  // Set once the person has chosen where to look, so a slow first GPS fix does not yank the map away.
  const steered = useRef(false);
  // The person was sent to the phone's settings to allow location; ask again when they come back.
  const awaitingSettings = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // On the map the viewport is the filter, so the province (which only moves the camera there) is not sent.
  const mapFilters = useMemo<PropertyFilters>(
    () => ({ ...filters, province: undefined }),
    [filters],
  );
  const mapQuery = useMapProperties(mapFilters, area, mode === 'map');
  const listQuery = usePropertyList(filters, mode === 'list');
  const query = mode === 'map' ? mapQuery : listQuery;
  const properties = useMemo(() => flattenPages(query.data), [query.data]);
  const total = query.data?.pages[0]?.meta.total ?? 0;

  // Keep fetching pages (up to a limit) so the whole area fills in without button presses.
  const loadedPages = mapQuery.data?.pages.length ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = mapQuery;
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

  // Everything in the area has arrived: zooming in cannot reveal more, so there is no need to ask again.
  const mapComplete = useRef(false);
  mapComplete.current = mapQuery.data !== undefined && !mapQuery.hasNextPage;

  const agencyQuery = useAgencyMapPins(mode === 'map');
  const agencies = useMemo(
    () => (mode === 'map' ? agencyQuery.data ?? [] : []),
    [mode, agencyQuery.data],
  );

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

  /**
   * Where is the phone? `auto` is the look at start-up: it only moves the map if nobody has steered it yet.
   * The button (not auto) always moves it. Either way a refusal or a dead GPS opens the explanation card.
   */
  const findMe = useCallback(async (auto: boolean) => {
    setLocating(true);
    const result = await locate({ ask: true });
    if (!mounted.current) return;
    setLocating(false);
    if (result.status === 'ok') {
      setMe(result.coordinate);
      if (auto && steered.current) return;
      steered.current = true;
      flyTo(result.coordinate, LOCATION_ZOOM, 0);
    } else if (result.status === 'outside') {
      // The phone is outside Afghanistan: the map stays on Kabul and says nothing. A banner about it only worried
      // people who were simply travelling, and there is nothing for them to do.
    } else {
      setProblem(result.status);
    }
  }, []);

  // Ask once, as soon as the app opens.
  useEffect(() => {
    findMe(true);
  }, [findMe]);

  // Back from the phone's settings: try again, the person may have just switched it on.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && awaitingSettings.current) {
        awaitingSettings.current = false;
        findMe(false);
      }
    });
    return () => subscription.remove();
  }, [findMe]);

  const openPhoneSettings = () => {
    awaitingSettings.current = true;
    const kind = problem;
    setProblem(null);
    // A switched-off GPS has its own settings page on Android; everything else is the app's page.
    if (kind === 'unavailable' && Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
        () => Linking.openSettings(),
      );
    } else {
      Linking.openSettings();
    }
  };

  const selectProperty = (property: Property) => {
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
    setSelection({ kind: 'agency', agency });
    flyTo(
      { latitude: agency.lat, longitude: agency.lng },
      Math.max(zoom.current, SELECT_ZOOM),
      AGENCY_CARD_PADDING,
    );
  };
  /**
   * A counted cluster was tapped: fly in to where its pins come apart. Pins that sit on the same spot can never
   * come apart, so for those the list sheet is the way to reach each one.
   */
  const openCluster = (items: MapItem[]) => {
    const target = zoomToSeparate(items, zoom.current, MAP_TILE_MAX_ZOOM);
    if (target === null) {
      setClusterItems(items);
      return;
    }
    setSelection(null);
    flyTo(centroid(items), target, 0);
  };
  const clearSelection = () => setSelection(null);
  const pickFromCluster = (item: MapItem) => {
    setClusterItems(null);
    if (item.kind === 'property') selectProperty(item.property);
    else selectAgency(item.agency);
  };

  const onViewChange = useCallback(
    (view: { zoom: number; bounds: Bounds; userMoved: boolean }) => {
      // A finger moved the map: it is theirs now, and a late GPS fix must not take it back.
      if (view.userMoved) steered.current = true;
      zoom.current = view.zoom;
      setArea(current => nextArea(current, view.bounds, mapComplete.current));
    },
    [],
  );

  const applyFilters = (next: PropertyFilters) => {
    setFilters(next);
    setSelection(null);
    setFilterOpen(false);
    // Choosing a province takes the map there. Clearing it leaves the map where it is: on the map the
    // viewport already decides what is shown.
    if (next.province) lookAtProvince(next.province);
  };

  const chooseDeal = (deal: DealType | undefined) => {
    setSelection(null);
    setFilters(current => ({ ...current, deal_type: deal }));
  };

  const openDetails = (property: Property) =>
    navigation.navigate('PropertyDetails', { id: property.id });

  const filterCount = activeFilterCount(filters);
  // A card is open over the foot of the map: the tab bar steps aside so nothing sits on top of its buttons.
  const covered = mode === 'map' && selection !== null;
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: covered ? { display: 'none' } : undefined,
    });
  }, [navigation, covered]);

  const topControls = (
    <>
      <DealFilter value={filters.deal_type} onChange={chooseDeal} />
      <RoundButton
        testID="open-filters"
        icon="filter"
        label={t('home.filters')}
        active={filterCount > 0}
        badge={filterCount ? formatNumber(filterCount, 0) : undefined}
        onPress={() => setFilterOpen(true)}
      />
    </>
  );

  let body: React.ReactNode;
  if (mode === 'list') {
    let list: React.ReactNode;
    if (listQuery.isPending) {
      list = <LoadingView />;
    } else if (listQuery.isError) {
      list = (
        <ErrorView
          message={errorMessage(listQuery.error, t)}
          onRetry={() => listQuery.refetch()}
        />
      );
    } else if (properties.length === 0) {
      list = <EmptyView message={t('home.noResults')} />;
    } else {
      list = (
        <FlatList
          data={properties}
          keyExtractor={p => p.id}
          renderItem={({ item }) => (
            <PropertyCard property={item} onPress={() => openDetails(item)} />
          )}
          contentContainerStyle={{ paddingBottom: clearance + 72 }}
          onEndReached={() => {
            if (listQuery.hasNextPage && !listQuery.isFetchingNextPage)
              listQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
          onRefresh={() => listQuery.refetch()}
          ListFooterComponent={
            listQuery.hasNextPage ? (
              <View style={styles.footer}>
                {listQuery.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Button
                    title={t('home.loadMore')}
                    variant="outline"
                    onPress={() => listQuery.fetchNextPage()}
                  />
                )}
              </View>
            ) : undefined
          }
        />
      );
    }
    body = (
      <View style={styles.listRoot}>
        <View
          style={[styles.listHeader, { paddingTop: insets.top + spacing.sm }]}
        >
          <View style={styles.topRow}>{topControls}</View>
          {!listQuery.isPending && !listQuery.isError && total > 0 ? (
            <AppText
              variant="caption"
              color={colors.textMuted}
              style={styles.count}
            >
              {t('home.resultsCount', { count: formatNumber(total, 0) })}
              {filters.district ? ` · ${filters.district}` : ''}
            </AppText>
          ) : null}
        </View>
        <View style={styles.listBody}>{list}</View>
        <View
          pointerEvents="box-none"
          style={[styles.toggleDock, { bottom: clearance + spacing.md }]}
        >
          <ModeToggle
            mode="list"
            mapLabel={t('home.map')}
            listLabel={t('home.list')}
            onChange={setMode}
          />
        </View>
      </View>
    );
  } else {
    // The map is always on screen (even while loading or empty): the phone's position and the offices
    // are useful on their own, and a blank screen is the worst first impression for a map app.
    const inView = mapQuery.data?.pages[0]?.meta.total ?? 0;
    const status = mapQuery.isError ? (
      <View style={styles.notice}>
        <Banner kind="error" message={errorMessage(mapQuery.error, t)}>
          <Button
            title={t('common.retry')}
            variant="outline"
            onPress={() => mapQuery.refetch()}
          />
        </Banner>
      </View>
    ) : (
      <StatusPill
        loading={mapQuery.isPending}
        refreshing={mapQuery.isFetching}
        message={
          inView === 0
            ? t('home.noMapResults')
            : t('home.mapShowing', { count: formatNumber(inView, 0) })
        }
      />
    );

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
          onOpenCluster={openCluster}
          onPressMap={clearSelection}
          onViewChange={onViewChange}
        />
        <View style={styles.overlay} pointerEvents="box-none">
          <View
            style={[styles.top, { paddingTop: insets.top + spacing.sm }]}
            pointerEvents="box-none"
          >
            <View style={styles.topRow} pointerEvents="box-none">
              {topControls}
            </View>
            {status}
          </View>

          {selection ? null : (
            <>
              <View
                style={[styles.stack, { bottom: clearance + spacing.md }]}
                pointerEvents="box-none"
              >
                <RoundButton
                  testID="locate"
                  icon="locate"
                  label={t('home.locate')}
                  busy={locating}
                  size={LOCATE_SIZE}
                  accent
                  onPress={() => findMe(false)}
                />
              </View>
              <View
                pointerEvents="box-none"
                style={[styles.toggleDock, { bottom: clearance + spacing.md }]}
              >
                <ModeToggle
                  mode="map"
                  mapLabel={t('home.map')}
                  listLabel={t('home.list')}
                  onChange={setMode}
                />
              </View>
            </>
          )}

          {selection?.kind === 'agency' ? (
            <View style={styles.agencyDock}>
              <AgencyPreviewCard
                key={selection.agency.id}
                agency={selection.agency}
                onClose={clearSelection}
              />
              <View
                style={{
                  height: insets.bottom,
                  backgroundColor: colors.surface,
                }}
              />
            </View>
          ) : null}
          <PropertyBottomSheet
            property={
              selection?.kind === 'property' ? selection.property : null
            }
            onOpenDetails={openDetails}
            onClose={clearSelection}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {body}

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

      <LocationPermissionModal
        problem={problem}
        onOpenSettings={openPhoneSettings}
        onClose={() => setProblem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill },
  top: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  notice: { alignSelf: 'stretch' },
  // The map's own controls, in one column on the end edge, just above the tab bar.
  stack: {
    position: 'absolute',
    end: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleDock: {
    position: 'absolute',
    start: 0,
    end: 0,
    alignItems: 'center',
  },
  agencyDock: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  listRoot: { flex: 1 },
  listHeader: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  listBody: { flex: 1 },
  count: { paddingHorizontal: spacing.xs },
  footer: { padding: spacing.lg },
});
