import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { useTranslation } from 'react-i18next';
import type { DealType, PropertyType } from '@bongah/shared-types';
import BaseMap from '../map/BaseMap';
import {
  cameraAt,
  metresBetween,
  toLngLat,
  type Coordinate,
  type MapCamera,
} from '../map/geo';
import { UserDot } from '../map/markers';
import { formatDistance, formatEta, formatSpeed } from '../map/navFormat';
import PinMarker from '../map/PinMarker';
import {
  findRoute,
  routeProgress,
  shouldReroute,
  toleranceFor,
  type Route,
} from '../map/routing';
import { useLiveLocation } from '../map/useLiveLocation';
import { colors, radius, spacing } from '../theme';
import AppText from './AppText';
import Button from './Button';
import CircleIconButton from './CircleIconButton';

/** How close the map follows the driver: a few blocks ahead are visible. */
const FOLLOW_ZOOM = 16;
/** A gap between the driver and the road (or the road's end and the listing) shorter than this is not drawn. */
const CONNECTOR_MIN_M = 12;
/**
 * When only a straight line could be had (no router answered), try again this often while the screen is open, so the
 * road route replaces it as soon as the network is back instead of never.
 */
const RETRY_ROAD_MS = 30_000;

interface Props {
  visible: boolean;
  /** The listing's pin. */
  destination: Coordinate;
  /** The listing's title, under the HUD. */
  title: string;
  /** What it is offered for and what it is: its pin takes its colour and icon from them (the same as everywhere). */
  deal?: DealType;
  type?: PropertyType;
  onClose: () => void;
}

/**
 * Driving to a listing inside the app: the route from where the phone is to the listing's pin, drawn on the map, and
 * a heads-up display over it with the distance still to go ("۴٫۲ کیلومتر"), the time to arrival ("۸ دقیقه") and the
 * live speed from the GPS ("۴۵ km/h").
 *
 * The map follows the driver until they move it by hand (then a button brings it back). Leaving the route by more
 * than the GPS's own error asks for a new one, at most every 20 seconds. Within 30 m of the pin it says "you have
 * arrived". The route comes from the API (Google / Mapbox) when signed in, OSRM otherwise, or a straight line that
 * says so (see routing.ts). Location is only read while this is open.
 */
export default function NavigationModal({
  visible,
  destination,
  title,
  deal,
  type,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {visible ? (
        <SafeAreaProvider>
          <Navigation
            destination={destination}
            title={title}
            deal={deal}
            type={type}
            onClose={onClose}
          />
        </SafeAreaProvider>
      ) : null}
    </Modal>
  );
}

