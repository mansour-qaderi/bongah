import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
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
import NavigationModal from '../../components/NavigationModal';
import LocationPermissionModal, {
  type LocationProblem,
} from '../../components/LocationPermissionModal';
import PropertyCard from '../../components/PropertyCard';
import PropertyMap from '../../components/PropertyMap';
import PropertyBottomSheet from '../../components/PropertyBottomSheet';
import EmptyState from '../../components/EmptyState';
import MapLoader from '../../components/MapLoader';
import { Reveal, useReveal } from '../../components/Reveal';
import {
  PropertyCardSkeleton,
  PropertyListSkeleton,
} from '../../components/SkeletonLoader';
import { ErrorView } from '../../components/States';
import { findProvince } from '../../constants/provinces';
import { MAP_TILE_MAX_ZOOM } from '../../config';
import { useFormat } from '../../i18n/useFormat';
import type { MapViewChange } from '../../map/BaseMap';
import { useMapStyle } from '../../map/mapStyleStore';
import { useAreaName, type AreaView } from '../../map/useAreaName';
import { centroid, zoomToSeparate } from '../../map/cluster';
import {
  AFGHANISTAN_CAMERA,
  fromLngLat,
  provinceCamera,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../../map/geo';
import type { MapItem } from '../../map/items';
import { LOCATE_TIMEOUT_MS, locate } from '../../map/location';
import { useWatchedPosition } from '../../map/useLiveLocation';
import { useNavigationStart } from '../../map/useNavigationStart';
import type { Bounds } from '../../map/cluster';
import {
  areaFor,
  areaOfBounds,
  boundsFromCamera,
  inBounds,
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
  AreaTitle,
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
/**
 * How close the map zooms to the person's own position: street level (17), where plots, buildings and lanes are
 * drawn and a listing next door is a separate pin, not a number in a cluster. The tiles go to 20.
 */
const LOCATION_ZOOM = 17;
/** How long past the search's own time limit the "finding you" mark may stay in the top chip. */
const LOCATING_GRACE_MS = 2_000;
/** Never zoom out when a listing is chosen; zoom in to at least street-block level. */
const SELECT_ZOOM = 13;
/** Height of the card covering the map, so the chosen marker is centred in what is still visible. */
const PROPERTY_CARD_PADDING = 360;
const AGENCY_CARD_PADDING = 170;

const cameraForProvince = (value: string | undefined): MapCamera => {
  const province = findProvince(value);
  return province ? provinceCamera(province) : AFGHANISTAN_CAMERA;
};

function activeFilterCount(filters: PropertyFilters): number {
  return [
    filters.province,
    filters.district,
    filters.types?.length ? filters.types : undefined,
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
 * Mazar fills each place in as it arrives. It does not start anywhere in particular: on start it asks for the phone's
 * position and opens on it, at street level, and asks the server for what is around it (nothing is fetched for a place
 * the person is not at while the GPS is still answering). If the position is refused or the GPS is off, a card explains
 * and offers the settings, and the map shows the whole country. Once a fix has been had, the position keeps following
 * the phone (the pulsing blue marker) for as long as Home is on screen.
 */
export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { language } = useFormat();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const clearance = floatingBarClearance(insets.bottom);
  // Where the map's middle is, for the name bar. Only the middle and the zoom: a pan changes it, nothing else does.
  const [areaView, setAreaView] = useState<AreaView | null>(null);
  const areaName = useAreaName(areaView, language);

  const mapStyle = useMapStyle();
  // The 3D view: the map leans back and the buildings stand up (the 3D button).
  const [tilted, setTilted] = useState(false);
  const [filters, setFilters] = useState<PropertyFilters>({});
  // The map is the first thing people see; the list is one tap away.
  const [mode, setMode] = useState<ViewMode>('map');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [clusterItems, setClusterItems] = useState<MapItem[] | null>(null);
  const [camera, setCamera] = useState<MapCamera>(AFGHANISTAN_CAMERA);
  const [me, setMe] = useState<Coordinate | null>(null);
  const [locating, setLocating] = useState(false);
  // The first answer to "where is the phone?" (a fix, a refusal, or nothing) has come. Until it has, the map has no
  // place to ask the server about: it would be the whole country, fetched only to be thrown away a second later.
  const [located, setLocated] = useState(false);
  // Home is on screen and the app in the foreground: the only time the GPS is listened to for the moving marker.
  const [watching, setWatching] = useState(true);
  const [problem, setProblem] = useState<LocationProblem | null>(null);
  // Until the map reports what it shows, ask for the area its starting camera implies.
  const [area, setArea] = useState<Area>(() =>
    areaFor(
      boundsFromCamera(
        AFGHANISTAN_CAMERA.center,
        AFGHANISTAN_CAMERA.zoom,
        width,
        height,
      ),
    ),
  );
  const zoom = useRef(AFGHANISTAN_CAMERA.zoom);
  // What the screen shows right now, exactly (no margin): the count under the map and the list are made from it.
  const [viewBounds, setViewBounds] = useState<Bounds>(() =>
    boundsFromCamera(
      AFGHANISTAN_CAMERA.center,
      AFGHANISTAN_CAMERA.zoom,
      width,
      height,
    ),
  );
  // The part of the map the list shows: what the map showed when the person left it. Null: no map to follow (the
  // list was reached by a province chosen in the filters), so the list is every listing that matches.
  const [listArea, setListArea] = useState<Area | null>(null);
  // Where the map is looking right now (a finger moves it without telling `camera`), so going to the list and back
  // puts it exactly there instead of where it was last sent.
  const lastView = useRef<{
    center: MapCamera['center'];
    zoom: number;
    bounds: Bounds;
  } | null>(null);
  // Set once the person has chosen where to look, so a slow first GPS fix does not yank the map away.
  const steered = useRef(false);
  // The person was sent to the phone's settings to allow location; ask again when they come back.
  const awaitingSettings = useRef(false);
  const mounted = useRef(true);
  // Which position search is the latest; an older one that answers late changes nothing.
  const locateRun = useRef(0);
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
  const mapQuery = useMapProperties(
    mapFilters,
    area,
    mode === 'map' && located,
  );
  // The list is the map's: the listings that were on screen when the person switched to it (the province, which
  // only moves the map, is not sent), so the rows and their count are exactly the pins that were in view.
  const listFilters = useMemo<PropertyFilters>(
    () =>
      listArea ? { ...filters, province: undefined, ...listArea } : filters,
    [filters, listArea],
  );
  const listQuery = usePropertyList(listFilters, mode === 'list');
  const listReveal = useReveal(listQuery.isPending);
  const query = mode === 'map' ? mapQuery : listQuery;
  const properties = useMemo(() => flattenPages(query.data), [query.data]);
  const total = listQuery.data?.pages[0]?.meta.total ?? 0;
  // The map's count is of what is on screen, not of the margin fetched around it: the loaded listings whose pin is
  // inside the view. While more pages are still to come it is "at least" this many.
  const inView = useMemo(
    () =>
      mode === 'map'
        ? properties.filter(
            p =>
              p.lat !== null &&
              p.lng !== null &&
              inBounds(p.lat, p.lng, viewBounds),
          ).length
        : 0,
    [mode, properties, viewBounds],
  );

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
    const run = (locateRun.current += 1);
    setLocating(true);
    // The "finding you" mark in the top chip must never outlive the search: whatever the phone's location service
    // does (or never answers), it is gone shortly after the time the search itself is allowed to take.
    const watchdog = setTimeout(() => {
      if (mounted.current && locateRun.current === run) {
        setLocating(false);
        // The map's listings wait for the first answer about where the phone is; a question nobody answers must not
        // hold them back for good, so the country is shown instead.
        setLocated(true);
      }
    }, LOCATE_TIMEOUT_MS + LOCATING_GRACE_MS);
    let result: Awaited<ReturnType<typeof locate>>;
    try {
      result = await locate({ ask: true });
    } finally {
      clearTimeout(watchdog);
    }
    if (!mounted.current || locateRun.current !== run) return;
    setLocating(false);
    if (result.status === 'ok') {
      setMe(result.coordinate);
      if (!(auto && steered.current)) {
        steered.current = true;
        // The camera is set before `located` is, so the map (which is only drawn once the first answer is in) opens
        // on the phone and never on the country.
        flyTo(result.coordinate, LOCATION_ZOOM, 0);
        // Ask the server about the place the map is flying to now, not about the country it started on.
        const target = boundsFromCamera(
          toLngLat(result.coordinate),
          LOCATION_ZOOM,
          width,
          height,
        );
        setViewBounds(target);
        setArea(areaFor(target));
      }
    } else if (result.status === 'outside') {
      // The phone is outside Afghanistan: the map keeps showing the country and says nothing. A banner about it only
      // worried people who were simply travelling, and there is nothing for them to do.
    } else {
      setProblem(result.status);
    }
    setLocated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the screen's size only decides the first guess of the area
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

  // The moving marker listens to the GPS only while Home is the screen in front and the app is in the foreground.
  useEffect(() => {
    let tab = true;
    let foreground = AppState.currentState !== 'background';
    const update = () => setWatching(tab && foreground);
    const state = AppState.addEventListener('change', next => {
      foreground = next === 'active';
      update();
    });
    const focus = navigation.addListener('focus', () => {
      tab = true;
      update();
    });
    const blur = navigation.addListener('blur', () => {
      tab = false;
      update();
    });
    return () => {
      state.remove();
      focus();
      blur();
    };
  }, [navigation]);
  // Once a first fix has shown that location is allowed, the marker follows the phone (and falls back to that fix).
  const live = useWatchedPosition(me !== null && watching);
  const here = live?.coordinate ?? me;

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

  // «مسیریابی» in the listing's card: the same steps as on its page (find the phone first), then the route screen.
  const [navTarget, setNavTarget] = useState<Property | null>(null);
  const [navigating, setNavigating] = useState(false);
  const nav = useNavigationStart(() => setNavigating(true));
  const navDestination = useMemo<Coordinate | null>(
    () =>
      navTarget && navTarget.lat !== null && navTarget.lng !== null
        ? { latitude: navTarget.lat, longitude: navTarget.lng }
        : null,
    [navTarget],
  );
  const navigateTo = (property: Property) => {
    setNavTarget(property);
    nav.start();
  };
  const pickFromCluster = (item: MapItem) => {
    setClusterItems(null);
    if (item.kind === 'property') selectProperty(item.property);
    else selectAgency(item.agency);
  };

  const onViewChange = useCallback((view: MapViewChange) => {
    // A finger moved the map: it is theirs now, and a late GPS fix must not take it back.
    if (view.userMoved) steered.current = true;
    zoom.current = view.zoom;
    lastView.current = {
      center: view.center,
      zoom: view.zoom,
      bounds: view.bounds,
    };
    setViewBounds(view.bounds);
    setAreaView({ center: fromLngLat(view.center), zoom: view.zoom });
    setArea(current => nextArea(current, view.bounds, mapComplete.current));
  }, []);

  /**
   * Map or list. The map is not kept alive behind the list, so it opens again from `camera`: leaving it first copies
   * where it is looking into `camera` (same nonce, so nothing flies), and the map comes back exactly where it was left
   * instead of on Kabul or on the last place the app sent it.
   */
  const changeMode = (next: ViewMode) => {
    if (next === mode) return;
    const view = lastView.current;
    if (mode === 'map' && view) {
      setCamera(current => ({
        ...current,
        center: view.center,
        zoom: view.zoom,
      }));
    }
    // To the list: it shows what the map was showing. Back to the map: the map's own view takes over again.
    if (next === 'list') setListArea(view ? areaOfBounds(view.bounds) : null);
    setMode(next);
  };

  const applyFilters = (next: PropertyFilters) => {
    setFilters(next);
    setSelection(null);
    setFilterOpen(false);
    // Choosing a province takes the map there. Clearing it leaves the map where it is: on the map the
    // viewport already decides what is shown.
    if (next.province) {
      lookAtProvince(next.province);
      // A province chosen from the list is meant for the list: every listing there, not the old map's window.
      setListArea(null);
    }
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
      <RoundButton
        testID="open-saved"
        icon="bookmark"
        label={t('nav.saved')}
        onPress={() => navigation.navigate('Saved')}
      />
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
      list = <PropertyListSkeleton />;
    } else if (listQuery.isError) {
      list = (
        <ErrorView
          message={errorMessage(listQuery.error, t)}
          onRetry={() => listQuery.refetch()}
        />
      );
    } else if (properties.length === 0) {
      // Nothing in this list. When the filters, or the part of the map the list follows, are what is hiding the
      // listings, the button takes them off (all the listings, everywhere); with none of those there is nothing to widen.
      const widen = filterCount > 0 || listArea !== null;
      list = (
        <EmptyState
          illustration="search"
          testID="home-empty"
          title={t('home.noResults')}
          hint={t('home.noResultsHint')}
          actionIcon="search"
          actionLabel={widen ? t('home.browseListings') : undefined}
          onAction={
            widen
              ? () => {
                  setFilters({});
                  setListArea(null);
                }
              : undefined
          }
        />
      );
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
                  <PropertyCardSkeleton standalone />
                ) : (
                  <Button
                    icon="down"
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
        <View style={styles.listBody}>
          <Reveal {...listReveal} loader={<PropertyListSkeleton />}>
            {list}
          </Reveal>
        </View>
      </View>
    );
  } else {
    // The map is always on screen (even while loading or empty): the phone's position and the offices
    // are useful on their own, and a blank screen is the worst first impression for a map app.
    const status = mapQuery.isError ? (
      <View style={styles.notice}>
        <Banner kind="error" message={errorMessage(mapQuery.error, t)}>
          <Button
            icon="refresh"
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
        locating={locating}
        message={
          inView === 0
            ? t('home.noMapResults')
            : t('home.mapShowing', {
                count: `${formatNumber(inView, 0)}${
                  mapQuery.hasNextPage ? '+' : ''
                }`,
              })
        }
      />
    );

    body = (
      <View style={styles.mapWrap}>
        {located ? (
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
            userLocation={here}
            onSelectProperty={selectProperty}
            onSelectAgency={selectAgency}
            onOpenCluster={openCluster}
            onPressMap={clearSelection}
            onViewChange={onViewChange}
            tilted={tilted}
          />
        ) : (
          // The map is not drawn until the phone has said where it is, so it opens on the phone: drawing the country
          // first and then flying across it to the person's street is what this replaces.
          <View style={styles.waiting} testID="map-waiting">
            <MapLoader size={88} />
            <AppText variant="bodySm" color={colors.textSecondary}>
              {t('home.locating')}
            </AppText>
          </View>
        )}
        <View style={styles.overlay} pointerEvents="box-none">
          <View
            style={[styles.top, { paddingTop: insets.top + spacing.sm }]}
            pointerEvents="box-none"
          >
            <View style={styles.topRow} pointerEvents="box-none">
              {topControls}
            </View>
            <AreaTitle name={areaName} />
            {status}
          </View>

          {selection ? null : (
            <>
              <View
                style={[styles.stack, { bottom: clearance + spacing.md }]}
                pointerEvents="box-none"
              >
                <RoundButton
                  testID="map-3d"
                  icon="cube"
                  label={t('map.view3d')}
                  active={tilted}
                  onPress={() => setTilted(on => !on)}
                />
                <RoundButton
                  testID="map-style"
                  icon="satellite"
                  label={
                    mapStyle.kind === 'satellite'
                      ? t('map.styleStreet')
                      : t('map.styleSatellite')
                  }
                  active={mapStyle.kind === 'satellite'}
                  onPress={mapStyle.toggle}
                />
                <RoundButton
                  testID="locate"
                  icon="locate"
                  label={t('home.locate')}
                  size={LOCATE_SIZE}
                  accent
                  onPress={() => findMe(false)}
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
            onNavigate={navigateTo}
            navigating={nav.finding}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {body}

      {/* One switch for both screens, so the fill can pass from one tab to the other instead of the switch being
          drawn again (and so starting already moved) when the screen under it changes. With a listing's card open
          the tab bar and the switch step aside. */}
      {mode === 'list' || selection === null ? (
        <View
          pointerEvents="box-none"
          style={[styles.toggleDock, { bottom: clearance + spacing.md }]}
        >
          <ModeToggle
            mode={mode}
            mapLabel={t('home.map')}
            listLabel={t('home.list')}
            onChange={changeMode}
          />
        </View>
      ) : null}

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
      {/* The same card, for a phone that cannot be found when directions to a listing were asked for. */}
      <LocationPermissionModal
        problem={nav.problem}
        onOpenSettings={nav.openSettings}
        onClose={nav.closeProblem}
      />
      {navDestination && navTarget ? (
        <NavigationModal
          visible={navigating}
          destination={navDestination}
          title={navTarget.title}
          deal={navTarget.deal_type}
          type={navTarget.type}
          onClose={() => setNavigating(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  mapWrap: { flex: 1 },
  waiting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutralSoft,
  },
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