function Navigation({
  destination,
  title,
  deal,
  type,
  onClose,
}: Omit<Props, 'visible'>) {
  const { t } = useTranslation();
  const live = useLiveLocation(true);
  const fix = live.status === 'live' ? live.fix : null;
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [following, setFollowing] = useState(true);
  const lastRouteAt = useRef(0);
  // Where the phone was when the current route was asked for, and what the screen holds right now, for the checks that
  // run on a timer or after an answer.
  const askedFrom = useRef<Coordinate | null>(null);
  const routeRef = useRef<Route | null>(null);
  routeRef.current = route;
  // Metres of the current route the driver has got to; it only grows, and starts again with every new route.
  const matched = useRef(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const askRoute = useCallback(
    (from: Coordinate) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      lastRouteAt.current = Date.now();
      askedFrom.current = from;
      setRouting(true);
      findRoute(from, destination, controller.signal).then(found => {
        if (controller.signal.aborted) return;
        // A road route already on the screen is not replaced by a straight line because one request failed (a bad
        // signal for a moment): the line would jump to a dashed one and back. The next try may do better.
        const keep = routeRef.current;
        if (
          found.source === 'straight' &&
          !found.near &&
          keep !== null &&
          keep.source !== 'straight'
        ) {
          setRouting(false);
          return;
        }
        matched.current = 0;
        setRoute(found);
        setRouting(false);
      });
    },
    [destination],
  );

  // The first fix asks for the route (findRoute always answers: at worst a straight line).
  useEffect(() => {
    if (fix && !route && !routing) askRoute(fix.coordinate);
  }, [fix, route, routing, askRoute]);

  const progress = useMemo(
    () =>
      route && fix
        ? routeProgress(route, fix.coordinate, fix.speed, {
            matchedAlongM: matched.current,
            toleranceM: toleranceFor(fix.accuracy),
            destination,
          })
        : null,
    [route, fix, destination],
  );
  // The driver has got this far; the next fix is matched from here on, never behind it.
  useEffect(() => {
    if (progress?.onRoute)
      matched.current = Math.max(matched.current, progress.alongM);
  }, [progress]);

  // Off the route: a new one, not more often than every 20 seconds and not before the driver has moved.
  useEffect(() => {
    if (!progress || !fix || routing) return;
    const origin = askedFrom.current;
    const moved = origin
      ? metresBetween(
          [origin.longitude, origin.latitude],
          [fix.coordinate.longitude, fix.coordinate.latitude],
        )
      : Infinity;
    if (
      shouldReroute(
        progress,
        fix.accuracy,
        lastRouteAt.current,
        Date.now(),
        undefined,
        moved,
      )
    )
      askRoute(fix.coordinate);
  }, [progress, fix, routing, askRoute]);

  // Only a straight line (no router answered): look for the road route again from time to time.
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const needsRoad = route?.source === 'straight' && !route.near;
  useEffect(() => {
    if (!needsRoad) return;
    const timer = setInterval(() => {
      const here = fixRef.current;
      if (here) askRoute(here.coordinate);
    }, RETRY_ROAD_MS);
    return () => clearInterval(timer);
  }, [needsRoad, askRoute]);

  // Where the map looks: on the driver while following, moving with every fix. Once the person moves the map by hand
  // it stays where they put it (the last camera is kept, so nothing flies back) until "follow" is pressed again.
  // Before the first fix it shows the listing.
  const held = useRef<MapCamera>({ ...cameraAt(destination, FOLLOW_ZOOM) });
  if (fix && following) {
    held.current = {
      center: toLngLat(fix.coordinate),
      zoom: FOLLOW_ZOOM,
      nonce: fix.timestamp,
    };
  }
  const camera = held.current;

  // Dashed connectors: from the driver to the road when they are not on it (a router puts the start on the nearest road
  // it knows, which can be a block away), and from the road's end to the listing's pin. They are drawn so the line
  // never claims to start or end where it does not, and the distance on the HUD includes them.
  const connectors = useMemo<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    const link = (a: [number, number], b: [number, number]) => {
      if (metresBetween(a, b) < CONNECTOR_MIN_M) return;
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [a, b] },
      });
    };
    if (route && route.source !== 'straight') {
      if (fix && progress) link(toLngLat(fix.coordinate), progress.snapped);
      link(route.line[route.line.length - 1], toLngLat(destination));
    }
    return { type: 'FeatureCollection', features };
  }, [route, fix, progress, destination]);

  const line = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: route
        ? [
            {
              type: 'Feature',
              properties: { straight: route.source === 'straight' ? 1 : 0 },
              geometry: { type: 'LineString', coordinates: route.line },
            },
          ]
        : [],
    }),
    [route],
  );

  const openSettings = () => {
    if (live.status === 'unavailable' && Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(
        () => Linking.openSettings(),
      );
    } else {
      Linking.openSettings();
    }
  };

  const arrived = progress?.arrived ?? false;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.map}>
        <BaseMap
          camera={camera}
          testID="navigation-map"
          onViewChange={view => {
            if (view.userMoved) setFollowing(false);
          }}
        >
          <GeoJSONSource id="route" data={line}>
            <Layer
              id="route-casing"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': colors.surface, 'line-width': 9 }}
            />
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              // A straight line (no road was found) is dashed, so it does not pass for a road.
              paint={
                route?.source === 'straight'
                  ? {
                      'line-color': colors.info,
                      'line-width': 5,
                      'line-dasharray': [1.5, 1.5],
                    }
                  : { 'line-color': colors.info, 'line-width': 5 }
              }
            />
          </GeoJSONSource>
          <GeoJSONSource id="connectors" data={connectors}>
            <Layer
              id="connectors-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': colors.info,
                'line-width': 4,
                'line-dasharray': [1.2, 1.6],
              }}
            />
          </GeoJSONSource>
          <Marker
            id="destination"
            lngLat={toLngLat(destination)}
            anchor={deal ? 'bottom' : 'center'}
          >
            <PinMarker selected deal={deal} type={type} />
          </Marker>
          {fix ? (
            <Marker id="driver" lngLat={toLngLat(fix.coordinate)}>
              <UserDot testID="driver-position" />
            </Marker>
          ) : null}
        </BaseMap>

        {/* The heads-up display: distance, arrival time and speed, in one white strip over the map. */}
        <View style={styles.hud} testID="navigation-hud">
          <Reading
            testID="hud-distance"
            label={t('route.remaining')}
            value={progress ? formatDistance(progress.remainingM, t) : '–'}
          />
          <View style={styles.hudDivider} />
          <Reading
            testID="hud-eta"
            label={t('route.eta')}
            value={progress ? formatEta(progress.etaS, t) : '–'}
          />
          <View style={styles.hudDivider} />
          <Reading
            testID="hud-speed"
            label={t('route.speed')}
            value={formatSpeed(fix?.speed ?? null, t)}
            latin
          />
        </View>

        <View style={styles.notes} pointerEvents="box-none">
          {live.status === 'starting' ||
          (live.status === 'unavailable' && !fix) ? (
            <Note
              busy={live.status === 'starting'}
              text={
                live.status === 'starting'
                  ? t('route.locating')
                  : t('route.unavailable')
              }
              action={
                live.status === 'unavailable'
                  ? { label: t('route.settings'), onPress: openSettings }
                  : undefined
              }
            />
          ) : live.status === 'denied' ? (
            <Note
              text={t('route.denied')}
              danger
              action={{ label: t('route.settings'), onPress: openSettings }}
            />
          ) : arrived ? (
            <Note text={t('route.arrived')} success />
          ) : routing ? (
            <Note
              busy
              text={route ? t('route.rerouting') : t('route.finding')}
            />
          ) : route?.source === 'straight' ? (
            <Note text={route.near ? t('route.near') : t('route.straight')} />
          ) : null}
        </View>

        {!following && fix ? (
          <View style={styles.follow}>
            <CircleIconButton
              testID="navigation-follow"
              icon="map-pin"
              tone="brand"
              label={t('route.follow')}
              onPress={() => setFollowing(true)}
              size={48}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <AppText variant="bodySm" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <Button
          testID="navigation-close"
          icon="close"
          variant="danger"
          title={t('route.close')}
          onPress={onClose}
        />
      </View>
    </SafeAreaView>
  );
}

function Reading({
  label,
  value,
  testID,
  latin = false,
}: {
  label: string;
  value: string;
  testID: string;
  /** The value holds a unit symbol in Latin letters (km/h): keep it left-to-right. */
  latin?: boolean;
}) {
  return (
    <View style={styles.reading} testID={testID}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText
        variant="heading"
        color={colors.text}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={latin ? styles.ltrText : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

function Note({
  text,
  busy = false,
  danger = false,
  success = false,
  action,
}: {
  text: string;
  busy?: boolean;
  danger?: boolean;
  success?: boolean;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View
      style={[
        styles.note,
        danger && styles.noteDanger,
        success && styles.noteSuccess,
      ]}
      testID="navigation-note"
    >
      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      <AppText
        variant="bodySm"
        color={
          danger
            ? colors.danger
            : success
            ? colors.primaryDark
            : colors.textSecondary
        }
        style={styles.noteText}
      >
        {text}
      </AppText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={8}
          testID="navigation-note-action"
        >
          <AppText variant="label" color={colors.primary}>
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  map: { flex: 1 },
  ltrText: { writingDirection: 'ltr' },
  hud: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  hudDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  reading: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  notes: {
    position: 'absolute',
    top: 104,
    left: spacing.md,
    right: spacing.md,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noteDanger: { borderColor: colors.danger },
  noteSuccess: { borderColor: colors.primary },
  noteText: { flex: 1 },
  follow: { position: 'absolute', bottom: spacing.lg, right: spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  title: { flex: 1 },
});
